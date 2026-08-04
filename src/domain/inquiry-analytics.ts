/**
 * Что видно по обращениям гостей.
 *
 * Считает то, что владелец может проверить руками: сколько написали, сколько
 * ответил ассистент, за сколько отвечает человек, о чём чаще всего пишут и
 * стало ли жалоб больше. Вывод в конце — предложение из этих же чисел, а не
 * мнение: «34% обращений о долгом ожидании» проверяется пересчётом, «клиенты
 * недовольны сервисом» — нет.
 *
 * Чистый модуль: время приходит аргументом.
 */

import { CATEGORY_LABELS, type InquiryCategory, type Sentiment } from './inquiry-triage.ts';

export interface InquiryRow {
  category: InquiryCategory | null;
  sentiment: Sentiment | null;
  status: string | null;
  occurredAt: string;
  answeredAt: string | null;
  answeredBy: 'ai' | 'owner' | null;
}

export interface CategoryShare {
  category: InquiryCategory;
  label: string;
  count: number;
  shareBps: number;
}

export interface InquirySummary {
  total: number;
  answered: number;
  waiting: number;
  autoAnsweredShareBps: number;
  escalatedShareBps: number;
  negativeShareBps: number;
  /** Медиана, а не среднее: один ответ через трое суток не должен красить всю неделю. */
  medianOwnerReplyMinutes: number | null;
  medianAssistantReplySeconds: number | null;
  topCategories: readonly CategoryShare[];
  /** Изменение доли жалоб против предыдущего такого же периода, в bps. `null` — сравнивать не с чем. */
  complaintChangeBps: number | null;
  /** Готовые выводы — по одному предложению, каждый проверяется пересчётом. */
  conclusions: readonly string[];
}

const MINUTE = 60_000;
const bps = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 10_000) : 0);
const percent = (value: number) => Math.round(value / 100);

function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

export function summariseInquiries(input: {
  rows: readonly InquiryRow[];
  /** Обращения предыдущего такого же периода — только чтобы сравнить долю жалоб. */
  previous?: readonly InquiryRow[];
  windowDays: number;
}): InquirySummary {
  const rows = input.rows;
  const total = rows.length;

  const answered = rows.filter((row) => row.answeredAt !== null).length;
  const auto = rows.filter((row) => row.answeredBy === 'ai').length;
  const waiting = rows.filter((row) => row.status === 'awaiting_owner').length;
  const negative = rows.filter((row) => row.sentiment === 'negative').length;

  const gap = (row: InquiryRow) => (row.answeredAt
    ? new Date(row.answeredAt).getTime() - new Date(row.occurredAt).getTime()
    : null);
  const ownerGaps = rows.filter((row) => row.answeredBy === 'owner').map(gap).filter((value): value is number => value !== null && value >= 0);
  const assistantGaps = rows.filter((row) => row.answeredBy === 'ai').map(gap).filter((value): value is number => value !== null && value >= 0);

  const counts = new Map<InquiryCategory, number>();
  for (const row of rows) {
    const category = row.category ?? 'other';
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  const topCategories = [...counts.entries()]
    .map(([category, count]) => ({ category, label: CATEGORY_LABELS[category], count, shareBps: bps(count, total) }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, 'ru'))
    .slice(0, 5);

  const complaintsNow = rows.filter((row) => row.category === 'complaint').length;
  const previous = input.previous ?? [];
  const complaintChangeBps = previous.length >= 5 && total >= 5
    ? bps(complaintsNow, total) - bps(previous.filter((row) => row.category === 'complaint').length, previous.length)
    : null;

  const summary: InquirySummary = {
    total,
    answered,
    waiting,
    autoAnsweredShareBps: bps(auto, total),
    escalatedShareBps: bps(total - auto, total),
    negativeShareBps: bps(negative, total),
    medianOwnerReplyMinutes: ownerGaps.length ? Math.round((median(ownerGaps) ?? 0) / MINUTE) : null,
    medianAssistantReplySeconds: assistantGaps.length ? Math.round((median(assistantGaps) ?? 0) / 1000) : null,
    topCategories,
    complaintChangeBps,
    conclusions: [],
  };

  return { ...summary, conclusions: concludeFrom(summary, input.windowDays) };
}

/**
 * Вывод — это пересказ чисел, а не догадка о причинах.
 *
 * Каждое предложение можно проверить: доля, счётчик, медиана. Там, где
 * напрашивается причина («гости недовольны сервисом»), продукт останавливается
 * на наблюдении и предлагает посмотреть, а не утверждает.
 */
function concludeFrom(summary: InquirySummary, windowDays: number): string[] {
  const lines: string[] = [];
  if (summary.total === 0) return ['За выбранный период гости ничего не писали.'];

  const top = summary.topCategories[0];
  if (top && top.shareBps >= 2_500) {
    lines.push(`За ${windowDays} дн. ${percent(top.shareBps)}% обращений — «${top.label}» (${top.count} из ${summary.total}). Это самая частая тема.`);
  }

  if (summary.autoAnsweredShareBps > 0) {
    lines.push(`Ассистент ответил сам на ${percent(summary.autoAnsweredShareBps)}% обращений${
      summary.medianAssistantReplySeconds !== null ? `, обычно за ${summary.medianAssistantReplySeconds} с` : ''
    }. Остальное дошло до вас.`);
  } else if (summary.total >= 3) {
    lines.push('Ассистент не ответил сам ни на одно обращение: либо темы закрыты настройками, либо в данных заведения нет ответов.');
  }

  if (summary.medianOwnerReplyMinutes !== null) {
    const hours = Math.round(summary.medianOwnerReplyMinutes / 60);
    lines.push(summary.medianOwnerReplyMinutes >= 120
      ? `Ваш ответ гость ждёт в среднем ${hours} ч. Темы, которые вы разрешите ассистенту, он закроет за секунды.`
      : `Вы отвечаете в среднем за ${summary.medianOwnerReplyMinutes} мин.`);
  }

  if (summary.waiting > 0) {
    lines.push(`${summary.waiting} обращений ждут ответа прямо сейчас.`);
  }

  if (summary.complaintChangeBps !== null && Math.abs(summary.complaintChangeBps) >= 500) {
    const change = percent(Math.abs(summary.complaintChangeBps));
    lines.push(summary.complaintChangeBps < 0
      ? `Доля жалоб снизилась на ${change} п. п. против предыдущих ${windowDays} дн.`
      : `Доля жалоб выросла на ${change} п. п. против предыдущих ${windowDays} дн. Причину показывают сами обращения — продукт её не угадывает.`);
  }

  if (summary.negativeShareBps >= 3_000) {
    lines.push(`${percent(summary.negativeShareBps)}% обращений написаны с недовольством. Это наблюдение по тексту, а не оценка вашей работы.`);
  }

  return lines;
}
