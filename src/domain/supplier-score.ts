/**
 * Выбор поставщика цветов: цена — только один из шести параметров.
 *
 * Самая дешёвая роза бесполезна, если база везёт её двое суток, а витрина
 * пустеет через двадцать девять часов. Так же бесполезна самая быстрая, если
 * она приезжает с распустившимся бутоном — такой цветок стоит на витрине не
 * пять дней, а два, и разница уходит в списание.
 *
 * Поэтому здесь сначала отсекаются варианты, которые физически не подходят
 * (нет сорта, не успевает, не набирается минимальная партия, не хватает
 * бюджета), и только оставшиеся получают оценку. Порядок принципиален: без
 * него дешёвый и невозможный вариант конкурировал бы с дорогим и реальным.
 */
import { DomainError, assertSafeInteger, explanation, roundDiv, type NumberExplanation } from './shared.ts';

export const SUPPLIER_SCORE_VERSION = 'flower-supplier-score-1';

/** Веса оценки. Сумма — единица; каждый подписан на экране. */
export const SCORE_WEIGHTS = Object.freeze({
  cost: 0.3,
  lead: 0.25,
  reliability: 0.2,
  freshness: 0.15,
  moq: 0.05,
  terms: 0.05,
});

export interface SupplierOffer {
  supplierId: string;
  supplierName: string;
  /** Цена за единицу в тиынах: за стебель, пучок или лист. */
  unitPriceMinor: number;
  /** Кратность заказа в тысячных единицы. */
  packSizeMilli: number;
  /** Минимальная партия в тысячных единицы. */
  moqMilli: number;
  /** Сколько поставщик реально может отгрузить сейчас. */
  availableMilli: number;
  /** Срок, который поставщик выдерживает в 80% случаев. */
  leadTimeP80Hours: number;
  /**
   * Сколько дней свежести остаётся у цветка на момент приёмки. У фермы это
   * почти полный срок, у базы — на день-два меньше: цветок успел постоять.
   */
  freshnessOnArrivalDays: number;
  /** Доля поставок вовремя и полностью, миллионные. */
  otifPpm: number;
  /** Доля недопоставленного объёма, миллионные. */
  shortfallRatePpm: number;
  /** Сколько поставок в выборке — без этого рейтинг ничего не значит. */
  sampleSize: number;
  /** Отсрочка платежа в днях. Ноль — по предоплате. */
  paymentTermsDays: number;
  /** Есть ли нужный сорт, цвет и длина стебля. */
  matchesVariety: boolean;
}

export type RejectionReason =
  | 'no_stock'
  | 'wrong_variety'
  | 'too_slow'
  | 'moq_above_need'
  | 'over_budget';

export interface ScoredOffer {
  offer: SupplierOffer;
  /** Итоговая оценка, миллионные доли: 810 000 — это 0,81. */
  scorePpm: number;
  /** Разложение по слагаемым — то, что раскрывается по клику. */
  breakdownPpm: Readonly<Record<keyof typeof SCORE_WEIGHTS, number>>;
  /** Сколько реально брать у этого поставщика с учётом упаковки. */
  feasibleQuantityMilli: number;
  costMinor: number;
}

export interface RejectedOffer {
  offer: SupplierOffer;
  reason: RejectionReason;
  detail: string;
}

export interface CompareInput {
  offers: readonly SupplierOffer[];
  /** Сколько нужно всего, в тысячных единицы. */
  neededMilli: number;
  /** Через сколько часов витрина опустеет. `null` — спешить некуда. */
  hoursUntilStockout: number | null;
  /** Потолок бюджета на эту закупку. `null` — не задан. */
  budgetMinor: number | null;
  /** Сколько дней свежести нужно, чтобы товар успел продаться. */
  requiredFreshnessDays: number;
  source: string;
  isMock: boolean;
}

export interface CompareResult {
  ranked: readonly ScoredOffer[];
  rejected: readonly RejectedOffer[];
  version: string;
  explanation: NumberExplanation;
}

export const REJECTION_TEXT: Readonly<Record<RejectionReason, string>> = Object.freeze({
  no_stock: 'нет в наличии',
  wrong_variety: 'не тот сорт, цвет или длина стебля',
  too_slow: 'не успевает до того, как витрина опустеет',
  moq_above_need: 'минимальная партия больше, чем нужно',
  over_budget: 'выходит за бюджет закупки',
});

/** Округление вверх до целой пачки: половину коробки роз не привезут. */
function roundUpToPack(quantityMilli: number, packSizeMilli: number): number {
  assertSafeInteger(packSizeMilli, 'packSizeMilli', 1);
  return Math.ceil(quantityMilli / packSizeMilli) * packSizeMilli;
}

