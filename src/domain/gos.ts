import { DomainError, assertSafeInteger, ratePpm, roundDiv } from './shared.ts';

export interface GosInputs { P: number; S: number; R: number; V: number; G: number; C: number; D: number; A: number; L: number }
export interface GosGuards { expectedIncrementalContributionMinor: number; hasConsent: boolean; withinLimits: boolean }
export interface GosResult { score: number; status: 'green' | 'amber' | 'blocked'; formulaVersion: 'gos.v1'; assumptions: Readonly<GosInputs>; blockedReasons: readonly string[] }
const WEIGHTS: Readonly<Record<keyof GosInputs, number>> = Object.freeze({ P: 22, S: 17, R: 12, V: 10, G: 10, C: 10, D: 8, A: 6, L: 5 });

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
