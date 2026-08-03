import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import { runDueAutomations, runOutboxBatch } from '@/server/execution/worker';
import { refreshDueContent } from '@/server/qadam/content-refresh';
import { detectAndRecord } from '@/server/qadam/signal-detection';
import { sendOwnerDigest } from '@/server/qadam/owner-assistant';

/**
 * Protected job endpoint.
 *
 * No production cron or queue is configured for this project, so scheduling is
 * done by an external caller (a local runner, or a platform scheduler later)
 * hitting this endpoint. That makes the endpoint itself the security boundary:
 *
 *  - a shared secret in a header, compared in constant time;
 *  - a per-caller rate limit;
 *  - replay prevention on the cycle key, so the same cycle cannot be run twice
 *    even if the request is repeated or intercepted.
 *
 * The endpoint never trusts the caller for anything except "run now".
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const WINDOW_MS = 60_000;
const MAX_CALLS_PER_WINDOW = 12;
const seenCycles = new Map<string, number>();
const callWindow: number[] = [];

function constantTimeEquals(a: string, b: string): boolean {
  const left = createHash('sha256').update(a).digest();
  const right = createHash('sha256').update(b).digest();
  return timingSafeEqual(left, right);
}

function rateLimited(now: number): boolean {
  while (callWindow.length && now - callWindow[0] > WINDOW_MS) callWindow.shift();
  if (callWindow.length >= MAX_CALLS_PER_WINDOW) return true;
  callWindow.push(now);
  return false;
}

function isReplay(cycleKey: string, now: number): boolean {
  for (const [key, seenAt] of seenCycles) {
    if (now - seenAt > 15 * 60_000) seenCycles.delete(key);
  }
  if (seenCycles.has(cycleKey)) return true;
  seenCycles.set(cycleKey, now);
  return false;
}

export async function POST(request: Request) {
  const secret = process.env.QADAM_JOB_SECRET ?? '';
  if (!secret) {
    return NextResponse.json({ error: 'jobs_not_configured', message: 'QADAM_JOB_SECRET is not set on the server.' }, { status: 503 });
  }

  const provided = request.headers.get('x-qadam-job-secret') ?? '';
  if (!provided || !constantTimeEquals(provided, secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const now = Date.now();
  if (rateLimited(now)) {
    return NextResponse.json({ error: 'rate_limited', retryAfterSeconds: 60 }, { status: 429 });
  }

  let body: { businessId?: string; cycleKey?: string; limit?: number; digest?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const cycleKey = String(body.cycleKey ?? '').trim();
  if (cycleKey.length < 8) {
    return NextResponse.json({ error: 'invalid_cycle_key', message: 'cycleKey must be at least 8 characters.' }, { status: 400 });
  }
  if (isReplay(cycleKey, now)) {
    // Replay is refused at the edge; the database keys would also make it a
    // no-op, but a caller should hear about it rather than assume work happened.
    return NextResponse.json({ error: 'replayed_cycle', cycleKey }, { status: 409 });
  }

  const db = createAdminClient();
  const businessIds: string[] = [];
  if (body.businessId) {
    businessIds.push(body.businessId);
  } else {
    const { data } = await db.from('businesses').select('id').eq('status', 'active').limit(50);
    businessIds.push(...(data ?? []).map((row) => row.id));
  }

  const report: Record<string, unknown>[] = [];
  for (const businessId of businessIds) {
    // Detection first: an automation that fires on a signal should see the
    // measurement taken from today's data, not last cycle's.
    let signal: unknown;
    try {
      const outcome = await detectAndRecord(db, businessId);
      signal = outcome.all.length
        ? { recorded: outcome.all.map((item) => ({ metricKey: item.metricKey, changeBps: item.signal.evidence.deltaBps })) }
        : { missing: outcome.missing };
    } catch (error) {
      // One business whose numbers cannot be read must not stop the cycle for
      // everyone else, but the failure is reported rather than swallowed.
      signal = { error: error instanceof Error ? error.message : String(error) };
    }

    const automations = await runDueAutomations(db, businessId, cycleKey, 'scheduler');

    // Материалы для соцсетей раз в полдня. The database decides whether this
    // venue is due, so the five-minute cycle asks cheaply and almost always
    // gets an empty list back — no model is called on a cycle that is not due.
    let content: unknown;
    try {
      const outcome = await refreshDueContent(db, { businessId });
      content = outcome.refreshed.length || outcome.failed.length ? outcome : { due: false };
    } catch (error) {
      content = { error: error instanceof Error ? error.message : String(error) };
    }

    const outbox = await runOutboxBatch(db, businessId, `job:${cycleKey}`, Math.min(50, Number(body.limit ?? 20)));

    // The assistant writes last, so it reports the state after this cycle
    // rather than the one before it. Its failure is never the cycle's failure:
    // a chat that could not be written to has no bearing on work already done.
    let digest: unknown;
    if (body.digest !== false) {
      try {
        digest = await sendOwnerDigest(db, businessId);
      } catch (error) {
        digest = { error: error instanceof Error ? error.message : String(error) };
      }
    }

    report.push({ businessId, signal, automations: automations.ran, content, outbox, digest });
  }

  return NextResponse.json({ cycleKey, businesses: report.length, report }, { status: 200 });
}
