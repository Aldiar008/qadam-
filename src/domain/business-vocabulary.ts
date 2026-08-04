/**
 * Продукт говорит словами того бизнеса, в котором он работает.
 *
 * «Гость», «визит», «позиция меню» — язык кофейни. В стоматологии это пациент,
 * приём и процедура; в магазине одежды — покупатель, покупка и товар. Интерфейс,
 * который называет пациента гостем, читается как чужой, и владелец справедливо
 * решает, что продукт написан не для него.
 *
 * Здесь один словарь на тип заведения. Он не меняет ни расчётов, ни структуры
 * экранов — только слова, которыми они себя называют. Незнакомый тип получает
 * нейтральный набор: сказать «клиент» безопасно везде, а угадывать — нет.
 *
 * Модуль чистый и без классов Tailwind: сборка отбрасывает их вне
 * `src/components` и `src/app`.
 */

export type VocabularyTypeCode = 'cafe' | 'beauty' | 'retail' | 'service' | 'dental';

export interface Vocabulary {
  /** Кто приходит: гость, клиент, покупатель, пациент. */
  personOne: string;
  personMany: string;
  /** «12 <родительный падеж>»: гостей, клиентов, покупателей, пациентов. */
  personGenitive: string;
  /**
   * «за этим <творительный падеж>»: гостем, клиентом, покупателем, пациентом.
   *
   * Падежи перечислены, а не выведены правилом: «гость» и «покупатель»
   * склоняются по-разному, и любая попытка достроить окончание из именительного
   * рано или поздно печатает «гостьом».
   */
  personInstrumental: string;
  /** Что он делает: визит, посещение, покупка, приём. */
  visitOne: string;
  visitMany: string;
  visitGenitive: string;
  /** Что он покупает: позиция, услуга, товар, процедура. */
  itemOne: string;
  itemMany: string;
  /** Где это перечислено: меню, прайс, каталог. */
  catalogue: string;
  /** Кто обслуживает: бариста, мастера, продавцы, врачи. */
  staff: string;
  /** Как называется средний чек в этом бизнесе. */
  averageCheck: string;
  /** Примеры категорий — подсказка при заполнении меню. */
  categoryExamples: readonly string[];
}

const NEUTRAL: Vocabulary = {
  personOne: 'клиент', personMany: 'клиенты', personGenitive: 'клиентов', personInstrumental: 'клиентом',
  visitOne: 'визит', visitMany: 'визиты', visitGenitive: 'визитов',
  itemOne: 'позиция', itemMany: 'позиции',
  catalogue: 'каталог', staff: 'сотрудники', averageCheck: 'средний чек',
  categoryExamples: ['основное', 'дополнительное'],
};

const VOCABULARIES: Record<VocabularyTypeCode, Vocabulary> = {
  cafe: {
    personOne: 'гость', personMany: 'гости', personGenitive: 'гостей', personInstrumental: 'гостем',
    visitOne: 'визит', visitMany: 'визиты', visitGenitive: 'визитов',
    itemOne: 'позиция', itemMany: 'позиции',
    catalogue: 'меню', staff: 'бариста', averageCheck: 'средний чек',
    categoryExamples: ['кофе', 'выпечка', 'десерты', 'еда'],
  },
  beauty: {
    personOne: 'клиент', personMany: 'клиенты', personGenitive: 'клиентов', personInstrumental: 'клиентом',
    visitOne: 'запись', visitMany: 'записи', visitGenitive: 'записей',
    itemOne: 'услуга', itemMany: 'услуги',
    catalogue: 'прайс', staff: 'мастера', averageCheck: 'средний чек',
    categoryExamples: ['стрижки', 'окрашивание', 'уход', 'маникюр'],
  },
  retail: {
    personOne: 'покупатель', personMany: 'покупатели', personGenitive: 'покупателей', personInstrumental: 'покупателем',
    visitOne: 'покупка', visitMany: 'покупки', visitGenitive: 'покупок',
    itemOne: 'товар', itemMany: 'товары',
    catalogue: 'каталог', staff: 'продавцы', averageCheck: 'средний чек',
    categoryExamples: ['коллекции', 'размеры', 'аксессуары'],
  },
  service: {
    personOne: 'клиент', personMany: 'клиенты', personGenitive: 'клиентов', personInstrumental: 'клиентом',
    visitOne: 'обращение', visitMany: 'обращения', visitGenitive: 'обращений',
    itemOne: 'услуга', itemMany: 'услуги',
    catalogue: 'прайс', staff: 'мастера', averageCheck: 'средний чек',
    categoryExamples: ['диагностика', 'ремонт', 'обслуживание'],
  },
  dental: {
    personOne: 'пациент', personMany: 'пациенты', personGenitive: 'пациентов', personInstrumental: 'пациентом',
    visitOne: 'приём', visitMany: 'приёмы', visitGenitive: 'приёмов',
    itemOne: 'процедура', itemMany: 'процедуры',
    catalogue: 'список процедур', staff: 'врачи', averageCheck: 'средняя стоимость приёма',
    categoryExamples: ['лечение', 'профилактика', 'протезирование', 'гигиена'],
  },
};

export function vocabularyFor(code: string | null | undefined): Vocabulary {
  if (!code) return NEUTRAL;
  return VOCABULARIES[code as VocabularyTypeCode] ?? NEUTRAL;
}

/** Заглавная первая буква — для заголовков, где слово начинает предложение. */
export function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export const VOCABULARY_CODES = Object.keys(VOCABULARIES) as VocabularyTypeCode[];
