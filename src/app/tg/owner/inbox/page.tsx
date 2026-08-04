import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { readTelegramSession } from '@/server/telegram/session';
import { CATEGORY_LABELS, type InquiryCategory } from '@/domain/inquiry-triage';
import { answerGuestAsOwner } from '../../actions';

export const dynamic = 'force-dynamic';

const moment = (iso: string) => new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

interface Row {
  id: string;
  customer_id: string | null;
  direction: string;
  kind: string;
  body: string;
  occurred_at: string;
  metadata: Record<string, unknown> | null;
  category: string | null;
  status: string | null;
  draft_reply: string | null;
  answered_by: string | null;
  customers: { display_name?: string | null } | { display_name?: string | null }[] | null;
}

/**
 * Вопросы гостей, на которые должен ответить человек.
 *
 * The bot answers what the data answers. Everything else waits here — and the
 * reply the owner types lands in the guest's own app and in their chat, so an
 * answer given at midnight is not waiting to be discovered.
 */
export default async function OwnerInboxPage({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string }> }) {
  const params = await searchParams;
  const session = await readTelegramSession();
  if (!session) redirect('/tg');
  if (!session.ownerUserId) redirect('/tg/card');

  const db = createAdminClient();
  const { data: rows } = await db
    .from('customer_interactions')
    .select('id,customer_id,direction,kind,body,occurred_at,metadata,category,status,draft_reply,answered_by,customers(display_name)')
    .eq('business_id', session.businessId)
    .in('kind', ['question', 'answer'])
    .order('occurred_at', { ascending: false })
    .limit(60);

  const all = (rows ?? []) as unknown as Row[];

  // One thread per guest, so a question and its answer sit together.
  const threads = new Map<string, { name: string; rows: Row[] }>();
  for (const row of all) {
    if (!row.customer_id) continue;
    const person = Array.isArray(row.customers) ? row.customers[0] : row.customers;
    const thread = threads.get(row.customer_id) ?? { name: person?.display_name || 'Гость', rows: [] };
    thread.rows.push(row);
    threads.set(row.customer_id, thread);
  }

  // Unanswered first: that is the whole reason to open this screen.
  const ordered = [...threads.entries()].map(([customerId, thread]) => {
    const sorted = [...thread.rows].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
    const lastQuestion = [...sorted].reverse().find((row) => row.direction === 'inbound');
    const answeredAfter = lastQuestion
      ? sorted.some((row) => row.direction === 'outbound' && row.kind === 'answer' && row.occurred_at > lastQuestion.occurred_at)
      : true;
    return { customerId, name: thread.name, rows: sorted.slice(-6), answeredAfter, waiting: lastQuestion?.status === 'awaiting_owner' ? lastQuestion : null };
  }).sort((a, b) => Number(a.answeredAfter) - Number(b.answeredAfter));

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold">Вопросы гостей</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Ассистент отвечает сам на разрешённые вами темы. Жалобы и всё денежное ждут здесь —
          вместе с готовым проектом ответа, который можно отправить как есть или исправить.
        </p>
      </header>

      {params.sent && <p role="status" className="rounded-2xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800">Ответ отправлен гостю.</p>}
      {params.error && <p role="alert" className="rounded-2xl bg-amber-500/10 px-4 py-3 text-sm text-amber-900">{decodeURIComponent(params.error)}</p>}

      {ordered.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Гости пока ничего не спрашивали.
        </p>
      ) : (
        ordered.map((thread) => (
          <section key={thread.customerId} className={'rounded-3xl border bg-surface p-5 ' + (thread.answeredAfter ? 'border-border' : 'border-amber-500/40')}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-bold">{thread.name}</p>
              {!thread.answeredAfter && (
                <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-bold text-amber-900">ждёт ответа</span>
              )}
            </div>

            <div className="mt-3 grid gap-2">
              {thread.rows.map((row) => {
                return (
                  <div key={row.id} className={'rounded-2xl p-3 text-sm leading-6 ' + (row.direction === 'inbound' ? 'bg-primary/10' : 'border border-border bg-surface-muted')}>
                    <p className="whitespace-pre-line">{row.body}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {row.direction === 'inbound' ? 'гость' : row.answered_by === 'ai' ? 'ассистент' : 'вы'} · {moment(row.occurred_at)}
                    </p>
                  </div>
                );
              })}
            </div>

            <form action={answerGuestAsOwner} className="mt-3 grid gap-2">
              <input type="hidden" name="customerId" value={thread.customerId} />
              {thread.waiting && <input type="hidden" name="inquiryId" value={thread.waiting.id} />}
              {thread.waiting?.category && (
                <p className="text-[11px] font-bold text-muted-foreground">
                  {CATEGORY_LABELS[thread.waiting.category as InquiryCategory] ?? thread.waiting.category}
                  {thread.waiting.draft_reply ? ' · проект ответа готов, проверьте' : ''}
                </p>
              )}
              <textarea
                name="body"
                required
                defaultValue={thread.waiting?.draft_reply ?? ''}
                rows={3}
                maxLength={1500}
                placeholder="Ответить гостю…"
                className="w-full rounded-2xl border border-border bg-surface-muted p-3 text-sm leading-6 outline-none focus:ring-2 focus:ring-primary"
              />
              <button className="min-h-11 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground">Отправить</button>
            </form>
          </section>
        ))
      )}
    </div>
  );
}
