'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { PromotionMechanic } from '@/domain/index.ts';
import { DomainError } from '@/domain/shared.ts';
import { GrowthContractService } from '@/server/domain/growth-contract-service';
import { canMarket, requireBusinessContext } from '@/server/qadam/repository';
import { loadGosInputs } from '@/server/qadam/gos-facts';
import { describeDbError } from '@/server/qadam/errors';

const textValue = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
const intValue = (form: FormData, key: string, fallback: number) => {
  // An absent field must fall back, not become 0: Number('') === 0 would have
  // silently zeroed the uplift assumptions and made Margin Shield block everything.
  const raw = textValue(form, key);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
};

function failTo(path: string, message: string): never {
  redirect(`${path}${path.includes('?') ? '&' : '?'}error=${encodeURIComponent(message)}#campaign-result`);
}

/**
 * Margin Shield refuses to compile unsafe economics, so the contract that would
 * have carried the reasons never exists. Explain the refusal in the owner's terms
 * instead of leaking the domain error code.
 */
function domainMessage(error: DomainError): string {
  switch (error.code) {
    case 'MARGIN_BLOCKED':
      return 'Margin Shield остановил кампанию: при этих условиях вклад-маржа опускается ниже вашего порога. Уменьшите скидку, добавьте минимальный чек или сузьте аудиторию.';
    case 'FORBIDDEN_OR_MISSING':
      return 'Не хватает данных бизнеса: проверьте профиль, лимиты и выбранный сигнал.';
    case 'PREVIEW_MISMATCH':
      return 'Условия изменились во время расчёта — пересчитайте экономику.';
    default:
      return `${error.code}: ${error.message}`;
  }
}

function buildMechanic(form: FormData): PromotionMechanic {
  const kind = textValue(form, 'mechanic') || 'gift_with_threshold';
  const amount = Math.max(0, intValue(form, 'mechanicAmount', 0));
  const threshold = Math.max(1, intValue(form, 'thresholdMinor', 3500));
  switch (kind) {
    case 'percentage_discount': return { type: 'percentage_discount', discountBps: amount };
    case 'fixed_discount': return { type: 'fixed_discount', discountMinor: amount };
    case '2_plus_1': return { type: '2_plus_1', freeUnitCostMinor: amount };
    case 'happy_hours': return { type: 'happy_hours', discountBps: amount };
    case 'return_coupon': return { type: 'return_coupon', couponMinor: amount };
    case 'bonus_points': return { type: 'bonus_points', liabilityBps: amount };
    default: return { type: 'gift_with_threshold', giftCostMinor: amount, thresholdMinor: threshold };
  }
}

/**
 * Compiles a Growth Contract from the studio form. All economics, Margin Shield
 * and consent numbers are recalculated server-side; the form only supplies inputs.
 */
