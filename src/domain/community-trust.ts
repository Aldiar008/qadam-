/**
 * Общий рейтинг поставщика: сигнал до первого заказа.
 *
 * Новый цветочный магазин узнаёт, что база срывает сроки, только после того,
 * как она сорвала их ему — а перед восьмым марта такая наука стоит сезона.
 * Обезличенная статистика по всем магазинам даёт этот сигнал заранее.
 *
 * Цена такого рейтинга — доверие, и оно теряется мгновенно. Поэтому здесь три
 * жёстких правила: до порога выборки ничего не публикуется; малая выборка
 * притягивается к средней по рынку; в ответе нет ни одного идентификатора
 * чужого заведения или заказа.
 */
import { DomainError, explanation, roundDiv, type NumberExplanation } from './shared.ts';

export const COMMUNITY_TRUST_VERSION = 'community-trust-1';

/** Меньше двадцати заказов — это не статистика, а совпадение. */
export const MIN_ORDERS = 20;

/**
 * Меньше десяти независимых магазинов — тоже.
 *
 * Порог по заказам сам по себе не спасает: один магазин с сотней поставок
 * нарисовал бы «рынку» любую картину, а поставщику — репутацию по своей
 * единственной истории.
 */
export const MIN_TENANTS = 10;

/** Сила притяжения к среднему. Двадцать — вес полной выборки. */
const SMOOTHING_ALPHA = 20;

/** Априорная надёжность рынка: к ней тянется поставщик с короткой историей. */
const PRIOR_RELIABILITY_PPM = 800_000;

export type TrustCategory = 'roses' | 'tulips' | 'greenery' | 'packaging';

export interface CommunityAggregate {
  canonicalSupplier: string;
  region: string;
  category: TrustCategory | string;
  windowDays: number;
  nOrders: number;
  nTenants: number;
  deliveryReliabilityPpm: number;
  fillRatePpm: number;
  freshnessScorePpm: number;
}

export type TrustVisibility = 'published' | 'below_threshold';

export interface CommunityTrust {
  visibility: TrustVisibility;
  /** Сглаженная надёжность. `null`, пока выборки не хватает. */
  reliabilityPpm: number | null;
  fillRatePpm: number | null;
  freshnessScorePpm: number | null;
  nOrders: number;
  nTenants: number;
  /** Чего не хватает до публикации — так порог перестаёт быть загадкой. */
  missing: { orders: number; tenants: number };
  version: string;
  assumptions: readonly string[];
  explanation: NumberExplanation;
}

/**
 * Байесовское сглаживание: `(успехи + α × априор) / (n + α)`.
 *
 * Без него поставщик с тремя удачными поставками получал бы сто процентов и
 * обыгрывал того, кто возит два года с девяноста четырьмя. Сглаживание не
 * «занижает» — оно отражает то, что мы про новичка попросту мало знаем.
 */
export function smoothPpm(observedPpm: number, sampleSize: number, priorPpm = PRIOR_RELIABILITY_PPM): number {
  if (sampleSize < 0) throw new DomainError('INVALID_SAMPLE', 'sample size must not be negative');
  const successes = observedPpm * sampleSize;
  const prior = priorPpm * SMOOTHING_ALPHA;
  return roundDiv(successes + prior, sampleSize + SMOOTHING_ALPHA);
}

/**
 * Готовит рейтинг к показу.
 *
 * Ниже порога возвращается не «ноль» и не «нет данных», а прямое объяснение,
 * сколько ещё нужно: скрытый рейтинг без причины читается как поломка.
 */
export function readCommunityTrust(aggregate: CommunityAggregate, isMock = true): CommunityTrust {
  const enough = aggregate.nOrders >= MIN_ORDERS && aggregate.nTenants >= MIN_TENANTS;

  const missing = {
    orders: Math.max(0, MIN_ORDERS - aggregate.nOrders),
    tenants: Math.max(0, MIN_TENANTS - aggregate.nTenants),
  };

  const assumptions = Object.freeze([
    `публикуется от ${MIN_ORDERS} поставок и ${MIN_TENANTS} независимых магазинов`,
    'малая выборка сглажена к средней по рынку — три удачные поставки не дают ста процентов',
    'в ответе нет идентификаторов заведений, заказов и комментариев',
    `скользящее окно ${aggregate.windowDays} дней, категория «${aggregate.category}», регион ${aggregate.region}`,
    ...(isMock ? ['[MOCK AGGREGATE] считается по синтетическим магазинам стенда'] : []),
  ]);

  const reliability = enough ? smoothPpm(aggregate.deliveryReliabilityPpm, aggregate.nOrders) : null;

  return {
    visibility: enough ? 'published' : 'below_threshold',
    reliabilityPpm: reliability,
    fillRatePpm: enough ? smoothPpm(aggregate.fillRatePpm, aggregate.nOrders) : null,
    freshnessScorePpm: enough ? smoothPpm(aggregate.freshnessScorePpm, aggregate.nOrders, 700_000) : null,
    nOrders: aggregate.nOrders,
    nTenants: aggregate.nTenants,
    missing,
    version: COMMUNITY_TRUST_VERSION,
    assumptions,
    explanation: explanation({
      what: 'Общая надёжность поставщика',
      value: reliability ?? 0,
      unit: 'ppm',
      period: {
        start: new Date(Date.now() - aggregate.windowDays * 86_400_000).toISOString(),
        end: new Date().toISOString(),
      },
      source: 'community_supplier_metrics',
      formula: '(успехи + α × априор) / (n + α), α = 20',
      confidence: enough ? Math.min(0.85, 0.4 + aggregate.nOrders / 200) : 0.2,
      assumptions,
      status: isMock ? 'simulated' : 'observed',
      nextAction: enough
        ? 'Сравнить с собственным опытом: личный рейтинг и общий не смешиваются'
        : `Пока недостаточно данных: не хватает ${missing.orders} поставок и ${missing.tenants} магазинов`,
      kind: isMock ? 'mock_actual' : 'influenced',
    }),
  };
}

/** Категория позиции для общего рейтинга — по названию категории магазина. */
export function trustCategoryFor(category: string | null): TrustCategory | null {
  if (!category) return null;
  const value = category.toLowerCase();
  if (value.includes('роз')) return 'roses';
  if (value.includes('тюльпан')) return 'tulips';
  if (value.includes('зелен')) return 'greenery';
  if (value.includes('упаков')) return 'packaging';
  return null;
}
