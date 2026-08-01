'use server';

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { canManage, canMarket, requireBusinessContext } from '@/server/qadam/repository';
import { describeDbError } from '@/server/qadam/errors';
import { buildContentPack, checkPackCompleteness } from '@/ai/content-pack.ts';
import type { Json } from '@/types/database.generated';

const textValue = (form: FormData, key: string) => String(form.get(key) ?? '').trim();

export async function toggleFavorite(form: FormData) {
  const ctx = await requireBusinessContext();
  if (!canMarket(ctx.role)) throw new Error('FORBIDDEN');
  const toolId = textValue(form, 'toolId');
  const { data: row } = await ctx.supabase.from('favorite_tools').select('id').eq('business_id', ctx.businessId).eq('tool_id', toolId).eq('user_id', ctx.userId).maybeSingle();
  const result = row
    ? await ctx.supabase.from('favorite_tools').delete().eq('id', row.id)
    : await ctx.supabase.from('favorite_tools').insert({ business_id: ctx.businessId, tool_id: toolId, user_id: ctx.userId, is_mock: ctx.business.mode === 'demo' });
  if (result.error) throw result.error;
  revalidatePath('/app/tools');
}

export async function toggleToolActivation(form: FormData) {
  const ctx = await requireBusinessContext();
  if (!canMarket(ctx.role)) throw new Error('FORBIDDEN');
  const toolId = textValue(form, 'toolId');
  const { data: row } = await ctx.supabase.from('business_tools').select('id,status').eq('business_id', ctx.businessId).eq('tool_id', toolId).maybeSingle();
  const result = row
    ? await ctx.supabase.from('business_tools').update({ status: row.status === 'active' ? 'disabled' : 'active', activated_by: ctx.userId }).eq('id', row.id)
    : await ctx.supabase.from('business_tools').insert({ business_id: ctx.businessId, tool_id: toolId, status: 'active', activated_by: ctx.userId, is_mock: ctx.business.mode === 'demo' });
  if (result.error) throw result.error;
  revalidatePath('/app/tools');
  revalidatePath('/app/today');
}

export async function updateRecommendation(form: FormData) {
  const ctx = await requireBusinessContext();
  if (!canMarket(ctx.role)) throw new Error('FORBIDDEN');
  const id = textValue(form, 'id');
  const status = textValue(form, 'status');
  const expectedVersion = Number(textValue(form, 'version'));
  const reason = textValue(form, 'reason');
  const idempotencyKey = textValue(form, 'idempotencyKey') || `recommendation:${id}:${status}:${randomUUID()}`;
  const { error } = await ctx.supabase.rpc('transition_domain_entity', { p_entity_type: 'recommendation', p_entity_id: id, p_to_status: status, p_expected_version: expectedVersion, p_idempotency_key: idempotencyKey });
  if (error) throw error;
  if (reason) await ctx.supabase.from('recommendations').update({ feedback: { reason, kind: 'owner_feedback', trained_model: false } }).eq('id', id).eq('business_id', ctx.businessId);
  revalidatePath('/app/recommendations');
  revalidatePath('/app/today');
}

export async function createLoyaltyProgram(form: FormData) {
  const ctx = await requireBusinessContext();
  if (!canManage(ctx.role)) throw new Error('FORBIDDEN');
  const type = textValue(form, 'programType') === 'points' ? 'points' : 'stamps';
  const earn = Math.max(1, Number(textValue(form, 'earn') || '1'));
  const rewardCost = Math.max(1, Number(textValue(form, 'rewardCost') || '6'));
  const token = randomBytes(32).toString('base64url');
  const rules = type === 'points' ? { joinPoints: earn, earnPerMinor: 1000, expiryDays: 365 } : { joinStamps: earn, earnPerVisit: 1, expiryDays: 365 };
  const rewards = [{ nameRu: textValue(form, 'rewardNameRu') || 'Подарок', nameKk: textValue(form, 'rewardNameKk') || 'Сыйлық', costPoints: type === 'points' ? rewardCost : null, costStamps: type === 'stamps' ? rewardCost : null, inventoryLimit: null }];
  const { data, error } = await ctx.supabase.rpc('create_loyalty_program', {
    p_business_id: ctx.businessId,
    p_name: textValue(form, 'name'),
    p_program_type: type,
    p_rules: rules,
    p_rewards: rewards,
    p_location_id: (ctx.location?.id ?? null) as unknown as string,
    p_token: token,
    p_expires_at: new Date(Date.now() + 365 * 86400000).toISOString(),
    p_idempotency_key: `loyalty:create:${randomUUID()}`,
  });
  if (error) throw error;
  const result = data as { program_id?: string; qr_code_id?: string } | null;
  redirect(`/app/loyalty?created=1&program=${encodeURIComponent(result?.program_id ?? '')}&token=${encodeURIComponent(token)}`);
}

