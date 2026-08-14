/**
 * Риск дефицита: остаток, переведённый во время, и сравнённый со сроком поставки.
 *
 * «Осталось 14 литров» — не риск, а число. Риск появляется, когда времени до
 * нуля меньше, чем времени до ближайшей поставки: разрыв между ними и есть то,
 * ради чего вообще нужен автопилот. Поэтому здесь считаются три вещи — часы до
 * дефицита, страховой запас и точка перезаказа — и каждая несёт с собой
 * формулу, источник и уверенность.
 *
 * Величины количества — в тысячных единицы, времени — в часах.
 */
import { DomainError, assertSafeInteger, explanation, roundDiv, type NumberExplanation } from './shared.ts';

export const RISK_MODEL_VERSION = 'stockout-clock-1';

/** Причина, по которой время до нуля не посчитано. */
export type NoClockReason = 'no_demand' | 'no_stock';

export type RiskLevel = 'critical' | 'warning' | 'watch' | 'none';

export interface ReorderPolicy {
  /** Срок поставки, который поставщик выдерживает в 80% случаев. */
  leadTimeP80Hours: number;
  /** Коэффициент уровня сервиса, тысячные доли: 1645 — это z = 1,645 (95%). */
  serviceLevelZMilli: number;
  /** Минимальный остаток, заданный владельцем вручную. Ноль — не задан. */
  minStockMilli: number;
}

export interface RiskInput {
  onHandMilli: number;
  /** Уже заказано и едет: уменьшает риск, но не остаток. */
  inboundMilli: number;
  dailyForecastMilli: number;
  sigmaDailyMilli: number;
  policy: ReorderPolicy;
  forecastConfidencePpm: number;
  /** Когда по позиции в последний раз было движение. */
  lastEventAt: string | null;
  now: string;
  source: string;
  isMock: boolean;
}

export interface RiskAssessment {
  /** Часы до нуля. `null`, когда считать не из чего — это не бесконечность. */
  timeToStockoutHours: number | null;
  noClockReason: NoClockReason | null;
  leadTimeP80Hours: number;
  /** Разрыв: на сколько часов поставка не успевает. Положительный — беда. */
  coverageGapHours: number | null;
  safetyStockMilli: number;
  reorderPointMilli: number;
  /** Сколько не хватает до точки перезаказа с учётом того, что уже едет. */
  shortfallMilli: number;
  atRisk: boolean;
  level: RiskLevel;
  reason: string;
  modelVersion: string;
  assumptions: readonly string[];
  explanations: Readonly<{
    timeToStockout: NumberExplanation | null;
    safetyStock: NumberExplanation;
    reorderPoint: NumberExplanation;
  }>;
}

/** Целочисленный квадратный корень с округлением — чтобы страховой запас был воспроизводим. */
function sqrtMilli(valueMilli: number): number {
  return Math.round(Math.sqrt(Math.max(0, valueMilli)) * 1000);
}

/**
 * Страховой запас = z × σ_дневное × √(срок поставки в днях).
 *
 * Корень из срока — потому что отклонения за несколько дней складываются не
 * линейно: два дня подряд «на треть больше обычного» случаются реже, чем один.
 */
export function safetyStockMilli(sigmaDailyMilli: number, leadTimeP80Hours: number, serviceLevelZMilli: number): number {
  assertSafeInteger(sigmaDailyMilli, 'sigmaDailyMilli', 0);
  assertSafeInteger(serviceLevelZMilli, 'serviceLevelZMilli', 0);
  if (leadTimeP80Hours < 0) throw new DomainError('INVALID_LEAD_TIME', 'lead time must not be negative');
  if (sigmaDailyMilli === 0 || leadTimeP80Hours === 0) return 0;
  const leadDaysMilli = roundDiv(leadTimeP80Hours * 1000, 24);
  const rootDaysMilli = sqrtMilli(leadDaysMilli / 1000);
  return roundDiv(roundDiv(sigmaDailyMilli * serviceLevelZMilli, 1000) * rootDaysMilli, 1000);
}

