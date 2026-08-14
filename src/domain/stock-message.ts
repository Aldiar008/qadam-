/**
 * Разбор сообщения флориста в предложение изменить остаток.
 *
 * Флорист считает розы в ведре и пишет в чат: «осталось 70 красных». Это и есть
 * настоящий способ учёта в цветочном магазине — не потому, что владелец не знает
 * про складские программы, а потому, что между двумя покупателями некогда
 * открывать таблицу.
 *
 * Продукт встраивается в эту привычку, но не смеет менять остаток по сообщению.
 * Разбор возвращает предложение с уверенностью; остаток меняет только человек,
 * подтвердивший позицию, количество и единицу. Ошибка разбора стоит витрины:
 * списать сто стеблей вместо десяти — это пустая полка на празднике.
 */
import { DomainError, roundDiv } from './shared.ts';

export const PARSER_VERSION = 'florist-message-1';

/** Ниже этого порога продукт спрашивает, а не догадывается. */
export const CONFIRM_THRESHOLD_PPM = 850_000;

export interface KnownItem {
  id: string;
  name: string;
  unit: string;
  /** Слова, по которым флорист называет позицию в чате. */
  aliases?: readonly string[];
}

export interface ParsedCandidate {
  itemId: string;
  itemName: string;
  /** Насколько название из сообщения похоже на эту позицию. */
  matchPpm: number;
}

export type ParseOutcome = 'proposed' | 'needs_clarification';

export interface ParsedMessage {
  outcome: ParseOutcome;
  itemId: string | null;
  itemName: string | null;
  quantityMilli: number | null;
  unit: string | null;
  confidencePpm: number;
  candidates: readonly ParsedCandidate[];
  /** Что именно спросить у человека, если разобрать однозначно не вышло. */
  question: string | null;
  version: string;
}

/** Слова, которыми флорист называет операцию. Влияют на подсказку, не на остаток. */
const WASTE_WORDS = ['выброс', 'списа', 'завя', 'увя', 'помя', 'испорт'];
const RECEIVE_WORDS = ['привезли', 'приехал', 'поставк', 'пришл', 'приняли'];

export type SuggestedOperation = 'adjust' | 'receive' | 'waste';

/**
 * Нормализация под сравнение: регистр, ё и хвосты словоформ.
 *
 * Русские окончания — главная сложность: «розы», «роз», «розами» должны попасть
 * в одну позицию. Полноценная морфология здесь избыточна, а вот отсечение
 * последних букв даёт нужный результат на словаре из десятка названий.
 */
function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Грубое отсечение окончания.
 *
 * Порог в пять букв казался безопасным и ломал главное слово словаря: «роза» и
 * «розы» различаются последней буквой, оба короче порога — и позиция не
 * находилась вовсе. Поэтому у четырёх- и пятибуквенных срезается одна буква,
 * у длинных — две.
 */
function stem(word: string): string {
  if (word.length >= 6) return word.slice(0, word.length - 2);
  if (word.length >= 4) return word.slice(0, word.length - 1);
  return word;
}

/** Доля слов позиции, встретившихся в сообщении. */
function matchScorePpm(message: string, item: KnownItem): number {
  const haystack = normalise(message).split(' ').map(stem);
  const names = [item.name, ...(item.aliases ?? [])];

  let best = 0;
  for (const name of names) {
    const words = normalise(name)
      .split(' ')
      .filter((word) => word.length >= 3 && !/^\d+$/.test(word))
      .map(stem);
    if (words.length === 0) continue;

    // Совпадение только в одну сторону: токен сообщения начинается со слова
    // названия. Обратная проверка казалась мягче и ломала смысл — «розовая»
    // считалась совпадением со словом «роза», и красная роза становилась
    // неотличимой от розовой.
    const hits = words.filter((word) => haystack.some((token) => token.startsWith(word)));

    // Доля совпавших слов наказывала за уточнения в названии: у «Тюльпан микс»
    // слово «микс» в сообщении не пишут никогда, и позиция набирала половину.
    // Поэтому главное слово — существительное, стоящее первым, — даёт основу,
    // а уточнения её добирают. Плоский минимум здесь не годился: он уравнивал
    // «красную розу» с «розой вообще», и точное совпадение переставало
    // отличаться от частичного.
    const headMatched = hits.includes(words[0]);
    const share = roundDiv(hits.length * 1_000_000, words.length);
    const score = headMatched
      ? 700_000 + roundDiv(share * 300_000, 1_000_000)
      : roundDiv(share * 700_000, 1_000_000);
    if (score > best) best = score;
  }
  return best;
}

