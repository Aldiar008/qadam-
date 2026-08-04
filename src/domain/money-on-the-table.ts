/**
 * Сколько денег лежит на столе прямо сейчас.
 *
 * Владельцу кофейни не нужен дашборд. Ему нужно предложение вида «двенадцать
 * гостей молчат дольше обычного, обычно каждый третий из таких возвращается —
 * это примерно столько-то тенге; вот кнопка». Экран «Сегодня» показывал
 * показатели и один сигнал: правильные вещи, но ни одна из них не отвечала на
 * вопрос «что я с этого получу».
 *
 * Здесь считаются возможности, а не обещания. У каждой строки есть своё
 * основание, и оно печатается рядом с суммой: сумма без метода — это просто
 * красивое число. Там, где считать не из чего, стоит `null`, а не ноль и не
 * догадка.
 *
 * Модуль чистый: время приходит аргументом, к базе он не ходит.
 */

import { estimateReturn, type CohortObservation } from './customer-insights.ts';

export type OpportunityKind = 'sleeping' | 'unanswered' | 'quiet_hours' | 'declining_item';

export interface Opportunity {
  kind: OpportunityKind;
  title: string;
  detail: string;
  /** `null` — величину нечем измерить. Это ответ, а не пропуск. */
  amountMinor: number | null;
  basis: string;
  actionLabel: string;
  actionHref: string;
}

export interface HourSlice {
  hour: number;
  revenueMinor: number;
  /** Сколько дней попало в срез — чтобы сравнивать средние, а не суммы. */
  days: number;
}

export interface ItemTrend {
  name: string;
  recentMinor: number;
  previousMinor: number;
}

export interface GuestState {
  daysSinceLastVisit: number;
  visits: number;
  consentGranted: boolean;
}

export interface MoneyInput {
  averageCheckMinor: number;
  guests: readonly GuestState[];
  cohort: readonly CohortObservation[];
  unansweredQuestions: number;
  /** Доля обращений, за которыми в течение недели последовала покупка. `null` — не измерено. */
  questionConversionBps: number | null;
  hourly: readonly HourSlice[];
  itemTrend: readonly ItemTrend[];
  /** Порог молчания, после которого гость считается спящим. */
  sleepingAfterDays?: number;
  /**
   * Слова этого бизнеса: гость или пациент, визит или приём.
   *
   * По умолчанию — язык кофейни, потому что расчёты писались на её данных.
   * Стоматологии «12 гостей не приходили» читается как чужой текст.
   */
  words?: { personGenitive: string; visitGenitive: string };
}

export interface MoneyOnTheTable {
  totalMinor: number;
  opportunities: readonly Opportunity[];
  peak: { hour: number; shareBps: number } | null;
  quietest: { hour: number; shareBps: number } | null;
  notes: readonly string[];
}

const bps = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 10_000) : 0);