/** Точка перезаказа = дневной прогноз × срок поставки в днях + страховой запас. */
export function reorderPointMilli(dailyForecastMilli: number, leadTimeP80Hours: number, safetyMilli: number): number {
  assertSafeInteger(dailyForecastMilli, 'dailyForecastMilli', 0);
  assertSafeInteger(safetyMilli, 'safetyMilli', 0);
  const duringLead = roundDiv(dailyForecastMilli * leadTimeP80Hours, 24);
  return duringLead + safetyMilli;
}

/**
 * Часы до нуля = остаток / дневной расход.
 *
 * Возвращает `null`, когда расхода нет: бесконечность здесь была бы враньём,
 * а ноль — паникой. Интерфейс должен сказать «нет достаточного расхода».
 */
export function timeToStockoutHours(onHandMilli: number, dailyForecastMilli: number): number | null {
  assertSafeInteger(onHandMilli, 'onHandMilli');
  assertSafeInteger(dailyForecastMilli, 'dailyForecastMilli', 0);
  if (dailyForecastMilli <= 0) return null;
  if (onHandMilli <= 0) return 0;
  return roundDiv(onHandMilli * 24, dailyForecastMilli);
}

function levelFrom(gapHours: number | null, ttsHours: number | null, shortfallMilli: number): RiskLevel {
  if (gapHours !== null && gapHours > 0) return ttsHours !== null && ttsHours <= 24 ? 'critical' : 'warning';
  if (shortfallMilli > 0) return 'watch';
  return 'none';
}

/**
 * Собирает оценку риска по позиции.
 *
 * Риск объявляется, когда времени до нуля меньше срока поставки: заказывать уже
 * поздно, чтобы успеть без разрыва. Отдельно отмечается более мягкий случай —
 * остаток опустился ниже точки перезаказа, но поставка ещё успевает.
 */
