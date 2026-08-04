import assert from 'node:assert/strict';
import test from 'node:test';

import {
  areaPath,
  campaignFunnel,
  dailyRevenueSeries,
  isWeekend,
  lifecycleMix,
  linePath,
  movingAverage,
  visitHeatmap,
} from '../analytics-charts.ts';

const ALMATY = 'Asia/Almaty';

/** A window of `days` ending at a fixed instant, so the tests never read the clock. */
function windowEnding(endIso: string, days: number) {
  const end = new Date(endIso);
  const start = new Date(end.getTime() - days * 86_400_000);
  return { start, end, previousStart: new Date(start.getTime() - days * 86_400_000) };
}

test('dailyRevenueSeries keeps days without sales as zeroes', () => {
  const period = windowEnding('2026-08-04T12:00:00Z', 3);
  const series = dailyRevenueSeries(
    [
      { net_minor: 5_000, occurred_at: '2026-08-02T09:00:00Z' },
      { net_minor: 3_000, occurred_at: '2026-08-02T15:00:00Z' },
    ],
    period,
    ALMATY,
  );

  assert.equal(series.points.length, 4, 'four calendar days for a three-day window');
  assert.equal(series.totalMinor, 8_000);
  assert.equal(series.emptyDays, 3);
  // The gap is a zero, not a missing point: a line drawn between the days
  // either side of it would claim the venue traded that day.
  assert.ok(series.points.every((point) => typeof point.valueMinor === 'number'));
});

test('dailyRevenueSeries compares against the window before it', () => {
  const period = windowEnding('2026-08-04T12:00:00Z', 2);
  const series = dailyRevenueSeries(
    [
      { net_minor: 10_000, occurred_at: '2026-08-03T10:00:00Z' },
      { net_minor: 5_000, occurred_at: '2026-08-01T10:00:00Z' },
    ],
    period,
    ALMATY,
  );

  assert.equal(series.totalMinor, 10_000);
  assert.equal(series.previousTotalMinor, 5_000);
  assert.equal(series.changeBps, 10_000, '+100%');
});

test('dailyRevenueSeries refuses to compare when the previous window is empty', () => {
  const period = windowEnding('2026-08-04T12:00:00Z', 2);
  const series = dailyRevenueSeries([{ net_minor: 1_000, occurred_at: '2026-08-03T10:00:00Z' }], period, ALMATY);
  assert.equal(series.changeBps, null, 'no baseline means no percentage, not a division by zero');
});

test('visitHeatmap places a sale in the venue timezone, not UTC', () => {
  // 2026-08-03 is a Monday. 20:00 UTC is 01:00 Tuesday in Almaty (+05:00),
  // so the sale belongs to Tuesday's earliest band, not Monday evening.
  const heatmap = visitHeatmap([{ net_minor: 1_000, occurred_at: '2026-08-03T20:00:00Z' }], ALMATY);
  const filled = heatmap.cells.filter((cell) => cell.transactions > 0);
  assert.equal(filled.length, 1);
  assert.equal(filled[0].weekday, 1, 'Tuesday');
  assert.equal(filled[0].hour, 8, 'an out-of-hours sale is clamped into the first band, never dropped');
});

test('visitHeatmap groups into two-hour bands and finds the quietest weekday band', () => {
  const rows = [
    // Monday 15:00 and 15:40 Almaty = 10:00 and 10:40 UTC
    { net_minor: 100, occurred_at: '2026-08-03T10:00:00Z' },
    { net_minor: 900, occurred_at: '2026-08-03T10:40:00Z' },
    // Monday 19:00 Almaty = 14:00 UTC
    { net_minor: 50_000, occurred_at: '2026-08-03T14:00:00Z' },
  ];
  const heatmap = visitHeatmap(rows, ALMATY);
  const band = heatmap.cells.find((cell) => cell.weekday === 0 && cell.hour === 14);
  assert.equal(band?.valueMinor, 1_000, 'both 15:00 and 15:40 sales land in the 14:00–16:00 band');
  assert.equal(band?.transactions, 2);
  assert.equal(heatmap.busiest?.hour, 18);
  assert.equal(heatmap.quietest?.valueMinor, 0, 'a band with no money is the quietest one');
});

