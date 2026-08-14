/**
 * Разделение заказа: срочная часть у быстрого, основная у выгодного.
 *
 * Самая дешёвая база везёт розы двое суток, а витрина пустеет через двадцать
 * девять часов. Заказать всё у неё — полтора дня без роз накануне праздника.
 * Заказать всё у быстрого — переплатить за весь объём, хотя срочно нужна только
 * часть. Решение обычно посередине, и оно не очевидно на глаз: его нужно
 * посчитать с учётом кратности пачки, минимальной партии и бюджета.
 *
 * Солвер перебирает варианты, а не «оптимизирует»: поставщиков у цветочного
 * магазина единицы, полный перебор до трёх участников считается мгновенно и,
 * в отличие от эвристики, даёт воспроизводимый ответ, который можно проверить
 * руками.
 */
import { DomainError, assertSafeInteger, explanation, type NumberExplanation } from './shared.ts';
import type { ScoredOffer } from './supplier-score.ts';

export const ORDER_SOLVER_VERSION = 'split-order-1';

/** Больше трёх поставщиков на одну позицию — это не план, а хаос на приёмке. */
const MAX_PARTS = 3;

export interface OrderLine {
  supplierId: string;
  supplierName: string;
  quantityMilli: number;
  unitPriceMinor: number;
  costMinor: number;
  leadTimeP80Hours: number;
  /** Закрывает ли эта часть срочную потребность. */
  urgent: boolean;
}

export interface OrderPlan {
  lines: readonly OrderLine[];
  totalQuantityMilli: number;
  totalCostMinor: number;
  /** Через сколько часов приедет первая часть. */
  firstArrivalHours: number;
  /** Часы, которые витрина простоит пустой. Ноль — разрыв закрыт. */
  uncoveredHours: number;
  feasible: boolean;
}

export interface SolveInput {
  offers: readonly ScoredOffer[];
  /** Сколько нужно всего, в тысячных единицы. */
  neededMilli: number;
  /** Сколько нужно закрыть срочно, до пустой витрины. */
  urgentMilli: number;
  /** Через сколько часов витрина опустеет. `null` — спешить некуда. */
  hoursUntilStockout: number | null;
  budgetMinor: number | null;
  source: string;
  isMock: boolean;
}

export interface SolveResult {
  /** Рекомендованный план. `null`, если ни один вариант не выполним. */
  best: OrderPlan | null;
  /** План «всё у самого быстрого» — с ним и сравнивается рекомендация. */
  allFast: OrderPlan | null;
  /** План «всё у самого дешёвого» — обычно он и оставляет витрину пустой. */
  allCheap: OrderPlan | null;
  /** Разница в деньгах между рекомендацией и «всё быстро». */
  savingVsAllFastMinor: number | null;
  version: string;
  assumptions: readonly string[];
  explanation: NumberExplanation;
}

function buildPlan(
  parts: readonly { offer: ScoredOffer; quantityMilli: number; urgent: boolean }[],
  input: SolveInput,
): OrderPlan {
  const lines: OrderLine[] = parts
    .filter((part) => part.quantityMilli > 0)
    .map((part) => ({
      supplierId: part.offer.offer.supplierId,
      supplierName: part.offer.offer.supplierName,
      quantityMilli: part.quantityMilli,
      unitPriceMinor: part.offer.offer.unitPriceMinor,
      costMinor: Math.round((part.quantityMilli * part.offer.offer.unitPriceMinor) / 1000),
      leadTimeP80Hours: part.offer.offer.leadTimeP80Hours,
      urgent: part.urgent,
    }));

  const totalQuantityMilli = lines.reduce((sum, line) => sum + line.quantityMilli, 0);
  const totalCostMinor = lines.reduce((sum, line) => sum + line.costMinor, 0);
  const firstArrivalHours = lines.length ? Math.min(...lines.map((line) => line.leadTimeP80Hours)) : Infinity;

  // Разрыв считается по срочной части: если она приезжает позже, чем кончается
  // товар, витрина стоит пустой независимо от того, что приедет потом.
  const urgentLines = lines.filter((line) => line.urgent);
  const urgentArrival = urgentLines.length ? Math.min(...urgentLines.map((line) => line.leadTimeP80Hours)) : firstArrivalHours;
  const uncoveredHours =
    input.hoursUntilStockout === null ? 0 : Math.max(0, urgentArrival - input.hoursUntilStockout);

  const withinBudget = input.budgetMinor === null || totalCostMinor <= input.budgetMinor;
  const coversNeed = totalQuantityMilli >= input.neededMilli;
  const coversUrgent =
    input.urgentMilli <= 0 ||
    urgentLines.reduce((sum, line) => sum + line.quantityMilli, 0) >= input.urgentMilli;

  return {
    lines: Object.freeze(lines),
    totalQuantityMilli,
    totalCostMinor,
    firstArrivalHours: Number.isFinite(firstArrivalHours) ? firstArrivalHours : 0,
    uncoveredHours,
    feasible: lines.length > 0 && withinBudget && coversNeed && coversUrgent && uncoveredHours === 0,
  };
}

