import 'server-only';

import { requireBusinessContext } from './repository';
import type { Locale, MechanicKind, OwnerGoal } from '@/ai/contract.ts';
import type { Json } from '@/types/database.generated';

/**
 * Campaign Studio wizard state.
 *
 * The draft lives in Postgres, not in the URL or the browser, so refresh,
 * back/forward, a failed validation and a closed laptop all resume the same
 * work. Each step writes only its own fields, so a later step can never blank
 * an earlier answer.
 */

export const STUDIO_STEPS = [
  { index: 1, slug: 'goal', title: 'Цель' },
  { index: 2, slug: 'audience', title: 'Аудитория' },
  { index: 3, slug: 'offer', title: 'Предложение' },
  { index: 4, slug: 'delivery', title: 'Время, канал и контент' },
  { index: 5, slug: 'simulator', title: 'Симулятор' },
  { index: 6, slug: 'contract', title: 'Growth Contract' },
  { index: 7, slug: 'launch', title: 'Подтверждение и запуск' },
] as const;

export type StudioStepSlug = (typeof STUDIO_STEPS)[number]['slug'];

export interface StudioDraft {
  goal: OwnerGoal;
  segmentCode: string;
  channel: string;
  weekdayOnly: boolean;
  frequencyCap: number;
  locales: Locale[];
  mechanic: MechanicKind;
  benefitValue: number;
  thresholdMinor: number;
  durationDays: number;
  unitCostMinor: number;
  channelCostMinor: number;
  baselineConversionBps: number;
  upliftLowBps: number;
  upliftBaseBps: number;
  upliftHighBps: number;
  cannibalizationBps: number;
  briefRu: string;
  briefKk: string;
  campaignName: string;
  /** Provenance of the currently selected mechanic, so the UI can label it. */
  ideaSource: 'owner' | 'ai_provider' | 'ai_template' | 'safe_alternative';
}

export const DEFAULT_DRAFT: StudioDraft = {
  goal: 'reactivate',
  segmentCode: 'inactive_30',
  channel: 'whatsapp',
  weekdayOnly: true,
  frequencyCap: 1,
  locales: ['ru', 'kk'],
  mechanic: 'gift_with_threshold',
  benefitValue: 600,
  thresholdMinor: 3500,
  durationDays: 7,
  unitCostMinor: 1400,
  channelCostMinor: 20,
  baselineConversionBps: 1200,
  upliftLowBps: 400,
  upliftBaseBps: 900,
  upliftHighBps: 1500,
  cannibalizationBps: 1500,
  briefRu: 'Вернуть спящих клиентов в тихие часы будней.',
  briefKk: 'Ұйықтап қалған клиенттерді тыныш сағаттарда қайтару.',
  campaignName: 'Win-back тихие часы',
  ideaSource: 'owner',
};

export interface FieldIssue { field: string; message: string }

/**
 * Per-field validation for one step. Returning issues rather than throwing lets
 * the wizard keep the owner's input on screen next to the message.
 */
export function validateStep(step: number, draft: StudioDraft): FieldIssue[] {
  const issues: FieldIssue[] = [];
  const positive = (value: number, field: string, label: string, min = 1) => {
    if (!Number.isFinite(value) || value < min) issues.push({ field, message: `${label}: значение должно быть не меньше ${min}.` });
  };
  const bps = (value: number, field: string, label: string) => {
    if (!Number.isFinite(value) || value < 0 || value > 10_000) issues.push({ field, message: `${label}: допустимо от 0 до 10000 bps.` });
  };

  if (step === 1 && !draft.goal) issues.push({ field: 'goal', message: 'Выберите бизнес-цель.' });
  if (step === 2) {
    if (!draft.segmentCode) issues.push({ field: 'segmentCode', message: 'Выберите сегмент аудитории.' });
    if (!draft.channel) issues.push({ field: 'channel', message: 'Выберите канал.' });
    positive(draft.frequencyCap, 'frequencyCap', 'Частотный лимит');
  }
  if (step === 3) {
    positive(draft.benefitValue, 'benefitValue', 'Стоимость выгоды', 0);
    if (draft.mechanic === 'gift_with_threshold') positive(draft.thresholdMinor, 'thresholdMinor', 'Минимальный чек');
    if (draft.mechanic === 'percentage_discount' || draft.mechanic === 'happy_hours' || draft.mechanic === 'bonus_points') {
      bps(draft.benefitValue, 'benefitValue', 'Размер выгоды');
    }
    positive(draft.unitCostMinor, 'unitCostMinor', 'Себестоимость заказа', 0);
  }
  if (step === 4) {
    positive(draft.durationDays, 'durationDays', 'Длительность');
    if (draft.durationDays > 90) issues.push({ field: 'durationDays', message: 'Длительность: не более 90 дней.' });
    if (!draft.briefRu.trim()) issues.push({ field: 'briefRu', message: 'Бриф RU: заполните текст.' });
    if (!draft.briefKk.trim()) issues.push({ field: 'briefKk', message: 'Бриф KK: заполните текст.' });
  }
  if (step === 5) {
    bps(draft.baselineConversionBps, 'baselineConversionBps', 'Базовая конверсия');
    bps(draft.cannibalizationBps, 'cannibalizationBps', 'Каннибализация');
    for (const [field, label] of [['upliftLowBps', 'Осторожный'], ['upliftBaseBps', 'Базовый'], ['upliftHighBps', 'Оптимистичный']] as const) {
      bps(draft[field], field, `Прирост отклика · ${label}`);
    }
    if (draft.upliftLowBps > draft.upliftBaseBps || draft.upliftBaseBps > draft.upliftHighBps) {
      issues.push({ field: 'upliftBaseBps', message: 'Сценарии должны идти по возрастанию: осторожный ≤ базовый ≤ оптимистичный.' });
    }
  }
  if (step === 7 && !draft.campaignName.trim()) issues.push({ field: 'campaignName', message: 'Название кампании: заполните поле.' });
  return issues;
}

