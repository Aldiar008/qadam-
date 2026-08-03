/**
 * Дашборды аналитики: превращает строки в фигуры, не выдумывая чисел.
 *
 * The analytics screen was a wall of correct numbers nobody read. A number
 * answers «сколько», a shape answers «когда и куда» — which is the question an
 * owner actually has, and the one the signal detector already answers in
 * words («в будни с 15:00 до 18:00 выручка ниже»). Until now the screen never
 * showed the picture that claim comes from.
 *
 * Everything here is pure and takes rows in, so it can be tested without a
 * database — and so no chart can quietly acquire a constant of its own. A
 * series with too few points reports that instead of drawing a confident line
 * through two dots.
 */

/** Local calendar parts of an instant, in the venue's own timezone. */
function localParts(iso: string, timeZone: string): { date: string; weekday: number; hour: number } | null {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  // `en-CA` yields YYYY-MM-DD, which sorts as a string — the reason for the
  // otherwise arbitrary locale.
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false, weekday: 'short',
  });
  const parts = formatter.formatToParts(at);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const weekdays: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  // Hour 24 exists in some ICU outputs for midnight; both mean the same day boundary.
  const hour = Number(value('hour')) % 24;
  const weekday = weekdays[value('weekday')];
  if (weekday === undefined || Number.isNaN(hour)) return null;
  return { date: `${value('year')}-${value('month')}-${value('day')}`, weekday, hour };
}

export interface RevenuePoint {
  /** YYYY-MM-DD in the venue's timezone. */
  date: string;
  valueMinor: number;
  transactions: number;
}

export interface RevenueSeries {
  points: RevenuePoint[];
  totalMinor: number;
  previousTotalMinor: number;
  /** Change against the same-length window before it, in basis points; null when there is nothing to compare to. */
  changeBps: number | null;
  peak: RevenuePoint | null;
  /** Days in the window with no recorded sale at all — closed, or not recorded. */
  emptyDays: number;
}

/**
 * Выручка по дням за период, с тем же окном до него для сравнения.
 *
 * Days with no transactions are kept as zeroes rather than skipped: a gap drawn
 * as a straight line between the days either side of it says the venue traded
 * that day, and it did not.
 */
export function dailyRevenueSeries(
  transactions: readonly { net_minor: number | string; occurred_at: string }[],
  window: { start: Date; end: Date; previousStart: Date },
  timeZone: string,
): RevenueSeries {
  const byDate = new Map<string, { valueMinor: number; transactions: number }>();
  let previousTotalMinor = 0;

  for (const row of transactions) {
    const at = new Date(row.occurred_at);
    if (Number.isNaN(at.getTime())) continue;
    const amount = Number(row.net_minor) || 0;
    if (at >= window.previousStart && at < window.start) {
      previousTotalMinor += amount;
      continue;
    }
    if (at < window.start || at > window.end) continue;
    const parts = localParts(row.occurred_at, timeZone);
    if (!parts) continue;
    const cell = byDate.get(parts.date) ?? { valueMinor: 0, transactions: 0 };
    cell.valueMinor += amount;
    cell.transactions += 1;
    byDate.set(parts.date, cell);
  }

  // Every day in the window appears, in order, whether or not it traded.
  const points: RevenuePoint[] = [];
  const cursor = new Date(window.start);
  while (cursor <= window.end) {
    const key = localParts(cursor.toISOString(), timeZone)?.date;
    if (key && !points.some((point) => point.date === key)) {
      const cell = byDate.get(key);
      points.push({ date: key, valueMinor: cell?.valueMinor ?? 0, transactions: cell?.transactions ?? 0 });
    }
    cursor.setTime(cursor.getTime() + 86_400_000);
  }

  const totalMinor = points.reduce((sum, point) => sum + point.valueMinor, 0);
  const peak = points.reduce<RevenuePoint | null>((best, point) => (best && best.valueMinor >= point.valueMinor ? best : point), null);

  return {
    points,
    totalMinor,
    previousTotalMinor,
    changeBps: previousTotalMinor > 0 ? Math.round(((totalMinor - previousTotalMinor) / previousTotalMinor) * 10_000) : null,
    peak: peak && peak.valueMinor > 0 ? peak : null,
    emptyDays: points.filter((point) => point.transactions === 0).length,
  };
}

