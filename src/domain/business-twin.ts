import { DomainError, assertCurrency, assertRate, assertSafeInteger } from './shared.ts';

export interface Sourced<T> { value: T; source: string; confidence: number; calculatedAt: string }
export interface TwinLocation { id: string; timezone: string; capacity: number; operatingHours: readonly { weekday: number; opens: string; closes: string }[] }
export interface TwinItem { id: string; kind: 'product' | 'service'; priceMinor: number; costMinor: number | null; currency: string }
export interface BusinessTwinInput {
  profile: { name: string; currency: string; timezone: string };
  locations: readonly TwinLocation[];
  items: readonly TwinItem[];
  goals: readonly string[];
  monthlyBudgetMinor: number | null;
  marginFloor: number | null;
  channels: readonly string[];
  brandVoice: Readonly<Record<string, unknown>> | null;
  sources: Readonly<Record<string, { source: string; confidence: number }>>;
  calculatedAt: string;
}
export interface NormalizedBusinessTwin extends BusinessTwinInput {
  derived: { averagePriceMinor: Sourced<number | null>; knownCostShare: Sourced<number>; totalCapacity: Sourced<number> };
  readiness: number;
  missing: readonly string[];
}

function validTimezone(zone: string): boolean { try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); return true; } catch { return false; } }
function sourced<T>(value: T, source: string, confidence: number, calculatedAt: string): Sourced<T> { assertRate(confidence, 'source confidence'); return { value, source, confidence, calculatedAt }; }

export function normalizeBusinessTwin(input: BusinessTwinInput): NormalizedBusinessTwin {
  assertCurrency(input.profile.currency);
  if (!validTimezone(input.profile.timezone)) throw new DomainError('INVALID_TIMEZONE', `invalid IANA timezone: ${input.profile.timezone}`);
  if (Number.isNaN(Date.parse(input.calculatedAt))) throw new DomainError('INVALID_TIMESTAMP', 'calculatedAt must be ISO timestamp');
  if (input.monthlyBudgetMinor !== null) assertSafeInteger(input.monthlyBudgetMinor, 'monthlyBudgetMinor', 0);
  if (input.marginFloor !== null) assertRate(input.marginFloor, 'marginFloor');
  for (const location of input.locations) {
    if (!validTimezone(location.timezone)) throw new DomainError('INVALID_TIMEZONE', `invalid location timezone: ${location.timezone}`);
    assertSafeInteger(location.capacity, 'capacity', 1);
    for (const hours of location.operatingHours) if (hours.weekday < 1 || hours.weekday > 7 || hours.opens >= hours.closes) throw new DomainError('INVALID_HOURS', 'operating hours must use ISO weekday and opens < closes');
  }
  for (const item of input.items) {
    assertCurrency(item.currency); if (item.currency !== input.profile.currency) throw new DomainError('CURRENCY_MISMATCH', 'catalog currency differs from business currency');
    assertSafeInteger(item.priceMinor, 'priceMinor', 0); if (item.costMinor !== null) { assertSafeInteger(item.costMinor, 'costMinor', 0); if (item.costMinor > item.priceMinor) throw new DomainError('NEGATIVE_ITEM_MARGIN', 'item cost exceeds price'); }
  }
  const missing: string[] = [];
  if (!input.locations.length) missing.push('locations');
  if (!input.locations.some((x) => x.operatingHours.length)) missing.push('operating_hours');
  if (!input.items.length) missing.push('catalog_items');
  if (input.items.some((x) => x.costMinor === null)) missing.push('catalog_costs');
  if (!input.goals.length) missing.push('business_goals');
  if (input.monthlyBudgetMinor === null) missing.push('monthly_budget');
  if (input.marginFloor === null) missing.push('margin_floor');
  if (!input.channels.length) missing.push('channels');
  if (!input.brandVoice) missing.push('brand_voice');
  const activeItems = input.items.filter((x) => x.priceMinor >= 0);
  const averagePrice = activeItems.length ? roundAverage(activeItems.map((x) => x.priceMinor)) : null;
  const knownCosts = activeItems.filter((x) => x.costMinor !== null).length;
  const confidence = input.sources.catalog?.confidence ?? 0.5;
  const completeness = 9 - new Set(missing).size;
  return {
    ...input,
    derived: {
      averagePriceMinor: sourced(averagePrice, input.sources.catalog?.source ?? 'catalog_items', confidence, input.calculatedAt),
      knownCostShare: sourced(activeItems.length ? knownCosts / activeItems.length : 0, input.sources.catalog?.source ?? 'catalog_items', confidence, input.calculatedAt),
      totalCapacity: sourced(input.locations.reduce((sum, x) => sum + x.capacity, 0), input.sources.capacity?.source ?? 'business_locations', input.sources.capacity?.confidence ?? 0.5, input.calculatedAt),
    },
    readiness: Math.round((completeness / 9) * 100),
    missing: Object.freeze([...new Set(missing)]),
  };
}

function roundAverage(values: readonly number[]): number { return Math.round(values.reduce((a, b) => a + b, 0) / values.length); }
