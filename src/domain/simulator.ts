import { DomainError, assertCurrency, assertRate, assertSafeInteger, explanation, mulDiv, ratePpm, roundDiv, type NumberExplanation } from './shared.ts';

export type PromotionMechanic =
  | { type: 'percentage_discount'; discountBps: number }
  | { type: 'fixed_discount'; discountMinor: number }
  | { type: '2_plus_1'; freeUnitCostMinor: number }
  | { type: 'gift_with_threshold'; giftCostMinor: number; thresholdMinor: number }
  | { type: 'happy_hours'; discountBps: number }
  | { type: 'return_coupon'; couponMinor: number }
  | { type: 'bonus_points'; liabilityBps: number };

export interface SimulatorInput {
  eligibleAudience: number;
  baselineConversion: number;
  uplift: { pessimistic: number; base: number; optimistic: number };
  averageOrderValueMinor: number;
  unitCostMinor: number;
  contributionMargin: number;
  channelCostPerContactMinor: number;
  fixedCostMinor: number;
  budgetMinor: number;
  durationDays: number;
  frequencyCap: number;
  cannibalization: number;
  currency: string;
  mechanic: PromotionMechanic;
  period: { start: string; end: string };
  source: string;
}
export interface ScenarioOutput {
  name: 'pessimistic' | 'base' | 'optimistic';
  orders: number;
  incrementalOrders: number;
  revenueMinor: number;
  incrementalRevenueMinor: number;
  incrementalContributionMinor: number;
  campaignCostMinor: number;
  roiBps: number | null;
  breakEvenOrders: number | null;
  costPerReturnMinor: number | null;
  confidence: number;
  numbers: Readonly<Record<string, NumberExplanation>>;
}
export interface SimulatorResult { formulaVersion: 'simulator.v1'; assumptions: Readonly<SimulatorInput>; scenarios: { pessimistic: ScenarioOutput; base: ScenarioOutput; optimistic: ScenarioOutput } }

export function mechanicBenefitCost(mechanic: PromotionMechanic, aovMinor: number): number {
  switch (mechanic.type) {
    case 'percentage_discount': case 'happy_hours': assertSafeInteger(mechanic.discountBps, 'discountBps', 0); if (mechanic.discountBps > 10_000) throw new DomainError('INVALID_DISCOUNT', 'discount exceeds 100%'); return mulDiv(aovMinor, mechanic.discountBps, 10_000);
    case 'fixed_discount': assertSafeInteger(mechanic.discountMinor, 'discountMinor', 0); return mechanic.discountMinor;
    case '2_plus_1': assertSafeInteger(mechanic.freeUnitCostMinor, 'freeUnitCostMinor', 0); return mechanic.freeUnitCostMinor;
    case 'gift_with_threshold': assertSafeInteger(mechanic.giftCostMinor, 'giftCostMinor', 0); assertSafeInteger(mechanic.thresholdMinor, 'thresholdMinor', 1); return mechanic.giftCostMinor;
    case 'return_coupon': assertSafeInteger(mechanic.couponMinor, 'couponMinor', 0); return mechanic.couponMinor;
    case 'bonus_points': assertSafeInteger(mechanic.liabilityBps, 'liabilityBps', 0); if (mechanic.liabilityBps > 10_000) throw new DomainError('INVALID_POINTS', 'liability exceeds order'); return mulDiv(aovMinor, mechanic.liabilityBps, 10_000);
  }
}

function validate(input: SimulatorInput): void {
  assertCurrency(input.currency);
  for (const [name, value] of Object.entries({ eligibleAudience: input.eligibleAudience, unitCostMinor: input.unitCostMinor, channelCostPerContactMinor: input.channelCostPerContactMinor, fixedCostMinor: input.fixedCostMinor, budgetMinor: input.budgetMinor })) assertSafeInteger(value, name, 0);
  for (const [name, value] of Object.entries({ averageOrderValueMinor: input.averageOrderValueMinor, durationDays: input.durationDays, frequencyCap: input.frequencyCap })) assertSafeInteger(value, name, 1);
  assertRate(input.baselineConversion, 'baselineConversion'); assertRate(input.contributionMargin, 'contributionMargin'); assertRate(input.cannibalization, 'cannibalization');
  for (const [name, value] of Object.entries(input.uplift)) assertRate(value, `uplift.${name}`);
  if (!(input.uplift.pessimistic <= input.uplift.base && input.uplift.base <= input.uplift.optimistic)) throw new DomainError('INVALID_SCENARIO_ORDER', 'uplift must be pessimistic <= base <= optimistic');
  if (Date.parse(input.period.start) >= Date.parse(input.period.end)) throw new DomainError('INVALID_PERIOD', 'simulation period invalid');
}

