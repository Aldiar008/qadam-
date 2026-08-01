import 'server-only';

import { DomainError } from '@/domain/shared.ts';
import {
  evaluateMarginShield,
  safeAlternatives,
  simulateScenarios,
  type MarginDecision,
  type PromotionMechanic,
  type SimulatorResult,
} from '@/domain/index.ts';
import { MECHANIC_KINDS, type MechanicKind } from '@/ai/contract.ts';
import { toPromotionMechanic } from '@/server/ai/campaign-ai-service';
import { loadStudioSession, type StudioDraft } from './campaign-studio';
import type { requireBusinessContext } from './repository';

type Ctx = Awaited<ReturnType<typeof requireBusinessContext>>;

export interface StudioAudience {
  segmentCode: string;
  segmentLabel: string;
  segmentSize: number;
  eligibleIds: string[];
  segments: { id: string; code: string; name_ru: string }[];
}

/** Segment membership narrowed to customers whose consent the database will accept. */
export async function resolveStudioAudience(ctx: Ctx, segmentCode: string, channel: string): Promise<StudioAudience> {
  const { data: segments } = await ctx.supabase.from('customer_segments')
    .select('id,code,name_ru').eq('business_id', ctx.businessId).eq('status', 'active').order('name_ru');
  const list = segments ?? [];
  const selected = list.find((segment) => segment.code === segmentCode) ?? list.find((segment) => segment.code === 'inactive_30') ?? list[0];
  if (!selected) return { segmentCode, segmentLabel: 'Сегмент не найден', segmentSize: 0, eligibleIds: [], segments: list };

  const { data: members } = await ctx.supabase.from('segment_memberships')
    .select('customer_id').eq('business_id', ctx.businessId).eq('segment_id', selected.id).limit(500);
  const memberIds = (members ?? []).map((row) => row.customer_id);

  const { data: eligible } = memberIds.length
    ? await ctx.supabase.rpc('effective_consent_customers', { p_business_id: ctx.businessId, p_scope: `marketing.${channel}`, p_customer_ids: memberIds })
    : { data: [] as string[] };

  return {
    segmentCode: selected.code,
    segmentLabel: selected.name_ru,
    segmentSize: memberIds.length,
    eligibleIds: ((eligible ?? []) as string[]),
    segments: list,
  };
}

export interface VariantEvaluation {
  kind: MechanicKind;
  label: string;
  mechanic: PromotionMechanic;
  simulator: SimulatorResult;
  decision: MarginDecision;
  blocked: boolean;
  /** Present when the current draft matches this variant. */
  selected: boolean;
}

export const MECHANIC_LABELS: Record<MechanicKind, string> = {
  gift_with_threshold: 'Подарок при пороге чека',
  '2_plus_1': '2+1',
  happy_hours: 'Счастливые часы',
  return_coupon: 'Купон на возврат',
  bonus_points: 'Бонусные баллы',
  percentage_discount: 'Скидка в процентах',
  fixed_discount: 'Фиксированная скидка',
};

interface EvaluateArgs {
  draft: StudioDraft;
  aovMinor: number;
  marginFloorBps: number;
  budgetMinor: number;
  currency: string;
  eligibleCount: number;
}