/**
 * Отсев по жёстким ограничениям.
 *
 * Это не оптимизация, а вопрос выполнимости: поставщик либо может привезти
 * нужный сорт в нужный срок в пределах бюджета, либо нет. Смешивать это со
 * взвешенной оценкой нельзя — иначе достаточно низкая цена «перевесит» то, что
 * товара просто нет.
 */
export function screenOffers(input: CompareInput): { feasible: SupplierOffer[]; rejected: RejectedOffer[] } {
  const feasible: SupplierOffer[] = [];
  const rejected: RejectedOffer[] = [];

  for (const offer of input.offers) {
    if (!offer.matchesVariety) {
      rejected.push({ offer, reason: 'wrong_variety', detail: REJECTION_TEXT.wrong_variety });
      continue;
    }
    if (offer.availableMilli <= 0) {
      rejected.push({ offer, reason: 'no_stock', detail: REJECTION_TEXT.no_stock });
      continue;
    }
    if (input.hoursUntilStockout !== null && offer.leadTimeP80Hours > input.hoursUntilStockout) {
      rejected.push({
        offer,
        reason: 'too_slow',
        detail: `везёт ${offer.leadTimeP80Hours} ч, а витрина опустеет через ${input.hoursUntilStockout} ч`,
      });
      continue;
    }
    // Минимальная партия отсекает только тогда, когда она заметно больше
    // потребности: взять на пачку больше — обычное дело, взять втрое больше —
    // это заказ, половина которого уедет в списание.
    if (offer.moqMilli > input.neededMilli * 2) {
      rejected.push({
        offer,
        reason: 'moq_above_need',
        detail: `минимум ${offer.moqMilli} при потребности ${input.neededMilli}`,
      });
      continue;
    }
    if (input.budgetMinor !== null) {
      const minimumSpend = Math.round((Math.max(offer.moqMilli, input.neededMilli) * offer.unitPriceMinor) / 1000);
      if (minimumSpend > input.budgetMinor) {
        rejected.push({
          offer,
          reason: 'over_budget',
          detail: `минимальная закупка ${minimumSpend} при бюджете ${input.budgetMinor}`,
        });
        continue;
      }
    }
    feasible.push(offer);
  }

  return { feasible, rejected };
}

/**
 * Насколько цена близка к лучшей: отношение, а не место в диапазоне.
 *
 * Нормировка по размаху выборки выглядит естественной и врёт: если два
 * поставщика различаются на три процента, она растягивает эти три процента на
 * всю шкалу, и «дороже на двадцать тиынов» весит столько же, сколько «дороже
 * вдвое». На цветах это ломало выбор — база с ценой на 3% ниже обыгрывала
 * ферму, которая привозит цветок на три дня свежее.
 *
 * Отношение `дешёвая / эта` сохраняет масштаб: три процента разницы дают три
 * процента проигрыша, и свежесть с надёжностью получают свой честный вес.
 */
function costFitPpm(offer: SupplierOffer, cheapest: number): number {
  if (offer.unitPriceMinor <= 0) return 1_000_000;
  return Math.max(0, Math.min(1_000_000, roundDiv(cheapest * 1_000_000, offer.unitPriceMinor)));
}

/** Чем больше запас времени до пустой витрины, тем выше. */
function leadFitPpm(offer: SupplierOffer, hoursUntilStockout: number | null): number {
  if (hoursUntilStockout === null) return offer.leadTimeP80Hours <= 24 ? 1_000_000 : 600_000;
  if (offer.leadTimeP80Hours >= hoursUntilStockout) return 0;
  const slack = hoursUntilStockout - offer.leadTimeP80Hours;
  return Math.min(1_000_000, roundDiv(slack * 1_000_000, Math.max(1, hoursUntilStockout)));
}

/**
 * Надёжность с поправкой на размер выборки.
 *
 * Три поставки подряд без срывов — это не «100% надёжности», а три поставки.
 * Пока выборка мала, оценка притягивается к средней: иначе новый поставщик с
 * одной удачной машиной обыгрывал бы того, кто возит два года.
 */
function reliabilityPpm(offer: SupplierOffer): number {
  const prior = 800_000;
  const weight = Math.min(offer.sampleSize, 20);
  const blended = roundDiv(offer.otifPpm * weight + prior * (20 - weight), 20);
  const penalty = roundDiv(offer.shortfallRatePpm, 2);
  return Math.max(0, Math.min(1_000_000, blended - penalty));
}

/** Свежесть на приёмке: сколько дней у цветка останется, чтобы продаться. */
function freshnessFitPpm(offer: SupplierOffer, requiredDays: number): number {
  if (requiredDays <= 0) return 1_000_000;
  return Math.max(0, Math.min(1_000_000, roundDiv(offer.freshnessOnArrivalDays * 1_000_000, requiredDays)));
}

