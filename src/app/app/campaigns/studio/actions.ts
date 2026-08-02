'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import type { Locale, MechanicKind, OwnerGoal } from '@/ai/contract.ts';
import { DomainError } from '@/domain/shared.ts';
import { GrowthContractService } from '@/server/domain/growth-contract-service';
import { CampaignAiService, toPromotionMechanic } from '@/server/ai/campaign-ai-service';
import { describeDbError } from '@/server/qadam/errors';
import { canMarket, requireBusinessContext } from '@/server/qadam/repository';
import { loadGosInputs } from '@/server/qadam/gos-facts';
import { coerceDraft, loadStudioSession, validateStep, type StudioDraft } from '@/server/qadam/campaign-studio';
import { resolveStudioAudience } from '@/server/qadam/campaign-studio-data';
import type { Json } from '@/types/database.generated';

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

/** Reads the fields this step owns; every other field keeps its stored value. */
function applyStep(step: number, current: StudioDraft, form: FormData): StudioDraft {
  const next: StudioDraft = { ...current };
  if (step === 1) {
    next.goal = (text(form, 'goal') || current.goal) as OwnerGoal;
  }
  if (step === 2) {
    next.segmentCode = text(form, 'segmentCode') || current.segmentCode;
    next.channel = text(form, 'channel') || current.channel;
    next.weekdayOnly = form.get('weekdayOnly') === 'on';
    next.frequencyCap = int(form, 'frequencyCap', current.frequencyCap);
  }
  if (step === 3) {
    next.mechanic = (text(form, 'mechanic') || current.mechanic) as MechanicKind;
    next.benefitValue = int(form, 'benefitValue', current.benefitValue);
    next.thresholdMinor = int(form, 'thresholdMinor', current.thresholdMinor);
    next.unitCostMinor = int(form, 'unitCostMinor', current.unitCostMinor);
    next.ideaSource = 'owner';
  }
  if (step === 4) {
    next.durationDays = int(form, 'durationDays', current.durationDays);
    next.channel = text(form, 'channel') || current.channel;
    next.channelCostMinor = int(form, 'channelCostMinor', current.channelCostMinor);
    next.briefRu = text(form, 'briefRu') || current.briefRu;
    next.briefKk = text(form, 'briefKk') || current.briefKk;
    const locales = form.getAll('locales').map(String).filter((value) => value === 'ru' || value === 'kk') as Locale[];
    if (locales.length) next.locales = locales;
  }
  if (step === 5) {
    next.baselineConversionBps = int(form, 'baselineConversionBps', current.baselineConversionBps);
    next.upliftLowBps = int(form, 'upliftLowBps', current.upliftLowBps);
    next.upliftBaseBps = int(form, 'upliftBaseBps', current.upliftBaseBps);
    next.upliftHighBps = int(form, 'upliftHighBps', current.upliftHighBps);
    next.cannibalizationBps = int(form, 'cannibalizationBps', current.cannibalizationBps);
  }
  if (step === 7) {
    next.campaignName = text(form, 'campaignName') || current.campaignName;
  }
  return coerceDraft(next);
}

async function persist(sessionId: string, patch: Record<string, unknown>, expectedVersion: number) {
  const ctx = await requireBusinessContext();
  const { data, error } = await ctx.supabase.from('campaign_drafts')
    .update({ ...patch, optimistic_version: expectedVersion + 1 })
    .eq('id', sessionId).eq('business_id', ctx.businessId).eq('optimistic_version', expectedVersion)
    .select('id');
  if (error) return { ok: false as const, message: describeDbError(error) };
  if (!data?.length) return { ok: false as const, message: 'Черновик изменён в другой вкладке — обновите страницу.' };
  return { ok: true as const };
}

/** Saves the current step and moves. Input is never discarded, even when invalid. */
export async function saveStudioStep(form: FormData) {
  const session = await loadStudioSession();
  if (!canMarket(session.ctx.role)) backTo(session.currentStep, '&error=forbidden');

  const step = Math.min(7, Math.max(1, int(form, 'step', session.currentStep)));
  const direction = text(form, 'direction') || 'next';
  const draft = applyStep(step, session.draft, form);

  // Persist first: a validation failure must not cost the owner their typing.
  const target = direction === 'back' ? Math.max(1, step - 1) : Math.min(7, step + 1);
  const issues = direction === 'next' ? validateStep(step, draft) : [];
  const nextStep = issues.length ? step : target;

  const saved = await persist(session.id, { draft: draft as unknown as Json, current_step: nextStep }, session.optimisticVersion);
  if (!saved.ok) backTo(step, `&error=${encodeURIComponent(saved.message)}`);

  revalidatePath(BASE);
  if (issues.length) backTo(step, `&invalid=${encodeURIComponent(issues.map((issue) => issue.field).join(','))}`);
  backTo(nextStep);
}