export async function revokeCustomerConsent(form: FormData) {
  const ctx = await requireBusinessContext();
  if (!canManage(ctx.role)) throw new Error('FORBIDDEN');
  const customerId = textValue(form, 'customerId');
  const scope = textValue(form, 'scope');
  const { error } = await ctx.supabase.from('customer_consents').insert({ business_id: ctx.businessId, customer_id: customerId, scope, status: 'revoked', source: 'owner_request', revoked_at: new Date().toISOString(), evidence: { immediate_exclusion: true }, is_mock: ctx.business.mode === 'demo' });
  if (error) throw error;
  await ctx.supabase.from('activity_logs').insert({ business_id: ctx.businessId, actor_id: ctx.userId, action: 'consent.revoked', resource_type: 'customer', resource_id: customerId, metadata: { scope }, is_mock: ctx.business.mode === 'demo' });
  revalidatePath(`/app/customers/${customerId}`);
}

export async function addCustomerNote(form: FormData) {
  const ctx = await requireBusinessContext();
  if (!canManage(ctx.role)) throw new Error('FORBIDDEN');
  const customerId = textValue(form, 'customerId');
  const note = textValue(form, 'note');
  if (!note) return;
  const { error } = await ctx.supabase.from('customer_notes').insert({ business_id: ctx.businessId, customer_id: customerId, author_id: ctx.userId, note, is_mock: ctx.business.mode === 'demo' });
  if (error) throw error;
  revalidatePath(`/app/customers/${customerId}`);
}

async function resolveProgramId(ctx: Awaited<ReturnType<typeof requireBusinessContext>>, requested: string) {
  if (requested) return requested;
  const { data } = await ctx.supabase.from('loyalty_programs').select('id').eq('business_id', ctx.businessId).eq('status', 'active').order('created_at').limit(1).maybeSingle();
  return data?.id ?? '';
}

export async function rotateQrCode(form: FormData) {
  const ctx = await requireBusinessContext();
  if (!canManage(ctx.role)) throw new Error('FORBIDDEN');
  const qrId = textValue(form, 'qrId');
  const programId = await resolveProgramId(ctx, textValue(form, 'programId'));
  if (!programId) redirect('/app/loyalty?error=no_active_program');
  const expiryDays = Math.max(1, Number(textValue(form, 'expiryDays') || '365'));
  const newToken = randomBytes(32).toString('base64url');

  const { error } = await ctx.supabase.rpc('rotate_qr_code', {
    p_business_id: ctx.businessId,
    p_loyalty_program_id: programId,
    p_qr_id: qrId || (null as unknown as string),
    p_token: newToken,
    p_expires_at: new Date(Date.now() + expiryDays * 86400000).toISOString(),
    p_idempotency_key: `qr:rotate:${randomUUID()}`,
  });
  if (error) redirect(`/app/loyalty?error=${encodeURIComponent(describeDbError(error))}`);

  revalidatePath('/app/loyalty');
  redirect(`/app/loyalty?token=${encodeURIComponent(newToken)}&program=${encodeURIComponent(programId)}&rotated=1`);
}

export async function revokeQrCode(form: FormData) {
  const ctx = await requireBusinessContext();
  if (!canManage(ctx.role)) throw new Error('FORBIDDEN');
  const qrId = textValue(form, 'qrId');
  if (!qrId) redirect('/app/loyalty?error=qr_not_selected');

  const { data: updated, error } = await ctx.supabase.from('qr_codes')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('id', qrId).eq('business_id', ctx.businessId).neq('status', 'revoked')
    .select('id');
  if (error) redirect(`/app/loyalty?error=${encodeURIComponent(describeDbError(error))}`);
  if (!updated?.length) redirect('/app/loyalty?error=qr_already_revoked');

  await ctx.supabase.from('activity_logs').insert({
    business_id: ctx.businessId,
    actor_id: ctx.userId,
    action: 'qr.revoked',
    resource_type: 'qr_code',
    resource_id: qrId,
    is_mock: ctx.business.mode === 'demo',
  });

  revalidatePath('/app/loyalty');
  redirect('/app/loyalty?revoked=1');
}