function scenario(input: SimulatorInput, name: ScenarioOutput['name'], uplift: number): ScenarioOutput {
  const baselineOrders = roundDiv(input.eligibleAudience * ratePpm(input.baselineConversion, 'baselineConversion'), 1_000_000);
  const incrementalOrders = roundDiv(input.eligibleAudience * ratePpm(uplift, `uplift.${name}`), 1_000_000);
  const orders = Math.min(input.eligibleAudience * input.frequencyCap, baselineOrders + incrementalOrders);
  const benefitPerOrder = mechanicBenefitCost(input.mechanic, input.averageOrderValueMinor);
  const revenueMinor = orders * input.averageOrderValueMinor;
  const incrementalRevenueMinor = incrementalOrders * input.averageOrderValueMinor;
  const grossIncrementalContribution = mulDiv(incrementalRevenueMinor, ratePpm(input.contributionMargin, 'contributionMargin'), 1_000_000);
  const benefitCost = orders * benefitPerOrder;
  const channelCost = input.eligibleAudience * input.channelCostPerContactMinor;
  const cannibalizationLeakage = mulDiv(baselineOrders * benefitPerOrder, ratePpm(input.cannibalization, 'cannibalization'), 1_000_000);
  const incrementalContributionMinor = grossIncrementalContribution - benefitCost - channelCost - cannibalizationLeakage;
  const campaignCostMinor = benefitCost + channelCost + input.fixedCostMinor;
  const roiBps = input.fixedCostMinor > 0 ? roundDiv((incrementalContributionMinor - input.fixedCostMinor) * 10_000, input.fixedCostMinor) : null;
  const contributionPerReturn = mulDiv(input.averageOrderValueMinor, ratePpm(input.contributionMargin, 'contributionMargin'), 1_000_000) - benefitPerOrder;
  const breakEvenOrders = contributionPerReturn > 0 ? Math.ceil((input.fixedCostMinor + channelCost) / contributionPerReturn) : null;
  const costPerReturnMinor = incrementalOrders > 0 ? roundDiv(campaignCostMinor, incrementalOrders) : null;
  const confidence = Math.max(0.35, 0.9 - (input.uplift.optimistic - input.uplift.pessimistic));
  const baseExplanation = { period: input.period, source: input.source, confidence, assumptions: [`mechanic=${input.mechanic.type}`, `audience=${input.eligibleAudience}`], status: 'estimated' as const, nextAction: 'Review assumptions and Margin Shield', kind: 'forecast' as const };
  const numbers = {
    orders: explanation({ ...baseExplanation, what: `${name} orders`, value: orders, unit: 'orders', formula: 'round(audience × baseline conversion) + round(audience × uplift)' }),
    incrementalRevenue: explanation({ ...baseExplanation, what: `${name} incremental revenue`, value: incrementalRevenueMinor, unit: input.currency, formula: 'incremental orders × average order value' }),
    incrementalContribution: explanation({ ...baseExplanation, what: `${name} incremental contribution`, value: incrementalContributionMinor, unit: input.currency, formula: 'incremental revenue × contribution margin − benefit cost − channel cost − cannibalization leakage' }),
    campaignCost: explanation({ ...baseExplanation, what: `${name} campaign cost`, value: campaignCostMinor, unit: input.currency, formula: 'benefit cost × orders + channel cost × audience + fixed cost' }),
  };
  return { name, orders, incrementalOrders, revenueMinor, incrementalRevenueMinor, incrementalContributionMinor, campaignCostMinor, roiBps, breakEvenOrders, costPerReturnMinor, confidence, numbers: Object.freeze(numbers) };
}

export function simulateScenarios(input: SimulatorInput): SimulatorResult {
  validate(input); const scenarios = { pessimistic: scenario(input, 'pessimistic', input.uplift.pessimistic), base: scenario(input, 'base', input.uplift.base), optimistic: scenario(input, 'optimistic', input.uplift.optimistic) };
  return { formulaVersion: 'simulator.v1', assumptions: Object.freeze(structuredClone(input)), scenarios };
}
