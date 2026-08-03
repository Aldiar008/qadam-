import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { readTelegramSession } from '@/server/telegram/session';
import { launchFromMiniApp, refreshRecommendationsFromMiniApp } from '../actions';
import { money } from '@/lib/telegram/card';

export const dynamic = 'force-dynamic';

interface Console {
  business?: { name?: string; isDemo?: boolean } | null;
  kpi?: { customers: number; sleeping: number; reachable: number; activeCampaigns: number; revenue30: number; unread: number };
  signal?: { metricKey?: string; changeBps?: number; confidence?: number; gos?: number } | null;
  recommendations?: { id: string; title: string; confidence: number; reason: string | null; eligible: number | null; contributionMinor: number | null }[];
  contract?: { id?: string; status?: string; audience?: number } | null;
  questions?: { id: string; customerId: string; name: string; body: string; occurredAt: string; answered: boolean }[];
  notifications?: { id: string; title: string; body: string; category: string }[];
  supply?: { name: string; unit: string; monthlySavingMinor: number | null; best: { supplier: string; title: string | null; unitPriceMinor: number } | null }[];
}

const bandOf = (metricKey?: string) => {
  const match = /_(\d{1,2})_(\d{1,2})$/.exec(metricKey ?? '');
  return match ? `${match[1]}:00–${match[2]}:00` : null;
};

/**
 * «Сегодня» владельца внутри Telegram.
 *
 * Not a read-only digest: the point of opening this on a phone is to do the one
 * thing that needs doing. Confirming a launch goes through
 * `launch_contract_from_chat`, which re-checks the role, Margin Shield and the
 * one-launch-per-contract rule in the database — being on a phone relaxes none
 * of it.
 */