/** Округляет вверх до пачки, но не ниже минимальной партии поставщика. */
function quantityFor(offer: ScoredOffer, wantedMilli: number): number {
  const pack = offer.offer.packSizeMilli;
  const rounded = Math.ceil(Math.max(wantedMilli, 0) / pack) * pack;
  const withMoq = Math.max(rounded, offer.offer.moqMilli);
  return Math.min(withMoq, Math.max(offer.offer.availableMilli, offer.offer.moqMilli));
}

/** Все сочетания поставщиков размером до трёх — их единицы, перебор дешёв. */
function combinations<T>(items: readonly T[], maxSize: number): T[][] {
  const result: T[][] = [];
  const walk = (start: number, current: T[]) => {
    if (current.length > 0) result.push([...current]);
    if (current.length === maxSize) return;
    for (let index = start; index < items.length; index += 1) {
      current.push(items[index]);
      walk(index + 1, current);
      current.pop();
    }
  };
  walk(0, []);
  return result;
}

/**
 * Считает план закупки.
 *
 * Внутри сочетания поставщики упорядочены по сроку: срочную часть закрывает
 * тот, кто приедет раньше, остальное добирает следующий. Это не эвристика ради
 * скорости, а прямое следствие задачи — срочно нужен товар, а не цена.
 */
export function solveOrder(input: SolveInput): SolveResult {
  assertSafeInteger(input.neededMilli, 'neededMilli', 0);
  assertSafeInteger(input.urgentMilli, 'urgentMilli', 0);
  if (input.urgentMilli > input.neededMilli) {
    throw new DomainError('URGENT_ABOVE_NEED', 'urgent part cannot exceed the total need');
  }

  const candidates = [...input.offers];
  const plans: OrderPlan[] = [];

  for (const combination of combinations(candidates, MAX_PARTS)) {
    const byLead = [...combination].sort((left, right) => left.offer.leadTimeP80Hours - right.offer.leadTimeP80Hours);

    let urgentLeft = input.urgentMilli;
    let totalLeft = input.neededMilli;
    const parts: { offer: ScoredOffer; quantityMilli: number; urgent: boolean }[] = [];

    for (const offer of byLead) {
      if (totalLeft <= 0) break;
      const isUrgentPart = urgentLeft > 0;
      const wanted = isUrgentPart ? Math.min(urgentLeft, totalLeft) : totalLeft;
      const quantity = quantityFor(offer, wanted);
      if (quantity <= 0) continue;

      parts.push({ offer, quantityMilli: quantity, urgent: isUrgentPart });
      if (isUrgentPart) urgentLeft -= Math.min(quantity, urgentLeft);
      totalLeft -= quantity;
    }

    plans.push(buildPlan(parts, input));
  }

  const feasible = plans.filter((plan) => plan.feasible);

  // Из выполнимых выбирается самый дешёвый; при равной цене — тот, что приедет
  // раньше. Дешевле здесь честнее, чем «оптимальнее»: разрыв уже закрыт у всех.
  const best =
    feasible.sort((left, right) =>
      left.totalCostMinor !== right.totalCostMinor
        ? left.totalCostMinor - right.totalCostMinor
        : left.firstArrivalHours - right.firstArrivalHours,
    )[0] ?? null;

  const fastest = [...candidates].sort((left, right) => left.offer.leadTimeP80Hours - right.offer.leadTimeP80Hours)[0];
  const cheapest = [...candidates].sort((left, right) => left.offer.unitPriceMinor - right.offer.unitPriceMinor)[0];

  const allFast = fastest
    ? buildPlan([{ offer: fastest, quantityMilli: quantityFor(fastest, input.neededMilli), urgent: true }], input)
    : null;
  const allCheap = cheapest
    ? buildPlan([{ offer: cheapest, quantityMilli: quantityFor(cheapest, input.neededMilli), urgent: true }], input)
    : null;

  const savingVsAllFastMinor =
    best && allFast ? allFast.totalCostMinor - best.totalCostMinor : null;

  const assumptions = Object.freeze([
    'перебор всех сочетаний до трёх поставщиков, срочную часть закрывает тот, кто приедет раньше',
    'количество округлено вверх до пачки и не ниже минимальной партии',
    input.budgetMinor === null ? 'бюджет не ограничен' : `бюджет закупки ${input.budgetMinor}`,
    'разница с вариантом «всё у быстрого» — прогноз, а не фактическая экономия',
    ...(input.isMock ? ['[MOCK] предложения и цены синтетические'] : []),
  ]);

  return {
    best,
    allFast,
    allCheap,
    savingVsAllFastMinor,
    version: ORDER_SOLVER_VERSION,
    assumptions,
    explanation: explanation({
      what: 'Стоимость рекомендованного плана',
      value: best?.totalCostMinor ?? 0,
      unit: 'KZT·1/100',
      period: { start: new Date(Date.now() - 86_400_000).toISOString(), end: new Date().toISOString() },
      source: input.source,
      formula: 'сумма по частям: количество × цена за единицу',
      confidence: best ? 0.8 : 0.2,
      assumptions,
      status: input.isMock ? 'simulated' : 'estimated',
      nextAction: best
        ? 'Подтвердить план — заказы создадутся черновиками, отправка отдельным действием'
        : 'Ни один план не закрывает потребность: смотрите отклонённых поставщиков',
      kind: 'forecast',
    }),
  };
}