export async function auditCustomerExport() {
  const ctx = await requireBusinessContext();
  if (!canMarket(ctx.role)) throw new Error('FORBIDDEN');

  await ctx.supabase.from('activity_logs').insert({
    business_id: ctx.businessId,
    actor_id: ctx.userId,
    action: 'customers.exported',
    resource_type: 'customer',
    resource_id: ctx.businessId,
    metadata: { format: 'csv', exported_at: new Date().toISOString() },
    is_mock: ctx.business.mode === 'demo',
  });
}

/**
 * Content Studio: derives channel-ready drafts from the campaign's own Growth
 * Contract snapshot. Deterministic today; the AI provider will replace the
 * composer without changing this write path.
 */
export async function generateCampaignContent(form: FormData) {
  const ctx = await requireBusinessContext();
  if (!canMarket(ctx.role)) throw new Error('FORBIDDEN');
  const campaignId = textValue(form, 'campaignId');
  if (!campaignId) redirect('/app/content?error=campaign_required');

  const { data: campaign } = await ctx.supabase.from('campaigns').select('id,name,channel,growth_contract_id,ends_at,starts_at').eq('business_id', ctx.businessId).eq('id', campaignId).maybeSingle();
  if (!campaign) redirect('/app/content?error=campaign_not_found');
  const { data: contract } = await ctx.supabase.from('growth_contracts').select('accepted_snapshot').eq('business_id', ctx.businessId).eq('id', campaign.growth_contract_id).maybeSingle();

  const snapshot = (contract?.accepted_snapshot ?? {}) as {
    contentBrief?: { ru?: string; kk?: string };
    simulator?: { assumptions?: { durationDays?: number; mechanic?: { type?: string; giftCostMinor?: number; thresholdMinor?: number; discountBps?: number; couponMinor?: number } } };
  };
  const mechanic = snapshot.simulator?.assumptions?.mechanic;
  const durationDays = snapshot.simulator?.assumptions?.durationDays ?? 7;

  // The offer line is derived from the contract's own mechanic so the copy can
  // never advertise something the approved economics do not cover.
  const offerRu = mechanic?.type === 'gift_with_threshold'
    ? `подарок при заказе от ${Number(mechanic.thresholdMinor ?? 0).toLocaleString('ru-RU')} ₸`
    : mechanic?.type === 'percentage_discount' || mechanic?.type === 'happy_hours'
      ? `скидка ${Math.round(Number(mechanic.discountBps ?? 0) / 100)}%`
      : mechanic?.type === 'return_coupon'
        ? `купон ${Number(mechanic.couponMinor ?? 0).toLocaleString('ru-RU')} ₸ на следующий визит`
        : 'персональное предложение';
  const offerKk = mechanic?.type === 'gift_with_threshold'
    ? `${Number(mechanic.thresholdMinor ?? 0).toLocaleString('ru-RU')} ₸-ден бастап тапсырысқа сыйлық`
    : mechanic?.type === 'percentage_discount' || mechanic?.type === 'happy_hours'
      ? `${Math.round(Number(mechanic.discountBps ?? 0) / 100)}% жеңілдік`
      : mechanic?.type === 'return_coupon'
        ? `келесі келуге ${Number(mechanic.couponMinor ?? 0).toLocaleString('ru-RU')} ₸ купон`
        : 'жеке ұсыныс';

  // One tracking code per campaign links content -> tracking -> impact.
  const publicCode = `QDM-${randomBytes(4).toString('hex').toUpperCase()}`;
  const { data: existingCode } = await ctx.supabase.from('tracking_codes')
    .select('id,public_code').eq('business_id', ctx.businessId).eq('campaign_id', campaignId).limit(1).maybeSingle();
  let trackingCodeId = existingCode?.id ?? null;
  let trackingCode = existingCode?.public_code ?? publicCode;
  if (!trackingCodeId) {
    const { data: createdCode, error: codeError } = await ctx.supabase.from('tracking_codes').insert({
      business_id: ctx.businessId,
      campaign_id: campaignId,
      // PostgREST accepts bytea as a \x-prefixed hex literal.
      code_hash: `\\x${createHash('sha256').update(publicCode).digest('hex')}` as unknown as string,
      public_code: publicCode,
      purpose: 'campaign_attribution',
      is_mock: ctx.business.mode === 'demo',
    }).select('id,public_code').single();
    if (codeError) redirect(`/app/content?error=${encodeURIComponent(describeDbError(codeError))}`);
    trackingCodeId = createdCode.id;
    trackingCode = createdCode.public_code;
  }

  const assets = buildContentPack({
    businessName: ctx.business.name,
    offerRu,
    offerKk,
    briefRu: snapshot.contentBrief?.ru ?? campaign.name,
    briefKk: snapshot.contentBrief?.kk ?? campaign.name,
    channel: campaign.channel,
    trackingCode,
    quietWindow: '15:00–18:00',
    durationDays,
  });

  const completeness = checkPackCompleteness(assets, ['ru', 'kk']);
  if (!completeness.complete) {
    redirect(`/app/content?error=${encodeURIComponent(`Пакет неполный: ${completeness.missing.slice(0, 3).join('; ')}`)}`);
  }

  const { error } = await ctx.supabase.from('content_items').insert(assets.map((asset) => ({
    business_id: ctx.businessId,
    campaign_id: campaignId,
    content_kind: asset.kind,
    channel: asset.channel,
    locale: asset.locale,
    body: asset.body,
    alt_text: asset.altText,
    cta: asset.cta,
    status: 'draft',
    is_mock: ctx.business.mode === 'demo',
  })));
  if (error) redirect(`/app/content?error=${encodeURIComponent(describeDbError(error))}`);

  await ctx.supabase.from('activity_logs').insert({
    business_id: ctx.businessId, actor_id: ctx.userId, action: 'content.generated',
    resource_type: 'campaign', resource_id: campaignId,
    metadata: {
      items: assets.length,
      generator: 'qadam_content_pack_v1',
      tracking_code_id: trackingCodeId,
      native_review_required: completeness.nativeReviewRequired,
    },
    is_mock: ctx.business.mode === 'demo',
  });

  revalidatePath('/app/content');
  revalidatePath(`/app/campaigns/${campaignId}`);
  redirect(`/app/content?campaign=${campaignId}&generated=${assets.length}`);
}

