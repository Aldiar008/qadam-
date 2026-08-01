import { DomainError, assertSafeInteger } from './shared.ts';

export type SegmentCode = 'new' | 'regular' | 'loyal' | 'vip' | 'inactive';
export interface SegmentRules { version: number; inactiveDays: number; regularVisits: number; loyalVisits: number; vipSpendMinor: number; newDays: number }
export interface CustomerTransaction { occurredAt: string; netMinor: number }
export interface CustomerForSegmentation { id: string; transactions: readonly CustomerTransaction[]; consent: 'granted' | 'denied' | 'revoked' | 'expired' | 'missing'; returnScore: number }
export interface SegmentMembership { key: string; customerId: string; segment: SegmentCode; ruleVersion: number; recencyDays: number; frequency: number; monetaryMinor: number; reason: Readonly<Record<string, number | string>> }

export function classifyCustomer(customer: CustomerForSegmentation, rules: SegmentRules, asOf: string): SegmentMembership {
  assertSafeInteger(rules.version, 'rule version', 1); const now = Date.parse(asOf); if (Number.isNaN(now)) throw new DomainError('INVALID_TIMESTAMP', 'asOf invalid');
  const sorted = [...customer.transactions].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
  for (const tx of sorted) assertSafeInteger(tx.netMinor, 'netMinor', 0);
  const frequency = sorted.length, monetaryMinor = sorted.reduce((sum, tx) => sum + tx.netMinor, 0);
  const recencyDays = frequency ? Math.floor((now - Date.parse(sorted[0].occurredAt)) / 86_400_000) : Number.MAX_SAFE_INTEGER;
  const ageDays = frequency ? Math.floor((now - Date.parse(sorted[frequency - 1].occurredAt)) / 86_400_000) : 0;
  let segment: SegmentCode;
  if (!frequency || recencyDays >= rules.inactiveDays) segment = 'inactive';
  else if (monetaryMinor >= rules.vipSpendMinor) segment = 'vip';
  else if (frequency >= rules.loyalVisits) segment = 'loyal';
  else if (frequency >= rules.regularVisits) segment = 'regular';
  else if (ageDays <= rules.newDays) segment = 'new';
  else segment = 'regular';
  return { key: `${rules.version}:${customer.id}:${segment}`, customerId: customer.id, segment, ruleVersion: rules.version, recencyDays, frequency, monetaryMinor, reason: Object.freeze({ recencyDays, frequency, monetaryMinor, ruleVersion: rules.version }) };
}

export function recomputeMemberships(customers: readonly CustomerForSegmentation[], rules: SegmentRules, asOf: string): SegmentMembership[] {
  const map = new Map(customers.map((customer) => { const row = classifyCustomer(customer, rules, asOf); return [row.customerId, row] as const; }));
  return [...map.values()].sort((a, b) => a.customerId.localeCompare(b.customerId));
}

export function eligibleAudience(customers: readonly CustomerForSegmentation[], rules: SegmentRules, asOf: string, target: SegmentCode, minimumReturnScore: number): { memberships: SegmentMembership[]; eligibleCustomerIds: string[]; excluded: Record<string, string> } {
  const memberships = recomputeMemberships(customers, rules, asOf); const byId = new Map(customers.map((x) => [x.id, x])); const eligibleCustomerIds: string[] = []; const excluded: Record<string, string> = {};
  for (const member of memberships.filter((x) => x.segment === target)) { const customer = byId.get(member.customerId)!; if (customer.consent !== 'granted') excluded[customer.id] = `consent_${customer.consent}`; else if (customer.returnScore < minimumReturnScore) excluded[customer.id] = 'return_score'; else eligibleCustomerIds.push(customer.id); }
  return { memberships, eligibleCustomerIds, excluded };
}
