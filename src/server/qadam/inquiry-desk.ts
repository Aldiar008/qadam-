import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  CATEGORY_LABELS, classifyInquiry, decideAnswer, isInquiryCategory,
  type AnswerDecision, type InquiryCategory, type PolicyMode, type Triage,
} from '@/domain/inquiry-triage';
import { answerGuest } from '@/server/ai/guest-assistant';

/**
 * Центр обращений: что происходит с сообщением гостя сразу после отправки.
 *
 * Раньше любое сообщение из мини-приложения ложилось в общую кучу с пометкой
 * «нужен человек» — включая «во сколько вы открываетесь», на что у продукта
 * есть точный ответ из часов работы заведения. Владелец кофейни ночью получал
 * уведомление о вопросе, ответ на который был в его же данных.
 *
 * Теперь обращение разбирается: тема, настроение, срочность, проект ответа. И
 * дальше решается, кто этот ответ отправит. Разрешённые владельцем бытовые темы
 * уходят гостю сразу; жалобы и всё денежное ждут человека всегда.
 */

export interface TriageOutcome {
  triage: Triage;
  decision: AnswerDecision;
  draft: string;
  /** Ответ написан моделью или встроенным шаблоном — подписывается владельцу. */
  source: 'provider' | 'deterministic_fallback';
  /** Ушёл ли ответ гостю прямо сейчас. */
  sent: boolean;
}

export async function loadInquiryPolicies(
  db: SupabaseClient,
  businessId: string,
): Promise<Partial<Record<InquiryCategory, PolicyMode>>> {
  const { data } = await db.from('inquiry_policies')
    .select('category,mode').eq('business_id', businessId).limit(50);
  const policies: Partial<Record<InquiryCategory, PolicyMode>> = {};
  for (const row of (data ?? []) as { category: string; mode: string }[]) {
    if (isInquiryCategory(row.category) && (row.mode === 'auto' || row.mode === 'approve')) {
      policies[row.category] = row.mode;
    }
  }
  return policies;
}

/**
 * Разобрать обращение и, если можно, ответить на него.
 *
 * Порядок важен: сначала на обращение записывается разбор со статусом «ждёт
 * владельца», и только потом — если решение позволяет — отправляется ответ,
 * который переводит статус в «ответил ассистент». Обратный порядок оставил бы
 * обращение отвеченным, но не разобранным, если второй шаг не выполнится.
 */
export async function triageInquiry(
  db: SupabaseClient,
  command: { businessId: string; customerId: string | null; inquiryId: string; body: string },
): Promise<TriageOutcome> {
  const triage = classifyInquiry(command.body);

  const [policies, answer] = await Promise.all([
    loadInquiryPolicies(db, command.businessId),
    answerGuest(db, {
      businessId: command.businessId,
      customerId: command.customerId,
      question: command.body,
      idempotencyKey: `inquiry:${command.inquiryId}`,
    }).catch(() => null),
  ]);

  const draft = (answer?.reply.reply ?? '').trim();
  const decision = decideAnswer({
    ownTriage: triage,
    needsHuman: answer?.reply.needsHuman ?? true,
    policies,
    hasDraft: draft.length > 2,
  });

  await db.from('customer_interactions').update({
    category: decision.category,
    sentiment: triage.sentiment,
    urgency: triage.urgency,
    status: 'awaiting_owner',
    draft_reply: draft || null,
    metadata: {
      surface: 'mini_app',
      triage: {
        matched: triage.matched,
        reason: decision.reason,
        source: answer?.source ?? 'unavailable',
      },
    },
  }).eq('id', command.inquiryId).eq('business_id', command.businessId);

  let sent = false;
  if (decision.automatic) {
    const { error } = await db.rpc('answer_inquiry', {
      p_inquiry_id: command.inquiryId,
      p_body: draft,
      p_answered_by: 'ai',
    });
    // Отказ базы — это ответ, а не сбой: обращение просто остаётся у владельца.
    sent = !error;
  }

  return { triage, decision, draft, source: answer?.source ?? 'deterministic_fallback', sent };
}

/** Что показать гостю сразу после отправки сообщения. */
export function guestAcknowledgement(outcome: TriageOutcome): string {
  if (outcome.sent) return 'Ответ уже в переписке ниже.';
  if (outcome.triage.category === 'complaint' || outcome.triage.category === 'money') {
    return 'Сообщение передано владельцу — на такие вопросы отвечает человек, а не бот.';
  }
  return 'Сообщение передано заведению. Ответ придёт сюда же.';
}

export const INQUIRY_CATEGORY_LABELS = CATEGORY_LABELS;

// ---------------------------------------------------------------------------
// Экран центра обращений
// ---------------------------------------------------------------------------

