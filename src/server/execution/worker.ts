import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { createAdapter, resolveConnectorState } from '@/connectors/adapters.ts';
import type { ChannelKind, ConnectorState } from '@/connectors/contract.ts';
import type { Json } from '@/types/database.generated';

/**
 * Outbox worker.
 *
 * Lease → network call → settle. The network call happens strictly between two
 * short transactions, so no HTTP request is ever held open inside a database
 * transaction and a worker crash simply lets the lease expire.
 *
 * Delivery is at-least-once, so the consumer is keyed on the delivery id and
 * re-checks the send gate before dispatching. A duplicate lease therefore ends
 * as a no-op rather than a second message.
 */

export interface WorkerResult {
  claimed: number;
  sent: number;
  simulated: number;
  skipped: number;
  failed: number;
  deadLettered: number;
  details: { eventId: string; outcome: string; reason?: string }[];
}

interface OutboxRow {
  id: string;
  business_id: string;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  attempts: number;
  attempts_max: number;
}

const SEND_TIMEOUT_MS = Number(process.env.QADAM_CONNECTOR_TIMEOUT_MS ?? 10_000);

/** Resolves the adapter configured for this business channel. */
async function resolveChannel(db: SupabaseClient, businessId: string, channel: string) {
  const { data } = await db.from('business_channels')
    .select('channel_type,adapter,connector_state,settings,status')
    .eq('business_id', businessId).eq('channel_type', channel).maybeSingle();

  const settings = (data?.settings ?? {}) as { endpoint?: string };
  return {
    adapterName: data?.adapter ?? 'mock',
    connectorState: (data?.connector_state ?? 'not_configured') as ConnectorState,
    endpoint: settings.endpoint,
    // The secret lives in the server environment, keyed per business channel,
    // and is never stored in a table a member can read.
    secret: process.env[`QADAM_WEBHOOK_SECRET_${channel.toUpperCase()}`] ?? process.env.QADAM_WEBHOOK_SECRET,
  };
}

