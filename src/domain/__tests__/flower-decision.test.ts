import assert from 'node:assert/strict';
import test from 'node:test';

import {
  REJECTION_TEXT,
  SCORE_WEIGHTS,
  SUPPLIER_SCORE_VERSION,
  compareSuppliers,
  screenOffers,
  type SupplierOffer,
} from '../supplier-score.ts';
import { ORDER_SOLVER_VERSION, solveOrder } from '../order-solver.ts';
import { DomainError } from '../shared.ts';

const offer = (over: Partial<SupplierOffer> & Pick<SupplierOffer, 'supplierId' | 'supplierName'>): SupplierOffer => ({
  unitPriceMinor: 700,
  packSizeMilli: 10_000,
  moqMilli: 10_000,
  availableMilli: 500_000,
  leadTimeP80Hours: 24,
  freshnessOnArrivalDays: 5,
  otifPpm: 900_000,
  shortfallRatePpm: 30_000,
  sampleSize: 20,
  paymentTermsDays: 0,
  matchesVariety: true,
  ...over,
});

const BASE = {
  neededMilli: 160_000,
  hoursUntilStockout: 29,
  budgetMinor: null,
  requiredFreshnessDays: 5,
  source: 'test',
  isMock: true,
};

// ─── Жёсткие ограничения ─────────────────────────────────────────────────────

test('поставщик без нужного сорта отсекается до всякой оценки', () => {
  const { feasible, rejected } = screenOffers({
    ...BASE,
    offers: [offer({ supplierId: 'a', supplierName: 'База А', matchesVariety: false, unitPriceMinor: 100 })],
  });
  assert.equal(feasible.length, 0, 'самая низкая цена не спасает отсутствующий сорт');
  assert.equal(rejected[0].reason, 'wrong_variety');
});

test('поставщик, который не успевает до пустой витрины, отсекается', () => {
  const { feasible, rejected } = screenOffers({
    ...BASE,
    offers: [offer({ supplierId: 'slow', supplierName: 'Дальняя база', leadTimeP80Hours: 42 })],
  });
  assert.equal(feasible.length, 0);
  assert.equal(rejected[0].reason, 'too_slow');
  assert.ok(rejected[0].detail.includes('42 ч'), 'в отказе названы обе цифры');
});

test('минимальная партия вдвое больше потребности — это не заказ, а будущее списание', () => {
  const { rejected } = screenOffers({
    ...BASE,
    offers: [offer({ supplierId: 'bulk', supplierName: 'Опт', moqMilli: 400_000 })],
  });
  assert.equal(rejected[0].reason, 'moq_above_need');
});

test('выход за бюджет отсекает вариант до оценки', () => {
  const { rejected } = screenOffers({
    ...BASE,
    budgetMinor: 50_000,
    offers: [offer({ supplierId: 'rich', supplierName: 'Премиум', unitPriceMinor: 2_000 })],
  });
  assert.equal(rejected[0].reason, 'over_budget');
});

test('отсутствие товара отсекается', () => {
  const { rejected } = screenOffers({
    ...BASE,
    offers: [offer({ supplierId: 'empty', supplierName: 'Пусто', availableMilli: 0 })],
  });
  assert.equal(rejected[0].reason, 'no_stock');
  assert.equal(REJECTION_TEXT.no_stock, 'нет в наличии');
});

test('отклонённые не пропадают: владелец видит, почему дешёвый вариант не подошёл', () => {
  const result = compareSuppliers({
    ...BASE,
    offers: [
      offer({ supplierId: 'fast', supplierName: 'Быстрая', leadTimeP80Hours: 10, unitPriceMinor: 820 }),
      offer({ supplierId: 'slow', supplierName: 'Дешёвая', leadTimeP80Hours: 42, unitPriceMinor: 690 }),
    ],
  });
  assert.equal(result.ranked.length, 1);
  assert.equal(result.rejected.length, 1);
  assert.equal(result.rejected[0].offer.supplierName, 'Дешёвая');
});

// ─── Оценка ──────────────────────────────────────────────────────────────────

