/**
 * Остаток как след событий, а не как редактируемое поле.
 *
 * Складская программа, где остаток можно переписать руками, отвечает на вопрос
 * «сколько сейчас» и не отвечает ни на один следующий: кто изменил, когда,
 * почему разошлось с приёмкой. Здесь остаток вообще нельзя присвоить — он
 * складывается из приёмок, расходов, списаний и перемещений, и каждое из них
 * помнит автора, время, источник и ключ идемпотентности.
 *
 * Количества хранятся в тысячных долях единицы (`quantityMilli`): 14 литров —
 * это 14 000. Целые числа выбраны по той же причине, что и минорные единицы у
 * денег — чтобы 0.1 + 0.2 не превращалось в 0.30000000000000004 при сложении
 * трёх сотен событий за месяц.
 */
import { DomainError, assertSafeInteger, explanation, roundDiv, type NumberExplanation } from './shared.ts';

export const INVENTORY_EVENT_TYPES = ['receive', 'consume', 'adjust', 'waste', 'transfer_in', 'transfer_out'] as const;
export type InventoryEventType = (typeof INVENTORY_EVENT_TYPES)[number];

/**
 * Куда событие двигает остаток. `adjust` несёт знак в самой величине.
 *
 * `waste` отделено от `consume` намеренно, хотя оба уменьшают остаток. Проданный
 * стебель и выброшенный стебель — разные факты: первый учит прогноз спросу,
 * второй говорит, что закупили лишнего. Смешай их — и модель выучит списания
 * как продажи, а магазин будет заказывать ровно столько, сколько выбрасывает.
 */
const DIRECTION: Readonly<Record<InventoryEventType, 1 | -1 | 0>> = {
  receive: 1,
  consume: -1,
  adjust: 0,
  waste: -1,
  transfer_in: 1,
  transfer_out: -1,
};

export interface InventoryEvent {
  /** Ключ, по которому повтор того же события распознаётся и не применяется дважды. */
  idempotencyKey: string;
  type: InventoryEventType;
  /**
   * Величина в тысячных единицы. Для `receive`, `consume`, `waste`,
   * `transfer_*` — неотрицательная: направление задаёт тип. Для `adjust` —
   * знаковая дельта.
   */
  quantityMilli: number;
  occurredAt: string;
  /** Откуда пришло: `manual`, `messenger`, `receiving`, `seed`. */
  source: string;
  actorId: string;
  /**
   * Разрешает результату уйти ниже нуля. Осмысленно только для `adjust`:
   * инвентаризация может обнаружить недостачу больше учётного остатка.
   */
  allowNegative?: boolean;
  /**
   * Когда партия теряет товарный вид. Заполняется у приёмки: у роз это пять-семь
   * дней, у зелени два, у упаковки — никогда.
   */
  expiresAt?: string | null;
  /** Причина списания: `withered`, `damaged`, `unsold`. Только для `waste`. */
  wasteReason?: string | null;
}

export interface LedgerState {
  onHandMilli: number;
  /** Ключи применённых событий — по ним отсеиваются повторы. */
  appliedKeys: readonly string[];
  lastEventAt: string | null;
}

export interface LedgerResult extends LedgerState {
  /** Сколько событий реально изменили остаток. */
  appliedCount: number;
  /** Сколько отброшено как повтор — это не ошибка, а нормальный исход. */
  duplicateCount: number;
}

export const EMPTY_LEDGER: LedgerState = Object.freeze({
  onHandMilli: 0,
  appliedKeys: Object.freeze([]),
  lastEventAt: null,
});

function assertEvent(event: InventoryEvent): void {
  if (!event.idempotencyKey.trim()) throw new DomainError('MISSING_IDEMPOTENCY_KEY', 'inventory event requires an idempotency key');
  if (!INVENTORY_EVENT_TYPES.includes(event.type)) throw new DomainError('UNKNOWN_EVENT_TYPE', `unknown inventory event type: ${event.type}`);
  assertSafeInteger(event.quantityMilli, 'quantityMilli');
  if (event.type !== 'adjust' && event.quantityMilli < 0) {
    throw new DomainError('NEGATIVE_QUANTITY', `${event.type} carries its direction in the type; quantity must not be negative`);
  }
  if (event.type === 'adjust' && event.quantityMilli === 0) {
    throw new DomainError('EMPTY_ADJUSTMENT', 'an adjustment of zero changes nothing and hides its own reason');
  }
  if (!event.source.trim()) throw new DomainError('MISSING_SOURCE', 'inventory event requires a source');
  if (Number.isNaN(Date.parse(event.occurredAt))) throw new DomainError('INVALID_TIMESTAMP', event.occurredAt);
}

/** Насколько событие двигает остаток — со знаком. */
export function eventDeltaMilli(event: InventoryEvent): number {
  assertEvent(event);
  const direction = DIRECTION[event.type];
  return direction === 0 ? event.quantityMilli : event.quantityMilli * direction;
}

/**
 * Применяет события к состоянию журнала.
 *
 * События с уже применённым ключом пропускаются молча: повторная отправка формы
 * или повторная доставка вебхука не должны списывать товар второй раз. Порядок
 * применения — тот, в котором события переданы; сортировать их по времени должен
 * вызывающий, потому что журнал допускает задним числом внесённую приёмку.
 */
