import Link from 'next/link';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { addCustomerNote, generateCustomerBriefNote, revokeCustomerConsent } from '@/app/app/actions';
import { canManage, getCustomerDetail } from '@/server/qadam/repository';

export const dynamic = 'force-dynamic';

const money = (minor: number) => `${Number(minor).toLocaleString('ru-RU')} ₸`;
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('ru-RU') : '—');
const moment = (iso: string) => new Date(iso).toLocaleString('ru-RU');

const card = 'rounded-3xl border border-border bg-surface p-6';

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getCustomerDetail(id);

  // Consent rows are append-only, so the newest row per scope is the decision.
  const latestConsent = new Map<string, (typeof data.consents)[number]>();
  data.consents.forEach((item) => { if (!latestConsent.has(item.scope)) latestConsent.set(item.scope, item); });

  const included = data.audiences.filter((row) => row.inclusion_status === 'included').length;
  const excluded = data.audiences.filter((row) => row.inclusion_status === 'excluded');

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/app/customers" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-primary">
        <ArrowLeft className="size-4" />К списку
      </Link>

      <header className="rounded-3xl border border-border bg-surface p-6 sm:p-8">
        <p className="font-mono text-xs text-muted-foreground">{data.identities[0]?.masked_value ?? 'Контакт анонимизирован'}</p>
        <h1 className="mt-2 text-3xl font-extrabold">{data.customer.display_name || 'Анонимизированный клиент'}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Стадия: {data.customer.lifecycle_stage}. Первый визит: {day(data.metrics.firstSeenAt ?? data.customer.first_seen_at)}.
          Последний: {day(data.metrics.lastSeenAt ?? data.customer.last_seen_at)}.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-4">
        {[
          ['Визиты', String(data.metrics.visits), 'записанных покупок'],
          ['Всего', money(data.metrics.totalMinor), 'за всю историю'],
          ['Средний чек', money(data.metrics.aovMinor), 'по его покупкам'],
          // Frequency was `visits / 4` for everybody. It is measured over this
          // person's own span or it is not claimed.
          ['Частота', data.metrics.frequencyPerMonth === null ? '—' : `${data.metrics.frequencyPerMonth}/мес`,
            data.metrics.frequencyPerMonth === null ? 'слишком короткая история' : 'по его собственному периоду'],
        ].map(([label, value, note]) => (
          <article key={label} className="rounded-2xl border border-border bg-surface p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-2 font-mono text-xl font-bold">{value}</p>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{note}</p>
          </article>
        ))}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className={card}>
          <h2 className="text-xl font-bold">Согласия</h2>
          <div className="mt-4 grid gap-3">
            {latestConsent.size ? [...latestConsent.values()].map((consent) => (
              <div key={consent.scope} className="flex items-center justify-between rounded-xl bg-surface-muted p-3">
                <div>
                  <strong className="text-sm">{consent.scope}</strong>
                  <p className="text-xs text-muted-foreground">{consent.status} · {consent.source}</p>
                </div>
                {canManage(data.role) && consent.status === 'granted' && (
                  <form action={revokeCustomerConsent}>
                    <input type="hidden" name="customerId" value={id} />
                    <input type="hidden" name="scope" value={consent.scope} />
                    <button className="min-h-11 rounded-xl border border-border px-3 text-xs font-bold">Отозвать</button>
                  </form>
                )}
              </div>
            )) : <p className="text-sm text-muted-foreground">Согласий не записано — в кампанию этот гость не попадёт.</p>}
          </div>
        </section>

        <section className={card}>
          <h2 className="text-xl font-bold">Лояльность</h2>
          <div className="mt-4 grid gap-3">
            {data.accounts.length
              ? data.accounts.map((account) => (
                <p key={account.id} className="rounded-xl bg-surface-muted p-4 font-mono text-sm">
                  {account.stamps_balance} штампов · {account.points_balance} баллов
                </p>
              ))
              : <p className="text-sm text-muted-foreground">Карты лояльности нет.</p>}
          </div>
        </section>
      </div>

      {/* Purchases, campaign history and the activity log were all fetched by the
          repository and thrown away by this page, so «Заметки и activity»
          showed notes only. */}
      <section className={card}>
        <h2 className="text-xl font-bold">Покупки</h2>
        {data.transactions.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead className="text-xs text-muted-foreground"><tr><th className="py-2">Когда</th><th className="py-2">Сумма</th><th className="py-2">Источник</th></tr></thead>
              <tbody>
                {data.transactions.slice(0, 10).map((row) => (
                  <tr key={row.id} className="border-t border-border">
                    <td className="py-2">{day(row.occurred_at)}</td>
                    <td className="py-2 font-mono">{money(Number(row.net_minor))}</td>
                    <td className="py-2 text-muted-foreground">{row.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.transactions.length > 10 && (
              <p className="mt-3 text-xs text-muted-foreground">Показаны последние 10 из {data.transactions.length}.</p>
            )}
          </div>
        ) : <p className="mt-3 text-sm text-muted-foreground">Покупок за этим гостем не записано.</p>}
      </section>

      <section className={card}>
        <h2 className="text-xl font-bold">Участие в кампаниях</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Попал в аудиторию {included} раз. {excluded.length ? `Исключён ${excluded.length} раз — причины ниже.` : 'Исключений не было.'}
        </p>
        {excluded.length > 0 && (
          <ul className="mt-3 grid gap-2">
            {excluded.slice(0, 5).map((row) => (
              <li key={`${row.campaign_id}-${row.evaluated_at}`} className="rounded-xl bg-surface-muted p-3 text-sm">
                {row.exclusion_reason ?? 'причина не записана'}
                <span className="ml-2 text-xs text-muted-foreground">{day(row.evaluated_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold">Заметки</h2>
          {canManage(data.role) && (
            <form action={generateCustomerBriefNote}>
              <input type="hidden" name="customerId" value={id} />
              <button className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground transition-all hover:brightness-110">
                <Sparkles className="size-4" /> Собрать досье AI
              </button>
            </form>
          )}
        </div>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Досье собирается по цифрам этой карточки и сохраняется обычной заметкой. Модель формулирует,
          но не считает: число, которого нет выше, в досье попасть не может.
        </p>

        {canManage(data.role) && (
          <form action={addCustomerNote} className="mt-4 flex gap-2">
            <input type="hidden" name="customerId" value={id} />
            <label className="sr-only" htmlFor="note">Новая заметка</label>
            <input id="note" name="note" maxLength={5000} required className="min-h-11 flex-1 rounded-xl bg-surface-muted px-4 text-sm" placeholder="Заметка о госте" />
            <button className="min-h-11 rounded-xl border border-border px-4 text-sm font-bold">Сохранить</button>
          </form>
        )}

        <div className="mt-5 grid gap-3">
          {data.notes.length ? data.notes.map((note) => (
            <p key={note.id} className="whitespace-pre-line rounded-xl bg-surface-muted p-3 text-sm">
              {note.note}
              <span className="mt-2 block text-xs text-muted-foreground">{moment(note.created_at)}</span>
            </p>
          )) : <p className="text-sm text-muted-foreground">Заметок пока нет.</p>}
        </div>
      </section>

      <section className={card}>
        <h2 className="text-xl font-bold">Журнал</h2>
        <div className="mt-4 grid gap-2">
          {data.activities.length ? data.activities.slice(0, 15).map((row) => (
            <p key={row.id} className="flex flex-wrap items-baseline gap-2 rounded-xl bg-surface-muted px-3 py-2 text-sm">
              <span className="font-mono text-xs font-bold">{row.action}</span>
              <span className="text-xs text-muted-foreground">{moment(row.occurred_at)}</span>
            </p>
          )) : <p className="text-sm text-muted-foreground">Действий по этому гостю не записано.</p>}
        </div>
      </section>
    </div>
  );
}
