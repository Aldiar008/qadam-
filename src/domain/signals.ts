import { DomainError, explanation, roundDiv, type NumberExplanation } from './shared.ts';

export interface Observation { occurredAt: string; value: number; customerId?: string }
export interface ComparableWindow { start: string; end: string; timezone: string; weekdays: readonly number[]; startHour: number; endHour: number }
export interface SignalEvidence { baseline: number; current: number; deltaBps: number; assumptions: readonly string[]; confidence: number; causalClaim: false; explanation: NumberExplanation }
export type DetectedSignal = { type: 'quiet_hours' | 'repeat_rate_drop' | 'inactive_growth' | 'low_capacity' | 'data_quality'; severity: 'info' | 'warning' | 'critical'; evidence: SignalEvidence };

function localParts(value: string, timezone: string): { weekday: number; hour: number } {
  const date = new Date(value); if (Number.isNaN(date.valueOf())) throw new DomainError('INVALID_TIMESTAMP', value);
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short', hour: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const day = parts.find((x) => x.type === 'weekday')?.value;
  const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return { weekday: map[day ?? ''] ?? 0, hour: Number(parts.find((x) => x.type === 'hour')?.value) };
}
function sumWindow(rows: readonly Observation[], window: ComparableWindow): number {
  const start = Date.parse(window.start), end = Date.parse(window.end);
  if (!(start < end) || window.startHour < 0 || window.endHour > 24 || window.startHour >= window.endHour) throw new DomainError('INVALID_WINDOW', 'invalid comparison window');
  return rows.reduce((sum, row) => { const time = Date.parse(row.occurredAt); const local = localParts(row.occurredAt, window.timezone); return time >= start && time < end && window.weekdays.includes(local.weekday) && local.hour >= window.startHour && local.hour < window.endHour ? sum + row.value : sum; }, 0);
}

export function compareComparableWindows(rows: readonly Observation[], current: ComparableWindow, baseline: ComparableWindow, source: string): SignalEvidence {
  if (current.timezone !== baseline.timezone || current.startHour !== baseline.startHour || current.endHour !== baseline.endHour || current.weekdays.join() !== baseline.weekdays.join()) throw new DomainError('INCOMPARABLE_WINDOWS', 'weekday, timezone and time windows must match');
  const currentValue = sumWindow(rows, current), baselineValue = sumWindow(rows, baseline);
  if (baselineValue <= 0) throw new DomainError('NO_BASELINE', 'baseline must be positive');
  const deltaBps = roundDiv((currentValue - baselineValue) * 10_000, baselineValue);
  const confidence = Math.min(0.95, 0.5 + Math.min(rows.length, 90) / 200);
  return {
    baseline: baselineValue, current: currentValue, deltaBps, confidence, causalClaim: false,
    assumptions: Object.freeze(['same local weekdays', 'same local time window', 'observed association; no causal claim']),
    explanation: explanation({ what: 'Comparable-window change', value: deltaBps, unit: 'basis_points', period: { start: current.start, end: current.end }, source, formula: '(current - baseline) / baseline × 10,000', confidence, assumptions: ['same weekdays and local hours'], status: 'observed', nextAction: 'Review evidence and compile a guarded experiment', kind: 'verified_fact' }),
  };
}

export function detectSignals(input: { rows: readonly Observation[]; current: ComparableWindow; baseline: ComparableWindow; repeatRateCurrent: number; repeatRateBaseline: number; inactiveCurrent: number; inactiveBaseline: number; capacityUtilization: number; invalidRowShare: number; source: string }): DetectedSignal[] {
  const comparable = compareComparableWindows(input.rows, input.current, input.baseline, input.source);
  const signals: DetectedSignal[] = [];
  if (comparable.deltaBps <= -1500) signals.push({ type: 'quiet_hours', severity: comparable.deltaBps <= -2500 ? 'critical' : 'warning', evidence: comparable });
  const derived = (type: DetectedSignal['type'], current: number, baseline: number, threshold: number): void => {
    if (baseline <= 0) return; const deltaBps = roundDiv((current - baseline) * 10_000, baseline); if (Math.abs(deltaBps) < threshold) return;
    signals.push({ type, severity: Math.abs(deltaBps) >= threshold * 2 ? 'critical' : 'warning', evidence: { ...comparable, baseline, current, deltaBps, explanation: explanation({ ...comparable.explanation, what: type, value: deltaBps, formula: '(current - baseline) / baseline × 10,000' }) } });
  };
  if (input.repeatRateCurrent < input.repeatRateBaseline) derived('repeat_rate_drop', input.repeatRateCurrent, input.repeatRateBaseline, 1000);
  if (input.inactiveCurrent > input.inactiveBaseline) derived('inactive_growth', input.inactiveCurrent, input.inactiveBaseline, 1000);
  if (input.capacityUtilization < 0.35) derived('low_capacity', Math.round(input.capacityUtilization * 10_000), 10_000, 3000);
  if (input.invalidRowShare > 0.05) derived('data_quality', Math.round(input.invalidRowShare * 10_000), 10_000, 500);
  return signals;
}
