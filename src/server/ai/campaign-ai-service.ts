import 'server-only';

import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  evaluateMarginShield,
  simulateScenarios,
  type MarginDecision,
  type PromotionMechanic,
  type SimulatorResult,
} from '@/domain/index.ts';
import {
  type CampaignGenerationInput,
  type Locale,
  type MechanicKind,
  type OwnerGoal,
  type ProposedMechanic,
} from '@/ai/contract.ts';
import { generateCampaignProposal, type GenerationResult } from '@/ai/generator.ts';
import { generatorOptionsFor } from '@/ai/providers.ts';
import { readVoiceRules } from './brand-voice.ts';
import { recordGenerationRun } from './run-recorder.ts';

/**
 * Bridges the AI layer to the tenant database and to the deterministic domain.
 *
 * The model's job ends at "here are some mechanics and some copy". Every figure
 * an owner sees is produced here by `simulateScenarios` / `evaluateMarginShield`
 * from RLS-protected business data, so a suggestion with negative margin is
 * scored and blocked exactly like one the owner typed by hand.
 */

export interface EvaluatedMechanic {
  proposal: ProposedMechanic;
  mechanic: PromotionMechanic;
  simulator: SimulatorResult;
  decision: MarginDecision;
  /** True when Margin Shield refuses this variant; the UI must not offer launch. */
  blocked: boolean;
}

export interface CampaignIdeasResult {
  goal: OwnerGoal;
  source: GenerationResult['source'];
  providerLabel: string;
  notes: readonly string[];
  fallbackReason: string | null;
  runId: string | null;
  evaluated: readonly EvaluatedMechanic[];
}

/** Translate an AI proposal into the domain's mechanic union. */
export function toPromotionMechanic(kind: MechanicKind, benefitValue: number, thresholdMinor: number, aovMinor: number): PromotionMechanic {
  const positive = Math.max(0, Math.trunc(benefitValue));
  switch (kind) {
    case 'percentage_discount': return { type: 'percentage_discount', discountBps: Math.min(10_000, positive) };
    case 'happy_hours': return { type: 'happy_hours', discountBps: Math.min(10_000, positive) };
    case 'fixed_discount': return { type: 'fixed_discount', discountMinor: positive };
    case '2_plus_1': return { type: '2_plus_1', freeUnitCostMinor: positive };
    case 'return_coupon': return { type: 'return_coupon', couponMinor: positive };
    case 'bonus_points': return { type: 'bonus_points', liabilityBps: Math.min(10_000, positive) };
    case 'gift_with_threshold':
    default:
      return { type: 'gift_with_threshold', giftCostMinor: Math.max(1, positive), thresholdMinor: Math.max(1, Math.trunc(thresholdMinor) || Math.round(aovMinor * 1.02)) };
  }
}

export interface BusinessContextForAi {
  businessId: string;
  businessType: string;
  city: string;
  district: string;
  brandVoice: string;
  averageOrderValueMinor: number;
  unitCostMinor: number;
  marginFloorBps: number;
  budgetMinor: number;
  currency: string;
  quietWindow: string;
  catalog: readonly { name: string; priceMinor: number; costMinor: number }[];
  previousCampaign: string;
}

/**
 * The trough this business actually has, not the one TAMYR had.
 *
 * `'15:00–18:00'` was written into the prompt as a constant, so every tenant
 * was told its quiet hours were the demo's. The detector already names the band
 * it found in `signals.metric_key` (`weekday_revenue_afternoon_15_18`); that is
 * the only honest source, and when there is no signal the prompt says so.
 */
export function quietWindowFromMetricKey(metricKey: string | null | undefined): string {
  const match = /_(\d{1,2})_(\d{1,2})$/.exec(metricKey ?? '');
  if (!match) return 'не определено';
  const pad = (value: string) => value.padStart(2, '0') + ':00';
  return `${pad(match[1])}–${pad(match[2])}`;
}

