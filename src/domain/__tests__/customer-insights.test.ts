import assert from 'node:assert/strict';
import test from 'node:test';

import {
  analyseCustomer, buildCohort, estimateReturn,
  type CatalogEntry, type InsightsInput, type PurchaseLine,
} from '../customer-insights.ts';

const NOW = Date.UTC(2026, 7, 4, 9, 0, 0);
const DAY = 86_400_000;
const daysAgo = (days: number) => new Date(NOW - days * DAY).toISOString();

const CATALOG: CatalogEntry[] = [
  { name: 'Капучино', category: 'кофе', priceMinor: 1400, costMinor: 500 },
  { name: 'Раф', category: 'кофе', priceMinor: 1800, costMinor: 650 },
  { name: 'Чизкейк', category: 'десерты', priceMinor: 1900, costMinor: 900 },
  { name: 'Круассан с миндалём', category: 'выпечка', priceMinor: 1200, costMinor: 760 },
];

/** Гость ходит каждые семь дней; раньше брал чизкейк, теперь круассан. */
function regular(): InsightsInput {
  const visits = [56, 49, 42, 35, 28, 21, 14, 7];
  const lines: PurchaseLine[] = [];
  visits.forEach((day, index) => {
    const id = `t${index}`;
    lines.push({ transactionId: id, name: 'Капучино', category: 'кофе', quantity: 1, totalMinor: 1400, occurredAt: daysAgo(day) });
    lines.push(index < 5
      ? { transactionId: id, name: 'Чизкейк', category: 'десерты', quantity: 1, totalMinor: 1900, occurredAt: daysAgo(day) }
      : { transactionId: id, name: 'Круассан с миндалём', category: 'выпечка', quantity: 1, totalMinor: 1200, occurredAt: daysAgo(day) });
  });
  return { lines, receipts: visits.map(daysAgo), catalog: CATALOG, cohort: [], now: NOW };
}

test('the favourite item is the one actually bought most, with its real share', () => {
  const result = analyseCustomer(regular());
  assert.equal(result.favourites[0].name, 'Капучино');
  assert.equal(result.favourites[0].orders, 8);
  // 8 из 16 позиций.
  assert.equal(result.favourites[0].shareBps, 5000);
  assert.equal(result.linesCounted, 16);
  assert.equal(result.receiptsCounted, 8);
});

test('an item bought regularly and then abandoned is reported as abandoned', () => {
  const result = analyseCustomer(regular());
  const cheesecake = result.dropped.find((item) => item.name === 'Чизкейк');
  assert.ok(cheesecake, 'чизкейк должен попасть в «перестал брать»');
  assert.equal(cheesecake.ordersBefore, 5);
  assert.equal(cheesecake.daysSince, 28);
  // Капучино он берёт до сих пор — «перестал» про него сказать нельзя.
  assert.equal(result.dropped.some((item) => item.name === 'Капучино'), false);
});

test('a shift between categories is measured, not asserted', () => {
  const result = analyseCustomer(regular());
  const pastry = result.shift.find((item) => item.category === 'выпечка');
  assert.ok(pastry, 'сдвиг в сторону выпечки должен быть виден');
  assert.equal(pastry.earlierBps, 0);
  assert.ok(pastry.recentBps > 3000);
  assert.ok(pastry.changeBps > 0);
});

test('items bought together survive names that contain spaces', () => {
  const result = analyseCustomer(regular());
  const pair = result.pairs.find((item) => item.a === 'Капучино' && item.b === 'Круассан с миндалём');
  assert.ok(pair, 'пара должна собираться целиком, а не по словам');
  assert.equal(pair.together, 3);
});

test('cadence uses the median gap and says how late the guest is', () => {
  const result = analyseCustomer(regular());
  assert.ok(result.cadence);
  assert.equal(result.cadence.medianDays, 7);
  assert.equal(result.cadence.daysSinceLast, 7);
  assert.equal(result.cadence.overdueDays, 0);
});

test('the suggestion stays inside the guest’s own taste', () => {
  const result = analyseCustomer(regular());
  assert.ok(result.suggestion);
  // «кофе» — его категория, «Раф» он ещё не брал.
  assert.equal(result.suggestion.itemName, 'Раф');
  assert.equal(result.suggestion.mechanic, 'gift_with_threshold');
});

test('with no receipt lines nothing is invented and the gap is named', () => {
  const result = analyseCustomer({
    lines: [], receipts: [daysAgo(30), daysAgo(20), daysAgo(10)], catalog: CATALOG, cohort: [], now: NOW,
  });
  assert.deepEqual(result.favourites, []);
  assert.equal(result.suggestion, null);
  assert.ok(result.gaps.some((gap) => gap.includes('Состав чеков не записан')));
  // Ритм визитов считается и без позиций — для него хватает дат покупок.
  assert.equal(result.cadence?.medianDays, 10);
});

// ---------------------------------------------------------------------------
// Вероятность возврата
// ---------------------------------------------------------------------------

test('a return estimate needs a cohort and refuses to answer without one', () => {
  assert.equal(estimateReturn([], 10, 30), null);
  assert.equal(estimateReturn(Array.from({ length: 6 }, () => ({ days: 5, returned: true })), 3, 30), null);
});

test('guests who never came back pull the estimate down', () => {
  const returners = Array.from({ length: 40 }, (_, index) => ({ days: 10 + (index % 20), returned: true }));
  const optimistic = estimateReturn(returners, 12, 30);
  const withLost = estimateReturn(
    [...returners, ...Array.from({ length: 40 }, () => ({ days: 200, returned: false }))],
    12, 30,
  );
  assert.ok(optimistic && withLost);
  assert.ok(withLost.probabilityBps < optimistic.probabilityBps,
    'цензурированные наблюдения обязаны снижать оценку, а не игнорироваться');
  assert.ok(optimistic.probabilityBps <= 10_000);
});

test('confidence follows how many comparable guests there were', () => {
  const many = Array.from({ length: 80 }, (_, index) => ({ days: 5 + (index % 30), returned: index % 3 !== 0 }));
  const estimate = estimateReturn(many, 6, 30);
  assert.ok(estimate);
  assert.equal(estimate.confidence, 'high');
  assert.ok(estimate.sampleAtRisk >= 60);
  assert.equal(estimate.horizonDays, 30);
});

test('the cohort keeps both the gaps and the silence at the end', () => {
  const cohort = buildCohort(new Map([
    ['a', [daysAgo(30), daysAgo(20), daysAgo(10)]],
    ['b', [daysAgo(90)]],
  ]), NOW);
  assert.deepEqual(cohort, [
    { days: 10, returned: true },
    { days: 10, returned: true },
    { days: 10, returned: false },
    { days: 90, returned: false },
  ]);
});
