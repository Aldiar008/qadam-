/**
 * Свежесть: половина цветочного бизнеса, которой нет в обычном складском учёте.
 *
 * Для кофейни остаток — это просто число: стаканы полежат и месяц. Для цветочного
 * магазина у каждого стебля есть срок, после которого он не товар, а убыток.
 * Поэтому остаток здесь — не одно число, а несколько партий с разными датами
 * прихода, и расход идёт с той, что вянет раньше.
 *
 * Отсюда второй риск, которого нет у непортящихся товаров: закупить слишком
 * много так же плохо, как слишком мало. Первое видно сразу — пустая витрина в
 * праздник. Второе видно через неделю — ведро увядших роз и деньги, которые
 * уже не вернуть.
 */
import { DomainError, assertSafeInteger, explanation, roundDiv, type NumberExplanation } from './shared.ts';

export const SPOILAGE_MODEL_VERSION = 'expiry-exposure-1';

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export interface InventoryLot {
  id: string;
  /** Когда партия пришла. */
  receivedAt: string;
  /**
   * Когда партия перестаёт быть товаром. `null` — у того, что не портится:
   * упаковка, ленты, вазы.
   */
  expiresAt: string | null;
  /** Что осталось от партии, в тысячных единицы. */
  remainingMilli: number;
  /** Себестоимость единицы — по ней считается замороженная сумма. */
  unitCostMinor: number | null;
}

export type FreshnessState = 'fresh' | 'ageing' | 'last_day' | 'expired' | 'imperishable';

export interface LotExposure {
  lot: InventoryLot;
  /** Часов до истечения. `null` у непортящегося. Отрицательное — уже просрочено. */
  hoursLeft: number | null;
  state: FreshnessState;
  /** Сколько из этой партии успеет продаться до её срока. */
  sellableMilli: number;
  /** Сколько не успеет — то есть уйдёт в списание. */
  atRiskMilli: number;
}

export interface SpoilageAssessment {
  /** Суммарное количество под риском списания. */
  atRiskMilli: number;
  /** Замороженная себестоимость этого количества. `null`, если цена неизвестна. */
  atRiskCostMinor: number | null;
  /** Доля остатка под риском, миллионные. */
  atRiskSharePpm: number;
  /** Часы до истечения ближайшей партии. */
  nearestExpiryHours: number | null;
  /** Сколько партий уже просрочено. */
  expiredLots: number;
  /** Порог, который владелец считает приемлемым. */
  toleranceBps: number;
  /** Превышен ли порог — только это делает риск риском, а не наблюдением. */
  overTolerance: boolean;
  lots: readonly LotExposure[];
  modelVersion: string;
  assumptions: readonly string[];
  explanation: NumberExplanation;
}

function hoursBetween(from: string, to: string): number {
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (Number.isNaN(start) || Number.isNaN(end)) throw new DomainError('INVALID_TIMESTAMP', `${from} → ${to}`);
  return Math.round((end - start) / HOUR_MS);
}

/** Состояние партии по остатку срока — то, чем красится строка на витрине. */
export function freshnessState(hoursLeft: number | null): FreshnessState {
  if (hoursLeft === null) return 'imperishable';
  if (hoursLeft <= 0) return 'expired';
  if (hoursLeft <= 24) return 'last_day';
  if (hoursLeft <= 72) return 'ageing';
  return 'fresh';
}

/**
 * Сколько из остатка не успеет продаться до потери свежести.
 *
 * Партии перебираются в порядке истечения — так же, как их будет разбирать
 * продавец: сначала то, что вянет раньше. Прогнозируемый спрос расходуется на
 * партии по очереди, и то, что не покрыто спросом до собственного срока,
 * попадает в риск.
 *
 * Ключевая тонкость: спрос, уже «потраченный» на раннюю партию, не может второй
 * раз спасти позднюю. Без накопителя `covered` каждая партия считала бы весь
 * спрос своим, и риск списания выходил бы нулевым при любом переизбытке.
 */