/** Reads only what the generator is allowed to know: aggregates and catalogue economics. */
export async function loadAiBusinessContext(db: SupabaseClient, businessId: string): Promise<BusinessContextForAi> {
  const [{ data: business }, { data: profile }, { data: limits }, { data: location }, { data: brand }, { data: catalog }, { data: lastCampaign }, { data: type }, { data: signal }] = await Promise.all([
    db.from('businesses').select('name,currency,business_type_id').eq('id', businessId).maybeSingle(),
    db.from('business_profiles').select('average_check_minor,margin_floor_bps').eq('business_id', businessId).maybeSingle(),
    db.from('business_limits').select('monthly_budget_minor').eq('business_id', businessId).maybeSingle(),
    db.from('business_locations').select('city,district').eq('business_id', businessId).eq('is_active', true).order('created_at').limit(1).maybeSingle(),
    db.from('brand_memory').select('voice_rules').eq('business_id', businessId).eq('locale', 'ru').maybeSingle(),
    db.from('catalog_items').select('name_ru,price_minor,cost_minor').eq('business_id', businessId).eq('is_active', true).order('price_minor').limit(12),
    db.from('campaigns').select('name,status').eq('business_id', businessId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('business_types').select('name_ru').limit(1).maybeSingle(),
    db.from('signals').select('metric_key').eq('business_id', businessId).eq('status', 'open').order('growth_opportunity_score', { ascending: false }).limit(1).maybeSingle(),
  ]);

  const aov = profile?.average_check_minor ?? 3450;
  const items = (catalog ?? []).map((item) => ({
    name: item.name_ru,
    priceMinor: Number(item.price_minor),
    costMinor: Number(item.cost_minor ?? Math.round(Number(item.price_minor) * 0.4)),
  }));

  return {
    businessId,
    businessType: type?.name_ru ?? 'Локальный бизнес',
    city: location?.city ?? '',
    district: location?.district ?? '',
    brandVoice: readVoiceRules(brand?.voice_rules),
    averageOrderValueMinor: aov,
    // Falls back to the catalogue's blended cost ratio when no explicit unit cost exists.
    unitCostMinor: items.length ? Math.round(items.reduce((sum, item) => sum + item.costMinor, 0) / items.length) : Math.round(aov * 0.4),
    marginFloorBps: profile?.margin_floor_bps ?? 4200,
    budgetMinor: Number(limits?.monthly_budget_minor ?? 0),
    currency: business?.currency ?? 'KZT',
    quietWindow: quietWindowFromMetricKey(signal?.metric_key),
    catalog: items,
    previousCampaign: lastCampaign ? `${lastCampaign.name} (${lastCampaign.status})` : 'Предыдущих кампаний не было',
  };
}

export interface GenerateIdeasCommand {
  businessId: string;
  goal: OwnerGoal;
  channel: string;
  segment: { code: string; label: string; size: number; consentEligible: number };
  weekdayOnly: boolean;
  frequencyCap: number;
  locales: readonly Locale[];
  idempotencyKey?: string;
}

export class CampaignAiService {
  private readonly db: SupabaseClient;
  private readonly actorId: string;
  constructor(db: SupabaseClient, actorId: string) {
    this.db = db;
    this.actorId = actorId;
  }

  async generateIdeas(command: GenerateIdeasCommand): Promise<CampaignIdeasResult> {
    const context = await loadAiBusinessContext(this.db, command.businessId);

    const input: CampaignGenerationInput = {
      businessType: context.businessType,
      brandVoice: context.brandVoice,
      city: context.city,
      district: context.district,
      goal: command.goal,
      segment: command.segment,
      capacity: { quietWindow: context.quietWindow, weekdayOnly: command.weekdayOnly },
      channel: command.channel,
      catalog: context.catalog,
      averageOrderValueMinor: context.averageOrderValueMinor,
      marginFloorBps: context.marginFloorBps,
      budgetMinor: context.budgetMinor,
      frequencyCap: command.frequencyCap,
      previousCampaign: context.previousCampaign,
      currency: context.currency,
      locales: command.locales,
    };
    const result = await generateCampaignProposal(input, generatorOptionsFor());

    const runId = await this.recordRun(command, result);
    const evaluated = this.evaluate(result, context, command);

    return {
      goal: command.goal,
      source: result.source,
      providerLabel: result.source === 'provider' ? `${result.telemetry.provider} · ${result.telemetry.model}` : 'Встроенный шаблон QADAM',
      notes: result.proposal.notes,
      fallbackReason: result.telemetry.fallbackReason,
      runId,
      evaluated,
    };
  }

  /**
   * Recomputes every number. The proposal supplies only the mechanic shape and
   * the copy; the scenarios, contribution, ROI and the launch verdict come from
   * the deterministic domain using this tenant's own floor and budget.
   */
  private evaluate(result: GenerationResult, context: BusinessContextForAi, command: GenerateIdeasCommand): EvaluatedMechanic[] {
    const aov = context.averageOrderValueMinor;
    const contributionMargin = (aov - context.unitCostMinor) / aov;
    const now = Date.now();

    return result.proposal.mechanics.map((proposal) => {
      const mechanic = toPromotionMechanic(proposal.kind, proposal.benefitValue, proposal.thresholdMinor, aov);
      const simulator = simulateScenarios({
        eligibleAudience: command.segment.consentEligible,
        baselineConversion: 0.12,
        uplift: { pessimistic: 0.04, base: 0.09, optimistic: 0.15 },
        averageOrderValueMinor: aov,
        unitCostMinor: context.unitCostMinor,
        contributionMargin,
        channelCostPerContactMinor: 20,
        fixedCostMinor: 0,
        budgetMinor: context.budgetMinor,
        durationDays: proposal.durationDays,
        frequencyCap: command.frequencyCap,
        cannibalization: 0.15,
        currency: context.currency,
        mechanic,
        period: { start: new Date(now).toISOString(), end: new Date(now + proposal.durationDays * 86_400_000).toISOString() },
        source: 'ai_campaign_generator',
      });
      const decision = evaluateMarginShield({
        simulator,
        mechanic,
        averageOrderValueMinor: aov,
        contributionMargin,
        minimumContributionPerOrderMinor: Math.round(aov * (context.marginFloorBps / 10_000)),
        marginFloor: context.marginFloorBps / 10_000,
        budgetMinor: context.budgetMinor,
        maxCannibalization: 0.25,
        cannibalization: 0.15,
        consentEligibleCount: command.segment.consentEligible,
      });

      return { proposal, mechanic, simulator, decision, blocked: decision.status === 'blocked' };
    });
  }

  /** Provenance is written whether or not a provider was reached. */
  private async recordRun(command: GenerateIdeasCommand, result: GenerationResult): Promise<string | null> {
    return recordGenerationRun(this.db, {
      businessId: command.businessId,
      purpose: 'campaign_generation',
      output: result.proposal,
      source: result.source,
      telemetry: result.telemetry,
      idempotencyKey: command.idempotencyKey ?? `ai:campaign:${randomUUID()}`,
    });
  }
}

export { DAILY_GENERATION_LIMIT, DAILY_COST_CEILING_MICROS } from './run-recorder.ts';
