/**
 * Deterministic campaign generator.
 *
 * This is not a stub: it is the guaranteed path. When no provider is configured,
 * or a provider times out, rate-limits, returns malformed JSON or fails schema
 * validation, the owner still gets a usable, curated set of mechanics with the
 * same shape as a model response — plus a visible label saying it was templated.
 *
 * Output is a pure function of the input, so demo copy stays stable between runs.
 */

import type { SocialAsset, SocialPackInput } from './content-pack.ts';
import {
  BRIEF_SCHEMA_VERSION,
  CAMPAIGN_SCHEMA_VERSION,
  type CampaignGenerationInput,
  type CampaignProposal,
  type CustomerBrief,
  type CustomerBriefInput,
  type Locale,
  type MechanicKind,
  type OwnerGoal,
  type ProposedMechanic,
} from './contract.ts';

/** Round to a tidy figure an owner would actually print on a poster. */
function tidy(minor: number, step: number): number {
  return Math.max(step, Math.round(minor / step) * step);
}

const GOAL_LABELS: Record<OwnerGoal, { ru: string; kk: string }> = {
  new_customers: { ru: 'привлечь новых гостей', kk: 'жаңа қонақтарды тарту' },
  reactivate: { ru: 'вернуть гостей, которые давно не заходили', kk: 'көптен бері келмеген қонақтарды қайтару' },
  increase_aov: { ru: 'увеличить средний чек', kk: 'орташа чекті арттыру' },
  fill_quiet_hours: { ru: 'заполнить тихие часы', kk: 'тыныш сағаттарды толтыру' },
  repeat_visit: { ru: 'вернуть гостя на второй визит', kk: 'қонақты екінші рет келуге шақыру' },
};

/** Which mechanics suit which goal, most-fitting first. */
const GOAL_MECHANICS: Record<OwnerGoal, readonly MechanicKind[]> = {
  new_customers: ['gift_with_threshold', 'return_coupon', 'percentage_discount'],
  reactivate: ['gift_with_threshold', 'return_coupon', 'bonus_points'],
  increase_aov: ['gift_with_threshold', '2_plus_1', 'bonus_points'],
  fill_quiet_hours: ['happy_hours', 'gift_with_threshold', '2_plus_1'],
  repeat_visit: ['return_coupon', 'bonus_points', 'gift_with_threshold'],
};

interface MechanicPlan {
  benefitValue: number;
  thresholdMinor: number;
  hypothesisRu: string;
  whyFitRu: string;
  risks: string[];
  assumptions: string[];
  offerRu: string;
  offerKk: string;
}