function evaluateOne(kind: MechanicKind, benefitValue: number, thresholdMinor: number, args: EvaluateArgs): VariantEvaluation {
  const { draft, aovMinor, marginFloorBps, budgetMinor, currency, eligibleCount } = args;
  const contributionMargin = (aovMinor - draft.unitCostMinor) / aovMinor;
  const mechanic = toPromotionMechanic(kind, benefitValue, thresholdMinor, aovMinor);
  const now = Date.now();

  const simulator = simulateScenarios({
    eligibleAudience: eligibleCount,
    baselineConversion: draft.baselineConversionBps / 10_000,
    uplift: {
      pessimistic: draft.upliftLowBps / 10_000,
      base: draft.upliftBaseBps / 10_000,
      optimistic: draft.upliftHighBps / 10_000,
    },
    averageOrderValueMinor: aovMinor,
    unitCostMinor: draft.unitCostMinor,
    contributionMargin,
    channelCostPerContactMinor: draft.channelCostMinor,
    fixedCostMinor: 0,
    budgetMinor,
    durationDays: draft.durationDays,
    frequencyCap: draft.frequencyCap,
    cannibalization: draft.cannibalizationBps / 10_000,
    currency,
    mechanic,
    period: { start: new Date(now).toISOString(), end: new Date(now + draft.durationDays * 86_400_000).toISOString() },
    source: 'campaign_studio',
  });

  const decision = evaluateMarginShield({
    simulator,
    mechanic,
    averageOrderValueMinor: aovMinor,
    contributionMargin,
    minimumContributionPerOrderMinor: Math.round(aovMinor * (marginFloorBps / 10_000)),
    marginFloor: marginFloorBps / 10_000,
    budgetMinor,
    maxCannibalization: 0.25,
    cannibalization: draft.cannibalizationBps / 10_000,
    consentEligibleCount: eligibleCount,
  });

  return {
    kind,
    label: MECHANIC_LABELS[kind],
    mechanic,
    simulator,
    decision,
    blocked: decision.status === 'blocked',
    selected: draft.mechanic === kind && draft.benefitValue === benefitValue,
  };
}

export interface StudioViewData {
  session: Awaited<ReturnType<typeof loadStudioSession>>;
  audience: StudioAudience;
  aovMinor: number;
  marginFloorBps: number;
  budgetMinor: number;
  currency: string;
  current: VariantEvaluation | null;
  /** Set when the stored assumptions cannot be simulated; the input is still kept. */
  evaluationError: string | null;
  /** Every required mechanic, evaluated on the same assumptions for side-by-side comparison. */
  comparison: VariantEvaluation[];
  /** Populated only when the current variant is blocked. */
  safeAlternative: { kind: MechanicKind; label: string; benefitValue: number; thresholdMinor: number; evaluation: VariantEvaluation } | null;
  aiIdeas: StoredIdeas | null;
  contract: ContractRow | null;
}

export interface StoredIdeas {
  generatedAt: string;
  source: 'provider' | 'deterministic_fallback';
  providerLabel: string;
  fallbackReason: string | null;
  runId: string | null;
  notes: string[];
  mechanics: {
    kind: MechanicKind;
    benefitValue: number;
    thresholdMinor: number;
    durationDays: number;
    hypothesis: string;
    whyFit: string;
    audienceSummary: string;
    risks: string[];
    requiredAssumptions: string[];
    copy: Record<'ru' | 'kk', { title: string; body: string; cta: string }>;
    blocked: boolean;
  }[];
}

export interface ContractRow {
  id: string;
  status: string;
  version: number;
  optimistic_version: number;
  content_hash: string;
  accepted_snapshot: unknown;
  consent_summary: unknown;
  simulator_result: unknown;
  margin_decision: unknown;
  attribution_plan: unknown;
  owner_limits_snapshot: unknown;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
}

/** Benefit size used when offering a mechanic the owner has not configured yet. */
function defaultBenefit(kind: MechanicKind, aovMinor: number, draft: StudioDraft): { benefitValue: number; thresholdMinor: number } {
  if (kind === draft.mechanic) return { benefitValue: draft.benefitValue, thresholdMinor: draft.thresholdMinor };
  switch (kind) {
    case 'percentage_discount': return { benefitValue: 2000, thresholdMinor: 0 };
    case 'happy_hours': return { benefitValue: 1500, thresholdMinor: 0 };
    case 'bonus_points': return { benefitValue: 800, thresholdMinor: 0 };
    case 'fixed_discount': return { benefitValue: Math.round(aovMinor * 0.15), thresholdMinor: 0 };
    case 'return_coupon': return { benefitValue: Math.round(aovMinor * 0.08), thresholdMinor: 0 };
    case '2_plus_1': return { benefitValue: Math.round(aovMinor * 0.18), thresholdMinor: 0 };
    case 'gift_with_threshold':
    default: return { benefitValue: Math.round(aovMinor * 0.18), thresholdMinor: Math.round(aovMinor * 1.02) };
  }
}

