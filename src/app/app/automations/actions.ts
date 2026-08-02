'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { allowedModes, findTemplate } from '@/automations/catalog.ts';
import { createAdapter, resolveConnectorState } from '@/connectors/adapters.ts';
import type { ChannelKind, ConnectorState } from '@/connectors/contract.ts';
import { describeDbError } from '@/server/qadam/errors';
import { canManage, canMarket, requireBusinessContext } from '@/server/qadam/repository';
import { runDueAutomations, runOutboxBatch } from '@/server/execution/worker';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/types/database.generated';

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
const back = (extra = ''): never => redirect(`/app/automations${extra}`);

/** Creates an automation from a versioned template, recording which version was approved. */
export async function createAutomationFromTemplate(form: FormData) {
  const ctx = await requireBusinessContext();
  if (!canMarket(ctx.role)) back('?error=forbidden');

  const template = findTemplate(text(form, 'code'));
  if (!template) back('?error=' + encodeURIComponent('Шаблон правила не найден.'));

  const requestedMode = text(form, 'mode') || template!.defaultMode;
  const permitted = allowedModes(template!);
  // A mode the template does not permit is refused rather than silently downgraded.
  if (!permitted.includes(requestedMode as (typeof permitted)[number])) {
    back('?error=' + encodeURIComponent(`Режим «${requestedMode}» пока недоступен для этого правила: ${template!.autopilotGates.join('; ')}`));
  }

  const { error } = await ctx.supabase.from('automations').insert({
    business_id: ctx.businessId,
    name: template!.nameRu,
    automation_type: template!.code,
    trigger_rules: template!.trigger as unknown as Json,
    filters: template!.filters as unknown as Json,
    action_rules: template!.action as unknown as Json,
    guardrails: template!.guardrails as unknown as Json,
    status: 'draft',
    mode: requestedMode,
    rule_version: 1,
    approved_template_version: template!.version,
    owner_id: ctx.userId,
    created_by: ctx.userId,
    next_run_at: new Date().toISOString(),
    is_mock: ctx.business.mode === 'demo',
  });
  if (error) back(`?error=${encodeURIComponent(describeDbError(error))}`);

  revalidatePath('/app/automations');
  back('?created=1');
}

export async function transitionAutomationRule(form: FormData) {
  const ctx = await requireBusinessContext();
  if (!canMarket(ctx.role)) back('?error=forbidden');
  const id = text(form, 'id');
  const toStatus = text(form, 'toStatus');

  const { error } = await ctx.supabase.rpc('transition_domain_entity', {
    p_entity_type: 'automation',
    p_entity_id: id,
    p_to_status: toStatus,
    p_expected_version: Number(text(form, 'expectedVersion') || '1'),
    p_idempotency_key: `automation:${id}:${toStatus}:${randomUUID()}`,
  });
  if (error) back(`?error=${encodeURIComponent(describeDbError(error))}`);

  await ctx.supabase.from('activity_logs').insert({
    business_id: ctx.businessId, actor_id: ctx.userId,
    action: `automation.${toStatus}`, resource_type: 'automation', resource_id: id,
    metadata: { by_owner: true } as unknown as Json, is_mock: ctx.business.mode === 'demo',
  });

  revalidatePath('/app/automations');
  back('?updated=1');
}

/** Runs one automation immediately, keyed so a double click cannot double-run it. */
export async function runAutomationNow(form: FormData) {
  const ctx = await requireBusinessContext();
  if (!canMarket(ctx.role)) back('?error=forbidden');
  const id = text(form, 'id');
  const key = text(form, 'idempotencyKey') || `manual:${id}:${randomUUID()}`;

  const { error } = await ctx.supabase.rpc('execute_automation', {
    p_automation_id: id,
    p_idempotency_key: key,
    p_trigger_source: 'manual',
  });
  if (error) back(`?error=${encodeURIComponent(describeDbError(error))}`);

  revalidatePath('/app/automations');
  back('?ran=1');
}

/** Demo-tenant convenience: run one full cycle (due automations + outbox drain). */
export async function runDemoCycle() {
  const ctx = await requireBusinessContext();
  if (!canManage(ctx.role)) back('?error=forbidden');
  if (ctx.business.mode !== 'demo') {
    back('?error=' + encodeURIComponent('Демонстрационный цикл доступен только для demo-бизнеса.'));
  }

  // The queue functions are granted to service_role only, by design: claiming
  // and settling an outbox event is machine work, not something a signed-in
  // member may do. Passing the member's client here made every claim fail with
  // "permission denied", and the worker reported an empty queue — so this
  // button appeared to work and did nothing at all. The authorisation decision
  // is made above, against the member's own role, before the admin client is
  // ever reached.
  const runner = createAdminClient();
  const cycleKey = `demo-cycle-${randomUUID()}`;
  const automations = await runDueAutomations(runner, ctx.businessId, cycleKey, 'demo_cycle');
  const outbox = await runOutboxBatch(runner, ctx.businessId, `demo:${cycleKey}`, 25);

  await ctx.supabase.from('activity_logs').insert({
    business_id: ctx.businessId, actor_id: ctx.userId,
    action: 'execution.demo_cycle', resource_type: 'business', resource_id: ctx.businessId,
    metadata: { automations: automations.ran, outbox } as unknown as Json, is_mock: true,
  });

  revalidatePath('/app/automations');
  back(`?cycle=${automations.ran}_${outbox.sent}`);
}