export function assessSpoilageRisk(input: {
  lots: readonly InventoryLot[];
  dailyForecastMilli: number;
  toleranceBps: number;
  now: string;
  source: string;
  isMock: boolean;
}): SpoilageAssessment {
  assertSafeInteger(input.dailyForecastMilli, 'dailyForecastMilli', 0);
  if (input.toleranceBps < 0 || input.toleranceBps > 10_000) {
    throw new DomainError('INVALID_TOLERANCE', 'spoilage tolerance must be between 0 and 10000 basis points');
  }

  const ordered = [...input.lots].sort((left, right) => {
    if (left.expiresAt === right.expiresAt) return 0;
    // Непортящееся уходит в конец: оно не участвует в гонке за спрос.
    if (left.expiresAt === null) return 1;
    if (right.expiresAt === null) return -1;
    return Date.parse(left.expiresAt) - Date.parse(right.expiresAt);
  });

  let covered = 0;
  let atRiskMilli = 0;
  let atRiskCostMinor = 0;
  let costKnown = true;
  let expiredLots = 0;
  let nearestExpiryHours: number | null = null;

  const lots: LotExposure[] = ordered.map((lot) => {
    assertSafeInteger(lot.remainingMilli, 'remainingMilli', 0);
    const hoursLeft = lot.expiresAt === null ? null : hoursBetween(input.now, lot.expiresAt);
    const state = freshnessState(hoursLeft);

    if (hoursLeft !== null && (nearestExpiryHours === null || hoursLeft < nearestExpiryHours)) {
      nearestExpiryHours = hoursLeft;
    }
    if (state === 'expired') expiredLots += 1;

    // Непортящееся под риском списания не бывает по определению.
    if (hoursLeft === null) {
      covered += lot.remainingMilli;
      return { lot, hoursLeft, state, sellableMilli: lot.remainingMilli, atRiskMilli: 0 };
    }

    // Просроченное уже списано по факту, даже если ещё стоит в ведре.
    if (hoursLeft <= 0) {
      atRiskMilli += lot.remainingMilli;
      if (lot.unitCostMinor === null) costKnown = false;
      else atRiskCostMinor += Math.round((lot.remainingMilli * lot.unitCostMinor) / 1000);
      return { lot, hoursLeft, state, sellableMilli: 0, atRiskMilli: lot.remainingMilli };
    }

    const demandUntilExpiry = Math.round((input.dailyForecastMilli * hoursLeft) / 24);
    const availableDemand = Math.max(0, demandUntilExpiry - covered);
    const sellable = Math.min(lot.remainingMilli, availableDemand);
    const atRisk = lot.remainingMilli - sellable;

    covered += sellable;
    atRiskMilli += atRisk;
    if (atRisk > 0) {
      if (lot.unitCostMinor === null) costKnown = false;
      else atRiskCostMinor += Math.round((atRisk * lot.unitCostMinor) / 1000);
    }

    return { lot, hoursLeft, state, sellableMilli: sellable, atRiskMilli: atRisk };
  });

  const totalRemaining = ordered.reduce((sum, lot) => sum + lot.remainingMilli, 0);
  const atRiskSharePpm = totalRemaining === 0 ? 0 : roundDiv(atRiskMilli * 1_000_000, totalRemaining);
  // Порог задан в базисных пунктах, доля посчитана в миллионных: 500 bps = 5% = 50 000 ppm.
  const overTolerance = atRiskSharePpm > input.toleranceBps * 100;

  const assumptions = Object.freeze([
    `спрос ${input.dailyForecastMilli} тысячных в день расходуется на партии в порядке истечения`,
    `допустимая доля списания ${(input.toleranceBps / 100).toFixed(1)}% задана владельцем`,
    totalRemaining === 0 ? 'остатка нет — считать нечего' : `на руках ${totalRemaining} тысячных в ${ordered.length} партиях`,
    ...(costKnown ? [] : ['себестоимость известна не по всем партиям — сумма занижена']),
    ...(input.isMock ? ['[MOCK] партии и себестоимость синтетические'] : []),
  ]);

  return {
    atRiskMilli,
    atRiskCostMinor: costKnown ? atRiskCostMinor : null,
    atRiskSharePpm,
    nearestExpiryHours,
    expiredLots,
    toleranceBps: input.toleranceBps,
    overTolerance,
    lots: Object.freeze(lots),
    modelVersion: SPOILAGE_MODEL_VERSION,
    assumptions,
    explanation: explanation({
      what: 'Количество под риском списания',
      value: atRiskMilli,
      unit: 'ед.·1/1000',
      period: { start: input.now, end: new Date(Date.parse(input.now) + 7 * DAY_MS).toISOString() },
      source: input.source,
      formula: 'по каждой партии: остаток − то, что успеет продаться до её срока при текущем прогнозе',
      confidence: input.dailyForecastMilli > 0 ? 0.75 : 0.3,
      assumptions,
      status: input.isMock ? 'simulated' : 'estimated',
      nextAction: overTolerance
        ? 'Уменьшить ближайший заказ или собрать промо-набор из того, что вянет раньше'
        : 'Наблюдать: доля списания в пределах заданного порога',
      kind: 'forecast',
    }),
  };
}

/** Срок партии по дате прихода и сроку жизни позиции. */
export function expiryFor(receivedAt: string, shelfLifeDays: number | null): string | null {
  if (shelfLifeDays === null || shelfLifeDays <= 0) return null;
  const received = Date.parse(receivedAt);
  if (Number.isNaN(received)) throw new DomainError('INVALID_TIMESTAMP', receivedAt);
  return new Date(received + shelfLifeDays * DAY_MS).toISOString();
}

/**
 * Списание партий по правилу «раньше вянет — раньше уходит».
 *
 * Возвращает, сколько снять с каждой партии. Продавец разбирает ведро именно
 * так, и учёт обязан повторять реальность, иначе остаток по срокам разъедется
 * с тем, что стоит в магазине.
 */
export function allocateFifo(
  lots: readonly InventoryLot[],
  quantityMilli: number,
): { lotId: string; takeMilli: number }[] {
  assertSafeInteger(quantityMilli, 'quantityMilli', 1);
  const ordered = [...lots].sort((left, right) => {
    if (left.expiresAt === right.expiresAt) return Date.parse(left.receivedAt) - Date.parse(right.receivedAt);
    if (left.expiresAt === null) return 1;
    if (right.expiresAt === null) return -1;
    return Date.parse(left.expiresAt) - Date.parse(right.expiresAt);
  });

  const plan: { lotId: string; takeMilli: number }[] = [];
  let left = quantityMilli;

  for (const lot of ordered) {
    if (left <= 0) break;
    const take = Math.min(lot.remainingMilli, left);
    if (take <= 0) continue;
    plan.push({ lotId: lot.id, takeMilli: take });
    left -= take;
  }

  if (left > 0) {
    throw new DomainError('NOT_ENOUGH_IN_LOTS', `партии держат ${quantityMilli - left} из ${quantityMilli} тысячных`);
  }
  return plan;
}
