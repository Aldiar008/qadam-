/**
 * Что видно по чекам одного гостя.
 *
 * Карточка клиента показывала четыре числа — визиты, сумма, средний чек, дата —
 * и «AI-досье», которое пересказывало те же четыре числа другими словами.
 * Полезного вывода в этом нет: владелец и так их видит.
 *
 * Здесь считается то, чего на экране не было: что человек берёт чаще всего, в
 * какой категории он живёт, что берёт вместе, что перестал брать, куда сдвинулся
 * вкус, с каким ритмом он ходит и какова вероятность, что он вернётся. Всё это
 * — арифметика по строкам чеков, а не мнение модели. Модель потом складывает из
 * этих фактов фразу; числа приходят отсюда.
 *
 * Модуль намеренно чистый: ни базы, ни времени, ни случайности. `now`
 * передаётся аргументом, поэтому тест на одних и тех же данных даёт один и тот
 * же ответ в любой день.
 */

export type MechanicHint =
  | '2_plus_1' | 'happy_hours' | 'gift_with_threshold' | 'return_coupon'
  | 'bonus_points' | 'percentage_discount' | 'fixed_discount';

export interface PurchaseLine {
  transactionId: string;
  name: string;
  category: string | null;
  quantity: number;
  totalMinor: number;
  occurredAt: string;
}

export interface CatalogEntry {
  name: string;
  category: string | null;
  priceMinor: number;
  costMinor: number;
}

/**
 * Наблюдение из базы заведения: сколько дней прошло и вернулся ли гость.
 *
 * `returned: false` — это не «не вернётся», а «на момент подсчёта ещё не
 * вернулся». Без таких наблюдений оценка получилась бы завышенной: те, кто
 * ушёл навсегда, не создают ни одного промежутка между визитами и просто
 * выпадают из выборки.
 */
export interface CohortObservation {
  days: number;
  returned: boolean;
}

export interface InsightsInput {
  lines: readonly PurchaseLine[];
  /** Момент каждой покупки: строк может не быть, а покупки — быть. */
  receipts: readonly string[];
  catalog: readonly CatalogEntry[];
  cohort: readonly CohortObservation[];
  now: number;
  horizonDays?: number;
}

export interface FavouriteItem {
  name: string;
  category: string | null;
  orders: number;
  shareBps: number;
  lastAt: string;
}

export interface CategoryShare {
  category: string;
  orders: number;
  shareBps: number;
}

export interface PairInsight {
  a: string;
  b: string;
  together: number;
}

export interface DroppedItem {
  name: string;
  ordersBefore: number;
  lastAt: string;
  daysSince: number;
}

export interface TasteShift {
  category: string;
  earlierBps: number;
  recentBps: number;
  changeBps: number;
}

export interface CadenceInsight {
  medianDays: number;
  daysSinceLast: number;
  /** Насколько он опаздывает против собственного ритма. Ноль — идёт по расписанию. */
  overdueDays: number;
}

export interface ReturnEstimate {
  probabilityBps: number;
  horizonDays: number;
  sampleAtRisk: number;
  confidence: 'low' | 'medium' | 'high';
}

export interface Suggestion {
  itemName: string;
  reason: string;
  mechanic: MechanicHint;
}

export interface CustomerInsights {
  linesCounted: number;
  receiptsCounted: number;
  favourites: readonly FavouriteItem[];
  categories: readonly CategoryShare[];
  pairs: readonly PairInsight[];
  dropped: readonly DroppedItem[];
  shift: readonly TasteShift[];
  cadence: CadenceInsight | null;
  returning: ReturnEstimate | null;
  suggestion: Suggestion | null;
  /** Чего не хватило, чтобы сказать больше. Пустой список — сказано всё. */
  gaps: readonly string[];
}

const DAY = 86_400_000;
const bps = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 10_000) : 0);
const daysBetween = (fromIso: string, to: number) => Math.max(0, Math.round((to - new Date(fromIso).getTime()) / DAY));