/** Обращения, ответы к ним, настройки и сводка — одним чтением. */
export async function getInquiryDeskData(filters: { days?: number; category?: string } = {}) {
  const { requireBusinessContext } = await import('./repository');
  const { summariseInquiries } = await import('@/domain/inquiry-analytics');
  const ctx = await requireBusinessContext();

  const days = Math.min(180, Math.max(7, filters.days ?? 30));
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const previousSince = new Date(Date.now() - days * 2 * 86_400_000).toISOString();

  const [{ data: rows }, { data: policyRows }] = await Promise.all([
    ctx.supabase.from('customer_interactions')
      .select('id,customer_id,direction,kind,body,occurred_at,metadata,category,sentiment,urgency,status,draft_reply,answered_by,answered_at,customers(display_name)')
      .eq('business_id', ctx.businessId)
      .gte('occurred_at', previousSince)
      .in('kind', ['question', 'answer'])
      .order('occurred_at', { ascending: false })
      .limit(500),
    ctx.supabase.from('inquiry_policies').select('category,mode').eq('business_id', ctx.businessId).limit(50),
  ]);

  type Row = {
    id: string; customer_id: string | null; direction: string; kind: string; body: string;
    occurred_at: string; metadata: Record<string, unknown> | null; category: string | null;
    sentiment: string | null; urgency: number | null; status: string | null; draft_reply: string | null;
    answered_by: string | null; answered_at: string | null;
    customers: { display_name?: string | null } | { display_name?: string | null }[] | null;
  };
  const all = (rows ?? []) as unknown as Row[];
  const inbound = all.filter((row) => row.direction === 'inbound');
  const current = inbound.filter((row) => row.occurred_at >= since);
  const earlier = inbound.filter((row) => row.occurred_at < since);

  const summary = summariseInquiries({
    rows: current.map((row) => ({
      category: (row.category ?? null) as never,
      sentiment: (row.sentiment ?? null) as never,
      status: row.status,
      occurredAt: row.occurred_at,
      answeredAt: row.answered_at,
      answeredBy: (row.answered_by ?? null) as 'ai' | 'owner' | null,
    })),
    previous: earlier.map((row) => ({
      category: (row.category ?? null) as never,
      sentiment: (row.sentiment ?? null) as never,
      status: row.status,
      occurredAt: row.occurred_at,
      answeredAt: row.answered_at,
      answeredBy: (row.answered_by ?? null) as 'ai' | 'owner' | null,
    })),
    windowDays: days,
  });

  // Ответы подклеиваются к обращению, чтобы владелец видел разговор целиком.
  const repliesByInquiry = new Map<string, Row[]>();
  for (const row of all) {
    if (row.direction !== 'outbound') continue;
    const meta = (row.metadata ?? {}) as { in_reply_to?: string };
    if (!meta.in_reply_to) continue;
    const list = repliesByInquiry.get(meta.in_reply_to) ?? [];
    list.push(row);
    repliesByInquiry.set(meta.in_reply_to, list);
  }

  const wanted = filters.category && filters.category !== 'all' ? filters.category : null;
  const threads = current
    .filter((row) => !wanted || (row.category ?? 'other') === wanted)
    .map((row) => {
      const person = Array.isArray(row.customers) ? row.customers[0] : row.customers;
      const triage = ((row.metadata ?? {}) as { triage?: { reason?: string; matched?: string[] } }).triage ?? {};
      return {
        id: row.id,
        customerId: row.customer_id,
        name: person?.display_name || 'Гость',
        body: row.body,
        occurredAt: row.occurred_at,
        category: (row.category ?? 'other') as InquiryCategory,
        sentiment: row.sentiment,
        urgency: row.urgency ?? 1,
        status: row.status ?? 'awaiting_owner',
        draft: row.draft_reply,
        answeredBy: row.answered_by,
        answeredAt: row.answered_at,
        reason: triage.reason ?? null,
        matched: triage.matched ?? [],
        replies: (repliesByInquiry.get(row.id) ?? []).sort((a, b) => a.occurred_at.localeCompare(b.occurred_at)),
      };
    })
    // Ждущие ответа — первыми: ради них этот экран и открывают.
    .sort((left, right) => {
      const waiting = Number(right.status === 'awaiting_owner') - Number(left.status === 'awaiting_owner');
      return waiting || right.urgency - left.urgency || right.occurredAt.localeCompare(left.occurredAt);
    });

  const policies: Partial<Record<InquiryCategory, PolicyMode>> = {};
  for (const row of (policyRows ?? []) as { category: string; mode: string }[]) {
    if (isInquiryCategory(row.category) && (row.mode === 'auto' || row.mode === 'approve')) {
      policies[row.category] = row.mode;
    }
  }

  const counts = new Map<string, number>();
  for (const row of current) counts.set(row.category ?? 'other', (counts.get(row.category ?? 'other') ?? 0) + 1);

  return { ...ctx, days, summary, threads, policies, counts, selected: wanted ?? 'all' };
}