export function assessStockoutRisk(input: RiskInput): RiskAssessment {
  assertSafeInteger(input.onHandMilli, 'onHandMilli');
  assertSafeInteger(input.inboundMilli, 'inboundMilli', 0);

  const tts = timeToStockoutHours(input.onHandMilli, input.dailyForecastMilli);
  const noClockReason: NoClockReason | null =
    tts === null ? 'no_demand' : input.onHandMilli <= 0 ? 'no_stock' : null;

  const safety = Math.max(
    safetyStockMilli(input.sigmaDailyMilli, input.policy.leadTimeP80Hours, input.policy.serviceLevelZMilli),
    input.policy.minStockMilli,
  );
  const reorderPoint = reorderPointMilli(input.dailyForecastMilli, input.policy.leadTimeP80Hours, safety);
  const available = input.onHandMilli + input.inboundMilli;
  const shortfall = Math.max(0, reorderPoint - available);

  const coverageGapHours = tts === null ? null : input.policy.leadTimeP80Hours - tts;
  const atRisk = coverageGapHours !== null && coverageGapHours > 0;
  const level = levelFrom(coverageGapHours, tts, shortfall);

  const reason = atRisk
    ? `Закончится через ${Math.max(0, Math.round((tts ?? 0) / 24 * 10) / 10)} дн., а поставка идёт ${Math.round(input.policy.leadTimeP80Hours / 24 * 10) / 10} дн.`
    : shortfall > 0
      ? 'Остаток ниже точки перезаказа, но ближайшая поставка ещё успевает'
      : noClockReason === 'no_demand'
        ? 'Нет достаточного расхода, чтобы посчитать время до нуля'
        : 'Запаса хватает до следующей поставки';

  const assumptions = Object.freeze([
    `срок поставки ${input.policy.leadTimeP80Hours} ч взят как значение, которое поставщик выдерживает в 80% случаев`,
    `уровень сервиса z = ${(input.policy.serviceLevelZMilli / 1000).toFixed(3)} — это настройка политики, а не измеренный факт`,
    input.inboundMilli > 0 ? `учтено ${input.inboundMilli} тысячных уже в пути` : 'ничего не едет по этой позиции',
    input.lastEventAt ? `последнее движение ${input.lastEventAt}` : 'движений по позиции ещё не было',
    ...(input.isMock ? ['[MOCK] данные демонстрационные'] : []),
  ]);

  const period = { start: input.lastEventAt ?? input.now, end: input.now };
  const safePeriod = Date.parse(period.start) >= Date.parse(period.end)
    ? { start: new Date(Date.parse(input.now) - 86_400_000).toISOString(), end: input.now }
    : period;
  const confidence = Math.min(0.92, Math.max(0.05, input.forecastConfidencePpm / 1_000_000));

  return {
    timeToStockoutHours: tts,
    noClockReason,
    leadTimeP80Hours: input.policy.leadTimeP80Hours,
    coverageGapHours,
    safetyStockMilli: safety,
    reorderPointMilli: reorderPoint,
    shortfallMilli: shortfall,
    atRisk,
    level,
    reason,
    modelVersion: RISK_MODEL_VERSION,
    assumptions,
    explanations: Object.freeze({
      timeToStockout: tts === null ? null : explanation({
        what: 'Время до дефицита',
        value: tts,
        unit: 'часов',
        period: safePeriod,
        source: input.source,
        formula: 'остаток / дневной прогноз расхода × 24',
        confidence,
        assumptions,
        status: input.isMock ? 'simulated' : 'estimated',
        nextAction: atRisk ? 'Открыть решение по этой позиции' : 'Наблюдать',
        kind: 'forecast',
      }),
      safetyStock: explanation({
        what: 'Страховой запас',
        value: safety,
        unit: 'ед.·1/1000',
        period: safePeriod,
        source: input.source,
        formula: 'z × σ дневного расхода × √(срок поставки в днях), но не ниже заданного минимума',
        confidence,
        assumptions,
        status: input.isMock ? 'simulated' : 'estimated',
        nextAction: 'Изменить уровень сервиса, если запас кажется избыточным',
        kind: 'forecast',
      }),
      reorderPoint: explanation({
        what: 'Точка перезаказа',
        value: reorderPoint,
        unit: 'ед.·1/1000',
        period: safePeriod,
        source: input.source,
        formula: 'дневной прогноз × срок поставки в днях + страховой запас',
        confidence,
        assumptions,
        status: input.isMock ? 'simulated' : 'estimated',
        nextAction: 'Заказывать, когда остаток опускается до этого значения',
        kind: 'forecast',
      }),
    }),
  };
}

/**
 * Очередь на сегодня: несколько позиций, а не весь склад.
 *
 * Сортировка ставит вперёд то, где раньше кончится и сильнее разрыв. Отсечка по
 * количеству — часть продукта, а не оптимизация: список из трёхсот строк владелец
 * не читает, и тогда не читает вообще ничего.
 */
export function rankRiskQueue<T extends { assessment: RiskAssessment }>(items: readonly T[], limit = 5): T[] {
  const weight: Record<RiskLevel, number> = { critical: 3, warning: 2, watch: 1, none: 0 };
  return [...items]
    .filter((item) => item.assessment.level !== 'none')
    .sort((left, right) => {
      const byLevel = weight[right.assessment.level] - weight[left.assessment.level];
      if (byLevel !== 0) return byLevel;
      const leftClock = left.assessment.timeToStockoutHours ?? Number.MAX_SAFE_INTEGER;
      const rightClock = right.assessment.timeToStockoutHours ?? Number.MAX_SAFE_INTEGER;
      if (leftClock !== rightClock) return leftClock - rightClock;
      return right.assessment.shortfallMilli - left.assessment.shortfallMilli;
    })
    .slice(0, limit);
}
