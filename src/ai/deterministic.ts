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

import {
  CAMPAIGN_SCHEMA_VERSION,
  type CampaignGenerationInput,
  type CampaignProposal,
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
