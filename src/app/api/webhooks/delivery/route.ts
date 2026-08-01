import { NextResponse } from 'next/server';

import { verifyWebhookSignature } from '@/connectors/contract.ts';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/types/database.generated';

/**
 * Delivery provider webhook.
 *
 * Two independent protections, because either alone is insufficient:
 *  - the signature proves the body came from the provider and is recent, so a
 *    replayed old body is rejected even though its signature is valid;
 *  - the database uniqueness on (business, provider, external_event_id) makes a
 *    duplicate delivery of the *same* event a no-op, which is what an
 *    at-least-once provider will inevitably do.
 *
 * An unverified body is never ingested — not even as "unverified" — because a
 * forged event would move a number on the owner's dashboard.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const raw = await request.text();
  const signature = request.headers.get('x-qadam-signature') ?? '';
  const timestamp = request.headers.get('x-qadam-timestamp') ?? '';
  const provider = request.headers.get('x-qadam-provider') ?? 'webhook';
  const secret = process.env.QADAM_WEBHOOK_SECRET ?? '';

  const verification = await verifyWebhookSignature({ secret, payload: raw, signature, timestamp });
  if (!verification.valid) {
    return NextResponse.json({ error: 'invalid_signature', reason: verification.reason }, { status: 401 });
  }

  let body: {
    businessId?: string;
    channel?: string;
    externalEventId?: string;
    eventType?: string;
    deliveryId?: string;
    occurredAt?: string;
    payload?: Record<string, unknown>;
  };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  if (!body.businessId || !body.externalEventId || !body.eventType) {
    return NextResponse.json({ error: 'missing_fields', required: ['businessId', 'externalEventId', 'eventType'] }, { status: 400 });
  }

  const db = createAdminClient();
  const { data, error } = await db.rpc('ingest_provider_event', {
    p_business_id: body.businessId,
    p_provider: provider,
    p_channel: body.channel ?? 'webhook',
    p_external_event_id: body.externalEventId,
    p_event_type: body.eventType,
    p_delivery_id: (body.deliveryId ?? null) as unknown as string,
    p_signature_verified: true,
    p_payload: (body.payload ?? {}) as unknown as Json,
    p_occurred_at: body.occurredAt ?? new Date().toISOString(),
  });

  if (error) {
    // A cross-tenant delivery reference is a security signal, not a retryable glitch.
    const status = error.message.includes('does not belong') ? 403 : error.message.includes('unsupported') ? 400 : 500;
    return NextResponse.json({ error: 'ingest_failed', message: error.message }, { status });
  }

  const result = (data ?? {}) as { duplicate?: boolean; provider_event_id?: string };
  return NextResponse.json(
    { accepted: true, duplicate: Boolean(result.duplicate), providerEventId: result.provider_event_id },
    // A duplicate is a successful no-op: the provider should stop retrying.
    { status: 200 },
  );
}
