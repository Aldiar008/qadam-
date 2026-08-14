import assert from 'node:assert/strict';
import test from 'node:test';

import { applyInventoryEvents, dailyDemandFromEvents, eventDeltaMilli, type InventoryEvent } from '../inventory.ts';
import {
  SPOILAGE_MODEL_VERSION,
  allocateFifo,
  assessSpoilageRisk,
  expiryFor,
  freshnessState,
  type InventoryLot,
} from '../freshness.ts';
import { combinedEventFactorPpm, eventsInEffect, forecastDailyDemand, type DemandEvent } from '../forecast.ts';
import { DomainError } from '../shared.ts';

const NOW = '2026-08-14T09:00:00Z';

const event = (over: Partial<InventoryEvent> & Pick<InventoryEvent, 'idempotencyKey' | 'type' | 'quantityMilli'>): InventoryEvent => ({
  occurredAt: '2026-08-14T06:00:00Z',
  source: 'test',
  actorId: '00000000-0000-4000-8000-000000000101',
  ...over,
});

const lot = (over: Partial<InventoryLot> & Pick<InventoryLot, 'id' | 'remainingMilli'>): InventoryLot => ({
  receivedAt: '2026-08-10T06:00:00Z',
  expiresAt: '2026-08-17T06:00:00Z',
  unitCostMinor: 420,
  ...over,
});

function flatHistory(days: number, quantityMilli: number, from = '2026-07-18') {
  const start = Date.parse(`${from}T00:00:00Z`);
  return Array.from({ length: days }, (_, index) => ({
    date: new Date(start + index * 86_400_000).toISOString().slice(0, 10),
    quantityMilli,
  }));
}

// ─── Списание как отдельный вид движения ─────────────────────────────────────

test('списание уменьшает остаток так же, как продажа', () => {
  const result = applyInventoryEvents([
    event({ idempotencyKey: 'in', type: 'receive', quantityMilli: 250_000 }),
    event({ idempotencyKey: 'sold', type: 'consume', quantityMilli: 95_000 }),
    event({ idempotencyKey: 'dead', type: 'waste', quantityMilli: 8_000, wasteReason: 'withered' }),
  ]);
  assert.equal(result.onHandMilli, 147_000);
  assert.equal(eventDeltaMilli(event({ idempotencyKey: 'w', type: 'waste', quantityMilli: 8_000 })), -8_000);
});

test('повтор списания по тому же ключу не выбрасывает цветы дважды', () => {
  const once = applyInventoryEvents([
    event({ idempotencyKey: 'in', type: 'receive', quantityMilli: 100_000 }),
    event({ idempotencyKey: 'waste-1', type: 'waste', quantityMilli: 5_000, wasteReason: 'withered' }),
  ]);
  const twice = applyInventoryEvents(
    [event({ idempotencyKey: 'waste-1', type: 'waste', quantityMilli: 5_000, wasteReason: 'withered' })],
    once,
  );
  assert.equal(twice.onHandMilli, 95_000);
  assert.equal(twice.duplicateCount, 1);
});

test('списать больше, чем стоит на витрине, нельзя', () => {
  assert.throws(
    () => applyInventoryEvents([
      event({ idempotencyKey: 'in', type: 'receive', quantityMilli: 4_000 }),
      event({ idempotencyKey: 'w', type: 'waste', quantityMilli: 9_000, wasteReason: 'withered' }),
    ]),
    (error: unknown) => error instanceof DomainError && error.code === 'NEGATIVE_BALANCE',
  );
});

test('списание не попадает в спрос: иначе прогноз выучит его как продажу', () => {
  const samples = dailyDemandFromEvents(
    [
      event({ idempotencyKey: '1', type: 'consume', quantityMilli: 95_000, occurredAt: '2026-08-12T14:00:00Z' }),
      event({ idempotencyKey: '2', type: 'waste', quantityMilli: 20_000, occurredAt: '2026-08-12T20:00:00Z', wasteReason: 'withered' }),
    ],
    { start: '2026-08-12T00:00:00Z', end: '2026-08-13T00:00:00Z', timezone: 'UTC' },
  );
  assert.deepEqual(samples, [{ date: '2026-08-12', quantityMilli: 95_000 }]);
});

