import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { readTelegramSession } from '@/server/telegram/session';
import { sendMessageToVenue } from '../actions';

export const dynamic = 'force-dynamic';

const moment = (iso: string) => new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * Написать заведению.
 *
 * Deliberately not the assistant. The bot answers questions about the menu and
 * the hours because those have answers in the data; a complaint does not, and
 * a machine replying to «у меня проблема» with a cheerful fact is worse than
 * silence. Everything sent here goes to the owner, and the owner answers.
 */
export default async function GuestChatPage({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string }> }) {
  const params = await searchParams;
  const session = await readTelegramSession();
  if (!session) redirect('/tg');
  if (!session.customerId) redirect('/tg/owner');

  const db = createAdminClient();
  const { data: history } = await db
    .from('customer_interactions')
    .select('id,direction,kind,body,occurred_at,metadata')
    .eq('business_id', session.businessId).eq('customer_id', session.customerId)
    .in('kind', ['question', 'answer'])
    .order('occurred_at', { ascending: false }).limit(20);

  const thread = [...(history ?? [])].reverse();

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold">Написать заведению</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Здесь отвечает человек, а не робот. Если вопрос о меню или часах работы — бот в чате
          ответит сразу; сюда пишите то, что должен прочитать владелец.
        </p>
      </header>

      {params.sent && (
        <p role="status" className="rounded-2xl bg-emerald-500/10 px-4 py-3 text-sm leading-6 text-emerald-800">
          Отправлено. Владелец видит это в своём кабинете и ответит здесь же.
        </p>
      )}
      {params.error && (
        <p role="alert" className="rounded-2xl bg-amber-500/10 px-4 py-3 text-sm text-amber-900">{decodeURIComponent(params.error)}</p>
      )}

      <form action={sendMessageToVenue} className="rounded-3xl border border-border bg-surface p-5">
        <label className="grid gap-2 text-sm font-semibold">
          Ваше сообщение
          <textarea
            name="body"
            required
            rows={4}
            maxLength={1500}
            placeholder="Например: вчера ждал заказ 20 минут, хотя в зале было пусто."
            className="w-full rounded-2xl border border-border bg-surface-muted p-3 text-sm leading-6 outline-none focus:ring-2 focus:ring-primary"
          />
        </label>
        <button className="mt-4 min-h-12 w-full rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground">
          Отправить владельцу
        </button>
      </form>

      {thread.length > 0 && (
        <section className="space-y-3">
          <p className="text-sm font-bold">Переписка</p>
          {thread.map((row) => {
            const meta = (row.metadata ?? {}) as { source?: string };
            const fromBot = row.direction === 'outbound' && meta.source !== 'owner';
            return (
              <div
                key={row.id}
                className={'rounded-2xl p-3 text-sm leading-6 ' + (row.direction === 'inbound'
                  ? 'ml-6 bg-primary/10'
                  : 'mr-6 border border-border bg-surface')}
              >
                <p className="whitespace-pre-line">{row.body}</p>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  {row.direction === 'inbound' ? 'вы' : fromBot ? 'бот' : 'заведение'} · {moment(row.occurred_at)}
                </p>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