export const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const;

export interface HeatCell {
  weekday: number;
  /** Start hour of a two-hour band, 8 through 22. */
  hour: number;
  valueMinor: number;
  transactions: number;
}

export interface VisitHeatmap {
  cells: HeatCell[];
  hours: number[];
  maxMinor: number;
  /** The band with the least money across weekdays — the one a signal would name. */
  quietest: { weekday: number; hour: number; valueMinor: number } | null;
  busiest: { weekday: number; hour: number; valueMinor: number } | null;
  transactions: number;
}

const BAND_START = 8;
const BAND_END = 24;
const BAND_SIZE = 2;

/**
 * Когда в заведении есть деньги, а когда пусто.
 *
 * Two-hour bands rather than hours: a café gets a handful of sales an hour, and
 * a 7×16 grid of ones and zeroes is noise wearing the costume of a chart.
 */
export function visitHeatmap(
  transactions: readonly { net_minor: number | string; occurred_at: string }[],
  timeZone: string,
): VisitHeatmap {
  const hours: number[] = [];
  for (let hour = BAND_START; hour < BAND_END; hour += BAND_SIZE) hours.push(hour);

  const cells: HeatCell[] = [];
  for (let weekday = 0; weekday < 7; weekday += 1) {
    for (const hour of hours) cells.push({ weekday, hour, valueMinor: 0, transactions: 0 });
  }
  const at = (weekday: number, hour: number) => cells.find((cell) => cell.weekday === weekday && cell.hour === hour);

  let counted = 0;
  for (const row of transactions) {
    const parts = localParts(row.occurred_at, timeZone);
    if (!parts) continue;
    // Sales outside opening hours land in the nearest band rather than vanishing:
    // a 03:00 delivery order is still money, and dropping it would understate the day.
    const band = Math.min(
      BAND_END - BAND_SIZE,
      Math.max(BAND_START, BAND_START + Math.floor((parts.hour - BAND_START) / BAND_SIZE) * BAND_SIZE),
    );
    const cell = at(parts.weekday, band);
    if (!cell) continue;
    cell.valueMinor += Number(row.net_minor) || 0;
    cell.transactions += 1;
    counted += 1;
  }

  const maxMinor = cells.reduce((max, cell) => Math.max(max, cell.valueMinor), 0);
  // Weekday bands only: a quiet Sunday evening is a different business decision
  // from a quiet Tuesday afternoon, and it is the weekday dip campaigns address.
  const weekdayCells = cells.filter((cell) => cell.weekday <= 4);
  const sorted = [...weekdayCells].sort((a, b) => a.valueMinor - b.valueMinor);
  const busiest = [...cells].sort((a, b) => b.valueMinor - a.valueMinor)[0];

  return {
    cells,
    hours,
    maxMinor,
    quietest: counted > 0 && sorted[0] ? { weekday: sorted[0].weekday, hour: sorted[0].hour, valueMinor: sorted[0].valueMinor } : null,
    busiest: counted > 0 && busiest && busiest.valueMinor > 0 ? { weekday: busiest.weekday, hour: busiest.hour, valueMinor: busiest.valueMinor } : null,
    transactions: counted,
  };
}

export interface FunnelStage {
  key: string;
  label: string;
  count: number;
  /** Share of the stage before it, in basis points; null for the first stage. */
  ofPreviousBps: number | null;
}

const FUNNEL_ORDER: { key: string; label: string; events: string[] }[] = [
  { key: 'queued', label: 'Поставлено в очередь', events: ['queued'] },
  { key: 'sent', label: 'Отправлено', events: ['sent'] },
  { key: 'delivered', label: 'Доставлено', events: ['delivered'] },
  { key: 'opened', label: 'Открыто', events: ['opened', 'clicked'] },
  { key: 'redeemed', label: 'Погашено', events: ['redeemed'] },
];

