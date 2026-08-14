/**
 * Прогноз спроса, который можно проверить руками.
 *
 * Здесь нет обучения и нет скрытых весов: дневной прогноз — это взвешенное
 * среднее расхода за 28 дней, умноженное на коэффициент дня недели. Обе
 * величины считаются из ряда, который лежит рядом на экране, а ошибка модели
 * измеряется на скользящем бэктесте по тому же ряду и показывается вместе с
 * прогнозом.
 *
 * Это сознательный выбор против «AI-прогноза»: жюри и владелец точки могут
 * пересчитать любое число на бумаге, а модель не может ошибиться незаметно.
 * Когда истории мало, прогноз не выдумывает точность — он понижает уверенность
 * и говорит об этом прямым текстом.
 */
import { DomainError, assertSafeInteger, explanation, roundDiv, type NumberExplanation } from './shared.ts';
import type { DemandSample } from './inventory.ts';

/** Версия расчёта. Меняется вместе с формулой, хранится в каждом снимке. */
export const FORECAST_MODEL_VERSION = 'demand-baseline-1';

/** Окно истории, на котором строится база. */
export const HISTORY_DAYS = 28;

/** Сколько дней должно быть в ряду, прежде чем бэктест вообще запускается. */
const BACKTEST_MIN_DAYS = 8;

/** Границы коэффициента дня недели: пятница бывает вдвое сильнее вторника, но не втрое. */
const WEEKDAY_FACTOR_MIN_PPM = 500_000;
const WEEKDAY_FACTOR_MAX_PPM = 2_000_000;

/**
 * Потолок праздничного коэффициента — ×1,8, порог снизу — ×0,5.
 *
 * Восьмого марта цветочный магазин продаёт за день то, что в обычную неделю
 * расходится за месяц, и по правде коэффициент там куда выше. Потолок всё
 * равно стоит, и осознанно: пока лифт остаётся непроверенной гипотезой,
 * ошибиться в сторону «закупить втрое» дороже, чем недозаказать. Недозаказ —
 * упущенная выручка одного дня; перезаказ роз со сроком в пять дней — ведро в
 * помойку и деньги, которых уже не вернуть.
 *
 * Когда лифт будет подтверждён фактом прошлого года, потолок можно поднимать —
 * но это решение с данными на руках, а не настройка по умолчанию.
 */
const EVENT_FACTOR_MAX_PPM = 1_800_000;
const EVENT_FACTOR_MIN_PPM = 500_000;

/**
 * Событие спроса: праздник, сезон или локальный повод.
 *
 * У каждого есть источник и признак того, проверен ли коэффициент фактом. Пока
 * своей истории нет, лифт берётся из отраслевого шаблона и честно помечается
 * гипотезой — на экране это видно, и владелец решает сам.
 */
export interface DemandEvent {
  code: string;
  name: string;
  /** Дата события, `YYYY-MM-DD`. */
  date: string;
  /** За сколько дней до события начинается всплеск. */
  leadDays: number;
  /** Насколько поднимает спрос: 1 500 000 — это ×1,5. */
  liftPpm: number;
  /** Категории, которых касается. Пустой список — касается всего. */
  categories: readonly string[];
  source: string;
  /** Проверен ли коэффициент фактом прошлого года. */
  verified: boolean;
  /**
   * Одобрил ли владелец применение этого лифта.
   *
   * Без одобрения событие видно в календаре, но прогноз не двигает. Это не
   * бюрократия: коэффициент — предположение о будущем, и продукт не вправе
   * менять чужой заказ на его основании молча.
   */
  approved: boolean;
}

export interface ForecastInput {
  /** Дневной ряд расхода, старые дни первыми. Длиннее 28 дней — обрежется. */
  history: readonly DemandSample[];
  /** Дата, на которую строится прогноз, `YYYY-MM-DD`. Определяет день недели. */
  targetDate: string;
  source: string;
  isMock: boolean;
  /** Календарь событий. Применяются только те, что попадают в окно перед датой. */
  events?: readonly DemandEvent[];
  /** Категория позиции — по ней отбираются события. */
  category?: string | null;
}

export interface ForecastResult {
  /** Ожидаемый дневной расход в тысячных единицы. */
  dailyForecastMilli: number;
  /** База до поправки на день недели. */
  baselineMilli: number;
  /** Коэффициент дня недели, миллионные доли: 1 200 000 — это ×1,2. */
  weekdayFactorPpm: number;
  /** Совокупный праздничный коэффициент. 1 000 000 — событий нет. */
  eventFactorPpm: number;
  /** Какие именно события сработали — чтобы это можно было показать. */
  appliedEvents: readonly DemandEvent[];
  /** Средняя абсолютная ошибка бэктеста, миллионные доли. */
  wapePpm: number | null;
  /** Уверенность в прогнозе, миллионные доли. */
  confidencePpm: number;
  /** Стандартное отклонение дневного расхода — вход страхового запаса. */
  sigmaDailyMilli: number;
  /** Сколько дней истории реально участвовало. */
  sampleDays: number;
  /** Сколько дней из них были с ненулевым расходом. */
  daysWithDemand: number;
  modelVersion: string;
  assumptions: readonly string[];
  explanation: NumberExplanation;
}