function median(values: readonly number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

/**
 * Оценка Каплана — Мейера по промежуткам между визитами.
 *
 * Наивный ответ «сколько людей из молчавших столько же вернулись» завышает
 * вероятность, потому что считает только тех, кто вернулся. Здесь наблюдение
 * «молчит N дней и пока не вернулся» тоже участвует — как цензурированное, — и
 * ответ получается тот, который можно защитить перед владельцем.
 *
 * Возвращает `null`, когда столько молчавших в базе просто нет: пустая оценка
 * честнее придуманного процента.
 */
export function estimateReturn(
  cohort: readonly CohortObservation[],
  silentDays: number,
  horizonDays: number,
): ReturnEstimate | null {
  const observations = cohort.filter((item) => Number.isFinite(item.days) && item.days >= 0);
  if (observations.length < 8) return null;

  const eventTimes = [...new Set(observations.filter((item) => item.returned).map((item) => item.days))].sort((a, b) => a - b);
  const survivalAt = (time: number) => {
    let survival = 1;
    for (const eventTime of eventTimes) {
      if (eventTime > time) break;
      const atRisk = observations.filter((item) => item.days >= eventTime).length;
      if (!atRisk) break;
      const events = observations.filter((item) => item.returned && item.days === eventTime).length;
      survival *= 1 - events / atRisk;
    }
    return survival;
  };

  const sampleAtRisk = observations.filter((item) => item.days >= silentDays).length;
  if (sampleAtRisk < 5) return null;

  const base = survivalAt(silentDays);
  if (base <= 0) return null;
  const ahead = survivalAt(silentDays + horizonDays);
  const probability = Math.min(1, Math.max(0, 1 - ahead / base));

  return {
    probabilityBps: Math.round(probability * 10_000),
    horizonDays,
    sampleAtRisk,
    confidence: sampleAtRisk >= 60 ? 'high' : sampleAtRisk >= 25 ? 'medium' : 'low',
  };
}

/**
 * Делит покупки на «раньше» и «сейчас» по числу визитов, а не по календарю.
 *
 * Календарное окно врёт в обе стороны: тот, кто ходит раз в неделю, в «последние
 * 30 дней» умещает четыре визита, а тот, кто ходит раз в день, — тридцать.
 * «Последняя треть визитов» одинаково честна для обоих.
 */
function splitByVisits(receipts: readonly string[]): { recentFrom: number; recentCount: number } | null {
  const times = [...receipts].map((iso) => new Date(iso).getTime()).filter(Number.isFinite).sort((a, b) => a - b);
  if (times.length < 4) return null;
  const recentCount = Math.max(2, Math.round(times.length / 3));
  return { recentFrom: times[times.length - recentCount], recentCount };
}

export function analyseCustomer(input: InsightsInput): CustomerInsights {
  const horizonDays = input.horizonDays ?? 30;
  const lines = input.lines.filter((line) => line.name.trim().length > 0);
  const receipts = [...new Set(input.receipts)];
  const gaps: string[] = [];

  const receiptTimes = receipts.map((iso) => new Date(iso).getTime()).filter(Number.isFinite).sort((a, b) => a - b);

  // --- ритм визитов -------------------------------------------------------
  let cadence: CadenceInsight | null = null;
  if (receiptTimes.length >= 3) {
    const intervals: number[] = [];
    for (let index = 1; index < receiptTimes.length; index += 1) {
      intervals.push(Math.round((receiptTimes[index] - receiptTimes[index - 1]) / DAY));
    }
    const medianDays = Math.max(1, median(intervals.filter((value) => value > 0)));
    const daysSinceLast = Math.max(0, Math.round((input.now - receiptTimes[receiptTimes.length - 1]) / DAY));
    cadence = { medianDays, daysSinceLast, overdueDays: Math.max(0, daysSinceLast - medianDays) };
  } else {
    gaps.push('Ритм визитов не считается: для него нужно хотя бы три покупки.');
  }

  // --- вероятность возврата ----------------------------------------------
  const returning = cadence ? estimateReturn(input.cohort, cadence.daysSinceLast, horizonDays) : null;
  if (cadence && !returning) {
    gaps.push('Вероятность возврата не оценивается: в базе слишком мало гостей, молчавших столько же.');
  }

  if (!lines.length) {
    gaps.push('Состав чеков не записан — касса передаёт только сумму. Любимые позиции и категории появятся после импорта позиций.');
    return {
      linesCounted: 0, receiptsCounted: receipts.length, favourites: [], categories: [], pairs: [],
      dropped: [], shift: [], cadence, returning, suggestion: null, gaps,
    };
  }

  const totalOrders = lines.reduce((sum, line) => sum + Math.max(1, line.quantity), 0);

  // --- любимые позиции ----------------------------------------------------
  const byName = new Map<string, { orders: number; category: string | null; lastAt: string }>();
  for (const line of lines) {
    const current = byName.get(line.name) ?? { orders: 0, category: line.category, lastAt: line.occurredAt };
    current.orders += Math.max(1, line.quantity);
    current.category = current.category ?? line.category;
    if (new Date(line.occurredAt).getTime() > new Date(current.lastAt).getTime()) current.lastAt = line.occurredAt;
    byName.set(line.name, current);
  }
  const favourites = [...byName.entries()]
    .map(([name, value]) => ({ name, category: value.category, orders: value.orders, shareBps: bps(value.orders, totalOrders), lastAt: value.lastAt }))
    .sort((a, b) => b.orders - a.orders || a.name.localeCompare(b.name, 'ru'))
    .slice(0, 3);

  // --- категории ----------------------------------------------------------
  const byCategory = new Map<string, number>();
  for (const line of lines) {
    if (!line.category) continue;
    byCategory.set(line.category, (byCategory.get(line.category) ?? 0) + Math.max(1, line.quantity));
  }
  const categorised = [...byCategory.values()].reduce((sum, value) => sum + value, 0);
  const categories = [...byCategory.entries()]
    .map(([category, orders]) => ({ category, orders, shareBps: bps(orders, categorised) }))
    .sort((a, b) => b.orders - a.orders || a.category.localeCompare(b.category, 'ru'));
  if (!categories.length) {
    gaps.push('Меню не разложено по категориям, поэтому разбор идёт по названиям позиций.');
  }

  // --- что берёт вместе ---------------------------------------------------
  const perReceipt = new Map<string, Set<string>>();
  for (const line of lines) {
    const set = perReceipt.get(line.transactionId) ?? new Set<string>();
    set.add(line.name);
    perReceipt.set(line.transactionId, set);
  }
  const pairCounts = new Map<string, number>();
  for (const set of perReceipt.values()) {
    const names = [...set].sort((a, b) => a.localeCompare(b, 'ru'));
    for (let i = 0; i < names.length; i += 1) {
      for (let j = i + 1; j < names.length; j += 1) {
        const key = `${names[i]}\u0000${names[j]}`;
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
      }
    }
  }
  const pairs = [...pairCounts.entries()]
    .filter(([, together]) => together >= 2)
    .map(([key, together]) => { const [a, b] = key.split('\u0000'); return { a, b, together }; })
    .sort((left, right) => right.together - left.together || left.a.localeCompare(right.a, 'ru'))
    .slice(0, 2);

  // --- что перестал брать и куда сдвинулся вкус ---------------------------
  const split = splitByVisits(receipts);
  const dropped: DroppedItem[] = [];
  const shift: TasteShift[] = [];
  if (!split) {
    gaps.push('Изменения во вкусе не отслеживаются: для сравнения нужно хотя бы четыре покупки.');
  } else {
    const earlier = lines.filter((line) => new Date(line.occurredAt).getTime() < split.recentFrom);
    const recent = lines.filter((line) => new Date(line.occurredAt).getTime() >= split.recentFrom);
    const recentNames = new Set(recent.map((line) => line.name));

    const earlierByName = new Map<string, { orders: number; lastAt: string }>();
    for (const line of earlier) {
      const current = earlierByName.get(line.name) ?? { orders: 0, lastAt: line.occurredAt };
      current.orders += Math.max(1, line.quantity);
      if (new Date(line.occurredAt).getTime() > new Date(current.lastAt).getTime()) current.lastAt = line.occurredAt;
      earlierByName.set(line.name, current);
    }
    for (const [name, value] of earlierByName) {
      if (recentNames.has(name) || value.orders < 2) continue;
      dropped.push({ name, ordersBefore: value.orders, lastAt: value.lastAt, daysSince: daysBetween(value.lastAt, input.now) });
    }
    dropped.sort((left, right) => right.ordersBefore - left.ordersBefore || left.name.localeCompare(right.name, 'ru'));

    const shareByCategory = (subset: readonly PurchaseLine[]) => {
      const counts = new Map<string, number>();
      let total = 0;
      for (const line of subset) {
        if (!line.category) continue;
        const quantity = Math.max(1, line.quantity);
        counts.set(line.category, (counts.get(line.category) ?? 0) + quantity);
        total += quantity;
      }
      return { counts, total };
    };
    const before = shareByCategory(earlier);
    const after = shareByCategory(recent);
    for (const category of new Set([...before.counts.keys(), ...after.counts.keys()])) {
      const earlierBps = bps(before.counts.get(category) ?? 0, before.total);
      const recentBps = bps(after.counts.get(category) ?? 0, after.total);
      const changeBps = recentBps - earlierBps;
      if (Math.abs(changeBps) >= 1_000) shift.push({ category, earlierBps, recentBps, changeBps });
    }
    shift.sort((left, right) => Math.abs(right.changeBps) - Math.abs(left.changeBps));
  }

  // --- что предложить -----------------------------------------------------
  const suggestion = suggestNext({ favourites, categories, dropped, catalog: input.catalog, tried: new Set(byName.keys()) });
  if (!suggestion) gaps.push('Меню не заполнено, поэтому предложить конкретную позицию не из чего.');

  return {
    linesCounted: lines.length,
    receiptsCounted: receipts.length,
    favourites,
    categories: categories.slice(0, 4),
    pairs,
    dropped: dropped.slice(0, 3),
    shift: shift.slice(0, 2),
    cadence,
    returning,
    suggestion,
    gaps,
  };
}

function suggestNext(args: {
  favourites: readonly FavouriteItem[];
  categories: readonly CategoryShare[];
  dropped: readonly DroppedItem[];
  catalog: readonly CatalogEntry[];
  tried: ReadonlySet<string>;
}): Suggestion | null {
  const topCategory = args.categories[0]?.category ?? args.favourites[0]?.category ?? null;

  // Позиция из его же категории, которую он ни разу не брал: предложение
  // остаётся внутри вкуса, а не тянет человека в чужой раздел меню.
  if (topCategory) {
    const candidates = args.catalog
      .filter((item) => item.category === topCategory && !args.tried.has(item.name))
      .sort((left, right) => (right.priceMinor - right.costMinor) - (left.priceMinor - left.costMinor));
    if (candidates.length) {
      return {
        itemName: candidates[0].name,
        reason: `Его категория — «${topCategory}», а эту позицию он ещё не пробовал. Маржа у неё выше средней по категории.`,
        mechanic: 'gift_with_threshold',
      };
    }
  }

  // Что брал регулярно и перестал: вернуть проще, чем продать новое.
  if (args.dropped.length) {
    const item = args.dropped[0];
    return {
      itemName: item.name,
      reason: `Брал ${item.ordersBefore} раза и перестал ${item.daysSince} дней назад. Купон на возврат адресный, а не общий.`,
      mechanic: 'return_coupon',
    };
  }

  if (args.favourites.length) {
    const favourite = args.favourites[0];
    return {
      itemName: favourite.name,
      reason: 'Его постоянная позиция. Третья бесплатно бьёт по частоте, а не по марже с чека.',
      mechanic: '2_plus_1',
    };
  }

  return null;
}

/**
 * Собирает наблюдения для оценки возврата из истории всего заведения.
 *
 * На вход — время покупок по каждому гостю; на выход — промежутки между
 * визитами (гость вернулся) и хвост молчания у каждого (пока не вернулся).
 */
export function buildCohort(visitsByCustomer: ReadonlyMap<string, readonly string[]>, now: number): CohortObservation[] {
  const observations: CohortObservation[] = [];
  for (const visits of visitsByCustomer.values()) {
    const times = [...visits].map((iso) => new Date(iso).getTime()).filter(Number.isFinite).sort((a, b) => a - b);
    if (!times.length) continue;
    for (let index = 1; index < times.length; index += 1) {
      const days = Math.round((times[index] - times[index - 1]) / DAY);
      if (days >= 0) observations.push({ days, returned: true });
    }
    const silent = Math.round((now - times[times.length - 1]) / DAY);
    if (silent >= 0) observations.push({ days: silent, returned: false });
  }
  return observations;
}
