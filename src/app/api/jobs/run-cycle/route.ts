import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import { runDueAutomations, runOutboxBatch } from '@/server/execution/worker';

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

  let body: { businessId?: string; cycleKey?: string; limit?: number };
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
    const automations = await runDueAutomations(db, businessId, cycleKey, 'scheduler');
    const outbox = await runOutboxBatch(db, businessId, `job:${cycleKey}`, Math.min(50, Number(body.limit ?? 20)));
    report.push({ businessId, automations: automations.ran, outbox });
  }

  return NextResponse.json({ cycleKey, businesses: report.length, report }, { status: 200 });
}