export default async function OwnerConsolePage({ searchParams }: { searchParams: Promise<{ done?: string; error?: string }> }) {
  const params = await searchParams;
  const session = await readTelegramSession();
  if (!session) redirect('/tg');
  if (!session.ownerUserId) redirect('/tg/card');

  const db = createAdminClient();
  const { data } = await db.rpc('owner_console', { p_business_id: session.businessId });
  const view = (data ?? {}) as unknown as Console;
  const kpi = view.kpi;
  const band = bandOf(view.signal?.metricKey);
  const unanswered = (view.questions ?? []).filter((question) => !question.answered).length;

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Кабинет владельца{view.business?.isDemo ? ' · DEMO DATA' : ''}
          </p>
          <h1 className="mt-1 text-2xl font-extrabold">{view.business?.name ?? 'Заведение'}</h1>
        </div>
        {unanswered > 0 && (
          <Link href="/tg/owner/inbox" className="shrink-0 rounded-full bg-amber-500/15 px-3 py-1.5 text-xs font-bold text-amber-900">
            {unanswered} без ответа
          </Link>
        )}
      </header>

      {params.done && <p role="status" className="rounded-2xl bg-emerald-500/10 px-4 py-3 text-sm leading-6 text-emerald-800">{decodeURIComponent(params.done)}</p>}
      {params.error && <p role="alert" className="rounded-2xl bg-amber-500/10 px-4 py-3 text-sm leading-6 text-amber-900">{decodeURIComponent(params.error)}</p>}

      {kpi && (
        <section className="grid grid-cols-2 gap-2">
          {[
            ['Гостей', String(kpi.customers), 'в базе'],
            ['Спящих', String(kpi.sleeping), `написать можно ${kpi.reachable}`],
            ['Выручка 30 дней', money(kpi.revenue30), 'по записанным продажам'],
            ['Кампаний идёт', String(kpi.activeCampaigns), kpi.unread ? `${kpi.unread} уведомлений` : 'уведомлений нет'],
          ].map(([label, value, note]) => (
            <article key={label} className="rounded-2xl border border-border bg-surface p-3">
              <p className="text-[11px] text-muted-foreground">{label}</p>
              <p className="mt-1 font-mono text-lg font-extrabold leading-tight">{value}</p>
              <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">{note}</p>
            </article>
          ))}
        </section>
      )}

      {view.signal ? (
        <section className="rounded-3xl border border-border bg-surface p-5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-bold">Сигнал дня</p>
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 font-mono text-xs font-bold text-emerald-800">GOS {view.signal.gos}</span>
          </div>
          <p className="mt-2 text-sm leading-6">
            {band
              ? <>В будни с {band} выручка ниже сопоставимого периода на <strong>{Math.abs((view.signal.changeBps ?? 0) / 100)}%</strong>.</>
              : <>{view.signal.metricKey}: изменение {(view.signal.changeBps ?? 0) / 100}%.</>}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Уверенность {view.signal.confidence}%. Это наблюдение, а не установленная причина.
          </p>
        </section>
      ) : (
        <section className="rounded-3xl border border-dashed border-border p-5 text-sm text-muted-foreground">
          Сегодня сообщать нечего: показатели держатся ровно. Это тоже ответ.
        </section>
      )}

      {view.contract?.id && (
        <section className="rounded-3xl border border-primary/30 bg-primary/5 p-5">
          <p className="text-sm font-bold">Готово к запуску</p>
          {typeof view.contract.audience === 'number' && (
            <p className="mt-1 text-xs text-muted-foreground">Получателей после проверки согласий: {view.contract.audience}.</p>
          )}
          <form action={launchFromMiniApp} className="mt-4">
            <input type="hidden" name="contractId" value={view.contract.id} />
            <button className="min-h-12 w-full rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground">
              Подтвердить запуск
            </button>
          </form>
          <p className="mt-3 text-[11px] leading-4 text-muted-foreground">
            Перед каждой отправкой заново проверяются согласие, тихие часы и лимиты — получателей
            может оказаться меньше, чем в плане.
          </p>
        </section>
      )}

      <section className="rounded-3xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-bold">Что предлагает система</p>
          <form action={refreshRecommendationsFromMiniApp}>
            <button className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold">Пересобрать</button>
          </form>
        </div>
        {view.recommendations?.length ? (
          <ul className="mt-3 grid gap-3">
            {view.recommendations.map((item) => (
              <li key={item.id} className="rounded-2xl bg-surface-muted p-3">
                <p className="text-sm font-bold">{item.title}</p>
                {item.reason && <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.reason}</p>}
                <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-bold text-primary">
                  <span>уверенность {item.confidence}%</span>
                  {item.eligible !== null && <span>можно написать {item.eligible}</span>}
                  {item.contributionMinor !== null && <span>вклад ≈ {money(item.contributionMinor)}</span>}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Открытых предложений нет. Нажмите «Пересобрать» — если сигналы есть, список наполнится.
          </p>
        )}
      </section>

      {(view.supply ?? []).length > 0 && (
        <section className="rounded-3xl border border-amber-500/40 bg-surface p-5">
          <p className="text-sm font-bold">Закончилось</p>
          <ul className="mt-3 grid gap-2">
            {(view.supply ?? []).map((item) => (
              <li key={item.name} className="rounded-2xl bg-surface-muted p-3 text-sm">
                <p className="font-semibold">{item.name}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {item.best
                    ? <>Дешевле всего: «{item.best.title ?? item.best.supplier}» — {money(item.best.unitPriceMinor)} за {item.unit}
                        {item.monthlySavingMinor ? `, экономия ${money(item.monthlySavingMinor)} в месяц` : ''}.</>
                    : 'Предложений пока нет — внесите цену поставщика в кабинете.'}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(view.notifications ?? []).length > 0 && (
        <section className="rounded-3xl border border-border bg-surface p-5">
          <p className="text-sm font-bold">Уведомления</p>
          <ul className="mt-3 grid gap-2">
            {(view.notifications ?? []).map((item) => (
              <li key={item.id} className="rounded-2xl bg-surface-muted p-3">
                <p className="text-sm font-semibold">{item.title}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.body}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="pb-2 text-center text-[11px] leading-4 text-muted-foreground">
        Полный кабинет — на сайте. Здесь то, что решается одной кнопкой.
      </p>
    </div>
  );
}