function planFor(kind: MechanicKind, input: CampaignGenerationInput): MechanicPlan {
  const aov = Math.max(1, input.averageOrderValueMinor);
  // The gift is the cheapest thing the owner can hand over, chosen by shelf
  // price; its cost to the business is what the simulator charges.
  const cheapest = [...input.catalog].sort((a, b) => a.priceMinor - b.priceMinor)[0];
  const giftCost = cheapest ? Math.max(1, cheapest.costMinor) : Math.max(1, Math.round(aov * 0.08));
  const giftName = cheapest?.name ?? 'напиток';
  const threshold = tidy(Math.round(aov * 1.02), 100);

  switch (kind) {
    case 'gift_with_threshold':
      return {
        benefitValue: giftCost,
        thresholdMinor: threshold,
        hypothesisRu: `Подарок при чеке от ${threshold} ₸ поднимет средний чек, не давая скидку тем, кто и так купил бы.`,
        whyFitRu: 'Выгода привязана к порогу, поэтому маржа защищена: гость сам добирает чек до нужной суммы.',
        risks: ['Часть гостей и так превышала порог', 'Нужен запас подарочной позиции на складе'],
        assumptions: [`Себестоимость подарка ${giftCost} ₸`, `Порог ${threshold} ₸ выше текущего среднего чека`],
        offerRu: `${giftName} в подарок при заказе от ${threshold} ₸`,
        offerKk: `${threshold} ₸-ден бастап тапсырысқа ${giftName} сыйлыққа`,
      };
    case 'return_coupon':
      return {
        benefitValue: tidy(Math.round(aov * 0.08), 50),
        thresholdMinor: 0,
        hypothesisRu: 'Купон на следующий визит переносит выгоду в будущее и возвращает гостя второй раз.',
        whyFitRu: 'Затраты возникают только тогда, когда гость реально вернулся и сделал новый заказ.',
        risks: ['Часть купонов не будет погашена', 'Купон может достаться и без того постоянному гостю'],
        assumptions: ['Погашение купона в течение срока действия', 'Купон применяется один раз на гостя'],
        offerRu: `Купон ${tidy(Math.round(aov * 0.08), 50)} ₸ на следующий визит`,
        offerKk: `Келесі келуге ${tidy(Math.round(aov * 0.08), 50)} ₸ купон`,
      };
    case 'bonus_points':
      return {
        benefitValue: 800,
        thresholdMinor: 0,
        hypothesisRu: 'Двойные баллы усиливают привычку возвращаться, а списание растянуто во времени.',
        whyFitRu: 'Обязательство отражается в балансе программы лояльности, а не в скидке на текущий чек.',
        risks: ['Накопленное обязательство нужно закрывать', 'Эффект виден не сразу'],
        assumptions: ['Баллы списываются по правилам программы', 'Часть баллов сгорит по сроку'],
        offerRu: 'Двойные баллы за визит на этой неделе',
        offerKk: 'Осы аптадағы келуге қос ұпай',
      };
    case '2_plus_1':
      return {
        benefitValue: tidy(giftCost, 50),
        thresholdMinor: 0,
        hypothesisRu: 'Механика «2+1» увеличивает количество позиций в чеке без прямой скидки на цену.',
        whyFitRu: 'Третья позиция отдаётся по себестоимости, а чек растёт на две полные позиции.',
        risks: ['Подходит не всем категориям', 'Может увеличить нагрузку в пик'],
        assumptions: ['Третья позиция — из недорогой категории', 'Гость покупает минимум две позиции'],
        offerRu: 'Две позиции — третья в подарок',
        offerKk: 'Екі позиция — үшіншісі сыйлыққа',
      };
    case 'happy_hours':
      return {
        benefitValue: 1500,
        thresholdMinor: 0,
        hypothesisRu: `Скидка только в тихое окно ${input.capacity.quietWindow} перераспределяет спрос, а не раздаёт её всем.`,
        whyFitRu: 'Выгода ограничена по времени, поэтому не затрагивает пиковые часы с полной маржой.',
        risks: ['Часть пикового спроса может перетечь в тихие часы', 'Нужен контроль на кассе'],
        assumptions: [`Окно ${input.capacity.quietWindow}`, input.capacity.weekdayOnly ? 'Только будни' : 'Все дни недели'],
        offerRu: `−15% в тихие часы ${input.capacity.quietWindow}`,
        offerKk: `${input.capacity.quietWindow} тыныш сағаттарда −15%`,
      };
    case 'percentage_discount':
      return {
        benefitValue: 2000,
        thresholdMinor: 0,
        hypothesisRu: 'Прямая скидка 20% даёт самый заметный отклик, но затрагивает и тех, кто купил бы без неё.',
        whyFitRu: 'Вариант для сравнения: показывает, как выглядит агрессивная механика рядом с безопасной.',
        risks: ['Скидку получают гости, которые и так пришли бы', 'Вклад-маржа может уйти ниже порога'],
        assumptions: ['Скидка действует на весь чек', 'Каннибализация не менее 15%'],
        offerRu: 'Скидка 20% на весь заказ',
        offerKk: 'Бүкіл тапсырысқа 20% жеңілдік',
      };
    case 'fixed_discount':
    default:
      return {
        benefitValue: tidy(Math.round(aov * 0.15), 50),
        thresholdMinor: 0,
        hypothesisRu: 'Фиксированная скидка понятна гостю и легко считается на кассе.',
        whyFitRu: 'Сумма выгоды не растёт вместе с чеком, поэтому риск ограничен сверху.',
        risks: ['На маленьком чеке доля скидки высокая', 'Не стимулирует увеличивать заказ'],
        assumptions: ['Скидка применяется один раз', 'Минимальный чек не задан'],
        offerRu: `Скидка ${tidy(Math.round(aov * 0.15), 50)} ₸ на заказ`,
        offerKk: `Тапсырысқа ${tidy(Math.round(aov * 0.15), 50)} ₸ жеңілдік`,
      };
  }
}

