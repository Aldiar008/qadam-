import type { BusinessTwinInput } from './business-twin.ts';
import type { GosInputs } from './gos.ts';
import type { ImpactInput } from './impact-ledger.ts';
import type { CustomerForSegmentation, SegmentRules } from './segments.ts';
import type { SimulatorInput } from './simulator.ts';
import manifest from '../../supabase/seed/qadam_demo_seed.json' with { type: 'json' };

const domain=manifest.domain_fixture, simulation=domain.simulator, impact=domain.impact_assumptions;
export const TAMYR_PERIOD = Object.freeze(domain.period);
export const tamyrTwinInput: BusinessTwinInput = {
  profile: { name: manifest.business.name, currency: manifest.business.currency, timezone: manifest.business.timezone },
  locations: [{ id: 'tamyr-bostandyk', timezone: manifest.business.timezone, capacity: manifest.business.capacity, operatingHours: [1,2,3,4,5,6,7].map((weekday) => ({ weekday, opens: '08:00', closes: '22:00' })) }],
  items: [{ id: 'croissant', kind: 'product', priceMinor: 900, costMinor: simulation.safe_gift.gift_cost_minor, currency: manifest.business.currency }, { id: 'average-order', kind: 'product', priceMinor: manifest.business.average_check_minor, costMinor: 1311, currency: manifest.business.currency }],
  goals: ['reactivate_customers'], monthlyBudgetMinor: simulation.budget_minor, marginFloor: manifest.business.margin_floor_bps/10_000, channels: ['whatsapp'], brandVoice: { tone: 'warm_local' },
  sources: { catalog: { source: 'qadam_demo_seed.catalog_items', confidence: 0.95 }, capacity: { source: 'qadam_demo_seed.business_locations', confidence: 1 } }, calculatedAt: '2026-07-30T00:00:00.000Z',
};
export const tamyrGosInputs: GosInputs = domain.gos_inputs;
export const tamyrSegmentRules: SegmentRules = { version: 1, inactiveDays: domain.segments.inactive_days, regularVisits: 2, loyalVisits: 8, vipSpendMinor: 100000, newDays: 14 };
export function tamyrCustomers(): CustomerForSegmentation[] {
  return Array.from({ length: manifest.counts.customers }, (_, index) => { const number = index + 1; const inactive = number <= domain.segments.inactive_count; return { id: `customer-${number.toString().padStart(3,'0')}`, transactions: [{ occurredAt: inactive ? '2026-06-20T10:00:00.000Z' : '2026-07-25T10:00:00.000Z', netMinor: manifest.business.average_check_minor }], consent: number <= domain.segments.eligible_count ? 'granted' as const : 'denied' as const, returnScore: number <= domain.segments.eligible_count ? 0.9 : 0.4 }; });
}
export const tamyrGiftSimulation: SimulatorInput = { eligibleAudience: simulation.eligible_audience, baselineConversion: simulation.baseline_conversion, uplift: simulation.uplift, averageOrderValueMinor: simulation.average_order_value_minor, unitCostMinor: simulation.unit_cost_minor, contributionMargin: simulation.contribution_margin, channelCostPerContactMinor: simulation.channel_cost_per_contact_minor, fixedCostMinor: simulation.fixed_cost_minor, budgetMinor: simulation.budget_minor, durationDays: simulation.duration_days, frequencyCap: simulation.frequency_cap, cannibalization: simulation.cannibalization, currency: manifest.business.currency, mechanic: { type:'gift_with_threshold',giftCostMinor:simulation.safe_gift.gift_cost_minor,thresholdMinor:simulation.safe_gift.threshold_minor }, period: TAMYR_PERIOD, source: 'qadam_demo_seed+simulator.v1' };
export const tamyrDiscountSimulation: SimulatorInput = { ...tamyrGiftSimulation, averageOrderValueMinor: manifest.business.average_check_minor, mechanic: { type:'percentage_discount',discountBps:simulation.unsafe_discount.discount_bps } };
export const tamyrImpactInput: ImpactInput = { exposedPurchases: impact.exposed_purchases, expectedBaselinePurchases: impact.expected_baseline_purchases, incrementalAverageOrderValueMinor: impact.incremental_aov_minor, contributionMargin: impact.contribution_margin, discountLeakageMinor: impact.discount_leakage_minor, variableCostMinor: impact.variable_cost_minor, channelCostMinor: impact.channel_cost_minor, fixedCampaignCostMinor: manifest.canonical_outcome.campaign_cost_minor, acquisitionSpendMinor: 0, verifiedNewCustomers: 0, reactivationCostMinor: manifest.canonical_outcome.campaign_cost_minor, reactivatedCustomers: manifest.canonical_outcome.redeemed, averageOrderValueMinor: manifest.business.average_check_minor, monthlyFrequency: 2, expectedActiveMonths: 6, taskMinutes: [{ baseline: 180, actualOwner: 180-manifest.canonical_outcome.simulated_owner_time_saved_minutes }], forecastMinor: impact.forecast_minor, actualMinor: manifest.canonical_outcome.incremental_estimate_minor, influencedRevenueMinor: manifest.canonical_outcome.influenced_revenue_minor, kind: 'mock_actual', currency: manifest.business.currency, period: TAMYR_PERIOD, source: 'mock:qadam_demo_seed', confidence: 0.65 };