/**
 * Воронка кампаний: что из отправленного дошло и чем закончилось.
 *
 * Percentages are of the previous stage, not of the top. «40% открыли» is a
 * claim about the people who received it; measuring against the queue would
 * blame the copy for a channel that never delivered.
 */
export function campaignFunnel(events: readonly { event_type: string }[]): FunnelStage[] {
  const counts = new Map<string, number>();
  for (const row of events) counts.set(row.event_type, (counts.get(row.event_type) ?? 0) + 1);

  const stages: FunnelStage[] = [];
  let previous: number | null = null;
  for (const stage of FUNNEL_ORDER) {
    const count = stage.events.reduce((sum, type) => sum + (counts.get(type) ?? 0), 0);
    stages.push({
      key: stage.key,
      label: stage.label,
      count,
      ofPreviousBps: previous && previous > 0 ? Math.round((count / previous) * 10_000) : null,
    });
    previous = count;
  }
  // Stages that never happened are dropped from the head only: a funnel that
  // starts at «Доставлено» is honest, one with a hole in the middle is not.
  while (stages.length > 1 && stages[0].count === 0) stages.shift();
  return stages;
}

export interface LifecycleSlice {
  stage: string;
  label: string;
  count: number;
  shareBps: number;
}

// Deliberately no colours here. Tailwind only scans `src/app` and
// `src/components`, so a class name written in this file would be discarded at
// build time and the bar would render invisible — and a domain module has no
// business knowing what a stage looks like anyway.
const STAGE_LABELS: Record<string, string> = {
  new: 'Новые',
  active: 'Активные',
  loyal: 'Постоянные',
  vip: 'VIP',
  inactive: 'Спящие',
  churned: 'Ушедшие',
};

const STAGE_ORDER = ['new', 'active', 'loyal', 'vip', 'inactive', 'churned'];

/** Состав базы гостей: кого сколько и какая доля спит. */
export function lifecycleMix(customers: readonly { lifecycle_stage: string }[]): { slices: LifecycleSlice[]; total: number } {
  const counts = new Map<string, number>();
  for (const row of customers) counts.set(row.lifecycle_stage, (counts.get(row.lifecycle_stage) ?? 0) + 1);
  const total = customers.length;

  const slices = STAGE_ORDER
    .map((stage) => {
      const count = counts.get(stage) ?? 0;
      return {
        stage,
        label: STAGE_LABELS[stage],
        count,
        shareBps: total > 0 ? Math.round((count / total) * 10_000) : 0,
      };
    })
    .filter((slice) => slice.count > 0);

  return { slices, total };
}

/**
 * Точки линии, приведённые к прямоугольнику вьюпорта SVG.
 *
 * The chart is drawn on the server as plain SVG. A charting library would need
 * script the page's nonce-only CSP has no reason to allow, and a line through
 * thirty points does not need one.
 */
export function linePath(values: readonly number[], width: number, height: number, padding = 4): string {
  if (values.length === 0) return '';
  const max = Math.max(...values, 1);
  const step = values.length > 1 ? (width - padding * 2) / (values.length - 1) : 0;
  const y = (value: number) => height - padding - (value / max) * (height - padding * 2);
  return values
    .map((value, index) => `${index === 0 ? 'M' : 'L'} ${(padding + index * step).toFixed(2)} ${y(value).toFixed(2)}`)
    .join(' ');
}

/** The same line closed against the baseline, so it can be filled. */
export function areaPath(values: readonly number[], width: number, height: number, padding = 4): string {
  const line = linePath(values, width, height, padding);
  if (!line) return '';
  const lastX = values.length > 1 ? width - padding : padding;
  return `${line} L ${lastX.toFixed(2)} ${height - padding} L ${padding.toFixed(2)} ${height - padding} Z`;
}