/** Jump straight to a step the owner already reached. */
export async function gotoStudioStep(form: FormData) {
  const session = await loadStudioSession();
  const step = Math.min(7, Math.max(1, int(form, 'step', 1)));
  const saved = await persist(session.id, { current_step: step }, session.optimisticVersion);
  if (!saved.ok) backTo(session.currentStep, `&error=${encodeURIComponent(saved.message)}`);
  revalidatePath(BASE);
  backTo(step);
}

/** Runs the AI generator and stores the proposals on the draft for comparison. */
export async function generateStudioIdeas(form: FormData) {
  const session = await loadStudioSession();
  if (!canMarket(session.ctx.role)) backTo(3, '&error=forbidden');

  const draft = applyStep(1, session.draft, form);
  const audience = await resolveStudioAudience(session.ctx, draft.segmentCode, draft.channel);

  const service = new CampaignAiService(session.ctx.supabase, session.ctx.userId);
  const ideas = await service.generateIdeas({
    businessId: session.ctx.businessId,
    goal: draft.goal,
    channel: draft.channel,
    segment: { code: audience.segmentCode, label: audience.segmentLabel, size: audience.segmentSize, consentEligible: audience.eligibleIds.length },
    weekdayOnly: draft.weekdayOnly,
    frequencyCap: draft.frequencyCap,
    locales: draft.locales,
    idempotencyKey: `ai:studio:${session.id}:${randomUUID()}`,
  });

  // Only the proposal shape and copy are stored; the numbers are recomputed on render.
  const stored = {
    generatedAt: new Date().toISOString(),
    source: ideas.source,
    providerLabel: ideas.providerLabel,
    fallbackReason: ideas.fallbackReason,
    runId: ideas.runId,
    notes: ideas.notes,
    mechanics: ideas.evaluated.map((item) => ({
      kind: item.proposal.kind,
      benefitValue: item.proposal.benefitValue,
      thresholdMinor: item.proposal.thresholdMinor,
      durationDays: item.proposal.durationDays,
      hypothesis: item.proposal.hypothesis,
      whyFit: item.proposal.whyFit,
      audienceSummary: item.proposal.audienceSummary,
      risks: item.proposal.risks,
      requiredAssumptions: item.proposal.requiredAssumptions,
      copy: item.proposal.copy,
      blocked: item.blocked,
    })),
  };

  const saved = await persist(session.id, { draft: { ...draft, aiIdeas: stored } as unknown as Json, current_step: 3 }, session.optimisticVersion);
  if (!saved.ok) backTo(3, `&error=${encodeURIComponent(saved.message)}`);
  revalidatePath(BASE);
  backTo(3, '&generated=1');
}

/** Adopt one generated mechanic, or the Margin Shield safe alternative, in one action. */
export async function adoptStudioMechanic(form: FormData) {
  const session = await loadStudioSession();
  if (!canMarket(session.ctx.role)) backTo(3, '&error=forbidden');

  const draft: StudioDraft = {
    ...session.draft,
    mechanic: (text(form, 'mechanic') || session.draft.mechanic) as MechanicKind,
    benefitValue: int(form, 'benefitValue', session.draft.benefitValue),
    thresholdMinor: int(form, 'thresholdMinor', session.draft.thresholdMinor),
    durationDays: int(form, 'durationDays', session.draft.durationDays),
    ideaSource: (text(form, 'ideaSource') || 'ai_template') as StudioDraft['ideaSource'],
  };

  const saved = await persist(session.id, { draft: draft as unknown as Json, current_step: 5 }, session.optimisticVersion);
  if (!saved.ok) backTo(3, `&error=${encodeURIComponent(saved.message)}`);
  revalidatePath(BASE);
  backTo(5, '&adopted=1');
}

/**
 * Compiles the Growth Contract. Everything financial is recalculated here from
 * RLS-protected data; a blocked mechanic never produces a contract row.
 */
