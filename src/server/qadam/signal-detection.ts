import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { detectSignals, type ComparableWindow, type DetectedSignal, type Observation } from '@/domain/signals.ts';

/**
 * Runs the signal detector on a tenant's own data and records what it found.
 *
 * The detector existed, was unit-tested, and was called by nothing. Rows only
 * ever reached `public.signals` through the branch of `complete_onboarding`
 * that clones the demonstration tenant — so a real business never received a
 * signal at all, and «Сегодня», the screen the whole product is arranged
 * around, had nothing to show it. That is the gap this closes.
 *
 * Nothing here invents a finding. If the data cannot support a comparison the
 * function says which data is missing and writes no signal, because a made-up
 * signal is worse than an empty screen.
 */

/** Weekday bands examined for a quiet-hours drop, in local time. */
const CANDIDATE_BANDS: readonly { startHour: number; endHour: number; label: string }[] = [
  { startHour: 8, endHour: 11, label: 'morning_8_11' },
  { startHour: 11, endHour: 15, label: 'midday_11_15' },
  { startHour: 15, endHour: 18, label: 'afternoon_15_18' },
  { startHour: 18, endHour: 22, label: 'evening_18_22' },
];

const WEEKDAYS = [1, 2, 3, 4, 5] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface DetectionOutcome {
  detected: DetectedSignal | null;
  metricKey: string | null;
  /**
   * Everything the detector found this run, strongest first.
   *
   * Only the single sharpest finding used to be recorded, so a business with a
   * quiet-hours dip *and* a growing pile of dormant guests was told about one
   * of them and the other was measured and thrown away. Each becomes its own
   * signal, and therefore its own recommendation.
   */
  all: readonly { signal: DetectedSignal; metricKey: string }[];
  /** Present when nothing could be decided, naming what is missing. */
  missing: string | null;
  transactions: number;
  windowDays: number;
}

interface DetectionInput {
  rows: Observation[];
  timezone: string;
  capacity: number | null;
  invalidRowShare: number;
  now: number;
}

/**
 * Picks the weekday band with the sharpest comparable drop.
 *
 * Every band is compared like for like — same weekdays, same local hours, one
 * week against the week before — because a "drop" measured against a different
 * slice of the week is not a drop, it is a different question.
 */
function worstBand(input: DetectionInput): { window: ComparableWindow; baseline: ComparableWindow; label: string } | null {
  const currentEnd = new Date(input.now);
  const currentStart = new Date(input.now - 7 * DAY_MS);
  const baselineStart = new Date(input.now - 14 * DAY_MS);

  let worst: { window: ComparableWindow; baseline: ComparableWindow; label: string; delta: number } | null = null;
  for (const band of CANDIDATE_BANDS) {
    const window: ComparableWindow = {
      start: currentStart.toISOString(), end: currentEnd.toISOString(),
      timezone: input.timezone, weekdays: WEEKDAYS, startHour: band.startHour, endHour: band.endHour,
    };
    const baseline: ComparableWindow = { ...window, start: baselineStart.toISOString(), end: currentStart.toISOString() };
    try {
      const evidence = compare(input.rows, window, baseline);
      if (!worst || evidence < worst.delta) worst = { window, baseline, label: band.label, delta: evidence };
    } catch {
      // A band with no baseline turnover cannot be compared. That is a fact
      // about this business's week, not an error worth stopping for.
      continue;
    }
  }
  return worst;
}

function compare(rows: readonly Observation[], window: ComparableWindow, baseline: ComparableWindow): number {
  const detected = detectSignals({
    rows, current: window, baseline,
    repeatRateCurrent: 0, repeatRateBaseline: 0,
    inactiveCurrent: 0, inactiveBaseline: 0,
    capacityUtilization: 1, invalidRowShare: 0,
    source: 'probe',
  });
  const quiet = detected.find((signal) => signal.type === 'quiet_hours');
  return quiet ? quiet.evidence.deltaBps : 0;
}

