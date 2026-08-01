'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { describeDbError } from '@/server/qadam/errors';
import { canMarket, requireBusinessContext } from '@/server/qadam/repository';
import { loadStudioSession } from '@/server/qadam/campaign-studio';

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
const int = (form: FormData, key: string, fallback: number) => {
  const raw = text(form, key);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
};

const BASE = '/app/campaigns/studio';
function backTo(step: number, extra = ''): never {
  redirect(`${BASE}?step=${step}${extra}`);
}

/** Advances the contract state machine (defer, reject). */
export async function transitionStudioContract(form: FormData) {
  const ctx = await requireBusinessContext();
  if (!canMarket(ctx.role)) backTo(6, '&error=forbidden');

  const contractId = text(form, 'contractId');
  const toStatus = text(form, 'toStatus');
  const { error } = await ctx.supabase.rpc('transition_domain_entity', {
    p_entity_type: 'growth_contract',
    p_entity_id: contractId,
    p_to_status: toStatus,
    p_expected_version: int(form, 'expectedVersion', 1),
    p_idempotency_key: `studio:${contractId}:${toStatus}:${randomUUID()}`,
  });
  if (error) backTo(6, `&error=${encodeURIComponent(describeDbError(error))}`);

  revalidatePath(BASE);
  backTo(6, '&transitioned=1');
}

/**
 * Owner approval. Moves compiled -> awaiting_approval -> approved so the
 * database records who approved which immutable snapshot and when; the snapshot
 * itself is already protected from edits by `protect_accepted_growth_contract`.
 */
export async function approveStudioContract(form: FormData) {
  const ctx = await requireBusinessContext();
  if (!canMarket(ctx.role)) backTo(6, '&error=forbidden');
  const contractId = text(form, 'contractId');

  for (const toStatus of ['awaiting_approval', 'approved'] as const) {
    const { data: current } = await ctx.supabase.from('growth_contracts')
      .select('status,optimistic_version').eq('business_id', ctx.businessId).eq('id', contractId).maybeSingle();
    if (!current) backTo(6, '&error=' + encodeURIComponent('Контракт не найден.'));
    if (current!.status === toStatus || current!.status === 'approved') continue;

    const { error } = await ctx.supabase.rpc('transition_domain_entity', {
      p_entity_type: 'growth_contract',
      p_entity_id: contractId,
      p_to_status: toStatus,
      p_expected_version: current!.optimistic_version,
      p_idempotency_key: `studio:${contractId}:${toStatus}:${randomUUID()}`,
    });
    if (error) backTo(6, `&error=${encodeURIComponent(describeDbError(error))}`);
  }

  // Record the approving actor and moment alongside the frozen snapshot.
  // `enforce_domain_transition` requires optimistic_version to advance on every
  // update, including one that leaves the status alone, so bump it here too.
  const { data: approvedRow } = await ctx.supabase.from('growth_contracts')
    .select('optimistic_version,approved_at').eq('business_id', ctx.businessId).eq('id', contractId).maybeSingle();
  if (approvedRow && !approvedRow.approved_at) {
    const { error: stampError } = await ctx.supabase.from('growth_contracts')
      .update({
        approved_by: ctx.userId,
        approved_at: new Date().toISOString(),
        optimistic_version: approvedRow.optimistic_version + 1,
      })
      .eq('id', contractId).eq('business_id', ctx.businessId).eq('optimistic_version', approvedRow.optimistic_version);
    if (stampError) backTo(6, `&error=${encodeURIComponent(describeDbError(stampError))}`);
  }

  await ctx.supabase.from('activity_logs').insert({
    business_id: ctx.businessId,
    actor_id: ctx.userId,
    action: 'growth_contract.approved',
    resource_type: 'growth_contract',
    resource_id: contractId,
    metadata: { approved_at: new Date().toISOString() },
    is_mock: ctx.business.mode === 'demo',
  });

  revalidatePath(BASE);
  backTo(7, '&approved=1');
}

/**
 * Final launch.
 *
 * The server re-reads and re-checks the contract rather than trusting the page:
 * status must still be `approved` at the expected version, Margin Shield must
 * not have blocked it, and consent is resolved again at insert time by the
 * audience trigger. In PRODUCTION_MODE a missing channel connector refuses the
 * launch instead of reporting a success that never happened.
 */