/** Чем ближе минимальная партия к потребности, тем меньше лишнего на витрине. */
function moqFitPpm(offer: SupplierOffer, neededMilli: number): number {
  if (offer.moqMilli <= 0) return 1_000_000;
  if (offer.moqMilli <= neededMilli) return 1_000_000;
  return Math.max(0, roundDiv(neededMilli * 1_000_000, offer.moqMilli));
}

/** Отсрочка платежа: две недели лучше предоплаты, но весит меньше всего. */
function termsFitPpm(offer: SupplierOffer): number {
  return Math.min(1_000_000, roundDiv(Math.min(offer.paymentTermsDays, 30) * 1_000_000, 30));
}

/**
 * Сравнивает поставщиков одной позиции.
 *
 * Возвращает и принятые, и отклонённые: владелец должен видеть, что дешёвый
 * вариант не пропал, а не прошёл по сроку — иначе он будет думать, что система
 * его не заметила.
 */
export function compareSuppliers(input: CompareInput): CompareResult {
  assertSafeInteger(input.neededMilli, 'neededMilli', 0);
  if (input.offers.length === 0) throw new DomainError('NO_OFFERS', 'nothing to compare');

  const { feasible, rejected } = screenOffers(input);

  const prices = feasible.map((offer) => offer.unitPriceMinor);
  const cheapest = prices.length ? Math.min(...prices) : 0;

  const ranked = feasible
    .map((offer) => {
      const breakdownPpm = Object.freeze({
        cost: costFitPpm(offer, cheapest),
        lead: leadFitPpm(offer, input.hoursUntilStockout),
        reliability: reliabilityPpm(offer),
        freshness: freshnessFitPpm(offer, input.requiredFreshnessDays),
        moq: moqFitPpm(offer, input.neededMilli),
        terms: termsFitPpm(offer),
      });

      const scorePpm = Math.round(
        breakdownPpm.cost * SCORE_WEIGHTS.cost +
          breakdownPpm.lead * SCORE_WEIGHTS.lead +
          breakdownPpm.reliability * SCORE_WEIGHTS.reliability +
          breakdownPpm.freshness * SCORE_WEIGHTS.freshness +
          breakdownPpm.moq * SCORE_WEIGHTS.moq +
          breakdownPpm.terms * SCORE_WEIGHTS.terms,
      );

      const wanted = Math.min(input.neededMilli, offer.availableMilli);
      const feasibleQuantityMilli = Math.max(
        roundUpToPack(Math.max(wanted, offer.moqMilli), offer.packSizeMilli),
        offer.moqMilli,
      );

      return {
        offer,
        scorePpm,
        breakdownPpm,
        feasibleQuantityMilli,
        costMinor: Math.round((feasibleQuantityMilli * offer.unitPriceMinor) / 1000),
      };
    })
    .sort((left, right) => right.scorePpm - left.scorePpm);

  const assumptions = Object.freeze([
    'жёсткие ограничения применены до оценки: наличие, сорт, срок, партия, бюджет',
    `веса: цена ${SCORE_WEIGHTS.cost}, срок ${SCORE_WEIGHTS.lead}, надёжность ${SCORE_WEIGHTS.reliability}, свежесть ${SCORE_WEIGHTS.freshness}, партия ${SCORE_WEIGHTS.moq}, условия ${SCORE_WEIGHTS.terms}`,
    'веса — настройка продукта, а не измеренная зависимость',
    'надёжность сглажена по размеру выборки: три поставки не дают ста процентов',
    ...(input.isMock ? ['[MOCK] предложения поставщиков синтетические'] : []),
  ]);

  return {
    ranked: Object.freeze(ranked),
    rejected: Object.freeze(rejected),
    version: SUPPLIER_SCORE_VERSION,
    explanation: explanation({
      what: 'Оценка поставщика',
      value: ranked.length ? ranked[0].scorePpm : 0,
      unit: 'ppm',
      period: { start: new Date(Date.now() - 86_400_000).toISOString(), end: new Date().toISOString() },
      source: input.source,
      formula:
        '0,30 × цена + 0,25 × срок + 0,20 × надёжность + 0,15 × свежесть + 0,05 × партия + 0,05 × условия',
      confidence: ranked.length ? 0.8 : 0.2,
      assumptions,
      status: input.isMock ? 'simulated' : 'estimated',
      nextAction: ranked.length
        ? 'Проверить разложение оценки, прежде чем подтверждать заказ'
        : 'Ни один поставщик не проходит по жёстким ограничениям — смотрите список отклонённых',
      kind: 'forecast',
    }),
  };
}