export async function compileStudioContract() {
  const session = await loadStudioSession();
  if (!canMarket(session.ctx.role)) backTo(5, '&error=forbidden');

  const draft = session.draft;
  const issues = [...validateStep(3, draft), ...validateStep(4, draft), ...validateStep(5, draft)];
  if (issues.length) backTo(5, `&invalid=${encodeURIComponent(issues.map((issue) => issue.field).join(','))}`);

  const audience = await resolveStudioAudience(session.ctx, draft.segmentCode, draft.channel);
  if (!audience.eligibleIds.length) backTo(2, '&error=' + encodeURIComponent('В выбранном сегменте нет клиентов с действующим согласием.'));

  const { data: signal } = await session.ctx.supabase.from('signals')
    .select('id').eq('business_id', session.ctx.businessId).eq('status', 'open')
    .order('growth_opportunity_score', { ascending: false }).limit(1).maybeSingle();
  let { data: recommendation } = await session.ctx.supabase.from('recommendations')
    .select('id').eq('business_id', session.ctx.businessId).in('status', ['open', 'accepted'])
    .order('confidence', { ascending: false }).limit(1).maybeSingle();

  // Rejecting every suggestion used to end the road here permanently. If a
  // signal exists, a recommendation for it can always be rebuilt.
  if (signal && !recommendation) {
    await session.ctx.supabase.rpc('refresh_my_recommendations');
    ({ data: recommendation } = await session.ctx.supabase.from('recommendations')
      .select('id').eq('business_id', session.ctx.businessId).in('status', ['open', 'accepted'])
      .order('confidence', { ascending: false }).limit(1).maybeSingle());
  }

  if (!signal) backTo(1, '&error=' + encodeURIComponent('Пока нет измеренного сигнала: нужны продажи хотя бы за две сопоставимые недели.'));
  if (!recommendation) backTo(1, '&error=' + encodeURIComponent('Сигнал есть, но рекомендацию собрать не удалось. Откройте «Рекомендации» и нажмите «Пересобрать по сигналам».'));

  // Entitlement is checked server-side, and a refusal must not cost the owner
  // their draft: the wizard state stays exactly where it is.
  const { data: quota } = await session.ctx.supabase.rpc('consume_entitlement', {
    p_business_id: session.ctx.businessId,
    p_key: 'growth_contracts_month',
    p_amount: 1,
    p_request_key: `contract:${session.id}:${session.optimisticVersion}`,
  });
  const verdict = (quota ?? {}) as { allowed?: boolean; message?: string; limit?: number; used?: number; plan?: string };
  if (verdict.allowed === false) {
    backTo(5, `&error=${encodeURIComponent(
      `${verdict.message ?? 'Достигнут лимит тарифа.'} Тариф ${verdict.plan ?? 'free'}: ${verdict.used ?? 0}/${verdict.limit ?? 0} за период.`)}`);
  }

  const { data: profile } = await session.ctx.supabase.from('business_profiles')
    .select('average_check_minor').eq('business_id', session.ctx.businessId).maybeSingle();
  const aov = profile?.average_check_minor ?? 3450;
  const start = new Date();
  const end = new Date(start.getTime() + draft.durationDays * 86_400_000);
  const gos = await loadGosInputs(session.ctx.supabase, session.ctx.businessId, {
    signalId: signal!.id,
    segmentSize: audience.segmentSize || audience.eligibleIds.length,
    consentEligible: audience.eligibleIds.length,
    contributionMargin: (aov - draft.unitCostMinor) / aov,
    budgetMinor: 7000,
    expectedCostMinor: audience.eligibleIds.length * draft.channelCostMinor,
  });

  try {
    const compiled = await new GrowthContractService(session.ctx.supabase, session.ctx.userId).compile({
      businessId: session.ctx.businessId,
      signalId: signal!.id,
      recommendationId: recommendation!.id,
      audienceCustomerIds: audience.eligibleIds,
      consentScope: `marketing.${draft.channel}`,
      simulator: {
        baselineConversion: draft.baselineConversionBps / 10_000,
        uplift: {
          pessimistic: draft.upliftLowBps / 10_000,
          base: draft.upliftBaseBps / 10_000,
          optimistic: draft.upliftHighBps / 10_000,
        },
        averageOrderValueMinor: aov,
        unitCostMinor: draft.unitCostMinor,
        channelCostPerContactMinor: draft.channelCostMinor,
        fixedCostMinor: 0,
        durationDays: draft.durationDays,
        frequencyCap: draft.frequencyCap,
        cannibalization: draft.cannibalizationBps / 10_000,
        mechanic: toPromotionMechanic(draft.mechanic, draft.benefitValue, draft.thresholdMinor, aov),
        period: { start: start.toISOString(), end: end.toISOString() },
        source: 'campaign_studio',
      },
      gos,
      contentBrief: { ru: draft.briefRu, kk: draft.briefKk },
      channel: draft.channel,
      attributionPlan: { method: 'promo_code_and_qr', holdoutBps: 1000, windowDays: draft.durationDays },
      stopRule: { maxRedemptions: audience.eligibleIds.length, maxBudgetMinor: 7000, pauseOnNegativeContribution: true },
    });

    await persist(session.id, { growth_contract_id: compiled.id, current_step: 6 }, session.optimisticVersion);
    revalidatePath(BASE);
    backTo(6, '&compiled=1');
  } catch (error) {
    if (error instanceof DomainError) {
      const message = error.code === 'MARGIN_BLOCKED'
        ? 'Margin Shield остановил этот вариант: вклад-маржа опускается ниже вашего порога. Выберите безопасную альтернативу ниже.'
        : `${error.code}: ${error.message}`;
      backTo(5, `&error=${encodeURIComponent(message)}`);
    }
    throw error;
  }
}

/** Marks the draft finished once the campaign exists, so the next visit starts clean. */
export async function closeStudioDraft(form: FormData) {
  const session = await loadStudioSession();
  await persist(session.id, { status: text(form, 'status') === 'abandoned' ? 'abandoned' : 'launched' }, session.optimisticVersion);
  revalidatePath(BASE);
  redirect(text(form, 'next') || '/app/campaigns');
}
