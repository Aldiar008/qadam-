import assert from 'node:assert/strict';
import test from 'node:test';

import { moneyOnTheTable, type MoneyInput } from '../money-on-the-table.ts';

/** Пятьдесят промежутков между визитами и двадцать замолчавших навсегда. */
const COHORT = [
  ...Array.from({ length: 50 }, (_, index) => ({ days: 10 + (index % 40), returned: true })),
  ...Array.from({ length: 20 }, () => ({ days: 120, returned: false })),
];

const BASE: MoneyInput = {
  averageCheckMinor: 3400,
  guests: [],
  cohort: COHORT,
  unansweredQuestions: 0,
  questionConversionBps: null,
  hourly: [],
  itemTrend: [],
};

const sleepingGuests = (count: number, consented: number) =>
  Array.from({ length: count }, (_, index) => ({ daysSinceLastVisit: 45, visits: 4, consentGranted: index < consented }));

test('silent guests turn into a number with the method printed next to it', () => {
  const result = moneyOnTheTable({ ...BASE, guests: sleepingGuests(12, 12) });
  const sleeping = result.opportunities.find((item) => item.kind === 'sleeping');
  assert.ok(sleeping);
  assert.match(sleeping.title, /12 гостей/);
  assert.ok((sleeping.amountMinor ?? 0) > 0);
  // Сумма не может быть больше, чем «все вернулись и потратили средний чек».
  assert.ok((sleeping.amountMinor ?? 0) <= 12 * 3400);
  assert.match(sleeping.basis, /возвращаются в течение 30 дней/);
});

test('guests without consent are counted but not promised', () => {
  const all = moneyOnTheTable({ ...BASE, guests: sleepingGuests(12, 12) });
  const partial = moneyOnTheTable({ ...BASE, guests: sleepingGuests(12, 4) });
  const first = all.opportunities[0];
  const second = partial.opportunities[0];
  assert.ok((second.amountMinor ?? 0) < (first.amountMinor ?? 0),
    'без согласия писать нельзя, значит и деньги считать по ним нельзя');
  assert.match(second.detail, /Написать можно 4 из них/);
});

test('a guest who still comes on time is not called sleeping', () => {
  const result = moneyOnTheTable({
    ...BASE,
    guests: Array.from({ length: 9 }, () => ({ daysSinceLastVisit: 3, visits: 6, consentGranted: true })),
  });
  assert.equal(result.opportunities.some((item) => item.kind === 'sleeping'), false);
  assert.equal(result.totalMinor, 0);
});

test('unanswered questions are shown even when they cannot be priced', () => {
  const unpriced = moneyOnTheTable({ ...BASE, unansweredQuestions: 8 });
  const line = unpriced.opportunities.find((item) => item.kind === 'unanswered');
  assert.ok(line);
  assert.equal(line.amountMinor, null);
  assert.match(line.basis, /В деньгах не считается/);
  assert.ok(unpriced.notes.some((note) => note.includes('нечем оценить')));

  const priced = moneyOnTheTable({ ...BASE, unansweredQuestions: 8, questionConversionBps: 2500 });
  assert.equal(priced.opportunities[0].amountMinor, Math.round(8 * 0.25 * 3400));
});

test('quiet hours are measured against the venue own median hour', () => {
  const hourly = [
    { hour: 9, revenueMinor: 60_000, days: 30 },
    { hour: 12, revenueMinor: 90_000, days: 30 },
    { hour: 15, revenueMinor: 9_000, days: 30 },
    { hour: 18, revenueMinor: 120_000, days: 30 },
    { hour: 20, revenueMinor: 75_000, days: 30 },
  ];
  const result = moneyOnTheTable({ ...BASE, hourly });
  assert.equal(result.peak?.hour, 18);
  assert.equal(result.quietest?.hour, 15);
  const quiet = result.opportunities.find((item) => item.kind === 'quiet_hours');
  assert.ok(quiet);
  assert.ok((quiet.amountMinor ?? 0) > 0);
  assert.match(quiet.detail, /Самый тихий час — 15:00/);
});

test('too few open hours produce no peak instead of a made-up one', () => {
  const result = moneyOnTheTable({ ...BASE, hourly: [{ hour: 10, revenueMinor: 1000, days: 5 }] });
  assert.equal(result.peak, null);
  assert.equal(result.opportunities.some((item) => item.kind === 'quiet_hours'), false);
});

test('a falling item names itself and what it cost', () => {
  const result = moneyOnTheTable({
    ...BASE,
    itemTrend: [
      { name: 'Капучино', recentMinor: 77_000, previousMinor: 100_000 },
      { name: 'Латте', recentMinor: 99_000, previousMinor: 100_000 },
      { name: 'Чизкейк', recentMinor: 40_000, previousMinor: 50_000 },
    ],
  });
  const line = result.opportunities.find((item) => item.kind === 'declining_item');
  assert.ok(line);
  assert.match(line.title, /«Капучино» продаётся хуже на 23%/);
  assert.equal(line.amountMinor, 23_000);
  // Латте держится — он не должен попадать в просевшие.
  assert.match(line.detail, /ещё 1 позиций/);
});

test('the headline is the sum of what was actually measured', () => {
  const result = moneyOnTheTable({
    ...BASE,
    guests: sleepingGuests(10, 10),
    unansweredQuestions: 5,
    itemTrend: [{ name: 'Раф', recentMinor: 10_000, previousMinor: 30_000 }],
  });
  const measured = result.opportunities
    .map((item) => item.amountMinor ?? 0)
    .reduce((sum, value) => sum + value, 0);
  assert.equal(result.totalMinor, measured);
  assert.ok(result.totalMinor > 20_000);
});