export async function updateContentItem(form: FormData) {
  const ctx = await requireBusinessContext();
  if (!canMarket(ctx.role)) throw new Error('FORBIDDEN');
  const id = textValue(form, 'id');
  const body = textValue(form, 'body');
  const status = textValue(form, 'status');
  const patch: { body?: string; status?: string } = {};
  if (body) patch.body = body;
  if (status) patch.status = status;
  if (!Object.keys(patch).length) return;

  const { error } = await ctx.supabase.from('content_items').update(patch).eq('id', id).eq('business_id', ctx.businessId);
  if (error) redirect(`/app/content?error=${encodeURIComponent(describeDbError(error))}`);
  revalidatePath('/app/content');
}

export async function saveAutomation(form: FormData) {
  const ctx = await requireBusinessContext();
  if (!canMarket(ctx.role)) throw new Error('FORBIDDEN');
  const inactiveDays = Math.max(1, Number(textValue(form, 'inactiveDays') || '30'));
  const maxPerRun = Math.max(1, Number(textValue(form, 'maxPerRun') || '25'));

  const { error } = await ctx.supabase.from('automations').insert({
    business_id: ctx.businessId,
    name: textValue(form, 'name') || 'Win-back после паузы',
    automation_type: textValue(form, 'automationType') || 'winback',
    trigger_rules: { kind: 'customer_inactive', days: inactiveDays } as unknown as Json,
    action_rules: { kind: 'propose_growth_contract', requiresOwnerApproval: true } as unknown as Json,
    // Automations never send without an owner-approved Growth Contract.
    guardrails: { maxRecipientsPerRun: maxPerRun, requiresConsent: true, stopOnNegativeContribution: true, ownerApprovalRequired: true } as unknown as Json,
    status: 'draft',
    created_by: ctx.userId,
    is_mock: ctx.business.mode === 'demo',
  });
  if (error) redirect(`/app/automations?error=${encodeURIComponent(describeDbError(error))}`);
  revalidatePath('/app/automations');
  redirect('/app/automations?created=1');
}

