import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EMPTY_LEDGER,
  applyInventoryEvents,
  dailyDemandFromEvents,
  dataFreshnessPpm,
  eventDeltaMilli,
  formatQuantity,
  roundUpToPack,
  type InventoryEvent,
} from '../inventory.ts';
import { FORECAST_MODEL_VERSION, HISTORY_DAYS, backtestWapePpm, forecastDailyDemand } from '../forecast.ts';
import {
  assessStockoutRisk,
  rankRiskQueue,
  reorderPointMilli,
  safetyStockMilli,
  timeToStockoutHours,
  type ReorderPolicy,
} from '../risk.ts';
import { DomainError } from '../shared.ts';

const event = (over: Partial<InventoryEvent> & Pick<InventoryEvent, 'idempotencyKey' | 'type' | 'quantityMilli'>): InventoryEvent => ({
  occurredAt: '2026-08-14T06:00:00Z',
  source: 'test',
  actorId: '00000000-0000-4000-8000-000000000101',
  ...over,
});

/** Ровный ряд по 12 литров в день — нужен там, где важна предсказуемость. */
function flatHistory(days: number, quantityMilli: number, from = '2026-07-18') {
  const start = Date.parse(`${from}T00:00:00Z`);
  return Array.from({ length: days }, (_, index) => ({
    date: new Date(start + index * 86_400_000).toISOString().slice(0, 10),
    quantityMilli,
  }));
}

// ─── Inventory Ledger ────────────────────────────────────────────────────────

test('приёмка и расход двигают остаток в разные стороны', () => {
  const result = applyInventoryEvents([
    event({ idempotencyKey: 'k1', type: 'receive', quantityMilli: 40_000 }),
    event({ idempotencyKey: 'k2', type: 'consume', quantityMilli: 12_000 }),
  ]);
  assert.equal(result.onHandMilli, 28_000);
  assert.equal(result.appliedCount, 2);
  assert.equal(result.duplicateCount, 0);
});

test('повторный ключ идемпотентности не списывает товар второй раз', () => {
  const once = applyInventoryEvents([event({ idempotencyKey: 'receive-1', type: 'receive', quantityMilli: 20_000 })]);
  const twice = applyInventoryEvents(
    [event({ idempotencyKey: 'receive-1', type: 'receive', quantityMilli: 20_000 })],
    once,
  );
  assert.equal(twice.onHandMilli, 20_000, 'повтор не должен менять остаток');
  assert.equal(twice.appliedCount, 0);
  assert.equal(twice.duplicateCount, 1);
});

test('повтор внутри одной пачки событий тоже отсекается', () => {
  const result = applyInventoryEvents([
    event({ idempotencyKey: 'same', type: 'receive', quantityMilli: 10_000 }),
    event({ idempotencyKey: 'same', type: 'receive', quantityMilli: 10_000 }),
  ]);
  assert.equal(result.onHandMilli, 10_000);
  assert.equal(result.duplicateCount, 1);
});

test('состояние журнала переживает перезагрузку: продолжение даёт тот же итог', () => {
  const batch: InventoryEvent[] = [
    event({ idempotencyKey: 'a', type: 'receive', quantityMilli: 30_000 }),
    event({ idempotencyKey: 'b', type: 'consume', quantityMilli: 8_000 }),
    event({ idempotencyKey: 'c', type: 'consume', quantityMilli: 5_000 }),
  ];
  const inOneGo = applyInventoryEvents(batch);
  const restored = applyInventoryEvents(batch.slice(2), applyInventoryEvents(batch.slice(0, 2)));
  assert.equal(restored.onHandMilli, inOneGo.onHandMilli);
  assert.equal(restored.onHandMilli, 17_000);
});

test('расход не может увести остаток ниже нуля', () => {
  assert.throws(
    () => applyInventoryEvents([
      event({ idempotencyKey: 'r', type: 'receive', quantityMilli: 5_000 }),
      event({ idempotencyKey: 'c', type: 'consume', quantityMilli: 9_000 }),
    ]),
    (error: unknown) => error instanceof DomainError && error.code === 'NEGATIVE_BALANCE',
  );
});