export async function launchStudioCampaign(form: FormData) {
  const ctx = await requireBusinessContext();
  if (!canMarket(ctx.role)) backTo(7, '&error=forbidden');

  const contractId = text(form, 'contractId');
  const channel = text(form, 'channel') || 'whatsapp';
  const name = text(form, 'campaignName') || 'Кампания QADAM';

  const { data: contract } = await ctx.supabase.from('growth_contracts')
    .select('id,status,optimistic_version,margin_decision,consent_summary')
    .eq('business_id', ctx.businessId).eq('id', contractId).maybeSingle();
  if (!contract) backTo(7, '&error=' + encodeURIComponent('Контракт не найден.'));

  const decision = (contract!.margin_decision ?? {}) as { status?: string };
  if (decision.status === 'blocked') {
    backTo(7, '&error=' + encodeURIComponent('Margin Shield заблокировал этот контракт — запуск невозможен.'));
  }
  if (contract!.status !== 'approved') {
    backTo(6, '&error=' + encodeURIComponent('Контракт должен быть подтверждён владельцем перед запуском.'));
  }

  // Connector honesty: production refuses rather than simulating.
  const isDemo = ctx.business.mode === 'demo';
  const { data: connector } = await ctx.supabase.from('business_channels')
    .select('channel_type,status').eq('business_id', ctx.businessId).eq('channel_type', channel).maybeSingle();
  const connected = connector?.status === 'connected';
  if (!connected && !isDemo && process.env.QADAM_APP_MODE === 'PRODUCTION_MODE') {
    backTo(7, '&error=' + encodeURIComponent(`Канал ${channel} не подключён. Подключите провайдера в настройках — QADAM не показывает фальшивую отправку.`));
  }

  const { data: launched, error } = await ctx.supabase.rpc('launch_growth_contract', {
    p_contract_id: contractId,
    p_name: name,
    p_channel: channel,
    p_expected_version: contract!.optimistic_version,
    p_idempotency_key: `studio:launch:${contractId}`,
  });
  if (error) backTo(7, `&error=${encodeURIComponent(describeDbError(error))}`);

  const result = (launched ?? {}) as { campaign_id?: string; duplicate?: boolean };
  if (!result.campaign_id) backTo(7, '&error=' + encodeURIComponent('Кампания не создана.'));

  // Materialise the audience; the database trigger is the final consent gate.
  const audienceIds = String(form.get('audienceCustomerIds') ?? '').split(',').map((id) => id.trim()).filter(Boolean);
  if (audienceIds.length) {
    const { data: eligible } = await ctx.supabase.rpc('effective_consent_customers', {
      p_business_id: ctx.businessId,
      p_scope: `marketing.${channel}`,
      p_customer_ids: audienceIds,
    });
    const eligibleSet = new Set((eligible ?? []) as string[]);
    await ctx.supabase.from('campaign_audiences').upsert(
      audienceIds.map((customerId) => ({
        business_id: ctx.businessId,
        campaign_id: result.campaign_id as string,
        customer_id: customerId,
        inclusion_status: eligibleSet.has(customerId) ? 'included' : 'excluded',
        exclusion_reason: eligibleSet.has(customerId) ? null : 'no_effective_consent',
        rules_evidence: { source: 'campaign_studio', checked_at: new Date().toISOString() },
        is_mock: isDemo,
      })),
      { onConflict: 'campaign_id,customer_id' },
    );
  }

  // Demo runs reach a labelled simulated state; nothing is sent either way.
  await ctx.supabase.from('activity_logs').insert({
    business_id: ctx.businessId,
    actor_id: ctx.userId,
    action: isDemo ? 'campaign.simulated' : 'campaign.launch_requested',
    resource_type: 'campaign',
    resource_id: result.campaign_id as string,
    metadata: { connector: connected ? 'connected' : 'not_connected', mode: isDemo ? 'DEMO_MODE' : 'PRODUCTION_MODE', duplicate: Boolean(result.duplicate) },
    is_mock: isDemo,
  });

  const session = await loadStudioSession();
  await ctx.supabase.from('campaign_drafts').update({ status: 'launched' }).eq('id', session.id).eq('business_id', ctx.businessId);

  revalidatePath('/app/campaigns');
  revalidatePath('/app/today');
  redirect(`/app/campaigns/${result.campaign_id}?launched=1${isDemo ? '&simulated=1' : ''}`);
}