/** Reads a business's own numbers and decides whether anything is worth saying. */
export async function detectForBusiness(db: SupabaseClient, businessId: string, now = Date.now()): Promise<DetectionOutcome> {
  const since = new Date(now - 60 * DAY_MS).toISOString();

  const [{ data: business }, { data: location }, { data: transactions, error: txError }] = await Promise.all([
    db.from('businesses').select('timezone').eq('id', businessId).maybeSingle(),
    db.from('business_locations').select('capacity').eq('business_id', businessId).eq('is_active', true).order('created_at').limit(1).maybeSingle(),
    db.from('transactions').select('occurred_at,net_minor,customer_id').eq('business_id', businessId).gte('occurred_at', since).order('occurred_at').limit(5000),
  ]);
  if (txError) throw new Error(`could not read transactions for ${businessId}: ${txError.message}`);

  const rows: Observation[] = (transactions ?? []).map((row) => ({
    occurredAt: String(row.occurred_at),
    value: Number(row.net_minor ?? 0),
    customerId: row.customer_id ? String(row.customer_id) : undefined,
  }));

  // Two comparable weeks is the least this can be honest about. Below that the
  // answer is "not yet", said plainly, with the number still needed.
  if (rows.length < 30) {
    return {
      detected: null, metricKey: null, all: [], transactions: rows.length, windowDays: 14,
      missing: `Для сравнения двух недель нужно не меньше 30 продаж, сейчас ${rows.length}. Загрузите историю продаж или подключите источник.`,
    };
  }

  const timezone = String(business?.timezone ?? 'Asia/Almaty');
  const capacity = location?.capacity ? Number(location.capacity) : null;

  const band = worstBand({ rows, timezone, capacity, invalidRowShare: 0, now });
  if (!band) {
    return {
      detected: null, metricKey: null, all: [], transactions: rows.length, windowDays: 14,
      missing: 'Нет ни одного будничного окна, где на прошлой неделе была выручка, — сравнивать не с чем.',
    };
  }

  const repeat = repeatRates(rows, now);
  const inactive = inactiveCounts(rows, now);
  const utilisation = capacity && capacity > 0
    ? Math.min(1, rows.filter((row) => Date.parse(row.occurredAt) >= now - 7 * DAY_MS).length / (capacity * 7))
    : 1;

  const detected = detectSignals({
    rows,
    current: band.window,
    baseline: band.baseline,
    repeatRateCurrent: repeat.current,
    repeatRateBaseline: repeat.baseline,
    inactiveCurrent: inactive.current,
    inactiveBaseline: inactive.baseline,
    capacityUtilization: utilisation,
    invalidRowShare: 0,
    source: `собственные продажи заведения, окно ${band.label}`,
  });

  if (!detected.length) {
    return {
      detected: null, metricKey: null, all: [], transactions: rows.length, windowDays: 14,
      missing: 'Показатели держатся ровно: ни одно окно не просело настолько, чтобы это было отличимо от обычного разброса.',
    };
  }

  const ranked = [...detected]
    .sort((a, b) => Math.abs(b.evidence.deltaBps) - Math.abs(a.evidence.deltaBps))
    .map((signal) => ({
      signal,
      metricKey: signal.type === 'quiet_hours' ? `weekday_revenue_${band.label}` : signal.type,
    }));

  return {
    detected: ranked[0].signal,
    metricKey: ranked[0].metricKey,
    all: ranked,
    missing: null,
    transactions: rows.length,
    windowDays: 14,
  };
}

/**
 * Detects and records in one step, returning what the owner should be told.
 *
 * The admin client is required: `record_detected_signal` is granted to
 * `service_role` only, because writing a signal is the system stating a
 * measured fact about a business, not something a member types in.
 */
export async function detectAndRecord(db: SupabaseClient, businessId: string, now = Date.now()): Promise<DetectionOutcome> {
  const outcome = await detectForBusiness(db, businessId, now);
  if (!outcome.all.length) return outcome;

  for (const { signal, metricKey } of outcome.all) {
    const { evidence } = signal;
    const { error } = await db.rpc('record_detected_signal', {
      p_business_id: businessId,
      p_signal_type: signal.type,
      p_metric_key: metricKey,
      p_period_start: new Date(now - 7 * DAY_MS).toISOString(),
      p_period_end: new Date(now).toISOString(),
      p_comparison_start: new Date(now - 14 * DAY_MS).toISOString(),
      p_comparison_end: new Date(now - 7 * DAY_MS).toISOString(),
      p_change_bps: evidence.deltaBps,
      p_confidence: Math.round(evidence.confidence * 100),
      p_evidence: evidence.explanation as unknown as Record<string, unknown>,
      p_baseline: { value: evidence.baseline },
      p_delta: { value: evidence.current - evidence.baseline, bps: evidence.deltaBps },
      p_assumptions: evidence.assumptions,
    });
    // A measurement that could not be written is not a measurement anyone will
    // see, and the caller has to be able to say so rather than report success.
    if (error) throw new Error(`could not record the ${metricKey} signal for ${businessId}: ${error.message}`);
  }

  // A signal without a recommendation is a diagnosis with no treatment, which is
  // exactly where this product used to stop.
  const { error: recommendError } = await db.rpc('recommend_from_signals', { p_business_id: businessId });
  if (recommendError) throw new Error(`could not turn signals into recommendations for ${businessId}: ${recommendError.message}`);

  return outcome;
}

function repeatRates(rows: readonly Observation[], now: number): { current: number; baseline: number } {
  const share = (from: number, to: number) => {
    const visits = new Map<string, number>();
    for (const row of rows) {
      const time = Date.parse(row.occurredAt);
      if (!row.customerId || time < from || time >= to) continue;
      visits.set(row.customerId, (visits.get(row.customerId) ?? 0) + 1);
    }
    if (!visits.size) return 0;
    let repeated = 0;
    for (const count of visits.values()) if (count > 1) repeated += 1;
    return Math.round((repeated / visits.size) * 10_000);
  };
  return { current: share(now - 30 * DAY_MS, now), baseline: share(now - 60 * DAY_MS, now - 30 * DAY_MS) };
}

function inactiveCounts(rows: readonly Observation[], now: number): { current: number; baseline: number } {
  const lastSeen = new Map<string, number>();
  for (const row of rows) {
    if (!row.customerId) continue;
    const time = Date.parse(row.occurredAt);
    lastSeen.set(row.customerId, Math.max(lastSeen.get(row.customerId) ?? 0, time));
  }
  const inactiveAt = (moment: number) => {
    let count = 0;
    for (const seen of lastSeen.values()) if (seen <= moment - 30 * DAY_MS) count += 1;
    return count;
  };
  return { current: inactiveAt(now), baseline: inactiveAt(now - 30 * DAY_MS) };
}
