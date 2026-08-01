export type CurrencyCode = string;
export type MetricKind = 'forecast' | 'influenced' | 'incremental_estimate' | 'mock_actual' | 'verified_fact';
export type ExplanationStatus = 'observed' | 'estimated' | 'simulated' | 'verified' | 'blocked';

export interface Period { start: string; end: string }
export interface NumberExplanation {
  what: string;
  value: number;
  unit: string;
  period: Period;
  source: string;
  formula: string;
  confidence: number;
  assumptions: readonly string[];
  status: ExplanationStatus;
  nextAction: string;
  kind: MetricKind;
}

export class DomainError extends Error {
  readonly code: string;
  constructor(code: string, message: string) { super(message); this.code = code; this.name = 'DomainError'; }
}

export function assertSafeInteger(value: number, name: string, min = Number.MIN_SAFE_INTEGER): void {
  if (!Number.isSafeInteger(value) || value < min) throw new DomainError('INVALID_INTEGER', `${name} must be a safe integer >= ${min}`);
}

export function assertRate(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new DomainError('INVALID_RATE', `${name} must be between 0 and 1`);
}

export function assertCurrency(value: string): void {
  if (!/^[A-Z]{3}$/.test(value)) throw new DomainError('INVALID_CURRENCY', 'currency must be an ISO 4217 alpha-3 code');
}

export function ratePpm(value: number, name: string): number { assertRate(value, name); return Math.round(value * 1_000_000); }

export function roundDiv(numerator: number, denominator: number): number {
  assertSafeInteger(numerator, 'numerator');
  assertSafeInteger(denominator, 'denominator', 1);
  const sign = numerator < 0 ? -1 : 1;
  return sign * Math.floor((Math.abs(numerator) + Math.floor(denominator / 2)) / denominator);
}

export function mulDiv(value: number, multiplier: number, denominator: number): number {
  assertSafeInteger(value, 'value'); assertSafeInteger(multiplier, 'multiplier');
  const product = value * multiplier;
  if (!Number.isSafeInteger(product)) throw new DomainError('MONEY_OVERFLOW', 'fixed-point multiplication overflow');
  return roundDiv(product, denominator);
}

export function explanation(input: NumberExplanation): NumberExplanation {
  if (!input.what || !input.source || !input.formula || !input.nextAction) throw new DomainError('INCOMPLETE_EXPLANATION', 'every number requires what, source, formula and next action');
  if (Date.parse(input.period.start) >= Date.parse(input.period.end)) throw new DomainError('INVALID_PERIOD', 'period end must be after start');
  assertRate(input.confidence, 'confidence');
  return Object.freeze({ ...input, assumptions: Object.freeze([...input.assumptions]) });
}