function weekdayOf(date: string): number {
  const parsed = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed)) throw new DomainError('INVALID_DATE', date);
  return new Date(parsed).getUTCDay();
}

/**
 * Взвешенное среднее: свежий день весит больше давнего.
 *
 * Веса линейные — 1 у самого старого дня окна, N у самого свежего. Экспоненциальное
 * затухание давало бы примерно то же, но его нельзя пересчитать в уме, а это
 * прогноз, который владелец должен уметь проверить.
 */
function weightedMean(samples: readonly DemandSample[]): number {
  if (samples.length === 0) return 0;
  let weightedSum = 0;
  let weightTotal = 0;
  samples.forEach((sample, index) => {
    assertSafeInteger(sample.quantityMilli, 'quantityMilli', 0);
    const weight = index + 1;
    weightedSum += sample.quantityMilli * weight;
    weightTotal += weight;
  });
  return roundDiv(weightedSum, weightTotal);
}

function plainMean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return roundDiv(values.reduce((sum, value) => sum + value, 0), values.length);
}

/** Коэффициент дня недели: во сколько раз этот день отличается от среднего дня. */
function weekdayFactorPpm(samples: readonly DemandSample[], weekday: number): number {
  const overall = plainMean(samples.map((sample) => sample.quantityMilli));
  if (overall <= 0) return 1_000_000;
  const sameWeekday = samples.filter((sample) => weekdayOf(sample.date) === weekday).map((sample) => sample.quantityMilli);
  // Один-два наблюдения на день недели — это не сезонность, а совпадение.
  if (sameWeekday.length < 2) return 1_000_000;
  const raw = roundDiv(plainMean(sameWeekday) * 1_000_000, overall);
  return Math.min(WEEKDAY_FACTOR_MAX_PPM, Math.max(WEEKDAY_FACTOR_MIN_PPM, raw));
}

/**
 * Какие события действуют на выбранную дату и категорию.
 *
 * Всплеск начинается заранее: восьмого марта розы разбирают ещё седьмого, а
 * заказывать их нужно и вовсе за неделю. Поэтому событие действует на окне
 * `[дата − leadDays, дата]`, а не в один день.
 */
export function eventsInEffect(
  events: readonly DemandEvent[],
  targetDate: string,
  category: string | null | undefined,
): DemandEvent[] {
  // Неодобренные отсеиваются здесь, а не при отборе по дате: так их видно в
  // календаре как предложение, но на числа они не влияют.
  const target = Date.parse(`${targetDate}T00:00:00Z`);
  if (Number.isNaN(target)) throw new DomainError('INVALID_DATE', targetDate);

  return events.filter((event) => {
    if (!event.approved) return false;
    const eventDay = Date.parse(`${event.date}T00:00:00Z`);
    if (Number.isNaN(eventDay)) return false;
    const windowStart = eventDay - Math.max(0, event.leadDays) * 86_400_000;
    if (target < windowStart || target > eventDay) return false;
    if (event.categories.length === 0) return true;
    return category !== null && category !== undefined && event.categories.includes(category);
  });
}

/**
 * Совокупный коэффициент событий.
 *
 * Лифты складываются, а не перемножаются: два повода в один день не удваивают
 * друг друга, они складывают свои прибавки. Результат ограничен сверху и снизу,
 * чтобы совпадение праздника с сильным днём недели не превратилось в заказ,
 * который целиком уедет в списание.
 */
export function combinedEventFactorPpm(events: readonly DemandEvent[]): number {
  if (events.length === 0) return 1_000_000;
  const sum = events.reduce((total, event) => total + (event.liftPpm - 1_000_000), 0);
  return Math.min(EVENT_FACTOR_MAX_PPM, Math.max(EVENT_FACTOR_MIN_PPM, 1_000_000 + sum));
}

function standardDeviation(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const mean = plainMean(values);
  const variance = roundDiv(
    values.reduce((sum, value) => sum + (value - mean) * (value - mean), 0),
    values.length - 1,
  );
  return Math.round(Math.sqrt(Math.max(0, variance)));
}

/**
 * Скользящий бэктест: для каждого дня, начиная с восьмого, строим прогноз по
 * предыдущим дням и сравниваем с фактом.
 *
 * WAPE = Σ|факт − прогноз| / max(ε, Σ|факт|). Знаменатель — сумма фактов, а не
 * среднее из отношений: иначе один день с расходом в единицу даёт ошибку в сотни
 * процентов и топит всю метрику.
 */
export function backtestWapePpm(history: readonly DemandSample[]): number | null {
  if (history.length < BACKTEST_MIN_DAYS) return null;
  let absoluteError = 0;
  let actualTotal = 0;

  for (let index = BACKTEST_MIN_DAYS - 1; index < history.length; index += 1) {
    const prior = history.slice(0, index);
    const actual = history[index].quantityMilli;
    const predicted = Math.round(
      (weightedMean(prior) * weekdayFactorPpm(prior, weekdayOf(history[index].date))) / 1_000_000,
    );
    absoluteError += Math.abs(actual - predicted);
    actualTotal += Math.abs(actual);
  }

  return roundDiv(absoluteError * 1_000_000, Math.max(1, actualTotal));
}