export async function transitionAutomation(form: FormData) {
  const ctx = await requireBusinessContext();
  if (!canMarket(ctx.role)) throw new Error('FORBIDDEN');
  const id = textValue(form, 'id');
  const { error } = await ctx.supabase.rpc('transition_domain_entity', {
    p_entity_type: 'automation',
    p_entity_id: id,
    p_to_status: textValue(form, 'toStatus'),
    p_expected_version: Number(textValue(form, 'expectedVersion') || '1'),
    p_idempotency_key: `automation:${id}:${textValue(form, 'toStatus')}:${randomUUID()}`,
  });
  if (error) redirect(`/app/automations?error=${encodeURIComponent(describeDbError(error))}`);
  revalidatePath('/app/automations');
  redirect('/app/automations?updated=1');
}

export async function saveBusinessSettings(form: FormData) {
  const ctx = await requireBusinessContext();
  if (!canManage(ctx.role)) throw new Error('FORBIDDEN');

  const name = textValue(form, 'name');
  if (name) {
    const { error } = await ctx.supabase.from('businesses').update({ name }).eq('id', ctx.businessId);
    if (error) redirect(`/app/settings?error=${encodeURIComponent(describeDbError(error))}`);
  }

  const averageCheck = Number(textValue(form, 'averageCheckMinor') || '0');
  const marginFloorBps = Number(textValue(form, 'marginFloorBps') || '0');
  const marketingBudget = Number(textValue(form, 'monthlyMarketingBudgetMinor') || '0');
  if (averageCheck > 0 && marginFloorBps >= 0 && marginFloorBps <= 10000) {
    const { error } = await ctx.supabase.from('business_profiles')
      .update({ average_check_minor: averageCheck, margin_floor_bps: marginFloorBps, monthly_marketing_budget_minor: marketingBudget })
      .eq('business_id', ctx.businessId);
    if (error) redirect(`/app/settings?error=${encodeURIComponent(describeDbError(error))}`);
  }

  const city = textValue(form, 'city');
  const locationId = textValue(form, 'locationId');
  if (locationId && city) {
    const { error } = await ctx.supabase.from('business_locations')
      .update({ city, district: textValue(form, 'district') || null, address_text: textValue(form, 'addressText') || null })
      .eq('id', locationId).eq('business_id', ctx.businessId);
    if (error) redirect(`/app/settings?error=${encodeURIComponent(describeDbError(error))}`);
  }

  await ctx.supabase.from('activity_logs').insert({
    business_id: ctx.businessId, actor_id: ctx.userId, action: 'business.settings_updated',
    resource_type: 'business', resource_id: ctx.businessId,
    metadata: { fields: ['name', 'economics', 'location'] },
    is_mock: ctx.business.mode === 'demo',
  });

  revalidatePath('/app/settings');
  revalidatePath('/app/today');
  redirect('/app/settings?saved=1');
}

export async function saveCustomSegment(form: FormData) {
  const ctx = await requireBusinessContext();
  if (!canMarket(ctx.role)) throw new Error('FORBIDDEN');
  const nameRu = textValue(form, 'nameRu');
  const nameKk = textValue(form, 'nameKk');
  const stage = textValue(form, 'stage');
  const minVisits = Number(textValue(form, 'minVisits') || '0');
  const minAov = Number(textValue(form, 'minAov') || '0');
  const daysInactive = Number(textValue(form, 'daysInactive') || '0');

  const definition = {
    stage: stage || undefined,
    minVisits: minVisits > 0 ? minVisits : undefined,
    minAovMinor: minAov > 0 ? minAov : undefined,
    daysInactive: daysInactive > 0 ? daysInactive : undefined,
  };

  const { error } = await ctx.supabase.from('customer_segments').insert({
    business_id: ctx.businessId,
    code: `custom_${randomUUID().slice(0, 8)}`,
    name_ru: nameRu || 'Свой сегмент',
    name_kk: nameKk || 'Таңдамалы сегмент',
    definition: definition as unknown as Json,
    is_dynamic: true,
    is_mock: ctx.business.mode === 'demo',
  });
  if (error) throw error;

  revalidatePath('/app/segments');
}