function median(values: readonly number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

export function moneyOnTheTable(input: MoneyInput): MoneyOnTheTable {
  const sleepingAfterDays = input.sleepingAfterDays ?? 30;
  const people = input.words?.personGenitive ?? 'гостей';
  const opportunities: Opportunity[] = [];
  const notes: string[] = [];

  // --- гости, которые молчат ---------------------------------------------
  const sleeping = input.guests.filter((guest) => guest.daysSinceLastVisit >= sleepingAfterDays && guest.visits > 0);
  const reachable = sleeping.filter((guest) => guest.consentGranted);
  if (sleeping.length) {
    const silence = Math.round(median(sleeping.map((guest) => guest.daysSinceLastVisit)));
    const estimate = estimateReturn(input.cohort, silence, 30);
    const amount = estimate && input.averageCheckMinor > 0
      ? Math.round(reachable.length * (estimate.probabilityBps / 10_000) * input.averageCheckMinor)
      : null;

    opportunities.push({
      kind: 'sleeping',
      title: `${sleeping.length} ${people} не приходили ${silence} дней и дольше`,
      detail: reachable.length === sleeping.length
        ? 'Всем можно написать: согласие на рассылку у них действует.'
        : `Написать можно ${reachable.length} из них — у остальных нет действующего согласия, и кампания их исключит.`,
      amountMinor: amount,
      basis: estimate
        ? `${Math.round(estimate.probabilityBps / 100)}% таких гостей возвращаются в течение 30 дней (посчитано по ${estimate.sampleAtRisk} случаям вашей базы), средний чек ${input.averageCheckMinor} ₸.`
        : 'Сколько таких гостей возвращается — пока не на чем считать: в базе мало сравнимых случаев.',
      actionLabel: 'Собрать кампанию возврата',
      actionHref: '/app/campaigns/studio?step=1&goal=reactivate',
    });
    if (!estimate) notes.push('Вероятность возврата появится, когда в базе накопятся сравнимые промежутки между визитами.');
  }

  // --- вопросы, оставшиеся без ответа ------------------------------------
  if (input.unansweredQuestions > 0) {
    const conversion = input.questionConversionBps;
    opportunities.push({
      kind: 'unanswered',
      title: `${input.unansweredQuestions} вопросов от ${people} без ответа`,
      detail: 'Человек написал в бот заведения и до сих пор ничего не получил.',
      amountMinor: conversion !== null && input.averageCheckMinor > 0
        ? Math.round(input.unansweredQuestions * (conversion / 10_000) * input.averageCheckMinor)
        : null,
      basis: conversion !== null
        ? `${Math.round(conversion / 100)}% обращений у вас заканчиваются покупкой в течение недели, средний чек ${input.averageCheckMinor} ₸.`
        : 'В деньгах не считается: связи «ответили — купил» в ваших данных пока слишком мало.',
      actionLabel: 'Ответить гостям',
      actionHref: '/app/notifications',
    });
  }

  // --- тихие часы ---------------------------------------------------------
  const openHours = input.hourly.filter((slice) => slice.days > 0);
  let peak: MoneyOnTheTable['peak'] = null;
  let quietest: MoneyOnTheTable['quietest'] = null;
  if (openHours.length >= 4) {
    const totalRevenue = openHours.reduce((sum, slice) => sum + slice.revenueMinor, 0);
    const perDay = openHours.map((slice) => ({ hour: slice.hour, value: slice.revenueMinor / slice.days }));
    const busiest = [...perDay].sort((a, b) => b.value - a.value)[0];
    const calmest = [...perDay].sort((a, b) => a.value - b.value)[0];
    const middle = median(perDay.map((slice) => Math.round(slice.value)));
    peak = { hour: busiest.hour, shareBps: bps(openHours.find((s) => s.hour === busiest.hour)?.revenueMinor ?? 0, totalRevenue) };
    quietest = { hour: calmest.hour, shareBps: bps(openHours.find((s) => s.hour === calmest.hour)?.revenueMinor ?? 0, totalRevenue) };

    const quiet = perDay.filter((slice) => slice.value < middle * 0.6);
    if (quiet.length && middle > 0) {
      const weekly = Math.round(quiet.reduce((sum, slice) => sum + (middle - slice.value), 0) * 7);
      opportunities.push({
        kind: 'quiet_hours',
        title: `${quiet.length} часов работы приносят меньше половины обычного`,
        detail: `Самый тихий час — ${calmest.hour}:00. Пик приходится на ${busiest.hour}:00.`,
        amountMinor: weekly,
        basis: `Если довести тихие часы до вашего же среднего часа (${Math.round(middle)} ₸), за неделю это ${weekly} ₸. Персонал и аренда в эти часы вы платите в любом случае.`,
        actionLabel: 'Акция на тихие часы',
        actionHref: '/app/campaigns/studio?step=3&mechanic=happy_hours',
      });
    }
  }

  // --- позиция теряет продажи ---------------------------------------------
  const declining = input.itemTrend
    .filter((item) => item.previousMinor > 0 && item.recentMinor < item.previousMinor * 0.85)
    .map((item) => ({ ...item, lostMinor: item.previousMinor - item.recentMinor, dropBps: bps(item.previousMinor - item.recentMinor, item.previousMinor) }))
    .sort((left, right) => right.lostMinor - left.lostMinor);
  if (declining.length) {
    const worst = declining[0];
    opportunities.push({
      kind: 'declining_item',
      title: `«${worst.name}» продаётся хуже на ${Math.round(worst.dropBps / 100)}%`,
      detail: declining.length > 1
        ? `И ещё ${declining.length - 1} позиций просели за тот же период.`
        : 'Остальные позиции держатся на прежнем уровне.',
      amountMinor: worst.lostMinor,
      basis: `Столько эта позиция не добрала за последний период против предыдущего такого же. Причину покажет либо цена, либо место в меню — QADAM не утверждает, какая из двух.`,
      actionLabel: 'Посмотреть в аналитике',
      actionHref: '/app/analytics?days=90',
    });
  }

  const totalMinor = opportunities.reduce((sum, item) => sum + (item.amountMinor ?? 0), 0);
  if (opportunities.some((item) => item.amountMinor === null)) {
    notes.push('Строки без суммы — это возможности, которые есть, но которые пока нечем оценить в деньгах.');
  }

  return { totalMinor, opportunities, peak, quietest, notes };
}