test('только явная корректировка вправе увести остаток в минус', () => {
  assert.throws(
    () => applyInventoryEvents([event({ idempotencyKey: 'x', type: 'adjust', quantityMilli: -3_000 })]),
    (error: unknown) => error instanceof DomainError && error.code === 'NEGATIVE_BALANCE',
    'корректировка без явного разрешения тоже не пускает в минус',
  );
  const controlled = applyInventoryEvents([
    event({ idempotencyKey: 'x', type: 'adjust', quantityMilli: -3_000, allowNegative: true }),
  ]);
  assert.equal(controlled.onHandMilli, -3_000);
});

test('событие без ключа, с пустым источником или нулевой корректировкой отклоняется', () => {
  assert.throws(
    () => applyInventoryEvents([event({ idempotencyKey: ' ', type: 'receive', quantityMilli: 1_000 })]),
    (error: unknown) => error instanceof DomainError && error.code === 'MISSING_IDEMPOTENCY_KEY',
  );
  assert.throws(
    () => applyInventoryEvents([event({ idempotencyKey: 'k', type: 'receive', quantityMilli: 1_000, source: '' })]),
    (error: unknown) => error instanceof DomainError && error.code === 'MISSING_SOURCE',
  );
  assert.throws(
    () => applyInventoryEvents([event({ idempotencyKey: 'k', type: 'adjust', quantityMilli: 0 })]),
    (error: unknown) => error instanceof DomainError && error.code === 'EMPTY_ADJUSTMENT',
  );
});

test('приёмка с отрицательным количеством — это ошибка ввода, а не списание', () => {
  assert.throws(
    () => eventDeltaMilli(event({ idempotencyKey: 'k', type: 'receive', quantityMilli: -1_000 })),
    (error: unknown) => error instanceof DomainError && error.code === 'NEGATIVE_QUANTITY',
  );
});

test('перемещение между точками движет остаток в обе стороны', () => {
  assert.equal(eventDeltaMilli(event({ idempotencyKey: 'in', type: 'transfer_in', quantityMilli: 4_000 })), 4_000);
  assert.equal(eventDeltaMilli(event({ idempotencyKey: 'out', type: 'transfer_out', quantityMilli: 4_000 })), -4_000);
});

// ─── Дневной ряд спроса ──────────────────────────────────────────────────────

test('в спрос попадает только расход, приёмка и перемещение — нет', () => {
  const samples = dailyDemandFromEvents(
    [
      event({ idempotencyKey: '1', type: 'consume', quantityMilli: 12_000, occurredAt: '2026-08-12T07:00:00Z' }),
      event({ idempotencyKey: '2', type: 'receive', quantityMilli: 40_000, occurredAt: '2026-08-12T05:00:00Z' }),
      event({ idempotencyKey: '3', type: 'transfer_out', quantityMilli: 5_000, occurredAt: '2026-08-12T09:00:00Z' }),
      event({ idempotencyKey: '4', type: 'consume', quantityMilli: 3_000, occurredAt: '2026-08-12T18:00:00Z' }),
    ],
    { start: '2026-08-12T00:00:00Z', end: '2026-08-14T00:00:00Z', timezone: 'UTC' },
  );
  assert.deepEqual(samples, [
    { date: '2026-08-12', quantityMilli: 15_000 },
    { date: '2026-08-13', quantityMilli: 0 },
  ]);
});

test('день без движения остаётся в ряду нулём, а не пропадает', () => {
  const samples = dailyDemandFromEvents([], { start: '2026-08-10T00:00:00Z', end: '2026-08-13T00:00:00Z', timezone: 'UTC' });
  assert.equal(samples.length, 3);
  assert.ok(samples.every((sample) => sample.quantityMilli === 0));
  assert.equal(dataFreshnessPpm(samples), 0);
});

// ─── Forecast ────────────────────────────────────────────────────────────────