// ─── Свежесть и партии ───────────────────────────────────────────────────────

test('состояние партии читается по остатку срока', () => {
  assert.equal(freshnessState(null), 'imperishable');
  assert.equal(freshnessState(-3), 'expired');
  assert.equal(freshnessState(0), 'expired');
  assert.equal(freshnessState(18), 'last_day');
  assert.equal(freshnessState(48), 'ageing');
  assert.equal(freshnessState(120), 'fresh');
});

test('срок партии считается от даты прихода и срока жизни позиции', () => {
  assert.equal(expiryFor('2026-08-14T06:00:00Z', 5), '2026-08-19T06:00:00.000Z');
  assert.equal(expiryFor('2026-08-14T06:00:00Z', null), null, 'у ленты срока нет');
});

test('продажа разбирает партии в порядке истечения, а не прихода', () => {
  const plan = allocateFifo(
    [
      lot({ id: 'fresh', remainingMilli: 50_000, receivedAt: '2026-08-13T06:00:00Z', expiresAt: '2026-08-20T06:00:00Z' }),
      lot({ id: 'old', remainingMilli: 30_000, receivedAt: '2026-08-09T06:00:00Z', expiresAt: '2026-08-15T06:00:00Z' }),
    ],
    40_000,
  );
  assert.deepEqual(plan, [
    { lotId: 'old', takeMilli: 30_000 },
    { lotId: 'fresh', takeMilli: 10_000 },
  ]);
});

test('непортящееся уходит последним: у него нет причины спешить', () => {
  const plan = allocateFifo(
    [
      lot({ id: 'ribbon', remainingMilli: 100_000, expiresAt: null }),
      lot({ id: 'rose', remainingMilli: 20_000, expiresAt: '2026-08-16T06:00:00Z' }),
    ],
    30_000,
  );
  assert.equal(plan[0].lotId, 'rose');
});

test('нельзя списать больше, чем лежит в партиях', () => {
  assert.throws(
    () => allocateFifo([lot({ id: 'a', remainingMilli: 10_000 })], 15_000),
    (error: unknown) => error instanceof DomainError && error.code === 'NOT_ENOUGH_IN_LOTS',
  );
});

// ─── Риск списания ───────────────────────────────────────────────────────────

test('при хорошем спросе под списание не уходит ничего', () => {
  const assessment = assessSpoilageRisk({
    lots: [lot({ id: 'a', remainingMilli: 60_000, expiresAt: '2026-08-19T09:00:00Z' })],
    dailyForecastMilli: 95_000,
    toleranceBps: 500,
    now: NOW,
    source: 'test',
    isMock: false,
  });
  assert.equal(assessment.atRiskMilli, 0);
  assert.equal(assessment.overTolerance, false);
  assert.equal(assessment.modelVersion, SPOILAGE_MODEL_VERSION);
});

test('избыток над спросом до конца срока попадает под списание', () => {
  // Четыре дня до срока, спрос 60 стеблей в день — продастся 240, лежит 450.
  const assessment = assessSpoilageRisk({
    lots: [lot({ id: 'a', remainingMilli: 450_000, expiresAt: '2026-08-18T09:00:00Z' })],
    dailyForecastMilli: 60_000,
    toleranceBps: 800,
    now: NOW,
    source: 'test',
    isMock: false,
  });
  assert.equal(assessment.atRiskMilli, 210_000);
  assert.equal(assessment.overTolerance, true);
  assert.equal(assessment.atRiskCostMinor, Math.round((210_000 * 420) / 1000));
});