function buildMechanic(kind: MechanicKind, input: CampaignGenerationInput): ProposedMechanic {
  const plan = planFor(kind, input);
  const goal = GOAL_LABELS[input.goal];
  const audience = `${input.segment.label}: ${input.segment.size} гостей, из них ${input.segment.consentEligible} с действующим согласием на ${input.channel}`;

  // RU and KK are written as separate messages: the KK version is not a literal
  // rendering of the RU sentence, it addresses the guest in its own register.
  const copy: Record<Locale, { title: string; body: string; cta: string }> = {
    ru: {
      title: plan.offerRu,
      body: `Мы заметили, что вы давно к нам не заходили. Чтобы ${goal.ru}, приготовили для вас предложение: ${plan.offerRu.toLowerCase()}. Предложение личное и действует ${input.frequencyCap === 1 ? 'один раз' : 'ограниченное время'}.`,
      cta: 'Забрать предложение',
    },
    kk: {
      title: plan.offerKk,
      body: `Сізді көптен бері көрмедік. ${goal.kk.charAt(0).toUpperCase()}${goal.kk.slice(1)} мақсатында сізге арнайы ұсыныс дайындадық: ${plan.offerKk.toLowerCase()}. Ұсыныс жеке және ${input.frequencyCap === 1 ? 'бір рет' : 'шектеулі уақытта'} жарамды.`,
      cta: 'Ұсынысты алу',
    },
  };

  return Object.freeze({
    kind,
    benefitValue: plan.benefitValue,
    thresholdMinor: plan.thresholdMinor,
    durationDays: 7,
    channel: input.channel,
    hypothesis: plan.hypothesisRu,
    audienceSummary: audience,
    whyFit: plan.whyFitRu,
    risks: Object.freeze(plan.risks),
    requiredAssumptions: Object.freeze(plan.assumptions),
    copy: Object.freeze(copy),
  });
}

export function generateDeterministicProposal(input: CampaignGenerationInput): CampaignProposal {
  const kinds = GOAL_MECHANICS[input.goal] ?? GOAL_MECHANICS.reactivate;
  return Object.freeze({
    schemaVersion: CAMPAIGN_SCHEMA_VERSION,
    goal: input.goal,
    mechanics: Object.freeze(kinds.map((kind) => buildMechanic(kind, input))),
    notes: Object.freeze([
      'Варианты подготовлены встроенным детерминированным шаблоном QADAM, без обращения к языковой модели.',
      'Экономика каждого варианта в любом случае пересчитывается сервером и проверяется Margin Shield.',
    ]),
  });
}

/** Exposed so tests and the studio can offer every required mechanic for comparison. */
export function generateMechanicByKind(kind: MechanicKind, input: CampaignGenerationInput): ProposedMechanic {
  return buildMechanic(kind, input);
}

/**
 * The guaranteed customer brief.
 *
 * Same discipline as the campaign template: no provider is a supported state,
 * not an error. It says only what the aggregates already say, which is also why
 * it survives the "no invented numbers" check without special-casing.
 */