test('на ровной истории прогноз равен самой истории', () => {
  const result = forecastDailyDemand({
    history: flatHistory(HISTORY_DAYS, 12_000),
    targetDate: '2026-08-15',
    source: 'test',
    isMock: false,
  });
  assert.equal(result.dailyForecastMilli, 12_000);
  assert.equal(result.baselineMilli, 12_000);
  assert.equal(result.weekdayFactorPpm, 1_000_000, 'ровный ряд не даёт перекоса по дню недели');
  assert.equal(result.sigmaDailyMilli, 0);
  assert.equal(result.modelVersion, FORECAST_MODEL_VERSION);
});

test('прогноз воспроизводим: тот же вход даёт тот же выход', () => {
  const history = flatHistory(HISTORY_DAYS, 9_500);
  const first = forecastDailyDemand({ history, targetDate: '2026-08-15', source: 'test', isMock: false });
  const second = forecastDailyDemand({ history, targetDate: '2026-08-15', source: 'test', isMock: false });
  assert.deepEqual(
    { ...first, explanation: null },
    { ...second, explanation: null },
  );
});

test('ряд длиннее 28 дней обрезается до окна', () => {
  const long = flatHistory(60, 10_000);
  const result = forecastDailyDemand({ history: long, targetDate: '2026-09-20', source: 'test', isMock: false });
  assert.equal(result.sampleDays, HISTORY_DAYS);
});

test('свежие дни весят больше давних', () => {
  const rising = flatHistory(HISTORY_DAYS, 0).map((sample, index) => ({ ...sample, quantityMilli: index * 1_000 }));
  const result = forecastDailyDemand({ history: rising, targetDate: '2026-08-15', source: 'test', isMock: false });
  const plainMean = Math.round(rising.reduce((sum, sample) => sum + sample.quantityMilli, 0) / rising.length);
  assert.ok(result.baselineMilli > plainMean, 'растущий ряд должен дать базу выше простого среднего');
});

test('пятничный всплеск поднимает коэффициент дня недели, но не безгранично', () => {
  // 2026-07-18 — суббота; каждый седьмой день от неё это снова суббота.
  const spiky = flatHistory(HISTORY_DAYS, 10_000).map((sample, index) => ({
    ...sample,
    quantityMilli: index % 7 === 0 ? 40_000 : 10_000,
  }));
  const saturday = forecastDailyDemand({ history: spiky, targetDate: '2026-08-15', source: 'test', isMock: false });
  assert.ok(saturday.weekdayFactorPpm > 1_000_000, 'день с всплеском должен получить коэффициент выше единицы');
  assert.ok(saturday.weekdayFactorPpm <= 2_000_000, 'коэффициент ограничен сверху');
});

test('нулевой спрос даёт нулевой прогноз и низкую уверенность, а не ошибку', () => {
  const result = forecastDailyDemand({
    history: flatHistory(HISTORY_DAYS, 0),
    targetDate: '2026-08-15',
    source: 'test',
    isMock: false,
  });
  assert.equal(result.dailyForecastMilli, 0);
  assert.equal(result.daysWithDemand, 0);
  assert.ok(result.confidencePpm <= 400_000, 'без движения уверенность не может быть высокой');
});

test('пустая история — это состояние новой позиции, а не сбой', () => {
  const result = forecastDailyDemand({ history: [], targetDate: '2026-08-15', source: 'test', isMock: true });
  assert.equal(result.dailyForecastMilli, 0);
  assert.equal(result.sampleDays, 0);
  assert.equal(result.wapePpm, null);
  assert.ok(result.assumptions.some((line) => line.includes('[MOCK]')));
});

test('короткая история не даёт измерить ошибку модели', () => {
  assert.equal(backtestWapePpm(flatHistory(7, 5_000)), null);
  assert.notEqual(backtestWapePpm(flatHistory(14, 5_000)), null);
});

test('на идеально ровном ряду ошибка бэктеста равна нулю', () => {
  assert.equal(backtestWapePpm(flatHistory(HISTORY_DAYS, 7_000)), 0);
});

test('шумный ряд даёт ненулевую ошибку и роняет уверенность', () => {
  const noisy = flatHistory(HISTORY_DAYS, 0).map((sample, index) => ({
    ...sample,
    quantityMilli: index % 2 === 0 ? 2_000 : 20_000,
  }));
  const wape = backtestWapePpm(noisy);
  assert.ok(wape !== null && wape > 100_000, 'пилообразный ряд должен давать заметную ошибку');
  const steady = forecastDailyDemand({ history: flatHistory(HISTORY_DAYS, 11_000), targetDate: '2026-08-15', source: 't', isMock: false });
  const jumpy = forecastDailyDemand({ history: noisy, targetDate: '2026-08-15', source: 't', isMock: false });
  assert.ok(jumpy.confidencePpm < steady.confidencePpm);
});

