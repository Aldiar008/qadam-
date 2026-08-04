/**
 * Разбор обращения гостя: тема, настроение, срочность и кто имеет право ответить.
 *
 * Модуль решает один вопрос — можно ли отправить ответ без владельца. Ответ на
 * «во сколько вы открываетесь» продукт знает точно, и будить ради него человека
 * незачем. Ответ на «верните деньги» продукт не знает никогда, каким бы
 * уверенным ни выглядел текст модели.
 *
 * Классификатор здесь намеренно простой и без модели: он работает всегда, его
 * поведение можно прочитать глазами, и он служит нижней границей. Модель
 * предлагает свою тему поверх — и если две версии расходятся, побеждает та, что
 * строже. Ошибиться в сторону «пусть посмотрит человек» дёшево; ошибиться в
 * другую сторону — значит от имени заведения пообещать гостю деньги.
 *
 * Чистый модуль: ни базы, ни времени, ни классов Tailwind.
 */

export type InquiryCategory =
  | 'hours' | 'menu' | 'order' | 'booking' | 'question'
  | 'gratitude' | 'review' | 'suggestion'
  | 'complaint' | 'money' | 'other';

export type Sentiment = 'positive' | 'neutral' | 'negative';
export type PolicyMode = 'auto' | 'approve';

export const INQUIRY_CATEGORIES: readonly InquiryCategory[] = [
  'hours', 'menu', 'order', 'booking', 'question',
  'gratitude', 'review', 'suggestion', 'complaint', 'money', 'other',
];

export const CATEGORY_LABELS: Record<InquiryCategory, string> = {
  hours: 'Часы работы и адрес',
  menu: 'Меню, наличие и цены',
  order: 'Заказ, оплата и доставка',
  booking: 'Бронь и столики',
  question: 'Прочие вопросы',
  gratitude: 'Благодарность',
  review: 'Отзыв',
  suggestion: 'Предложение',
  complaint: 'Жалоба',
  money: 'Деньги: возврат, компенсация, скидка',
  other: 'Другое',
};

/**
 * Темы, которые не переводятся на автомат никаким переключателем.
 *
 * Это не значение по умолчанию, а правило. Ответ, который стоит денег или
 * репутации, отправляет человек — то же ограничение стоит в базе, потому что
 * экран можно обойти, а ограничение таблицы нет.
 */
export const ALWAYS_NEEDS_A_PERSON: readonly InquiryCategory[] = ['complaint', 'money'];

/** С чего начинает новое заведение, пока владелец не поменял настройки. */
export const DEFAULT_POLICY: Record<InquiryCategory, PolicyMode> = {
  hours: 'auto',
  menu: 'auto',
  order: 'auto',
  booking: 'auto',
  question: 'auto',
  gratitude: 'auto',
  review: 'approve',
  suggestion: 'approve',
  complaint: 'approve',
  money: 'approve',
  other: 'approve',
};

export interface Triage {
  category: InquiryCategory;
  sentiment: Sentiment;
  /** 1 — может подождать, 2 — сегодня, 3 — сейчас. */
  urgency: 1 | 2 | 3;
  /** Слова, по которым принято решение. Печатаются владельцу, чтобы разбор можно было оспорить. */
  matched: readonly string[];
}

// Порядок важен: первое совпадение выигрывает. «Верните деньги за холодный
// кофе» — это деньги, а не жалоба, потому что решение здесь денежное.
const RULES: { category: InquiryCategory; patterns: RegExp }[] = [
  { category: 'money', patterns: /верн(и|ите|уть)\s+(деньги|оплату)|возврат|компенсац|возместит|дайте скидку|сделайте скидку|скидку бы|бесплатно за счёт|за ваш счет|за ваш счёт|перерасч|обсчит|списали дважды|двойн(ое|ая) списан/i },
  { category: 'complaint', patterns: /жалоб|холодн|невкусн|грязн|нахам|хамств|нагруб|груб(о|ый)|ужасн|отврат|испорч|просроч|воло(с|сок)|долго жд|очень долго|до сих пор не|так и не|плохо обслуж|не работает|сломан/i },
  { category: 'suggestion', patterns: /предлага|было бы (здорово|классно|хорошо)|добавьте|хотелось бы|почему бы не|идея/i },
  { category: 'review', patterns: /отзыв|оставлю отзыв|оцен(ка|иваю)|понравил|не понравил|впечатлен/i },
  { category: 'booking', patterns: /брон|столик|зарезерв|записат[ьс]|запис(ь|аться)|свободн(о|ые) мест/i },
  { category: 'order', patterns: /заказ|доставк|самовывоз|забрать|курьер|оплат(ить|а|у)\s+(карт|kaspi|каспи|налич)|картой|каспи|kaspi|где мой|статус/i },
  { category: 'hours', patterns: /во сколько|час(ы|ов) работ|режим работы|когда (вы )?(открыт|закрыт|работает)|открыт|закрыт|адрес|как добраться|где вы наход|парковк|қашан|ашық/i },
  { category: 'menu', patterns: /меню|ассортимент|есть ли|в наличии|наличие|сколько стоит|цена|цены|почём|почем|состав|калор|веган|безлактозн|қанша/i },
  { category: 'gratitude', patterns: /спасибо|благодар|рахмет|рақмет|молодц|вы лучш|очень вкусн|了不起/i },
];