export function applyInventoryEvents(events: readonly InventoryEvent[], opening: LedgerState = EMPTY_LEDGER): LedgerResult {
  assertSafeInteger(opening.onHandMilli, 'opening.onHandMilli');
  const seen = new Set(opening.appliedKeys);
  let onHand = opening.onHandMilli;
  let lastEventAt = opening.lastEventAt;
  let applied = 0;
  let duplicates = 0;

  for (const event of events) {
    assertEvent(event);
    if (seen.has(event.idempotencyKey)) { duplicates += 1; continue; }

    const next = onHand + eventDeltaMilli(event);
    if (next < 0 && !(event.type === 'adjust' && event.allowNegative === true)) {
      throw new DomainError(
        'NEGATIVE_BALANCE',
        `event ${event.idempotencyKey} would leave ${next} milli units on hand; only an explicit adjustment may do that`,
      );
    }

    onHand = next;
    seen.add(event.idempotencyKey);
    applied += 1;
    if (!lastEventAt || Date.parse(event.occurredAt) > Date.parse(lastEventAt)) lastEventAt = event.occurredAt;
  }

  return {
    onHandMilli: onHand,
    appliedKeys: Object.freeze([...seen]),
    lastEventAt,
    appliedCount: applied,
    duplicateCount: duplicates,
  };
}

export interface DemandSample {
  /** Календарная дата в часовом поясе заведения, `YYYY-MM-DD`. */
  date: string;
  quantityMilli: number;
}

/**
 * Сворачивает расход в дневной ряд — вход прогноза.
 *
 * Считается только `consume`: приёмка и перемещение между точками не являются
 * спросом, а корректировка чаще всего исправляет учёт, а не отражает продажу.
 * Дни без расхода попадают в ряд нулями — иначе закрытый понедельник выглядел
 * бы как отсутствующее наблюдение и завышал среднее.
 */
export function dailyDemandFromEvents(
  events: readonly InventoryEvent[],
  window: { start: string; end: string; timezone: string },
): DemandSample[] {
  const start = Date.parse(window.start);
  const end = Date.parse(window.end);
  if (!(start < end)) throw new DomainError('INVALID_WINDOW', 'demand window end must be after start');

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: window.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const totals = new Map<string, number>();
  for (let day = start; day < end; day += 86_400_000) totals.set(formatter.format(new Date(day)), 0);

  for (const event of events) {
    if (event.type !== 'consume') continue;
    assertEvent(event);
    const time = Date.parse(event.occurredAt);
    if (time < start || time >= end) continue;
    const key = formatter.format(new Date(time));
    if (!totals.has(key)) continue;
    totals.set(key, (totals.get(key) ?? 0) + event.quantityMilli);
  }

  return [...totals.entries()]
    .sort((left, right) => (left[0] < right[0] ? -1 : 1))
    .map(([date, quantityMilli]) => ({ date, quantityMilli }));
}

/** Округляет количество вверх до целого числа упаковок — заказать 2.3 коробки нельзя. */
export function roundUpToPack(quantityMilli: number, packSizeMilli: number): number {
  assertSafeInteger(quantityMilli, 'quantityMilli', 0);
  assertSafeInteger(packSizeMilli, 'packSizeMilli', 1);
  return Math.ceil(quantityMilli / packSizeMilli) * packSizeMilli;
}

/** Человекочитаемое количество: 14 500 тысячных → «14,5». */
export function formatQuantity(quantityMilli: number, unit: string): string {
  const value = quantityMilli / 1000;
  const text = Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  return `${text.replace('.', ',')} ${unit}`;
}

/** Пояснение к остатку: откуда он взялся и на когда актуален. */
export function explainBalance(input: {
  state: LedgerResult;
  unit: string;
  period: { start: string; end: string };
  source: string;
  isMock: boolean;
}): NumberExplanation {
  return explanation({
    what: 'Остаток на руках',
    value: input.state.onHandMilli,
    unit: `${input.unit}·1/1000`,
    period: input.period,
    source: input.source,
    formula: 'сумма приёмок, расходов, корректировок и перемещений по журналу событий',
    confidence: input.state.lastEventAt ? 0.9 : 0.2,
    assumptions: Object.freeze([
      'остаток не редактируется напрямую — только событием',
      'повтор события с тем же ключом не применяется дважды',
      ...(input.isMock ? ['[MOCK] стартовые остатки синтетические'] : []),
    ]),
    status: input.isMock ? 'simulated' : 'observed',
    nextAction: input.state.lastEventAt ? 'Сверить с полкой при следующей приёмке' : 'Внести первое движение по позиции',
    kind: input.isMock ? 'mock_actual' : 'verified_fact',
  });
}

/** Доля дней окна, в которые по позиции вообще было движение. Вход для оценки свежести. */
export function dataFreshnessPpm(samples: readonly DemandSample[]): number {
  if (samples.length === 0) return 0;
  const withMovement = samples.filter((sample) => sample.quantityMilli > 0).length;
  return roundDiv(withMovement * 1_000_000, samples.length);
}
