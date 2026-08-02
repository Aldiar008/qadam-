import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { readTelegramSession } from '@/server/telegram/session';
import { launchFromMiniApp } from '../actions';

export const dynamic = 'force-dynamic';

interface Digest {
  business_name?: string;
  signal?: { metric_key?: string; change_bps?: number; confidence?: number } | null;
  contract?: { id?: string; title?: string; audience?: number } | null;
}

/**
 * «Сегодня» владельца, в чате.
 *
 * The same one signal and one action the cabinet shows, and confirmation goes
 * through the same guarded path. This is not a second, easier way to launch a
 * campaign — it is the same way, on a smaller screen.
 */
export default async function OwnerMiniAppPage({ searchParams }: { searchParams: Promise<{ done?: string; error?: string }> }) {
  const params = await searchParams;
  const session = await readTelegramSession();
  if (!session) redirect('/tg');
  if (!session.ownerUserId) redirect('/tg/card');

  const db = createAdminClient();
  const { data } = await db.rpc('owner_digest', { p_business_id: session.businessId });
  const digest = (data ?? null) as Digest | null;

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Кабинет владельца</p>
        <h1 className="mt-1 text-2xl font-extrabold">{digest?.business_name ?? 'Ваше заведение'}</h1>
      </header>

      {params.done && <p role="status" className="rounded-2xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800">{decodeURIComponent(params.done)}</p>}
      {params.error && <p role="alert" className="rounded-2xl bg-amber-500/10 px-4 py-3 text-sm text-amber-900">{decodeURIComponent(params.error)}</p>}

      {digest?.signal ? (
        <section className="rounded-3xl border border-border bg-surface p-5">
          <p className="text-sm font-bold">Сигнал дня</p>
          <p className="mt-2 text-sm leading-6">
            {digest.signal.metric_key}: изменение {(digest.signal.change_bps ?? 0) / 100}% за сопоставимый период.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Уверенность {digest.signal.confidence ?? 0}%. Это наблюдение, а не установленная причина.</p>
        </section>
      ) : (
        <section className="rounded-3xl border border-dashed border-border p-5 text-sm text-muted-foreground">
          Сегодня сообщать нечего: показатели держатся ровно. Это тоже ответ.
        </section>
      )}

      {digest?.contract?.id && (
        <section className="rounded-3xl border border-border bg-surface p-5">
          <p className="text-sm font-bold">Готово к запуску</p>
          <p className="mt-2 text-sm leading-6">{digest.contract.title ?? 'Growth Contract'}</p>
          {typeof digest.contract.audience === 'number' && (
            <p className="mt-1 text-xs text-muted-foreground">Получателей после проверки согласий: {digest.contract.audience}.</p>
          )}
          <form action={launchFromMiniApp} className="mt-4">
            <input type="hidden" name="contractId" value={digest.contract.id} />
            <button className="min-h-12 w-full rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground">
              Подтвердить запуск
            </button>
          </form>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            Перед каждой отправкой заново проверяются согласие, тихие часы и лимиты — получателей может
            оказаться меньше, чем в плане.
          </p>
        </section>
      )}

      <p className="pb-6 text-center text-xs leading-5 text-muted-foreground">
        Полный кабинет — на сайте. Здесь только то, что решается одной кнопкой.
      </p>
    </div>
  );
}