export function composeDeterministicBrief(input: CustomerBriefInput): CustomerBrief {
  const money = (minor: number) => `${minor} ${input.currency}`;
  const observations: string[] = [];

  observations.push(input.visits > 0
    ? `Визитов: ${input.visits}, средний чек ${money(input.averageCheckMinor)}.`
    : 'Покупок за этим гостем ещё не записано.');

  if (input.daysSinceLastVisit === null) {
    observations.push('Дата последнего визита неизвестна — источник продаж не подключён или гость ещё не покупал.');
  } else if (input.daysSinceLastVisit >= 30) {
    observations.push(`Последний визит был ${input.daysSinceLastVisit} дней назад — это уже спящий гость.`);
  } else {
    observations.push(`Последний визит был ${input.daysSinceLastVisit} дней назад.`);
  }

  const marketing = input.consents.find((item) => item.scope.startsWith('marketing'));
  observations.push(marketing?.status === 'granted'
    ? 'Согласие на рассылку действует — писать можно.'
    : 'Действующего согласия на рассылку нет: в кампанию этот гость не попадёт.');

  if (input.loyalty) {
    observations.push(`На карте лояльности ${input.loyalty.stamps} штампов и ${input.loyalty.points} баллов.`);
  }

  const nextStep = marketing?.status === 'granted'
    ? (input.daysSinceLastVisit !== null && input.daysSinceLastVisit >= 30
        ? 'Добавить в кампанию возврата — согласие есть, и гость давно не заходил.'
        : 'Держать в сегменте постоянных: специального повода писать сейчас нет.')
    : 'Получить согласие на рассылку при следующем визите — без него любая кампания его исключит.';

  return Object.freeze({
    schemaVersion: BRIEF_SCHEMA_VERSION,
    summary: input.visits > 0
      ? `${input.displayName}: стадия «${input.lifecycleStage}», ${input.visits} визитов, средний чек ${money(input.averageCheckMinor)}.`
      : `${input.displayName}: стадия «${input.lifecycleStage}», покупок пока не записано.`,
    observations: Object.freeze(observations.slice(0, 4)),
    nextStep,
    cautions: Object.freeze(['Это разбор по имеющимся данным, а не вывод о причинах поведения гостя.']),
  });
}

/**
 * Материалы для соцсетей, собранные без модели.
 *
 * Same discipline as everywhere else: no provider is a supported state. The
 * scripts are thinner than a model's, but they are shootable — a timing, a
 * shot list and a caption — which is more than a café owner had before.
 */