export async function toggleEmergencyStop(form: FormData) {
  const ctx = await requireBusinessContext();
  if (!canManage(ctx.role)) back('?error=forbidden');
  const stop = text(form, 'stop') === '1';

  const { error } = await ctx.supabase.rpc('set_emergency_stop', {
    p_business_id: ctx.businessId,
    p_stop: stop,
    p_reason: text(form, 'reason') || (stop ? 'Остановлено владельцем' : 'Возобновлено владельцем'),
  });
  if (error) back(`?error=${encodeURIComponent(describeDbError(error))}`);

  revalidatePath('/app/automations');
  revalidatePath('/app/today');
  back(stop ? '?stopped=1' : '?resumed=1');
}

/**
 * Runs a real health check and stores the resulting state with its evidence.
 * The database refuses to store `connected` without evidence, so a channel can
 * never be labelled live on the strength of a form submission alone.
 */
/**
 * Issues a one-hour, single-use code that attaches the owner's Telegram chat.
 *
 * The code is what the bot verifies; the cabinet never sees a chat id and the
 * bot never sees a session. That keeps the two identities separate — a leaked
 * link cannot be replayed into an account, and a leaked session cannot be
 * turned into a chat.
 */
export async function issueTelegramLink() {
  const ctx = await requireBusinessContext();
  if (!canManage(ctx.role)) back('?error=forbidden');

  const { data, error } = await ctx.supabase.rpc('issue_telegram_link', { p_business_id: ctx.businessId });
  if (error) back('?error=' + encodeURIComponent(describeDbError(error)));

  const result = (data ?? {}) as { code?: string };
  back('?telegram_code=' + encodeURIComponent(String(result.code ?? '')));
}

export async function checkConnectorHealth(form: FormData) {
  const ctx = await requireBusinessContext();
  if (!canManage(ctx.role)) back('?error=forbidden');

  const channel = text(form, 'channel') || 'whatsapp';
  const adapterName = text(form, 'adapter') || 'mock';
  const endpoint = text(form, 'endpoint');
  const secret = process.env[`QADAM_WEBHOOK_SECRET_${channel.toUpperCase()}`] ?? process.env.QADAM_WEBHOOK_SECRET;

  const adapter = createAdapter(adapterName, { channel: channel as ChannelKind, endpoint, secret });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  const health = await adapter.healthCheck(controller.signal).catch((error: Error) => ({
    ok: false, state: 'error' as ConnectorState, checkedAt: new Date().toISOString(), evidence: {}, error: error.message,
  }));
  clearTimeout(timer);

  const state = resolveConnectorState({
    businessMode: ctx.business.mode,
    adapter: adapterName,
    hasCredentials: adapterName === 'mock' ? true : Boolean(endpoint && secret),
    healthOk: health.ok,
    healthDeclaredState: health.state,
  });

  const { error } = await ctx.supabase.from('business_channels').upsert({
    business_id: ctx.businessId,
    channel_type: channel,
    adapter: adapterName,
    status: state === 'connected' || state === 'sandbox' ? 'connected' : state === 'error' ? 'error' : 'not_connected',
    connector_state: state,
    last_health_check_at: health.checkedAt,
    health_evidence: health.evidence as unknown as Json,
    last_error: health.error,
    settings: (endpoint ? { endpoint } : {}) as unknown as Json,
    is_mock: ctx.business.mode === 'demo',
  }, { onConflict: 'business_id,channel_type' });
  if (error) back(`?error=${encodeURIComponent(describeDbError(error))}`);

  if (state === 'error') {
    await ctx.supabase.from('notifications').insert({
      business_id: ctx.businessId, user_id: ctx.userId,
      notification_type: 'connector_error', category: 'connector_error',
      title: `Канал ${channel}: ошибка подключения`,
      body: health.error ?? 'Проверка связи не прошла.',
      action_url: '/app/automations', is_mock: ctx.business.mode === 'demo',
    });
  }

  revalidatePath('/app/automations');
  back(`?connector=${encodeURIComponent(`${channel}:${state}`)}`);
}