function coerceDraft(raw: unknown): StudioDraft {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Partial<StudioDraft>;
  const int = (value: unknown, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
  };
  return {
    ...DEFAULT_DRAFT,
    ...source,
    frequencyCap: int(source.frequencyCap, DEFAULT_DRAFT.frequencyCap),
    benefitValue: int(source.benefitValue, DEFAULT_DRAFT.benefitValue),
    thresholdMinor: int(source.thresholdMinor, DEFAULT_DRAFT.thresholdMinor),
    durationDays: int(source.durationDays, DEFAULT_DRAFT.durationDays),
    unitCostMinor: int(source.unitCostMinor, DEFAULT_DRAFT.unitCostMinor),
    channelCostMinor: int(source.channelCostMinor, DEFAULT_DRAFT.channelCostMinor),
    baselineConversionBps: int(source.baselineConversionBps, DEFAULT_DRAFT.baselineConversionBps),
    upliftLowBps: int(source.upliftLowBps, DEFAULT_DRAFT.upliftLowBps),
    upliftBaseBps: int(source.upliftBaseBps, DEFAULT_DRAFT.upliftBaseBps),
    upliftHighBps: int(source.upliftHighBps, DEFAULT_DRAFT.upliftHighBps),
    cannibalizationBps: int(source.cannibalizationBps, DEFAULT_DRAFT.cannibalizationBps),
    locales: Array.isArray(source.locales) && source.locales.length ? (source.locales as Locale[]) : DEFAULT_DRAFT.locales,
  };
}

export interface StudioSession {
  id: string;
  currentStep: number;
  draft: StudioDraft;
  growthContractId: string | null;
  optimisticVersion: number;
}

/** Loads the open draft for this owner, creating one on first entry. */
export async function loadStudioSession(): Promise<StudioSession & { ctx: Awaited<ReturnType<typeof requireBusinessContext>> }> {
  const ctx = await requireBusinessContext();
  const { data: existing } = await ctx.supabase
    .from('campaign_drafts')
    .select('id,current_step,draft,growth_contract_id,optimistic_version')
    .eq('business_id', ctx.businessId).eq('user_id', ctx.userId).eq('status', 'open')
    .order('updated_at', { ascending: false }).limit(1).maybeSingle();

  if (existing) {
    return {
      ctx,
      id: existing.id,
      currentStep: existing.current_step,
      draft: coerceDraft(existing.draft),
      growthContractId: existing.growth_contract_id,
      optimisticVersion: existing.optimistic_version,
    };
  }

  const { data: created, error } = await ctx.supabase
    .from('campaign_drafts')
    .insert({
      business_id: ctx.businessId,
      user_id: ctx.userId,
      current_step: 1,
      draft: DEFAULT_DRAFT as unknown as Json,
      is_mock: ctx.business.mode === 'demo',
    })
    .select('id,current_step,draft,growth_contract_id,optimistic_version').single();
  if (error) throw error;

  return {
    ctx,
    id: created.id,
    currentStep: created.current_step,
    draft: coerceDraft(created.draft),
    growthContractId: created.growth_contract_id,
    optimisticVersion: created.optimistic_version,
  };
}

export { coerceDraft };