test('спрос, потраченный на раннюю партию, не спасает позднюю', () => {
  // Две партии по 100, спрос 50 в день. Первая живёт сутки — продастся 50, а
  // 50 уйдёт в списание. Вторая живёт двое суток, но её спрос уже частично съеден.
  const assessment = assessSpoilageRisk({
    lots: [
      lot({ id: 'early', remainingMilli: 100_000, expiresAt: '2026-08-15T09:00:00Z' }),
      lot({ id: 'late', remainingMilli: 100_000, expiresAt: '2026-08-16T09:00:00Z' }),
    ],
    dailyForecastMilli: 50_000,
    toleranceBps: 500,
    now: NOW,
    source: 'test',
    isMock: false,
  });
  assert.equal(assessment.lots[0].atRiskMilli, 50_000, 'из ранней партии не успеет половина');
  assert.equal(assessment.lots[1].atRiskMilli, 50_000, 'поздней достаётся только оставшийся спрос');
  assert.equal(assessment.atRiskMilli, 100_000);
});

test('просроченная партия целиком под списанием, даже если ещё стоит в ведре', () => {
  const assessment = assessSpoilageRisk({
    lots: [lot({ id: 'dead', remainingMilli: 30_000, expiresAt: '2026-08-12T09:00:00Z' })],
    dailyForecastMilli: 95_000,
    toleranceBps: 500,
    now: NOW,
    source: 'test',
    isMock: false,
  });
  assert.equal(assessment.atRiskMilli, 30_000);
  assert.equal(assessment.expiredLots, 1);
  assert.equal(assessment.lots[0].state, 'expired');
});

test('лента и бумага под списание не попадают никогда', () => {
  const assessment = assessSpoilageRisk({
    lots: [lot({ id: 'ribbon', remainingMilli: 100_000, expiresAt: null })],
    dailyForecastMilli: 1_000,
    toleranceBps: 0,
    now: NOW,
    source: 'test',
    isMock: false,
  });
  assert.equal(assessment.atRiskMilli, 0);
  assert.equal(assessment.lots[0].state, 'imperishable');
  assert.equal(assessment.overTolerance, false);
});

test('без продаж под списание уходит весь остаток', () => {
  const assessment = assessSpoilageRisk({
    lots: [lot({ id: 'a', remainingMilli: 40_000, expiresAt: '2026-08-17T09:00:00Z' })],
    dailyForecastMilli: 0,
    toleranceBps: 500,
    now: NOW,
    source: 'test',
    isMock: true,
  });
  assert.equal(assessment.atRiskMilli, 40_000);
  assert.ok(assessment.assumptions.some((line) => line.includes('[MOCK]')));
});

test('порог допустимого списания решает, риск это или норма жизни', () => {
  const lots = [lot({ id: 'a', remainingMilli: 100_000, expiresAt: '2026-08-15T09:00:00Z' })];
  const strict = assessSpoilageRisk({ lots, dailyForecastMilli: 96_000, toleranceBps: 100, now: NOW, source: 't', isMock: false });
  const relaxed = assessSpoilageRisk({ lots, dailyForecastMilli: 96_000, toleranceBps: 2_000, now: NOW, source: 't', isMock: false });
  assert.equal(strict.atRiskMilli, relaxed.atRiskMilli, 'количество одно и то же');
  assert.equal(strict.overTolerance, true);
  assert.equal(relaxed.overTolerance, false, 'у зелени та же доля — обычное дело');
});

test('неизвестная себестоимость не превращается в ноль', () => {
  const assessment = assessSpoilageRisk({
    lots: [lot({ id: 'a', remainingMilli: 50_000, expiresAt: '2026-08-15T09:00:00Z', unitCostMinor: null })],
    dailyForecastMilli: 1_000,
    toleranceBps: 100,
    now: NOW,
    source: 'test',
    isMock: false,
  });
  assert.equal(assessment.atRiskCostMinor, null);
  assert.ok(assessment.assumptions.some((line) => line.includes('себестоимость известна не по всем')));
});

test('недопустимый порог отклоняется', () => {
  assert.throws(
    () => assessSpoilageRisk({ lots: [], dailyForecastMilli: 0, toleranceBps: 20_000, now: NOW, source: 't', isMock: false }),
    (error: unknown) => error instanceof DomainError && error.code === 'INVALID_TOLERANCE',
  );
});

// ─── Праздники ───────────────────────────────────────────────────────────────