export async function compileCampaignDraft(form: FormData) {
  const ctx = await requireBusinessContext();
  const back = `/app/campaigns/new?segment=${encodeURIComponent(textValue(form, 'segment'))}&channel=${encodeURIComponent(textValue(form, 'channel') || 'telegram')}`;
  if (!canMarket(ctx.role)) failTo(back, 'Недостаточно прав для подготовки кампании.');

  const signalId = textValue(form, 'signalId');
  const recommendationId = textValue(form, 'recommendationId');
  const channel = textValue(form, 'channel') || 'telegram';
  const audienceCustomerIds = String(form.get('audienceCustomerIds') ?? '').split(',').map((id) => id.trim()).filter(Boolean);
  if (!signalId || !recommendationId) failTo(back, 'Нужны открытый сигнал и рекомендация.');
  if (!audienceCustomerIds.length) failTo(back, 'В выбранном сегменте нет клиентов с действующим согласием.');

  const durationDays = Math.max(1, intValue(form, 'durationDays', 7));
  const periodStart = new Date();
  const periodEnd = new Date(periodStart.getTime() + durationDays * 86400000);

  const aovMinor = Math.max(1, intValue(form, 'aovMinor', 3450));
  const unitCostMinor = Math.max(0, intValue(form, 'unitCostMinor', 1400));
  const channelCostMinor = Math.max(0, intValue(form, 'channelCostMinor', 20));
  // The score used to be nine constants identical for every business. It is
  // derived from this tenant's own signal, consent and history instead.
  const gos = await loadGosInputs(ctx.supabase, ctx.businessId, {
    signalId,
    segmentSize: audienceCustomerIds.length,
    consentEligible: audienceCustomerIds.length,
    contributionMargin: (aovMinor - unitCostMinor) / aovMinor,
    budgetMinor: Math.max(0, intValue(form, 'budgetCapMinor', 7000)),
    expectedCostMinor: audienceCustomerIds.length * channelCostMinor,
  });

  try {
    const compiled = await new GrowthContractService(ctx.supabase, ctx.userId).compile({
      businessId: ctx.businessId,
      signalId,
      recommendationId,
      audienceCustomerIds,
      consentScope: `marketing.${channel}`,
      simulator: {
        baselineConversion: Math.min(1, Math.max(0, intValue(form, 'baselineConversionBps', 1200) / 10000)),
        uplift: {
          pessimistic: Math.max(0, intValue(form, 'upliftLowBps', 400) / 10000),
          base: Math.max(0, intValue(form, 'upliftBaseBps', 900) / 10000),
          optimistic: Math.max(0, intValue(form, 'upliftHighBps', 1500) / 10000),
        },
        averageOrderValueMinor: aovMinor,
        unitCostMinor,
        channelCostPerContactMinor: channelCostMinor,
        fixedCostMinor: Math.max(0, intValue(form, 'fixedCostMinor', 0)),
        durationDays,
        frequencyCap: Math.max(1, intValue(form, 'frequencyCap', 1)),
        cannibalization: Math.min(1, Math.max(0, intValue(form, 'cannibalizationBps', 1500) / 10000)),
        mechanic: buildMechanic(form),
        period: { start: periodStart.toISOString(), end: periodEnd.toISOString() },
        source: 'campaign_studio',
      },
      gos,
      contentBrief: {
        ru: textValue(form, 'briefRu') || 'Персональное предложение для выбранного сегмента.',
        kk: textValue(form, 'briefKk') || 'Таңдалған сегментке арналған жеке ұсыныс.',
      },
      channel,
      attributionPlan: { method: 'promo_code_and_qr', holdoutBps: 1000, windowDays: durationDays },
      stopRule: { maxRedemptions: audienceCustomerIds.length, maxBudgetMinor: Math.max(0, intValue(form, 'budgetCapMinor', 7000)), pauseOnNegativeContribution: true },
    });
    revalidatePath('/app/campaigns');
    // Якорь возвращает владельца к решению Margin Shield, ради которого он и
    // нажимал кнопку. Без него страница открывалась с начала, и результат
    // оставался ниже экрана.
    redirect(`/app/campaigns/new?contract=${compiled.id}&segment=${encodeURIComponent(textValue(form, 'segment'))}&channel=${encodeURIComponent(channel)}&compiled=1#campaign-result`);
  } catch (error) {
    if (error instanceof DomainError) failTo(back, domainMessage(error));
    throw error;
  }
}

export async function transitionContract(form: FormData) {
  const ctx = await requireBusinessContext();
  const contractId = textValue(form, 'contractId');
  const back = `/app/campaigns/new?contract=${encodeURIComponent(contractId)}`;
  if (!canMarket(ctx.role)) failTo(back, 'Недостаточно прав для изменения статуса контракта.');

  const { error } = await ctx.supabase.rpc('transition_domain_entity', {
    p_entity_type: 'growth_contract',
    p_entity_id: contractId,
    p_to_status: textValue(form, 'toStatus'),
    p_expected_version: intValue(form, 'expectedVersion', 1),
    p_idempotency_key: `contract:${contractId}:${textValue(form, 'toStatus')}:${randomUUID()}`,
  });
  if (error) failTo(back, describeDbError(error));
  revalidatePath('/app/campaigns');
  redirect(`${back}&transitioned=1#campaign-result`);
}