test('нулевой знаменатель WAPE не роняет расчёт', () => {
  const wape = backtestWapePpm(flatHistory(HISTORY_DAYS, 0));
  assert.equal(wape, 0, 'при нулевом факте и нулевом прогнозе ошибки нет');
});

// ─── Risk ────────────────────────────────────────────────────────────────────

const POLICY: ReorderPolicy = { leadTimeP80Hours: 48, serviceLevelZMilli: 1_645, minStockMilli: 0 };

test('время до нуля считается в часах и переживает дробный расход', () => {
  assert.equal(timeToStockoutHours(14_000, 12_000), 28);
  assert.equal(timeToStockoutHours(24_000, 12_000), 48);
  assert.equal(timeToStockoutHours(0, 12_000), 0);
});

test('без расхода время до нуля не бесконечность, а отсутствие ответа', () => {
  assert.equal(timeToStockoutHours(14_000, 0), null);
});

test('страховой запас растёт с разбросом и со сроком поставки', () => {
  const short = safetyStockMilli(3_000, 24, 1_645);
  const long = safetyStockMilli(3_000, 96, 1_645);
  assert.ok(long > short, 'долгая поставка требует большего запаса');
  assert.equal(safetyStockMilli(0, 48, 1_645), 0, 'ровный расход не требует страхового запаса');
  assert.equal(safetyStockMilli(3_000, 0, 1_645), 0, 'мгновенная поставка не требует запаса');
});

test('точка перезаказа = расход за срок поставки плюс страховой запас', () => {
  assert.equal(reorderPointMilli(12_000, 48, 0), 24_000);
  assert.equal(reorderPointMilli(12_000, 48, 5_000), 29_000);
  assert.equal(reorderPointMilli(0, 48, 5_000), 5_000);
});

test('риск объявляется, когда время до нуля меньше срока поставки', () => {
  const assessment = assessStockoutRisk({
    onHandMilli: 14_000,
    inboundMilli: 0,
    dailyForecastMilli: 12_000,
    sigmaDailyMilli: 2_000,
    policy: POLICY,
    forecastConfidencePpm: 870_000,
    lastEventAt: '2026-08-14T06:00:00Z',
    now: '2026-08-14T08:00:00Z',
    source: 'test',
    isMock: false,
  });
  assert.equal(assessment.timeToStockoutHours, 28);
  assert.equal(assessment.atRisk, true, '28 часов до нуля против 48 часов поставки — это риск');
  assert.equal(assessment.coverageGapHours, 20);
  assert.equal(assessment.level, 'warning');
  assert.ok(assessment.explanations.timeToStockout);
});

test('запаса больше срока поставки — риска нет', () => {
  const assessment = assessStockoutRisk({
    onHandMilli: 200_000,
    inboundMilli: 0,
    dailyForecastMilli: 12_000,
    sigmaDailyMilli: 1_000,
    policy: POLICY,
    forecastConfidencePpm: 870_000,
    lastEventAt: '2026-08-14T06:00:00Z',
    now: '2026-08-14T08:00:00Z',
    source: 'test',
    isMock: false,
  });
  assert.equal(assessment.atRisk, false);
  assert.equal(assessment.level, 'none');
  assert.equal(assessment.shortfallMilli, 0);
});

test('меньше суток до нуля — это уже критично', () => {
  const assessment = assessStockoutRisk({
    onHandMilli: 6_000,
    inboundMilli: 0,
    dailyForecastMilli: 12_000,
    sigmaDailyMilli: 2_000,
    policy: POLICY,
    forecastConfidencePpm: 870_000,
    lastEventAt: '2026-08-14T06:00:00Z',
    now: '2026-08-14T08:00:00Z',
    source: 'test',
    isMock: false,
  });
  assert.equal(assessment.timeToStockoutHours, 12);
  assert.equal(assessment.level, 'critical');
});