const URGENT = /срочно|сейчас же|немедленно|прямо сейчас|уже час|до сих пор|второй раз|опять/i;
const NEGATIVE = /не\s|нет\b|плохо|ужас|отврат|разочаров|злюсь|возмущ/i;

/**
 * Разбор по тексту обращения.
 *
 * Совпавшие слова возвращаются наружу: владелец должен видеть, почему продукт
 * решил именно так, иначе разбор — это ярлык, который не оспорить.
 */
export function classifyInquiry(text: string): Triage {
  const body = (text ?? '').trim();
  const matched: string[] = [];

  let category: InquiryCategory = 'other';
  for (const rule of RULES) {
    const hit = rule.patterns.exec(body);
    if (!hit) continue;
    category = rule.category;
    matched.push(hit[0].toLowerCase());
    break;
  }
  // Вопросительный знак без иной темы — это всё-таки вопрос, а не «другое».
  if (category === 'other' && /\?|\bли\b|как |где |когда |можно ли/i.test(body)) category = 'question';

  const sentiment: Sentiment = category === 'complaint' || category === 'money'
    ? 'negative'
    : category === 'gratitude'
      ? 'positive'
      : NEGATIVE.test(body) && /не работ|плохо|ужас|отврат|разочаров/i.test(body)
        ? 'negative'
        : 'neutral';

  const urgent = URGENT.test(body);
  if (urgent) matched.push('срочность в тексте');
  const urgency: 1 | 2 | 3 = category === 'complaint' || category === 'money'
    ? (urgent ? 3 : 2)
    : category === 'order' || category === 'booking'
      ? (urgent ? 3 : 2)
      : urgent ? 2 : 1;

  return { category, sentiment, urgency, matched };
}

/**
 * Какой режим действует для темы с учётом настроек владельца.
 *
 * Настройка может только ужесточить правило: перевести тему из автомата на
 * подтверждение. Обратное для жалоб и денег не проходит ни здесь, ни в базе.
 */
export function resolvePolicy(
  category: InquiryCategory,
  policies: Readonly<Partial<Record<InquiryCategory, PolicyMode>>> = {},
): PolicyMode {
  if (ALWAYS_NEEDS_A_PERSON.includes(category)) return 'approve';
  return policies[category] ?? DEFAULT_POLICY[category];
}

export interface AnswerDecision {
  /** Можно ли отправить ответ гостю прямо сейчас. */
  automatic: boolean;
  /** Почему решено именно так — печатается владельцу и пишется в журнал. */
  reason: string;
  category: InquiryCategory;
}

/**
 * Кто отправляет ответ.
 *
 * Тема берётся строже из двух: своей, посчитанной по тексту, и предложенной
 * моделью. Модель видит контекст лучше, но ошибается увереннее, и цена ошибки
 * здесь односторонняя.
 */
export function decideAnswer(input: {
  ownTriage: Triage;
  modelCategory?: InquiryCategory | null;
  /** Модель сама сказала, что фактов не хватает. */
  needsHuman: boolean;
  policies?: Readonly<Partial<Record<InquiryCategory, PolicyMode>>>;
  /** Нечего отправлять: черновик пуст. */
  hasDraft: boolean;
}): AnswerDecision {
  const category = strictestOf(input.ownTriage.category, input.modelCategory ?? null);
  const mode = resolvePolicy(category, input.policies);

  if (ALWAYS_NEEDS_A_PERSON.includes(category)) {
    return { automatic: false, category, reason: `«${CATEGORY_LABELS[category]}» — отвечает человек, а не ассистент.` };
  }
  if (!input.hasDraft) {
    return { automatic: false, category, reason: 'Ассистент не смог составить ответ.' };
  }
  if (input.needsHuman) {
    return { automatic: false, category, reason: 'В данных заведения нет ответа на этот вопрос.' };
  }
  if (mode !== 'auto') {
    return { automatic: false, category, reason: `По теме «${CATEGORY_LABELS[category]}» вы просили подтверждать ответы.` };
  }
  return { automatic: true, category, reason: `Ответ по теме «${CATEGORY_LABELS[category]}» разрешён вашими настройками.` };
}

/** Строже — та тема, которая требует человека; из двух бытовых берётся своя. */
function strictestOf(own: InquiryCategory, model: InquiryCategory | null): InquiryCategory {
  if (!model) return own;
  if (ALWAYS_NEEDS_A_PERSON.includes(own)) return own;
  if (ALWAYS_NEEDS_A_PERSON.includes(model)) return model;
  // Своя тема выиграла бы спор о «другом»: модель охотно называет тему любой.
  return own === 'other' ? model : own;
}

export function isInquiryCategory(value: unknown): value is InquiryCategory {
  return typeof value === 'string' && (INQUIRY_CATEGORIES as readonly string[]).includes(value);
}