/**
 * Первое число сообщения — количество. «70 роз» и «роз 70» читаются одинаково.
 *
 * Извлекается из исходного текста, а не из нормализованного: нормализация
 * выбрасывает запятую как знак препинания, и «2,5 пучка» превращалось в два.
 */
function extractQuantity(message: string): number | null {
  const found = message.match(/(\d+(?:[.,]\d+)?)/);
  if (!found) return null;
  const value = Number(found[1].replace(',', '.'));
  return Number.isFinite(value) ? Math.round(value * 1000) : null;
}

/** Что флорист имел в виду: пересчёт витрины, приёмку или списание. */
export function suggestOperation(message: string): SuggestedOperation {
  const text = normalise(message);
  if (WASTE_WORDS.some((word) => text.includes(word))) return 'waste';
  if (RECEIVE_WORDS.some((word) => text.includes(word))) return 'receive';
  return 'adjust';
}

/**
 * Разбирает сообщение в предложение.
 *
 * Возвращает `needs_clarification`, когда позиция не опознана или подходит
 * сразу нескольким: спросить один раз дешевле, чем угадать и списать не то.
 */
export function parseStockMessage(message: string, items: readonly KnownItem[]): ParsedMessage {
  if (!message.trim()) throw new DomainError('EMPTY_MESSAGE', 'message is empty');

  const quantityMilli = extractQuantity(message);

  const scored = items
    .map((item) => ({ item, matchPpm: matchScorePpm(message, item) }))
    .filter((row) => row.matchPpm > 0)
    .sort((left, right) => right.matchPpm - left.matchPpm);

  const candidates: ParsedCandidate[] = scored.slice(0, 4).map((row) => ({
    itemId: row.item.id,
    itemName: row.item.name,
    matchPpm: row.matchPpm,
  }));

  if (scored.length === 0) {
    return {
      outcome: 'needs_clarification',
      itemId: null,
      itemName: null,
      quantityMilli,
      unit: null,
      confidencePpm: 0,
      candidates: Object.freeze([]),
      question: 'Не понял, о какой позиции речь. Выберите её из списка.',
      version: PARSER_VERSION,
    };
  }

  const best = scored[0];
  const runnerUp = scored[1];

  // Два одинаково похожих названия — это не выбор системы. «Роза красная» и
  // «Роза розовая» различаются одним словом, и ошибка здесь стоит витрины.
  //
  // Порог небольшой намеренно: уточнение в названии («красная») стоит ровно
  // одного слова, и если оно есть в сообщении, выбор уже однозначен.
  const ambiguous = runnerUp !== undefined && best.matchPpm - runnerUp.matchPpm < 100_000;

  // Уверенность падает и от неоднозначности, и от отсутствия числа: без
  // количества подтверждать нечего.
  let confidence = best.matchPpm;
  if (ambiguous) confidence = roundDiv(confidence, 2);
  if (quantityMilli === null) confidence = roundDiv(confidence, 3);

  const needsClarification = confidence < CONFIRM_THRESHOLD_PPM;

  return {
    outcome: needsClarification ? 'needs_clarification' : 'proposed',
    itemId: best.item.id,
    itemName: best.item.name,
    quantityMilli,
    unit: best.item.unit,
    confidencePpm: confidence,
    candidates: Object.freeze(candidates),
    question: needsClarification
      ? quantityMilli === null
        ? 'Сколько именно? В сообщении нет числа.'
        : ambiguous
          ? `Уточните позицию: подходит и «${best.item.name}», и «${runnerUp?.item.name}».`
          : 'Проверьте позицию: разбор не уверен.'
      : null,
    version: PARSER_VERSION,
  };
}