export async function launchCampaign(form: FormData) {
  const ctx = await requireBusinessContext();
  const contractId = textValue(form, 'contractId');
  const back = `/app/campaigns/new?contract=${encodeURIComponent(contractId)}`;
  if (!canMarket(ctx.role)) failTo(back, 'Недостаточно прав для запуска кампании.');

  const { data, error } = await ctx.supabase.rpc('launch_growth_contract', {
    p_contract_id: contractId,
    p_name: textValue(form, 'name') || 'Кампания QADAM',
    p_channel: textValue(form, 'channel') || 'telegram',
    p_expected_version: intValue(form, 'expectedVersion', 1),
    p_idempotency_key: `launch:${contractId}:${randomUUID()}`,
  });
  if (error) failTo(back, describeDbError(error));

  const result = (data ?? {}) as { campaign_id?: string };
  if (!result.campaign_id) failTo(back, 'Кампания не создана.');

  // Materialise the consent-checked audience; the DB trigger is the final gate.
  const audienceIds = String(form.get('audienceCustomerIds') ?? '').split(',').map((id) => id.trim()).filter(Boolean);
  if (audienceIds.length) {
    const { data: eligible } = await ctx.supabase.rpc('effective_consent_customers', {
      p_business_id: ctx.businessId,
      p_scope: `marketing.${textValue(form, 'channel') || 'telegram'}`,
      p_customer_ids: audienceIds,
    });
    const eligibleSet = new Set(((eligible ?? []) as string[]));
    const rows = audienceIds.map((customerId) => ({
      business_id: ctx.businessId,
      campaign_id: result.campaign_id as string,
      customer_id: customerId,
      inclusion_status: eligibleSet.has(customerId) ? 'included' : 'excluded',
      exclusion_reason: eligibleSet.has(customerId) ? null : 'no_effective_consent',
      rules_evidence: { source: 'campaign_studio', checked_at: new Date().toISOString() },
      is_mock: ctx.business.mode === 'demo',
    }));
    await ctx.supabase.from('campaign_audiences').upsert(rows, { onConflict: 'campaign_id,customer_id' });
  }

  revalidatePath('/app/campaigns');
  revalidatePath('/app/today');
  redirect(`/app/campaigns/${result.campaign_id}?launched=1`);
}

export async function transitionCampaign(form: FormData) {
  const ctx = await requireBusinessContext();
  const campaignId = textValue(form, 'campaignId');
  const back = `/app/campaigns/${campaignId}`;
  if (!canMarket(ctx.role)) failTo(back, 'Недостаточно прав для изменения кампании.');

  const expectedVersion = intValue(form, 'expectedVersion', 1);
  const { data, error } = await ctx.supabase.from('campaigns')
    .update({ status: textValue(form, 'toStatus'), optimistic_version: expectedVersion + 1 })
    .eq('id', campaignId).eq('business_id', ctx.businessId).eq('optimistic_version', expectedVersion)
    .select('id,status');
  if (error) failTo(back, describeDbError(error));
  const updated = data?.[0];
  if (!updated) failTo(back, 'Кампания изменена другим пользователем — обновите страницу.');

  await ctx.supabase.from('activity_logs').insert({
    business_id: ctx.businessId,
    actor_id: ctx.userId,
    action: `campaign.${updated.status}`,
    resource_type: 'campaign',
    resource_id: campaignId,
    metadata: { from_version: expectedVersion },
    is_mock: ctx.business.mode === 'demo',
  });

  revalidatePath(back);
  revalidatePath('/app/campaigns');
  revalidatePath('/app/today');
  redirect(`${back}?updated=1`);
}
