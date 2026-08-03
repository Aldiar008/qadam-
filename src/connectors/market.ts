/**
 * Цены с рынка: Kaspi для товаров, hh.kz для стоимости найма.
 *
 * «Закончились стаканы — найди, где дешевле» is the one feature in this product
 * that reads from outside. That makes it the one place where a made-up number
 * would reach a real purchase order, so the rules here are stricter than
 * anywhere else:
 *
 *  - Only two hosts are ever contacted, and they are constants in this file.
 *    Nothing derived from a database row can steer a request (an owner типing a
 *    URL into «поисковый запрос» must not become a request to that URL).
 *  - Every response is validated field by field. A price that is not a finite
 *    positive number, a link that is not https on the source's own host, a
 *    title that is empty — dropped, not defaulted.
 *  - Being blocked is a normal outcome with a name, not an error to bury.
 *    A marketplace refusing an automated request is expected, and the screen
 *    says so instead of showing stale prices as fresh.
 *  - Nothing found here is ever `verified`. A person opens the link.
 *
 * Neither endpoint is a partnership. Requests are made one at a time, on the
 * owner's explicit press, with a short timeout and a hard cap on how much is
 * read — and the whole feature can be switched off with QADAM_MARKET_SOURCES.
 */

export type MarketSource = 'kaspi' | 'hh';

export type MarketStatus = 'ok' | 'empty' | 'blocked' | 'unavailable' | 'disabled';

export interface FoundOffer {
  /** The shop or seller, as the marketplace names it. */
  supplier: string;
  title: string;
  /** Per listing, in tenge. Pack size is a separate field and is never guessed from the title. */
  priceMinor: number;
  packSize: number;
  url: string;
  externalId: string;
}

export interface MarketSearchResult {
  source: MarketSource;
  query: string;
  status: MarketStatus;
  offers: FoundOffer[];
  httpStatus: number | null;
  error: string | null;
}

export interface SalarySnapshot {
  roleQuery: string;
  areaName: string;
  sampleSize: number;
  medianMinor: number | null;
  p25Minor: number | null;
  p75Minor: number | null;
  currency: string;
  /** Vacancies read before filtering; the difference is how many hid their pay. */
  scanned: number;
}

export interface SalarySearchResult {
  status: MarketStatus;
  snapshot: SalarySnapshot | null;
  httpStatus: number | null;
  error: string | null;
}

const KASPI_HOST = 'kaspi.kz';
const HH_HOST = 'api.hh.ru';
const TIMEOUT_MS = 9_000;
/** Enough for a page of results and far short of anything that could exhaust memory. */
const MAX_BYTES = 2 * 1024 * 1024;

/** hh.ru area ids. Anything else falls back to the whole country. */
const HH_AREAS: Record<string, number> = {
  'Алматы': 160, 'Астана': 159, 'Нур-Султан': 159, 'Шымкент': 205,
  'Караганда': 177, 'Актобе': 156, 'Атырау': 168, 'Павлодар': 195,
  'Усть-Каменогорск': 202, 'Костанай': 181, 'Тараз': 199,
};
const HH_KAZAKHSTAN = 40;
const HH_CONTACT = 'QADAM-GrowthOS/1.0 (+https://qadam-growth-os.vercel.app)';

/** Kaspi city ids, as used by their own storefront. */
const KASPI_CITIES: Record<string, string> = {
  'Алматы': '750000000', 'Астана': '710000000', 'Нур-Султан': '710000000',
  'Шымкент': '511010000', 'Караганда': '351010000', 'Актобе': '151010000',
  'Атырау': '231010000', 'Павлодар': '551010000',
};
const KASPI_DEFAULT_CITY = '750000000';
const KASPI_CONTACT = 'QADAM-GrowthOS/1.0 (+https://qadam-growth-os.vercel.app)';