const MARCH8: DemandEvent = {
  code: 'march8',
  name: '8 марта',
  date: '2027-03-08',
  leadDays: 10,
  liftPpm: 3_800_000,
  categories: ['розы', 'тюльпаны'],
  source: 'отраслевой шаблон',
  verified: false,
  approved: true,
};

test('праздник действует в окне перед датой, а не только в сам день', () => {
  assert.equal(eventsInEffect([MARCH8], '2027-03-01', 'розы').length, 1, 'за неделю розы уже разбирают');
  assert.equal(eventsInEffect([MARCH8], '2027-03-08', 'розы').length, 1, 'в сам день тоже');
  assert.equal(eventsInEffect([MARCH8], '2027-02-25', 'розы').length, 0, 'до окна ещё рано');
  assert.equal(eventsInEffect([MARCH8], '2027-03-09', 'розы').length, 0, 'после праздника всё кончилось');
});

test('праздник касается только своих категорий', () => {
  assert.equal(eventsInEffect([MARCH8], '2027-03-05', 'розы').length, 1);
  assert.equal(eventsInEffect([MARCH8], '2027-03-05', 'упаковка').length, 0);
  const everything = { ...MARCH8, categories: [] };
  assert.equal(eventsInEffect([everything], '2027-03-05', 'упаковка').length, 1, 'пустой список — касается всего');
});

test('несколько поводов складывают прибавки, а не перемножаются', () => {
  const wedding = { ...MARCH8, code: 'wed', liftPpm: 1_400_000 };
  const small = { ...MARCH8, code: 'small', liftPpm: 1_200_000 };
  // +0,4 и +0,2 дают ×1,6 — сложение прибавок, а не перемножение коэффициентов
  // (перемножение дало бы ×1,68).
  assert.equal(combinedEventFactorPpm([wedding, small]), 1_600_000);
  assert.equal(combinedEventFactorPpm([wedding]), 1_400_000);
  assert.equal(combinedEventFactorPpm([]), 1_000_000, 'без поводов коэффициент нейтрален');
  // Потолок ×1,8: пока лифт остаётся гипотезой, перезаказ роз дороже недозаказа.
  assert.equal(combinedEventFactorPpm([MARCH8]), 1_800_000);
});

test('праздник поднимает прогноз и остаётся видимым в допущениях', () => {
  const history = flatHistory(28, 60_000, '2027-02-08');
  const plain = forecastDailyDemand({ history, targetDate: '2027-03-07', source: 't', isMock: false, category: 'розы' });
  const holiday = forecastDailyDemand({
    history,
    targetDate: '2027-03-07',
    source: 't',
    isMock: false,
    events: [MARCH8],
    category: 'розы',
  });

  assert.ok(holiday.dailyForecastMilli > plain.dailyForecastMilli, 'восьмое марта поднимает прогноз');
  assert.equal(holiday.eventFactorPpm, 1_800_000, 'коэффициент упирается в потолок продукта');
  assert.equal(holiday.appliedEvents.length, 1);
  assert.ok(holiday.assumptions.some((line) => line.includes('8 марта') && line.includes('гипотеза')));
});

test('непроверенный коэффициент снижает уверенность прогноза', () => {
  const history = flatHistory(28, 60_000, '2027-02-08');
  const verified = forecastDailyDemand({
    history,
    targetDate: '2027-03-07',
    source: 't',
    isMock: false,
    events: [{ ...MARCH8, verified: true }],
    category: 'розы',
  });
  const guessed = forecastDailyDemand({
    history,
    targetDate: '2027-03-07',
    source: 't',
    isMock: false,
    events: [MARCH8],
    category: 'розы',
  });
  assert.ok(guessed.confidencePpm < verified.confidencePpm);
});

test('позиция вне категории праздника прогнозируется как обычно', () => {
  const history = flatHistory(28, 20_000, '2027-02-08');
  const wrap = forecastDailyDemand({
    history,
    targetDate: '2027-03-07',
    source: 't',
    isMock: false,
    events: [MARCH8],
    category: 'упаковка',
  });
  assert.equal(wrap.eventFactorPpm, 1_000_000);
  assert.equal(wrap.appliedEvents.length, 0);
});