test('веса оценки в сумме дают единицу', () => {
  const total = Object.values(SCORE_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
  assert.ok(Math.abs(total - 1) < 1e-9);
});

test('при прочих равных дешевле — выше', () => {
  const result = compareSuppliers({
    ...BASE,
    offers: [
      offer({ supplierId: 'dear', supplierName: 'Дорогая', unitPriceMinor: 900 }),
      offer({ supplierId: 'cheap', supplierName: 'Дешёвая', unitPriceMinor: 600 }),
    ],
  });
  assert.equal(result.ranked[0].offer.supplierName, 'Дешёвая');
  assert.equal(result.version, SUPPLIER_SCORE_VERSION);
});

test('свежесть на приёмке перевешивает небольшую разницу в цене', () => {
  const result = compareSuppliers({
    ...BASE,
    requiredFreshnessDays: 5,
    offers: [
      offer({ supplierId: 'farm', supplierName: 'Ферма', unitPriceMinor: 720, freshnessOnArrivalDays: 5 }),
      offer({ supplierId: 'base', supplierName: 'База', unitPriceMinor: 700, freshnessOnArrivalDays: 2 }),
    ],
  });
  assert.equal(result.ranked[0].offer.supplierName, 'Ферма', 'два дня свежести дороже двадцати тиынов');
  assert.ok(result.ranked[0].breakdownPpm.freshness > result.ranked[1].breakdownPpm.freshness);
});

test('малая выборка не даёт стопроцентной надёжности', () => {
  const result = compareSuppliers({
    ...BASE,
    offers: [
      offer({ supplierId: 'new', supplierName: 'Новый', otifPpm: 1_000_000, shortfallRatePpm: 0, sampleSize: 2 }),
      offer({ supplierId: 'old', supplierName: 'Проверенный', otifPpm: 940_000, shortfallRatePpm: 20_000, sampleSize: 40 }),
    ],
  });
  const newcomer = result.ranked.find((item) => item.offer.supplierId === 'new');
  assert.ok(newcomer && newcomer.breakdownPpm.reliability < 1_000_000, 'две удачные поставки — это не сто процентов');
});

test('недопоставки снижают надёжность даже при высоком OTIF', () => {
  const result = compareSuppliers({
    ...BASE,
    offers: [
      offer({ supplierId: 'full', supplierName: 'Возит полностью', shortfallRatePpm: 0 }),
      offer({ supplierId: 'short', supplierName: 'Недовозит', shortfallRatePpm: 200_000 }),
    ],
  });
  const full = result.ranked.find((item) => item.offer.supplierId === 'full');
  const short = result.ranked.find((item) => item.offer.supplierId === 'short');
  assert.ok(full && short && full.breakdownPpm.reliability > short.breakdownPpm.reliability);
});

test('количество округляется вверх до пачки и не ниже минимальной партии', () => {
  const result = compareSuppliers({
    ...BASE,
    neededMilli: 45_000,
    offers: [offer({ supplierId: 'a', supplierName: 'База', packSizeMilli: 25_000, moqMilli: 25_000 })],
  });
  assert.equal(result.ranked[0].feasibleQuantityMilli, 50_000, '45 стеблей при пачке 25 — это две пачки');
});

test('сравнение без предложений — это ошибка вызова, а не пустой список', () => {
  assert.throws(
    () => compareSuppliers({ ...BASE, offers: [] }),
    (error: unknown) => error instanceof DomainError && error.code === 'NO_OFFERS',
  );
});

// ─── Разделение заказа: сценарий из постановки ───────────────────────────────
//
// Красные розы 60 см, на витрине 70 стеблей, праздничный спрос 58 стеблей в
// день, до пустой витрины 29 часов. Быстрый везёт за 10 часов по 820 ₸,
// выгодный — за 42 часа по 690 ₸.

const FAST = offer({
  supplierId: 'a',
  supplierName: 'Оптовая база «Барыс»',
  unitPriceMinor: 820,
  packSizeMilli: 10_000,
  moqMilli: 10_000,
  availableMilli: 200_000,
  leadTimeP80Hours: 10,
  freshnessOnArrivalDays: 4,
});

const CHEAP = offer({
  supplierId: 'b',
  supplierName: 'Ферма «Талгар»',
  unitPriceMinor: 690,
  packSizeMilli: 10_000,
  moqMilli: 20_000,
  availableMilli: 400_000,
  leadTimeP80Hours: 42,
  freshnessOnArrivalDays: 6,
});

/** Оба поставщика без отсева по сроку: разделение — про то, как их совместить. */
function scoredPair() {
  const result = compareSuppliers({
    ...BASE,
    neededMilli: 160_000,
    hoursUntilStockout: null,
    offers: [FAST, CHEAP],
  });
  return result.ranked;
}

test('разделение закрывает срочную часть быстрым, а объём — выгодным', () => {
  const solved = solveOrder({
    offers: scoredPair(),
    neededMilli: 160_000,
    urgentMilli: 40_000,
    hoursUntilStockout: 29,
    budgetMinor: null,
    source: 'test',
    isMock: true,
  });

  assert.ok(solved.best, 'план должен найтись');
  assert.equal(solved.best.lines.length, 2, 'два поставщика — две части');

  const urgent = solved.best.lines.find((line) => line.urgent);
  const planned = solved.best.lines.find((line) => !line.urgent);

  assert.equal(urgent?.supplierName, 'Оптовая база «Барыс»');
  assert.equal(urgent?.quantityMilli, 40_000, '40 стеблей срочно');
  assert.equal(planned?.supplierName, 'Ферма «Талгар»');
  assert.equal(planned?.quantityMilli, 120_000, '120 стеблей планово');

  // 40 × 820 + 120 × 690 = 32 800 + 82 800 = 115 600 ₸
  assert.equal(solved.best.totalCostMinor, 115_600);
  assert.equal(solved.best.uncoveredHours, 0, 'разрыв закрыт: срочная часть приедет за 10 часов');
  assert.equal(solved.version, ORDER_SOLVER_VERSION);
});

test('разница со сценарием «всё у быстрого» считается и помечается прогнозом', () => {
  const solved = solveOrder({
    offers: scoredPair(),
    neededMilli: 160_000,
    urgentMilli: 40_000,
    hoursUntilStockout: 29,
    budgetMinor: null,
    source: 'test',
    isMock: true,
  });

  // 160 × 820 = 131 200 ₸ против 115 600 ₸ — разница 15 600 ₸.
  assert.equal(solved.allFast?.totalCostMinor, 131_200);
  assert.equal(solved.savingVsAllFastMinor, 15_600);
  assert.ok(
    solved.assumptions.some((line) => line.includes('прогноз, а не фактическая экономия')),
    'разница не выдаётся за факт',
  );
});

test('вариант «всё у дешёвого» оставляет витрину пустой и не проходит', () => {
  const solved = solveOrder({
    offers: scoredPair(),
    neededMilli: 160_000,
    urgentMilli: 40_000,
    hoursUntilStockout: 29,
    budgetMinor: null,
    source: 'test',
    isMock: true,
  });
  assert.ok(solved.allCheap);
  assert.equal(solved.allCheap.uncoveredHours, 13, '42 часа доставки против 29 часов запаса');
  assert.equal(solved.allCheap.feasible, false);
});

test('бюджет отсекает планы, которые в него не помещаются', () => {
  const solved = solveOrder({
    offers: scoredPair(),
    neededMilli: 160_000,
    urgentMilli: 40_000,
    hoursUntilStockout: 29,
    budgetMinor: 100_000,
    source: 'test',
    isMock: true,
  });
  assert.equal(solved.best, null, 'план на 115 600 ₸ не помещается в 100 000 ₸');
});

test('когда спешить некуда, побеждает просто дешёвый', () => {
  const solved = solveOrder({
    offers: scoredPair(),
    neededMilli: 160_000,
    urgentMilli: 0,
    hoursUntilStockout: null,
    budgetMinor: null,
    source: 'test',
    isMock: true,
  });
  assert.equal(solved.best?.lines.length, 1);
  assert.equal(solved.best?.lines[0].supplierName, 'Ферма «Талгар»');
});

test('срочная часть больше общей потребности — ошибка вызова', () => {
  assert.throws(
    () =>
      solveOrder({
        offers: scoredPair(),
        neededMilli: 40_000,
        urgentMilli: 90_000,
        hoursUntilStockout: 29,
        budgetMinor: null,
        source: 'test',
        isMock: true,
      }),
    (error: unknown) => error instanceof DomainError && error.code === 'URGENT_ABOVE_NEED',
  );
});

test('в план не попадает больше трёх поставщиков', () => {
  const many = [FAST, CHEAP, offer({ supplierId: 'c', supplierName: 'Третья', leadTimeP80Hours: 20 }),
    offer({ supplierId: 'd', supplierName: 'Четвёртая', leadTimeP80Hours: 30 })];
  const ranked = compareSuppliers({ ...BASE, hoursUntilStockout: null, offers: many }).ranked;
  const solved = solveOrder({
    offers: ranked,
    neededMilli: 300_000,
    urgentMilli: 40_000,
    hoursUntilStockout: 40,
    budgetMinor: null,
    source: 'test',
    isMock: true,
  });
  assert.ok(solved.best === null || solved.best.lines.length <= 3);
});