test('то, что уже едет, снимает нехватку до точки перезаказа', () => {
  const base = {
    onHandMilli: 20_000,
    dailyForecastMilli: 12_000,
    sigmaDailyMilli: 1_500,
    policy: POLICY,
    forecastConfidencePpm: 800_000,
    lastEventAt: '2026-08-14T06:00:00Z',
    now: '2026-08-14T08:00:00Z',
    source: 'test',
    isMock: false,
  };
  const without = assessStockoutRisk({ ...base, inboundMilli: 0 });
  const withInbound = assessStockoutRisk({ ...base, inboundMilli: 40_000 });
  assert.ok(without.shortfallMilli > 0);
  assert.equal(withInbound.shortfallMilli, 0);
});

test('без расхода риск не объявляется, но причина называется прямо', () => {
  const assessment = assessStockoutRisk({
    onHandMilli: 14_000,
    inboundMilli: 0,
    dailyForecastMilli: 0,
    sigmaDailyMilli: 0,
    policy: POLICY,
    forecastConfidencePpm: 120_000,
    lastEventAt: null,
    now: '2026-08-14T08:00:00Z',
    source: 'test',
    isMock: true,
  });
  assert.equal(assessment.timeToStockoutHours, null);
  assert.equal(assessment.noClockReason, 'no_demand');
  assert.equal(assessment.atRisk, false);
  assert.ok(assessment.reason.includes('Нет достаточного расхода'));
  assert.equal(assessment.explanations.timeToStockout, null);
});

test('заданный вручную минимум поднимает страховой запас', () => {
  const assessment = assessStockoutRisk({
    onHandMilli: 50_000,
    inboundMilli: 0,
    dailyForecastMilli: 12_000,
    sigmaDailyMilli: 500,
    policy: { ...POLICY, minStockMilli: 30_000 },
    forecastConfidencePpm: 800_000,
    lastEventAt: '2026-08-14T06:00:00Z',
    now: '2026-08-14T08:00:00Z',
    source: 'test',
    isMock: false,
  });
  assert.equal(assessment.safetyStockMilli, 30_000);
});

test('очередь показывает не больше пяти позиций и ставит вперёд самое срочное', () => {
  const make = (onHand: number, forecast: number) => ({
    assessment: assessStockoutRisk({
      onHandMilli: onHand,
      inboundMilli: 0,
      dailyForecastMilli: forecast,
      sigmaDailyMilli: 1_000,
      policy: POLICY,
      forecastConfidencePpm: 800_000,
      lastEventAt: '2026-08-14T06:00:00Z',
      now: '2026-08-14T08:00:00Z',
      source: 'test',
      isMock: false,
    }),
  });

  const queue = rankRiskQueue([
    make(600_000, 12_000),
    make(14_000, 12_000),
    make(6_000, 12_000),
    make(20_000, 12_000),
    make(18_000, 12_000),
    make(22_000, 12_000),
    make(24_500, 12_000),
  ]);

  assert.ok(queue.length <= 5);
  assert.equal(queue[0].assessment.level, 'critical');
  assert.ok(queue.every((item) => item.assessment.level !== 'none'), 'позиции без риска в очередь не попадают');
});

// ─── Вспомогательное ─────────────────────────────────────────────────────────

test('заказ округляется вверх до целых упаковок', () => {
  assert.equal(roundUpToPack(23_000, 10_000), 30_000);
  assert.equal(roundUpToPack(30_000, 10_000), 30_000);
  assert.equal(roundUpToPack(1, 10_000), 10_000);
});

test('количество печатается так, как его читает человек', () => {
  assert.equal(formatQuantity(14_500, 'л'), '14,5 л');
  assert.equal(formatQuantity(40_000, 'л'), '40 л');
  assert.equal(formatQuantity(2_000, 'лоток'), '2 лоток');
});

test('пустой журнал — это ноль, а не отсутствие ответа', () => {
  assert.equal(EMPTY_LEDGER.onHandMilli, 0);
  assert.equal(EMPTY_LEDGER.lastEventAt, null);
});
