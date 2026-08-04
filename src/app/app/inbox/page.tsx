import Link from 'next/link';
import { AlertTriangle, Bot, Clock, User } from 'lucide-react';

import {
  ALWAYS_NEEDS_A_PERSON, CATEGORY_LABELS, DEFAULT_POLICY, INQUIRY_CATEGORIES,
} from '@/domain/inquiry-triage';
import { getInquiryDeskData } from '@/server/qadam/inquiry-desk';
import { canManage } from '@/server/qadam/repository';
import { answerInquiryAsOwner, setInquiryPolicy } from './actions';

export const dynamic = 'force-dynamic';

const moment = (iso: string) => new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const percent = (value: number) => `${Math.round(value / 100)}%`;

const SENTIMENT_TONE: Record<string, string> = {
  negative: 'bg-rose-500/10 text-rose-800',
  neutral: 'bg-surface-muted text-muted-foreground',
  positive: 'bg-emerald-500/10 text-emerald-800',
};
const SENTIMENT_LABEL: Record<string, string> = {
  negative: 'недоволен', neutral: 'спокойно', positive: 'доволен',
};
const URGENCY_LABEL: Record<number, string> = { 1: 'может подождать', 2: 'сегодня', 3: 'сейчас' };

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; category?: string; answered?: string; policy?: string; error?: string }>;
}) {
  const params = await searchParams;
  const data = await getInquiryDeskData({ days: Number(params.days) || 30, category: params.category });
  const canAnswer = canManage(data.role);
  const { summary } = data;

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Обращения гостей</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Всё, что {data.words.personMany} пишут заведению, приходит сюда. Ассистент разбирает тему,
            настроение и срочность и готовит проект ответа. На бытовые вопросы он отвечает сам —
            по темам, которые вы разрешили. Жалобы и всё денежное ждут вас: такой ответ отправляет
            человек, и это правило базы, а не настройка.
          </p>
        </div>
        <nav aria-label="Период" className="flex gap-2">
          {[7, 30, 90].map((option) => (
            <Link
              key={option}
              href={`/app/inbox?days=${option}${data.selected !== 'all' ? `&category=${data.selected}` : ''}`}
              className={`min-h-11 rounded-xl px-4 py-2 text-sm font-bold ${data.days === option ? 'bg-primary text-primary-foreground' : 'border border-border bg-surface'}`}
            >
              {option} дн.
            </Link>
          ))}
        </nav>
      </header>

      {params.error && (
        <div role="alert" className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4 text-sm font-semibold text-rose-800">
          <AlertTriangle className="mr-2 inline size-4" aria-hidden="true" />{decodeURIComponent(params.error)}
        </div>
      )}
      {(params.answered || params.policy) && (
        <div role="status" className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm font-semibold text-emerald-800">
          {params.answered && 'Ответ отправлен гостю — он видит его в своём приложении.'}
          {params.policy && 'Правило сохранено. Оно действует со следующего обращения.'}
        </div>
      )}

      {/* Аналитика ---------------------------------------------------------- */}
      <section aria-label="Показатели обращений" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Обращений', String(summary.total), `за ${data.days} дн.`],
          ['Ответил ассистент', percent(summary.autoAnsweredShareBps),
            summary.medianAssistantReplySeconds === null ? 'пока ни разу' : `обычно за ${summary.medianAssistantReplySeconds} с`],
          ['Дошло до вас', percent(summary.escalatedShareBps), `${summary.waiting} ждут ответа`],
          ['Ваш ответ гость ждёт', summary.medianOwnerReplyMinutes === null ? '—' : `${summary.medianOwnerReplyMinutes} мин`,
            summary.medianOwnerReplyMinutes === null ? 'вы ещё не отвечали' : 'медиана, а не среднее'],
        ].map(([label, value, note]) => (
          <article key={label} className="rounded-2xl border border-border bg-surface p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-2 font-mono text-xl font-bold">{value}</p>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{note}</p>
          </article>
        ))}
      </section>

      {summary.conclusions.length > 0 && (
        <section className="rounded-3xl border border-border bg-surface p-6">
          <h2 className="text-lg font-bold">Что из этого следует</h2>
          <ul className="mt-3 grid gap-2">
            {summary.conclusions.map((line) => (
              <li key={line} className="flex gap-2 text-sm leading-6">
                <span aria-hidden="true" className="text-primary">·</span>{line}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            Каждое предложение здесь — пересказ чисел выше, а не догадка о причинах. Причину показывают
            сами обращения.
          </p>
        </section>
      )}

      {/* Фильтр по темам ---------------------------------------------------- */}
      <nav aria-label="Фильтр по теме" className="flex flex-wrap gap-2">
        <Link
          href={`/app/inbox?days=${data.days}`}
          className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold ${data.selected === 'all' ? 'bg-primary text-primary-foreground' : 'border border-border bg-surface'}`}
        >
          Все ({summary.total})
        </Link>
        {INQUIRY_CATEGORIES.filter((category) => (data.counts.get(category) ?? 0) > 0).map((category) => (
          <Link
            key={category}
            href={`/app/inbox?days=${data.days}&category=${category}`}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold ${data.selected === category ? 'bg-primary text-primary-foreground' : 'border border-border bg-surface'}`}
          >
            {CATEGORY_LABELS[category]} ({data.counts.get(category)})
          </Link>
        ))}
      </nav>

      {/* Обращения ---------------------------------------------------------- */}
      {data.threads.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-border p-10 text-center">
          <h2 className="text-lg font-bold">Обращений нет</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            {data.selected === 'all'
              ? `За ${data.days} дн. ${data.words.personMany} ничего не писали. Кнопка «Написать заведению» есть у каждого в Telegram-приложении.`
              : 'По этой теме за выбранный период обращений не было.'}
          </p>
        </section>
      ) : (
        <div className="grid gap-4">
          {data.threads.map((thread) => {
            const waiting = thread.status === 'awaiting_owner';
            const needsPerson = ALWAYS_NEEDS_A_PERSON.includes(thread.category);
            return (
              <article key={thread.id} className={`rounded-3xl border bg-surface p-5 sm:p-6 ${waiting ? 'border-amber-500/40' : 'border-border'}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">{CATEGORY_LABELS[thread.category]}</span>
                  {thread.sentiment && (
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${SENTIMENT_TONE[thread.sentiment] ?? SENTIMENT_TONE.neutral}`}>
                      {SENTIMENT_LABEL[thread.sentiment] ?? thread.sentiment}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-3 py-1 text-xs font-bold text-muted-foreground">
                    <Clock className="size-3.5" aria-hidden="true" />{URGENCY_LABEL[thread.urgency] ?? '—'}
                  </span>
                  {waiting
                    ? <span className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-bold text-amber-900">ждёт вашего ответа</span>
                    : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-800">
                        {thread.answeredBy === 'ai' ? <Bot className="size-3.5" aria-hidden="true" /> : <User className="size-3.5" aria-hidden="true" />}
                        {thread.answeredBy === 'ai' ? 'ответил ассистент' : 'вы ответили'}
                        {thread.answeredAt ? ` · ${moment(thread.answeredAt)}` : ''}
                      </span>
                    )}
                </div>

                <p className="mt-3 text-sm font-bold">
                  {thread.customerId
                    ? <Link href={`/app/customers/${thread.customerId}`} className="text-primary hover:underline">{thread.name}</Link>
                    : thread.name}
                  <span className="ml-2 font-normal text-xs text-muted-foreground">{moment(thread.occurredAt)}</span>
                </p>
                <p className="mt-2 whitespace-pre-line rounded-2xl bg-primary/5 p-4 text-sm leading-6">{thread.body}</p>

                {thread.reason && (
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    Разбор: {thread.reason}
                    {thread.matched.length > 0 && ` Слова, по которым решено: ${thread.matched.join(', ')}.`}
                  </p>
                )}

                {thread.replies.length > 0 && (
                  <ul className="mt-3 grid gap-2">
                    {thread.replies.map((reply) => (
                      <li key={reply.id} className="rounded-2xl border border-border bg-surface-muted p-3 text-sm leading-6">
                        <p className="whitespace-pre-line">{reply.body}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {reply.answered_by === 'ai' ? 'ассистент' : 'вы'} · {moment(reply.occurred_at)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}

                {canAnswer && waiting && (
                  <form action={answerInquiryAsOwner} className="mt-4 grid gap-2">
                    <input type="hidden" name="inquiryId" value={thread.id} />
                    <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                      {thread.draft
                        ? needsPerson
                          ? 'Проект ответа. Ассистент его подготовил, но не отправил — эту тему отправляете вы.'
                          : 'Проект ответа. Отправьте как есть или исправьте.'
                        : 'Ассистенту нечего было предложить — напишите ответ сами.'}
                      <textarea
                        name="body"
                        required
                        rows={3}
                        maxLength={1500}
                        defaultValue={thread.draft ?? ''}
                        placeholder="Ответ гостю…"
                        className="w-full rounded-2xl border border-border bg-surface-muted p-3 text-sm font-normal leading-6 text-foreground outline-none focus:ring-2 focus:ring-primary"
                      />
                    </label>
                    <div>
                      <button className="min-h-11 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground">
                        Отправить гостю
                      </button>
                    </div>
                  </form>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* Правила ответов ---------------------------------------------------- */}
      <section id="inquiry-policies" className="scroll-mt-24 rounded-3xl border border-border bg-surface p-6">
        <h2 className="text-xl font-bold">На что ассистент отвечает сам</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Вы решаете это по темам. Кроме двух: жалобы и денежные вопросы — возврат, компенсация,
          скидка — отвечает человек. Переключателя для них нет, и его нет намеренно: ответ, который
          стоит денег или репутации, не должна отправлять машина. Это ограничение стоит в базе, а не
          только на этом экране.
        </p>

        <div className="mt-5 grid gap-2">
          {INQUIRY_CATEGORIES.map((category) => {
            const mode = data.policies[category] ?? DEFAULT_POLICY[category];
            const locked = ALWAYS_NEEDS_A_PERSON.includes(category);
            return (
              <div key={category} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border p-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold">{CATEGORY_LABELS[category]}</p>
                  <p className="text-xs text-muted-foreground">
                    {locked
                      ? 'Всегда через вас — правило продукта'
                      : mode === 'auto' ? 'Ассистент отвечает сам' : 'Ждёт вашего подтверждения'}
                  </p>
                </div>
                {canManage(data.role) && !locked && (
                  <form action={setInquiryPolicy} className="flex items-center gap-2">
                    <input type="hidden" name="category" value={category} />
                    <input type="hidden" name="mode" value={mode === 'auto' ? 'approve' : 'auto'} />
                    <button className="min-h-11 rounded-xl border border-border px-4 text-xs font-bold">
                      {mode === 'auto' ? 'Требовать подтверждение' : 'Разрешить автоответ'}
                    </button>
                  </form>
                )}
                {locked && (
                  <span className="rounded-full bg-surface-muted px-3 py-1 text-xs font-bold text-muted-foreground">только человек</span>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
