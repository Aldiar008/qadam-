import { mulDiv, ratePpm } from './shared.ts';
import { mechanicBenefitCost, type PromotionMechanic, type SimulatorResult } from './simulator.ts';

export interface MarginShieldInput { simulator: SimulatorResult; mechanic: PromotionMechanic; averageOrderValueMinor: number; contributionMargin: number; minimumContributionPerOrderMinor: number; marginFloor: number; budgetMinor: number; maxCannibalization: number; cannibalization: number; consentEligibleCount: number }
export interface MarginDecision { status: 'allowed' | 'warning' | 'blocked'; reasons: readonly string[]; contributionPerOrderMinor: number; postBenefitMargin: number; safeAlternatives: readonly PromotionMechanic[] }

export function evaluateMarginShield(input: MarginShieldInput): MarginDecision {
  const benefit = mechanicBenefitCost(input.mechanic, input.averageOrderValueMinor);
  const contributionPerOrderMinor = mulDiv(input.averageOrderValueMinor, ratePpm(input.contributionMargin, 'contributionMargin'), 1_000_000) - benefit;
  const postBenefitMargin = contributionPerOrderMinor / input.averageOrderValueMinor;
  const reasons: string[] = [];
  if (input.consentEligibleCount <= 0) reasons.push('no_consent_eligible_audience');
  if (contributionPerOrderMinor < input.minimumContributionPerOrderMinor) reasons.push('minimum_contribution_per_order');
  if (input.simulator.scenarios.base.incrementalContributionMinor <= 0) reasons.push('non_positive_total_contribution');
  if (input.simulator.scenarios.base.campaignCostMinor > input.budgetMinor) reasons.push('budget_exceeded');
  if (input.cannibalization > input.maxCannibalization) reasons.push('cannibalization_exceeded');
  if (postBenefitMargin < input.marginFloor) reasons.push('owner_margin_floor');
  const hard = reasons.length > 0;
  const warning = !hard && (postBenefitMargin < input.marginFloor + 0.05 || input.simulator.scenarios.pessimistic.incrementalContributionMinor <= 0);
  return { status: hard ? 'blocked' : warning ? 'warning' : 'allowed', reasons: Object.freeze(reasons), contributionPerOrderMinor, postBenefitMargin, safeAlternatives: Object.freeze(hard ? safeAlternatives(input.mechanic, input.averageOrderValueMinor) : []) };
}

export function safeAlternatives(mechanic: PromotionMechanic, aovMinor: number): PromotionMechanic[] {
  const alternatives: PromotionMechanic[] = [];
  if (mechanic.type === 'percentage_discount' || mechanic.type === 'happy_hours') alternatives.push({ type: 'percentage_discount', discountBps: Math.max(500, Math.floor(mechanic.discountBps / 2)) });
  alternatives.push({ type: 'gift_with_threshold', giftCostMinor: Math.max(1, mulDiv(aovMinor,800,10_000)), thresholdMinor: mulDiv(aovMinor,10_200,10_000) });
  alternatives.push({ type: 'return_coupon', couponMinor: Math.max(1, mulDiv(aovMinor,800,10_000)) });
  return alternatives;
}