export function isMarketSourceEnabled(source: MarketSource): boolean {
  // Default is off for nobody: the feature is useless disabled, and a venue can
  // still only reach two fixed hosts. The variable exists so a deployment that
  // must not make outbound calls can say so.
  const raw = (process.env.QADAM_MARKET_SOURCES ?? 'kaspi,hh').toLowerCase();
  if (raw === 'none' || raw === 'off') return false;
  return raw.split(',').map((part) => part.trim()).includes(source);
}

/** Читает ответ с ограничением по размеру: усечённый ответ лучше исчерпанной памяти. */
async function readCapped(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return response.text();
  const decoder = new TextDecoder();
  let text = '';
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_BYTES) {
      await reader.cancel();
      throw new Error('response_too_large');
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function classify(status: number): MarketStatus {
  // 403 and 429 are the marketplace saying «not like this», which is a different
  // fact from «сервис лежит» and leads to different advice on screen.
  if (status === 403 || status === 401 || status === 429) return 'blocked';
  return 'unavailable';
}

/** Ссылка принимается, только если она https и ведёт на тот же сайт. */
function safeUrl(candidate: unknown, host: string): string | null {
  if (typeof candidate !== 'string' || !candidate) return null;
  try {
    const url = new URL(candidate.startsWith('//') ? `https:${candidate}` : candidate, `https://${host}`);
    if (url.protocol !== 'https:') return null;
    if (url.hostname !== host && !url.hostname.endsWith(`.${host}`)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function positiveInteger(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').replace(/[^\d.]/g, ''));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed);
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  // Marketplace titles arrive with newlines and non-breaking spaces; they end up
  // in a table cell, so they are flattened here rather than in the view.
  const text = value.replace(/[\r\n\t ]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return text.length >= 2 ? text.slice(0, max) : null;
}

/**
 * Сколько штук в упаковке — только если это написано в названии.
 *
 * «Стаканы бумажные 250мл, 50 шт» is 50 units; «Стаканы бумажные 250мл» is one
 * listing of unknown count. Guessing here would silently divide the price by a
 * number nobody wrote, and the comparison is per unit — so a wrong guess reads
 * as a bargain.
 */
export function packSizeFromTitle(title: string): number {
  // Not `\b` after the unit: in JavaScript a word boundary is defined by
  // [A-Za-z0-9_], so «шт» followed by end-of-string is not a boundary and the
  // pattern silently never matched a Cyrillic title at all. A negative
  // lookahead for a letter says what was actually meant.
  const match = /(\d{1,4})\s*(?:штук[аи]?|шт\.?|pcs|pack)(?![a-zа-яё])/i.exec(title);
  if (!match) return 1;
  const size = Number(match[1]);
  return Number.isFinite(size) && size >= 1 && size <= 5000 ? size : 1;
}

interface KaspiCard {
  id?: unknown;
  title?: unknown;
  brand?: unknown;
  unitPrice?: unknown;
  unitSalePrice?: unknown;
  shopLink?: unknown;
  currency?: unknown;
}

/**
 * Разбирает ответ Kaspi. Отдельно от запроса, чтобы это можно было проверить тестом.
 *
 * Sorted by price per unit, not by listed price: a thousand cups for 14 500 ₸
 * beats fifty for 900 ₸, and a list ordered by the number on the tag would put
 * the expensive one first. That reordering is the entire point of the feature.
 */
export function parseKaspiPayload(payload: unknown, limit = 8): FoundOffer[] {
  const root = payload as { data?: unknown } | null;
  // The storefront has moved this between `data` and `data.cards` before; both
  // are accepted so a layout change degrades to «ничего не найдено», not a crash.
  const container = root?.data;
  const cards = Array.isArray(container)
    ? container
    : Array.isArray((container as { cards?: unknown } | null)?.cards)
      ? ((container as { cards: unknown[] }).cards)
      : [];

  const offers: FoundOffer[] = [];
  for (const raw of cards) {
    if (!raw || typeof raw !== 'object') continue;
    const card = raw as KaspiCard;
    if (card.currency !== undefined && card.currency !== 'KZT') continue;
    const title = cleanText(card.title, 200);
    // The sale price when there is one, the shelf price otherwise — never the
    // higher of the two, because that is the number the owner would not pay.
    const listed = positiveInteger(card.unitPrice);
    const sale = positiveInteger(card.unitSalePrice);
    const price = sale !== null && listed !== null ? Math.min(sale, listed) : (sale ?? listed);
    const url = safeUrl(card.shopLink, KASPI_HOST);
    const id = cleanText(String(card.id ?? ''), 120);
    if (!title || price === null || !url || !id) continue;
    offers.push({
      // A Kaspi search result is the product across all its sellers, not one
      // seller's listing. Naming a shop we did not read would be an invented
      // fact of exactly the kind this module exists to prevent.
      supplier: 'Kaspi.kz',
      title,
      priceMinor: price,
      packSize: packSizeFromTitle(title),
      url,
      externalId: id,
    });
  }

  offers.sort((a, b) => a.priceMinor / a.packSize - b.priceMinor / b.packSize);
  return offers.slice(0, limit);
}

/**
 * Ищет товар в Kaspi Магазине.
 *
 * The endpoint is the storefront's own search — undocumented, and it may change
 * or refuse at any time. Every one of those outcomes has a name in the result
 * rather than an exception, because the caller has to write down what happened.
 */
export async function searchKaspi(query: string, options: { city?: string; limit?: number } = {}): Promise<MarketSearchResult> {
  const trimmed = query.trim().slice(0, 200);
  const base: MarketSearchResult = { source: 'kaspi', query: trimmed, status: 'unavailable', offers: [], httpStatus: null, error: null };
  if (!trimmed) return { ...base, status: 'empty', error: 'Пустой поисковый запрос.' };
  if (!isMarketSourceEnabled('kaspi')) return { ...base, status: 'disabled', error: 'Источник Kaspi выключен настройкой QADAM_MARKET_SOURCES.' };

  const cityId = KASPI_CITIES[options.city ?? ''] ?? KASPI_DEFAULT_CITY;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    // Built with URL/searchParams so the query is encoded once, correctly, and
    // an owner's search text can never break out into another parameter.
    const endpoint = new URL(`https://${KASPI_HOST}/yml/product-view/pl/results`);
    endpoint.searchParams.set('text', trimmed);
    endpoint.searchParams.set('page', '0');
    endpoint.searchParams.set('c', cityId);

    const response = await fetch(endpoint, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'ru-RU,ru;q=0.9',
        'X-KS-City': cityId,
        Referer: `https://${KASPI_HOST}/shop/search/?text=${encodeURIComponent(trimmed)}`,
        // Identified honestly rather than dressed as a browser. It is accepted,
        // and a request that has to lie about who it is should not be made.
        'User-Agent': KASPI_CONTACT,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      return { ...base, status: classify(response.status), httpStatus: response.status, error: `Kaspi ответил ${response.status}.` };
    }

    const text = await readCapped(response);
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      // A login page or an anti-bot challenge arrives as HTML with a 200.
      return { ...base, status: 'blocked', httpStatus: response.status, error: 'Kaspi вернул не JSON — похоже на проверку «вы не робот».' };
    }

    const offers = parseKaspiPayload(payload, options.limit ?? 8);
    return { ...base, status: offers.length ? 'ok' : 'empty', httpStatus: response.status, offers };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return { ...base, status: 'unavailable', error: message === 'The operation was aborted.' || message.includes('abort') ? 'Kaspi не ответил за 9 секунд.' : message };
  } finally {
    clearTimeout(timer);
  }
}

interface HhVacancy {
  salary?: { from?: unknown; to?: unknown; currency?: unknown; gross?: unknown } | null;
}

/** Считает медиану и квартили по опубликованным вилкам. */
export function summariseVacancies(vacancies: readonly HhVacancy[], input: { roleQuery: string; areaName: string }): SalarySnapshot {
  const values: number[] = [];
  for (const vacancy of vacancies) {
    const salary = vacancy?.salary;
    if (!salary || salary.currency !== 'KZT') continue;
    const from = positiveInteger(salary.from);
    const to = positiveInteger(salary.to);
    // A posted range is one offer, so it counts once — at its midpoint. Counting
    // both ends would double the weight of employers who published a range.
    const value = from !== null && to !== null ? Math.round((from + to) / 2) : (from ?? to);
    if (value === null) continue;
    values.push(value);
  }

  values.sort((a, b) => a - b);
  const quantile = (fraction: number): number | null => {
    if (!values.length) return null;
    const index = Math.min(values.length - 1, Math.max(0, Math.round(fraction * (values.length - 1))));
    return values[index];
  };

  return {
    roleQuery: input.roleQuery,
    areaName: input.areaName,
    sampleSize: values.length,
    medianMinor: quantile(0.5),
    p25Minor: quantile(0.25),
    p75Minor: quantile(0.75),
    currency: 'KZT',
    scanned: vacancies.length,
  };
}

/**
 * Сколько платят по этой роли — по вакансиям hh.kz.
 *
 * The API is public and documented, and it asks for a User-Agent identifying the
 * caller, which is given honestly. It also refuses a good deal of traffic by
 * origin: at the time of writing it answers 403 from this deployment regardless
 * of headers. That is reported as «площадка отклонила запрос» and nothing is
 * stored — an empty answer must never be dressed up as a market rate.
 *
 * Vacancies that hide their pay are counted in `scanned` but not in the median.
 * «Зарплата не указана» is most of the board, and quietly dropping those
 * postings would make the sample look larger than it is.
 */
export async function searchSalaries(role: string, options: { city?: string } = {}): Promise<SalarySearchResult> {
  const trimmed = role.trim().slice(0, 120);
  if (!trimmed) return { status: 'empty', snapshot: null, httpStatus: null, error: 'Пустой запрос.' };
  if (!isMarketSourceEnabled('hh')) {
    return { status: 'disabled', snapshot: null, httpStatus: null, error: 'Источник hh выключен настройкой QADAM_MARKET_SOURCES.' };
  }

  const areaName = options.city && HH_AREAS[options.city] ? options.city : 'Казахстан';
  const area = HH_AREAS[options.city ?? ''] ?? HH_KAZAKHSTAN;
  const url = new URL(`https://${HH_HOST}/vacancies`);
  url.searchParams.set('text', trimmed);
  url.searchParams.set('area', String(area));
  url.searchParams.set('per_page', '50');
  url.searchParams.set('only_with_salary', 'false');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        // hh asks callers to identify themselves. The deployment URL does that
        // without putting a person's address in a public repository.
        'HH-User-Agent': HH_CONTACT,
        'User-Agent': HH_CONTACT,
      },
      cache: 'no-store',
    });
    if (!response.ok) {
      return { status: classify(response.status), snapshot: null, httpStatus: response.status, error: `hh.kz ответил ${response.status}.` };
    }

    const payload = JSON.parse(await readCapped(response)) as { items?: unknown };
    const items = Array.isArray(payload.items) ? (payload.items as HhVacancy[]) : [];
    if (!items.length) return { status: 'empty', snapshot: null, httpStatus: response.status, error: 'По этому запросу вакансий не найдено.' };

    const snapshot = summariseVacancies(items, { roleQuery: trimmed, areaName });
    return { status: snapshot.sampleSize > 0 ? 'ok' : 'empty', snapshot, httpStatus: response.status, error: null };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return { status: 'unavailable', snapshot: null, httpStatus: null, error: message.includes('abort') ? 'hh.kz не ответил за 9 секунд.' : message };
  } finally {
    clearTimeout(timer);
  }
}

export const MARKET_STATUS_LABELS: Record<MarketStatus, string> = {
  ok: 'Найдено',
  empty: 'Ничего не найдено',
  blocked: 'Площадка отклонила автоматический запрос',
  unavailable: 'Площадка не ответила',
  disabled: 'Источник выключен настройкой',
};
