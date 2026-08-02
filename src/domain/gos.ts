import { DomainError, assertSafeInteger, ratePpm, roundDiv } from './shared.ts';

export interface GosInputs { P: number; S: number; R: number; V: number; G: number; C: number; D: number; A: number; L: number }
export interface GosGuards { expectedIncrementalContributionMinor: number; hasConsent: boolean; withinLimits: boolean }
export interface GosResult { score: number; status: 'green' | 'amber' | 'blocked'; formulaVersion: 'gos.v1'; assumptions: Readonly<GosInputs>; blockedReasons: readonly string[] }
const WEIGHTS: Readonly<Record<keyof GosInputs, number>> = Object.freeze({ P: 22, S: 17, R: 12, V: 10, G: 10, C: 10, D: 8, A: 6, L: 5 });

/**
 * Measured facts the nine GOS components are derived from.
 *
 * The components used to be a literal `{P: 0.5, S: 0.7, …}` written into every
 * contract, so the Growth Opportunity Score was the same number for every
 * business, every signal and every offer — a score that cannot vary is not a
 * score. What each letter means was never written down anywhere either; it is
 * defined here, once, in terms of things the database can answer:
 *
 *   P — potential:      how deep the detected drop is
 *   S — signal:         how confident the detector is in it
 *   R — reach:          how much of the segment may lawfully be contacted
 *   V — value:          contribution margin left after the offer
 *   G — growth room:    share of the base that has gone quiet
 *   C — consent:        share of the whole base reachable at all
 *   D — data:           share of guests with purchase history behind them
 *   A — affordability:  budget against what this campaign would cost
 *   L — loyalty:        share of the base carrying a loyalty account
 */
export interface GosFacts {
  signalChangeBps: number | null;
  signalConfidence: number | null;
  segmentSize: number;
  consentEligible: number;
  contributionMargin: number;
  inactiveShare: number;
  consentShare: number;
  dataQuality: number;
  budgetMinor: number;
  expectedCostMinor: number;
  loyaltyShare: number;
}

const clamp = (value: number): number => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);
const share = (part: number, whole: number): number => (whole > 0 ? clamp(part / whole) : 0);

export function deriveGosInputs(facts: GosFacts): GosInputs {
  return {
    // A 30% drop is treated as the top of the scale: deeper than that and the
    // question is no longer "is this worth doing".
    P: facts.signalChangeBps === null ? 0.3 : clamp(Math.abs(facts.signalChangeBps) / 3_000),
    S: facts.signalConfidence === null ? 0.3 : clamp(facts.signalConfidence / 100),
    R: share(facts.consentEligible, facts.segmentSize),
    V: clamp(facts.contributionMargin),
    G: clamp(facts.inactiveShare),
    C: clamp(facts.consentShare),
    D: clamp(facts.dataQuality),
    A: facts.expectedCostMinor > 0 ? share(facts.budgetMinor, facts.expectedCostMinor * 4) : 0.5,
    L: clamp(facts.loyaltyShare),
  };
}

export function calculateGos(inputs: GosInputs, guards: GosGuards): GosResult {
  assertSafeInteger(guards.expectedIncrementalContributionMinor, 'expected contribution');
  let weighted = 0; for (const key of Object.keys(WEIGHTS) as (keyof GosInputs)[]) weighted += ratePpm(inputs[key], key) * WEIGHTS[key];
  const score = roundDiv(weighted, 1_000_000);
  const blockedReasons: string[] = [];
  if (guards.expectedIncrementalContributionMinor <= 0) blockedReasons.push('non_positive_contribution');
  if (!guards.hasConsent) blockedReasons.push('missing_consent');
  if (!guards.withinLimits) blockedReasons.push('business_limit_exceeded');
  const status = blockedReasons.length ? 'blocked' : score >= 75 ? 'green' : 'amber';
  if (score < 0 || score > 100) throw new DomainError('INVALID_GOS', 'GOS out of range');
  return { score, status, formulaVersion: 'gos.v1', assumptions: Object.freeze({ ...inputs }), blockedReasons: Object.freeze(blockedReasons) };
}