export function composeDeterministicSocialPack(input: SocialPackInput): SocialAsset[] {
  const money = (minor: number) => `${Number(minor).toLocaleString('ru-RU')} ₸`;
  const hero = input.menu[Math.min(1, Math.max(0, input.menu.length - 1))] ?? { name: 'фирменный напиток', priceMinor: 0 };
  const priceLine = hero.priceMinor ? ` — ${money(hero.priceMinor)}` : '';
  const assets: SocialAsset[] = [];

  const push = (kind: SocialAsset['kind'], locale: SocialAsset['locale'], title: string, body: string, cta: string, needs: string[]) => {
    assets.push({ kind, locale, title, body, cta, needs: Object.freeze(needs) });
  };

  for (const locale of input.locales) {
    const ru = locale === 'ru';

    push('reel_script', locale,
      ru ? `Reels: ${input.offer}` : `Reels: ${input.offer}`,
      ru
        ? `[0–3 с] Крупный план: ${hero.name}${priceLine}, пар над чашкой.\n[3–7 с] Руки бариста готовят заказ, на экране текст: «${input.offer}».\n[7–12 с] Гость забирает заказ и улыбается; в кадре вывеска ${input.businessName}.\n[12–15 с] Финальный кадр с текстом: «${input.offer}». Голоса не нужно, музыка спокойная.`
        : `[0–3 с] Ірі план: ${hero.name}${priceLine}.\n[3–7 с] Бариста тапсырысты дайындайды, экранда: «${input.offer}».\n[7–12 с] Қонақ тапсырысын алады, кадрда ${input.businessName} маңдайшасы.\n[12–15 с] Соңғы кадр: «${input.offer}».`,
      ru ? 'Зайти на этой неделе' : 'Осы аптада келу',
      ru ? ['Чистая барная стойка', 'Съёмка при дневном свете', 'Один гость-доброволец'] : ['Таза бар', 'Күндізгі жарық', 'Бір қонақ']);

    push('tiktok_script', locale,
      ru ? 'TikTok: три причины зайти' : 'TikTok: келуге үш себеп',
      ru
        ? `Хук (0–2 с): «三 причины зайти к нам на этой неделе» — заменить на текст на экране.\n1 (2–6 с): ${hero.name}${priceLine}.\n2 (6–10 с): ${input.offer}.\n3 (10–14 с): ${input.reward ?? 'карта лояльности: штампы за визиты'}.\nФинал (14–15 с): адрес и время работы на экране.`
        : `Хук (0–2 с): «Осы аптада келуге үш себеп».\n1 (2–6 с): ${hero.name}${priceLine}.\n2 (6–10 с): ${input.offer}.\n3 (10–14 с): ${input.reward ?? 'адалдық картасы'}.\nСоңы: мекенжай мен жұмыс уақыты.`,
      ru ? 'Смотреть условия' : 'Шарттарын көру',
      ru ? ['Три коротких кадра', 'Текст на экране крупно'] : ['Үш қысқа кадр', 'Экранда ірі мәтін']);

    push('photo_brief', locale,
      ru ? 'Фото: витрина и напиток' : 'Фото: витрина мен сусын',
      ru
        ? `Кадр 1: ${hero.name} на деревянной стойке, естественный свет сбоку, фон размыт.\nКадр 2: витрина целиком, видно вывеску.\nКадр 3: руки гостя с картой лояльности.\nПодпись: «${input.offer}». Снимать в ${input.quietWindow} — в это время меньше людей в кадре.`
        : `1-кадр: ${hero.name} ағаш үстелде, табиғи жарық.\n2-кадр: витрина толық.\n3-кадр: қонақтың қолындағы адалдық картасы.\nҚолтаңба: «${input.offer}».`,
      ru ? 'Забрать предложение' : 'Ұсынысты алу',
      ru ? ['Протереть стойку', 'Снимать до 12:00 или в ' + input.quietWindow] : ['Үстелді сүрту', input.quietWindow + ' аралығында түсіру']);

    push('story_series', locale,
      ru ? 'Сторис: три кадра' : 'Сторис: үш кадр',
      ru
        ? `1. «Мы на месте» — короткий кадр витрины, текст: ${input.businessName}, ${input.city}.\n2. «Что сегодня» — ${input.offer}.\n3. «Как получить» — покажите карту лояльности${input.reward ? ` и награду: ${input.reward}` : ''}.`
        : `1. «Біз осындамыз» — витрина, ${input.businessName}, ${input.city}.\n2. «Бүгін не бар» — ${input.offer}.\n3. «Қалай алуға болады» — адалдық картасы${input.reward ? `, сыйлық: ${input.reward}` : ''}.`,
      ru ? 'Смахните вверх' : 'Жоғары сырғытыңыз',
      ru ? ['Три вертикальных кадра'] : ['Үш тік кадр']);

    push('push_notice', locale,
      ru ? 'Уведомление гостям' : 'Қонақтарға хабарлама',
      ru
        ? `${input.businessName}: ${input.offer}. ${input.reward ? `На карте копятся штампы — ${input.reward}. ` : ''}Ждём вас.`
        : `${input.businessName}: ${input.offer}. ${input.reward ? `Картада мөрлер жиналады — ${input.reward}. ` : ''}Күтеміз.`,
      ru ? 'Открыть карту' : 'Картаны ашу',
      ru ? ['Отправляется только тем, кто дал согласие'] : ['Тек келісім бергендерге']);
  }

  return assets;
}