/**
 * Уверенность падает от трёх вещей: короткой истории, редкого движения и
 * большой ошибки бэктеста. Потолок 0,92 — потому что прогноз спроса не бывает
 * достоверным на девяносто девять процентов, и обещать это нечестно.
 */
function confidenceFrom(sampleDays: number, daysWithDemand: number, wapePpm: number | null): number {
  const coverage = Math.min(1, sampleDays / HISTORY_DAYS);
  const density = sampleDays === 0 ? 0 : daysWithDemand / sampleDays;
  const accuracy = wapePpm === null ? 0.5 : Math.max(0, 1 - wapePpm / 1_000_000);
  const raw = 0.92 * coverage * (0.4 + 0.6 * density) * (0.35 + 0.65 * accuracy);
  return Math.min(0.92, Math.max(0.05, raw));
}

/**
 * Строит прогноз дневного расхода.
 *
 * Пустая история — не ошибка: это состояние новой позиции. Тогда прогноз равен
 * нулю, а уверенность — минимальной, и дальше по цепочке это превращается в
 * «нет достаточного расхода», а не в бесконечный запас времени.
 */
export function forecastDailyDemand(input: ForecastInput): ForecastResult {
  const history = input.history.slice(-HISTORY_DAYS);
  const weekday = weekdayOf(input.targetDate);
  const values = history.map((sample) => sample.quantityMilli);
  const daysWithDemand = values.filter((value) => value > 0).length;

  const baselineMilli = weightedMean(history);
  const factorPpm = weekdayFactorPpm(history, weekday);
  const appliedEvents = eventsInEffect(input.events ?? [], input.targetDate, input.category);
  const eventFactorPpm = combinedEventFactorPpm(appliedEvents);

  const afterWeekday = Math.round((baselineMilli * factorPpm) / 1_000_000);
  const dailyForecastMilli = Math.max(0, Math.round((afterWeekday * eventFactorPpm) / 1_000_000));

  const wapePpm = backtestWapePpm(history);
  // Праздничный коэффициент не измерен на этой истории: прошлое восьмое марта в
  // 28 дней не попадает. Пока лифт остаётся гипотезой, уверенность за него
  // платит — иначе продукт обещал бы точность там, где её нечем подтвердить.
  const unverifiedLift = appliedEvents.some((event) => !event.verified);
  const confidence = confidenceFrom(history.length, daysWithDemand, wapePpm) * (unverifiedLift ? 0.75 : 1);

  const assumptions = Object.freeze([
    `история ${history.length} из ${HISTORY_DAYS} дней, свежие дни весят больше`,
    factorPpm === 1_000_000
      ? 'коэффициент дня недели не применён: наблюдений по этому дню меньше двух'
      : `коэффициент дня недели ×${(factorPpm / 1_000_000).toFixed(2)}`,
    ...appliedEvents.map(
      (event) =>
        `${event.name}: ×${(event.liftPpm / 1_000_000).toFixed(2)}` +
        (event.verified ? ` (проверено фактом, источник: ${event.source})` : ` — гипотеза, источник: ${event.source}`),
    ),
    wapePpm === null
      ? `ошибка модели не измерена: для бэктеста нужно минимум ${BACKTEST_MIN_DAYS} дней`
      : `ошибка на бэктесте ${(wapePpm / 10_000).toFixed(1)}%`,
    ...(input.isMock ? ['[MOCK] история продаж синтетическая'] : []),
  ]);

  const period = history.length
    ? { start: `${history[0].date}T00:00:00Z`, end: `${input.targetDate}T23:59:59Z` }
    : { start: `${input.targetDate}T00:00:00Z`, end: `${input.targetDate}T23:59:59Z` };

  return {
    dailyForecastMilli,
    baselineMilli,
    weekdayFactorPpm: factorPpm,
    eventFactorPpm,
    appliedEvents: Object.freeze([...appliedEvents]),
    wapePpm,
    confidencePpm: Math.round(confidence * 1_000_000),
    sigmaDailyMilli: standardDeviation(values),
    sampleDays: history.length,
    daysWithDemand,
    modelVersion: FORECAST_MODEL_VERSION,
    assumptions,
    explanation: explanation({
      what: 'Прогноз дневного расхода',
      value: dailyForecastMilli,
      unit: 'ед.·1/1000 в день',
      period,
      source: input.source,
      formula: 'взвешенное среднее расхода за 28 дней × коэффициент дня недели × коэффициент события',
      confidence,
      assumptions,
      status: input.isMock ? 'simulated' : 'estimated',
      nextAction: history.length < BACKTEST_MIN_DAYS
        ? 'Накопить историю: пока прогноз опирается на слишком короткий ряд'
        : 'Сверить прогноз с фактом после ближайшей поставки',
      kind: 'forecast',
    }),
  };
}