test('visitHeatmap reports how little it has when it has nothing', () => {
  const heatmap = visitHeatmap([], ALMATY);
  assert.equal(heatmap.transactions, 0);
  assert.equal(heatmap.busiest, null);
  assert.equal(heatmap.quietest, null, 'no data must not name a quiet hour');
});

test('campaignFunnel measures each stage against the one before it', () => {
  const events = [
    ...Array.from({ length: 10 }, () => ({ event_type: 'sent' })),
    ...Array.from({ length: 8 }, () => ({ event_type: 'delivered' })),
    ...Array.from({ length: 4 }, () => ({ event_type: 'opened' })),
    ...Array.from({ length: 1 }, () => ({ event_type: 'redeemed' })),
  ];
  const stages = campaignFunnel(events);
  const opened = stages.find((stage) => stage.key === 'opened');
  // 4 of 8 delivered, not 4 of 10 sent: the copy does not answer for the channel.
  assert.equal(opened?.ofPreviousBps, 5_000);
  assert.equal(stages[0].key, 'sent', 'a stage that never happened is dropped from the head');
  assert.equal(stages[0].ofPreviousBps, null);
});

test('campaignFunnel keeps a hole in the middle visible', () => {
  const stages = campaignFunnel([
    { event_type: 'sent' },
    { event_type: 'redeemed' },
  ]);
  const delivered = stages.find((stage) => stage.key === 'delivered');
  assert.equal(delivered?.count, 0, 'nothing delivered is a fact worth showing, not a stage to hide');
});

test('lifecycleMix shares add up and empty stages are left out', () => {
  const { slices, total } = lifecycleMix([
    { lifecycle_stage: 'active' },
    { lifecycle_stage: 'active' },
    { lifecycle_stage: 'inactive' },
    { lifecycle_stage: 'vip' },
  ]);
  assert.equal(total, 4);
  assert.deepEqual(slices.map((slice) => slice.stage), ['active', 'vip', 'inactive']);
  assert.equal(slices.reduce((sum, slice) => sum + slice.shareBps, 0), 10_000);
});

test('lifecycleMix on an empty base reports nothing rather than dividing by zero', () => {
  const { slices, total } = lifecycleMix([]);
  assert.equal(total, 0);
  assert.deepEqual(slices, []);
});

test('linePath scales to the box and areaPath closes it', () => {
  const line = linePath([0, 10], 100, 50, 5);
  assert.match(line, /^M 5\.00 45\.00 L 95\.00 5\.00$/);
  assert.ok(areaPath([0, 10], 100, 50, 5).endsWith('Z'));
  assert.equal(linePath([], 100, 50), '', 'no points, no path');
});

// ---------------------------------------------------------------------------
// Столбцы и линия тренда
// ---------------------------------------------------------------------------

test('среднее за неделю сглаживает субботние всплески, но не выдумывает точек', () => {
  const values = [100, 900, 100, 100, 100, 100, 100, 900];
  const average = movingAverage(values, 7);
  assert.equal(average.length, values.length);
  // Первая точка не может быть ничем, кроме самой себя: раньше данных нет.
  assert.equal(average[0], 100);
  assert.ok(average[1] > 100 && average[1] < 900, 'всплеск размазывается, а не копируется');
  assert.ok(Math.max(...average) < Math.max(...values), 'сглаженная линия ниже пиков по определению');
});

test('окно короче единицы возвращает исходный ряд, а не пустоту', () => {
  assert.deepEqual(movingAverage([1, 2, 3], 0), [1, 2, 3]);
});

test('выходные определяются по дате заведения, а не по часовому поясу сервера', () => {
  // 2026-08-01 — суббота, 2026-08-02 — воскресенье, 2026-08-03 — понедельник.
  assert.equal(isWeekend('2026-08-01'), true);
  assert.equal(isWeekend('2026-08-02'), true);
  assert.equal(isWeekend('2026-08-03'), false);
});
