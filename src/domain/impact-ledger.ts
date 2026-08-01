import { DomainError, assertRate, assertSafeInteger, explanation, mulDiv, ratePpm, roundDiv, type MetricKind, type NumberExplanation } from './shared.ts';

export interface ImpactInput {
  exposedPurchases: number; expectedBaselinePurchases: number; incrementalAverageOrderValueMinor: number; contributionMargin: number;
  discountLeakageMinor: number; variableCostMinor: number; channelCostMinor: number; fixedCampaignCostMinor: number;
  acquisitionSpendMinor: number; verifiedNewCustomers: number; reactivationCostMinor: number; reactivatedCustomers: number;
  averageOrderValueMinor: number; monthlyFrequency: number; expectedActiveMonths: number;
  taskMinutes: readonly { baseline: number; actualOwner: number }[];
  forecastMinor: number; actualMinor: number; influencedRevenueMinor: number;
  kind: Exclude<MetricKind, 'forecast' | 'influenced'>; currency: string; period: { start: string; end: string }; source: string; confidence: number;
}
export interface ImpactLedgerResult { incrementalOrders: number; incrementalRevenueMinor: number; incrementalContributionMinor: number; campaignRoiBps: number | null; cacMinor: number | null; costPerReturnMinor: number | null; ltvMinor: number; timeSavedMinutes: number; forecastErrorPpm: number; influencedRevenueMinor: number; kind: ImpactInput['kind']; numbers: Readonly<Record<string, NumberExplanation>> }

export function calculateImpactLedger(input: ImpactInput): ImpactLedgerResult {
  assertRate(input.contributionMargin, 'contributionMargin'); assertRate(input.confidence, 'confidence');
  if (!Number.isFinite(input.monthlyFrequency) || input.monthlyFrequency < 0) throw new DomainError('INVALID_FREQUENCY','monthlyFrequency must be non-negative');
  for (const [name,value] of Object.entries(input).filter(([,v]) => typeof v === 'number') as [string,number][]) if (!['contributionMargin','monthlyFrequency','confidence'].includes(name)) assertSafeInteger(value, name, 0);
  const incrementalOrders = input.exposedPurchases - input.expectedBaselinePurchases;
  const incrementalRevenueMinor = incrementalOrders * input.incrementalAverageOrderValueMinor;
  const incrementalContributionMinor = mulDiv(incrementalRevenueMinor, ratePpm(input.contributionMargin, 'contributionMargin'), 1_000_000) - input.discountLeakageMinor - input.variableCostMinor - input.channelCostMinor;
  const campaignRoiBps = input.fixedCampaignCostMinor > 0 ? roundDiv((incrementalContributionMinor - input.fixedCampaignCostMinor) * 10_000, input.fixedCampaignCostMinor) : null;
  const cacMinor = input.verifiedNewCustomers > 0 ? roundDiv(input.acquisitionSpendMinor, input.verifiedNewCustomers) : null;
  const costPerReturnMinor = input.reactivatedCustomers > 0 ? roundDiv(input.reactivationCostMinor, input.reactivatedCustomers) : null;
  const frequencyMilli = Math.round(input.monthlyFrequency * 1000);
  const monthlyRevenueMinor = mulDiv(input.averageOrderValueMinor,frequencyMilli,1000);
  const ltvMinor = mulDiv(monthlyRevenueMinor * input.expectedActiveMonths,ratePpm(input.contributionMargin,'contributionMargin'),1_000_000);
  const timeSavedMinutes = input.taskMinutes.reduce((sum, task) => sum + Math.max(0, task.baseline - task.actualOwner), 0);
  const epsilon = 1, forecastErrorPpm = roundDiv(Math.abs(input.actualMinor - input.forecastMinor) * 1_000_000, Math.max(Math.abs(input.actualMinor), epsilon));
  const shared = { period: input.period, source: input.source, confidence: input.confidence, assumptions: ['kind preserved; no cross-kind aggregation'], status: input.kind === 'mock_actual' ? 'simulated' as const : input.kind === 'verified_fact' ? 'verified' as const : 'estimated' as const, nextAction: 'Inspect provenance before comparing with another evidence kind', kind: input.kind };
  const numbers = {
    influencedRevenue: explanation({ ...shared, what: 'Influenced revenue', value: input.influencedRevenueMinor, unit: input.currency, formula: 'sum of exposed purchases; not incremental', kind: 'influenced' }),
    incrementalRevenue: explanation({ ...shared, what: 'Incremental revenue', value: incrementalRevenueMinor, unit: input.currency, formula: '(exposed purchases − expected baseline purchases) × incremental AOV' }),
    incrementalContribution: explanation({ ...shared, what: 'Incremental contribution', value: incrementalContributionMinor, unit: input.currency, formula: 'incremental revenue × contribution margin − discount leakage − variable cost − channel cost' }),
    campaignRoi: explanation({ ...shared, what: 'Campaign ROI', value: campaignRoiBps ?? 0, unit: 'basis_points', formula: '(incremental contribution − fixed campaign cost) / fixed campaign cost × 10,000' }),
    timeSaved: explanation({ ...shared, what: 'Owner time saved', value: timeSavedMinutes, unit: 'minutes', formula: 'Σ max(baseline task minutes − actual owner minutes, 0)' }),
  };
  if (input.kind === 'verified_fact' && input.source.startsWith('mock')) throw new DomainError('MOCK_AS_FACT', 'mock source cannot produce verified fact');
  return { incrementalOrders, incrementalRevenueMinor, incrementalContributionMinor, campaignRoiBps, cacMinor, costPerReturnMinor, ltvMinor, timeSavedMinutes, forecastErrorPpm, influencedRevenueMinor: input.influencedRevenueMinor, kind: input.kind, numbers: Object.freeze(numbers) };
}