export async function runOutboxBatch(db: SupabaseClient, businessId: string, workerId: string, limit = 20): Promise<WorkerResult> {
  const result: WorkerResult = { claimed: 0, sent: 0, simulated: 0, skipped: 0, failed: 0, deadLettered: 0, details: [] };

  const { data: claimed, error } = await db.rpc('claim_outbox_batch', {
    p_business_id: businessId,
    p_worker: workerId,
    p_limit: limit,
  });
  // An emergency stop makes the claim return nothing at all; that is success, not failure.
  if (error) return result;

  const rows = (claimed ?? []) as unknown as OutboxRow[];
  result.claimed = rows.length;

  for (const row of rows) {
    if (row.event_type !== 'delivery.requested') {
      // Nothing else is dispatchable yet; publish so the queue drains cleanly.
      await db.rpc('settle_outbox_event', { p_event_id: row.id, p_success: true, p_error: null as unknown as string });
      result.skipped += 1;
      result.details.push({ eventId: row.id, outcome: 'ignored_event_type' });
      continue;
    }

    const payload = row.payload ?? {};
    const deliveryId = String(payload.delivery_id ?? row.aggregate_id);
    const channel = String(payload.channel ?? 'whatsapp');
    const customerId = String(payload.customer_id ?? '');

    const { data: delivery } = await db.from('campaign_deliveries')
      .select('id,status,customer_id,content_item_id,idempotency_key,provider_message_ref')
      .eq('id', deliveryId).eq('business_id', businessId).maybeSingle();

    if (!delivery) {
      await db.rpc('settle_outbox_event', { p_event_id: row.id, p_success: true, p_error: null as unknown as string });
      result.skipped += 1;
      result.details.push({ eventId: row.id, outcome: 'delivery_missing' });
      continue;
    }
    // At-least-once means this row may already have been dispatched.
    if (delivery.status !== 'queued') {
      await db.rpc('settle_outbox_event', { p_event_id: row.id, p_success: true, p_error: null as unknown as string });
      result.skipped += 1;
      result.details.push({ eventId: row.id, outcome: 'already_dispatched', reason: delivery.status });
      continue;
    }

    // Re-check consent, suppression, quiet hours and caps at dispatch time.
    const { data: gate } = await db.rpc('send_gate', {
      p_business_id: businessId,
      p_customer_id: customerId || delivery.customer_id,
      p_channel: channel,
      p_at: new Date().toISOString(),
    });
    const verdict = (gate ?? {}) as { allowed?: boolean; reason?: string };
    if (!verdict.allowed) {
      await db.from('campaign_deliveries').update({ status: 'suppressed', failure_code: verdict.reason ?? 'gate_denied' }).eq('id', deliveryId);
      await db.rpc('settle_outbox_event', { p_event_id: row.id, p_success: true, p_error: null as unknown as string });
      result.skipped += 1;
      result.details.push({ eventId: row.id, outcome: 'suppressed', reason: verdict.reason });
      continue;
    }

    const channelConfig = await resolveChannel(db, businessId, channel);
    const adapter = createAdapter(channelConfig.adapterName, {
      channel: channel as ChannelKind,
      endpoint: channelConfig.endpoint,
      secret: channelConfig.secret,
      timeoutMs: SEND_TIMEOUT_MS,
    });

    const { data: content } = delivery.content_item_id
      ? await db.from('content_items').select('body').eq('id', delivery.content_item_id).maybeSingle()
      : { data: null };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
    let receipt;
    try {
      const prepared = await adapter.prepare({
        idempotencyKey: delivery.idempotency_key,
        channel: channel as ChannelKind,
        body: content?.body ?? '',
        // Only an opaque reference crosses the boundary — never the address itself.
        recipientRef: `customer:${delivery.customer_id}`,
        metadata: { deliveryId, businessId },
      });
      receipt = await adapter.send(prepared, controller.signal);
    } catch (sendError) {
      receipt = {
        status: 'failed' as const,
        providerMessageRef: null,
        retryable: true,
        error: (sendError as Error)?.name === 'AbortError' ? 'connector timeout' : (sendError as Error).message,
        simulated: false,
      };
    } finally {
      clearTimeout(timer);
    }

    if (receipt.status === 'sent' || receipt.status === 'queued') {
      await db.from('campaign_deliveries').update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        provider_message_ref: receipt.providerMessageRef,
      }).eq('id', deliveryId);
      await db.from('campaign_events').insert({
        business_id: businessId,
        campaign_id: String(payload.campaign_id ?? ''),
        delivery_id: deliveryId,
        customer_id: delivery.customer_id,
        event_type: 'sent',
        occurred_at: new Date().toISOString(),
        source: adapter.name,
        external_event_ref: `sent:${delivery.idempotency_key}`,
        metadata: { simulated: receipt.simulated } as unknown as Json,
        is_mock: receipt.simulated,
      });
      await db.rpc('settle_outbox_event', { p_event_id: row.id, p_success: true, p_error: null as unknown as string });
      result.sent += 1;
      if (receipt.simulated) result.simulated += 1;
      result.details.push({ eventId: row.id, outcome: receipt.simulated ? 'simulated' : 'sent' });
      continue;
    }

    // Failure: let the database decide between backoff and dead letter.
    const { data: settled } = await db.rpc('settle_outbox_event', {
      p_event_id: row.id,
      p_success: false,
      p_error: receipt.error ?? 'send failed',
    });
    const outcome = (settled ?? {}) as { status?: string };
    if (outcome.status === 'dead_letter') {
      await db.from('campaign_deliveries').update({ status: 'failed', failure_code: 'dead_letter' }).eq('id', deliveryId);
      result.deadLettered += 1;
    } else {
      result.failed += 1;
    }
    result.details.push({ eventId: row.id, outcome: outcome.status ?? 'retry', reason: receipt.error ?? undefined });
  }

  return result;
}

/** Runs due automations for one business. Each run is keyed so a repeat is a no-op. */
export async function runDueAutomations(db: SupabaseClient, businessId: string, cycleKey: string, source: 'scheduler' | 'manual' | 'demo_cycle'): Promise<{ ran: number; results: unknown[] }> {
  const { data: due } = await db.from('automations')
    .select('id,name,next_run_at,status')
    .eq('business_id', businessId).eq('status', 'active')
    .or(`next_run_at.is.null,next_run_at.lte.${new Date().toISOString()}`)
    .limit(20);

  const results: unknown[] = [];
  for (const automation of due ?? []) {
    const { data, error } = await db.rpc('execute_automation', {
      p_automation_id: automation.id,
      // Keyed on the cycle, so re-running the same cycle cannot double-run a rule.
      p_idempotency_key: `cycle:${cycleKey}:${automation.id}`,
      p_trigger_source: source,
    });
    results.push(error ? { automation: automation.id, error: error.message } : data);
  }
  return { ran: results.length, results };
}

export { resolveConnectorState };