export async function getStudioViewData(): Promise<StudioViewData> {
  const session = await loadStudioSession();
  const ctx = session.ctx;

  const [{ data: profile }, { data: limits }, audience] = await Promise.all([
    ctx.supabase.from('business_profiles').select('average_check_minor,margin_floor_bps').eq('business_id', ctx.businessId).maybeSingle(),
    ctx.supabase.from('business_limits').select('monthly_budget_minor').eq('business_id', ctx.businessId).maybeSingle(),
    resolveStudioAudience(ctx, session.draft.segmentCode, session.draft.channel),
  ]);

  const args: EvaluateArgs = {
    draft: session.draft,
    aovMinor: profile?.average_check_minor ?? 3450,
    marginFloorBps: profile?.margin_floor_bps ?? 4200,
    budgetMinor: Number(limits?.monthly_budget_minor ?? 0),
    currency: ctx.business.currency,
    eligibleCount: audience.eligibleIds.length,
  };

  // The wizard deliberately keeps invalid input on screen rather than discarding
  // the owner's typing, so the simulator can legitimately be handed numbers it
  // refuses. That must surface as a field message, never as a broken page.
  let evaluationError: string | null = null;
  let current: VariantEvaluation | null = null;
  try {
    current = evaluateOne(session.draft.mechanic, session.draft.benefitValue, session.draft.thresholdMinor, args);
  } catch (error) {
    evaluationError = error instanceof DomainError
      ? `${error.message}. Исправьте допущения ниже — введённые значения сохранены.`
      : 'Не удалось рассчитать сценарии с текущими допущениями.';
  }

  const comparison = evaluationError ? [] : MECHANIC_KINDS.flatMap((kind) => {
    const defaults = defaultBenefit(kind, args.aovMinor, session.draft);
    try {
      return [evaluateOne(kind, defaults.benefitValue, defaults.thresholdMinor, args)];
    } catch {
      // One unusable mechanic must not hide the rest of the comparison.
      return [];
    }
  });

  // Margin Shield already knows how to propose a safer shape; surface the first
  // one it offers as a single-click replacement rather than inventing our own.
  let safeAlternative: StudioViewData['safeAlternative'] = null;
  if (current?.blocked) {
    const suggestion = safeAlternatives(current.mechanic, args.aovMinor).find((alternative) => alternative.type === 'gift_with_threshold')
      ?? safeAlternatives(current.mechanic, args.aovMinor)[0];
    if (suggestion) {
      const kind = suggestion.type as MechanicKind;
      const benefitValue = suggestion.type === 'gift_with_threshold' ? suggestion.giftCostMinor
        : suggestion.type === 'return_coupon' ? suggestion.couponMinor
          : suggestion.type === 'percentage_discount' ? suggestion.discountBps : 0;
      const thresholdMinor = suggestion.type === 'gift_with_threshold' ? suggestion.thresholdMinor : 0;
      safeAlternative = {
        kind,
        label: MECHANIC_LABELS[kind],
        benefitValue,
        thresholdMinor,
        evaluation: evaluateOne(kind, benefitValue, thresholdMinor, args),
      };
    }
  }

  const rawIdeas = (session.draft as unknown as { aiIdeas?: StoredIdeas }).aiIdeas ?? null;

  const { data: contract } = session.growthContractId
    ? await ctx.supabase.from('growth_contracts')
      .select('id,status,version,optimistic_version,content_hash,accepted_snapshot,consent_summary,simulator_result,margin_decision,attribution_plan,owner_limits_snapshot,approved_at,approved_by,created_at')
      .eq('business_id', ctx.businessId).eq('id', session.growthContractId).maybeSingle()
    : { data: null };

  return {
    session,
    audience,
    aovMinor: args.aovMinor,
    marginFloorBps: args.marginFloorBps,
    budgetMinor: args.budgetMinor,
    currency: args.currency,
    current,
    evaluationError,
    comparison,
    safeAlternative,
    aiIdeas: rawIdeas,
    contract: (contract ?? null) as ContractRow | null,
  };
}
