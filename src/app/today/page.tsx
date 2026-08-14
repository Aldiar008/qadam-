import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Clock,
  Flower2,
  Trash2,
  Truck,
} from 'lucide-react';
import { DemoBadge } from '@/components/common/DemoBadge';
import { loadCabinet, type CabinetDecision } from '@/server/qadam/cabinet';

export const dynamic = 'force-dynamic';

const money = (value: number) => new Intl.NumberFormat('ru-RU').format(Math.round(value)) + ' ₸';
const percent = (ppm: number) => `${(ppm / 10_000).toFixed(1).replace('.0', '')}%`;
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : '—';

/**
 * Цвет карточки означает срок, а не важность.
 *
 * Красный — реагировать уже поздно или почти поздно. Янтарный — сегодня ещё
 * можно успеть. Зелёный в очереди не встречается: то, что в неё попало, требует
 * решения по определению, и «спокойный» цвет здесь врал бы.
 */
const TONE: Record<CabinetDecision['tone'], { card: string; chip: string; label: string }> = {
  urgent: {
    card: 'border-rose-500/40 bg-rose-500/5',
    chip: 'bg-rose-500/10 text-rose-800 border-rose-500/30',
    label: 'Поздно ждать',
  },
  today: {
    card: 'border-amber-500/40 bg-amber-500/5',
    chip: 'bg-amber-500/10 text-amber-900 border-amber-500/30',
    label: 'Решить сегодня',
  },
  calm: {
    card: 'border-emerald-600/30 bg-emerald-500/5',
    chip: 'bg-emerald-500/10 text-emerald-800 border-emerald-500/30',
    label: 'Под контролем',
  },
};

/**
 * Кабинет владельца цветочного магазина.
 *
 * Первый экран отвечает на один вопрос: что делать сегодня. Ответ — не больше
 * пяти карточек, и на каждой ровно четыре вещи: чем рискуем, сколько это в
 * деньгах, до какого срока и что нажать. Всё остальное — заказы, поставщики,
 * история, эффект — стоит ниже и отвечает на «как дела».
 */
export default async function AppTodayPage() {
  const data = await loadCabinet();
  const calm = data.decisions.length === 0;

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="flex items-center gap-3 text-3xl font-extrabold tracking-tight">
              <Flower2 className="size-7 text-primary" aria-hidden="true" />
              Сегодня
            </h1>
            {data.isMock && <DemoBadge label="DEMO DATA" />}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {data.businessName}. {calm ? 'Витрина под контролем.' : `Решений на сегодня: ${data.decisions.length}.`}
          </p>
        </div>

        {/* Две суммы, а не одна. Дефицит — это деньги, которые ещё предстоит
            потратить, чтобы не потерять продажу; списание — деньги, уже
            потраченные и рискующие уйти в мусор. Сложить их означало бы
            получить красивое число, не означающее ничего. */}
        <div className="flex flex-wrap gap-2">
          <p className={'rounded-2xl px-4 py-3 ' + (data.shortageMinor > 0 ? 'bg-rose-500/10 text-rose-800' : 'bg-emerald-500/10 text-emerald-800')}>
            <span className="block font-mono text-xl font-bold">{money(data.shortageMinor)}</span>
            <span className="text-xs font-semibold">не хватит до заказа</span>
          </p>
          <p className={'rounded-2xl px-4 py-3 ' + (data.spoilageMinor > 0 ? 'bg-amber-500/10 text-amber-900' : 'bg-emerald-500/10 text-emerald-800')}>
            <span className="block font-mono text-xl font-bold">{money(data.spoilageMinor)}</span>
            <span className="text-xs font-semibold">может уйти в мусор</span>
          </p>
        </div>
      </header>

      {/* Очередь решений. Пять — это не техническое ограничение, а то, сколько
          решений владелец успевает принять между двумя покупателями. */}
      <section aria-labelledby="queue-heading" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="queue-heading" className="text-lg font-bold">
            Что решить сегодня
          </h2>
          <p className="font-mono text-xs text-muted-foreground">
            {data.positionsTotal} позиций на витрине
            {data.riskAtStakeKnown ? '' : ' · часть цен не задана, сумма неполная'}
          </p>
        </div>

        {calm ? (
          <p className="flex items-start gap-3 rounded-3xl border border-emerald-600/30 bg-emerald-500/5 p-6 text-sm leading-6">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-700" aria-hidden="true" />
            <span>
              <strong className="block text-base font-bold">Ничего не горит.</strong>
              Ни одна позиция не подходит к нулю раньше поставки и не выходит за ваш порог списаний. Это состояние, а не
              отсутствие данных: расчёт прошёл по всем {data.positionsTotal} позициям.
            </span>
          </p>
        ) : (
          <ul className="grid gap-3">
            {data.decisions.map((decision) => {
              const tone = TONE[decision.tone];
              return (
                <li key={`${decision.itemId}-${decision.kind}`} className={'rounded-3xl border p-5 ' + tone.card}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ' + tone.chip}>
                      {decision.kind === 'stockout' ? (
                        <AlertTriangle className="size-3.5" aria-hidden="true" />
                      ) : (
                        <Trash2 className="size-3.5" aria-hidden="true" />
                      )}
                      {decision.kind === 'stockout' ? 'Дефицит' : 'Списание'}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">{tone.label}</span>
                  </div>

                  <h3 className="mt-3 text-lg font-bold">{decision.headline}</h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{decision.consequence}</p>

                  {/* Риск, сумма, срок и действие — на одной карточке и в одном
                      порядке у всех. Разный порядок заставлял бы перечитывать
                      каждую заново. */}
                  <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
                    <p>
                      <span className="block font-mono text-xl font-extrabold">
                        {decision.amountMinor === null ? '—' : money(decision.amountMinor)}
                      </span>
                      <span className="text-xs leading-5 text-muted-foreground">{decision.amountBasis}</span>
                    </p>
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      <Clock className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      {decision.deadline}
                    </p>
                    <Link
                      href={decision.actionHref}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary-hover"
                    >
                      {decision.actionLabel}
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Активные заказы */}
        <section className="rounded-3xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-bold">
              <ClipboardList className="size-4 text-muted-foreground" aria-hidden="true" />
              Активные заказы
            </h2>
            <Link href="/app/orders" className="inline-flex min-h-9 items-center text-xs font-bold text-primary hover:underline">
              Все заказы
            </Link>
          </div>

          {data.orders.length === 0 ? (
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              Открытых заказов нет. Подтверждённое решение создаёт заказ автоматически —{' '}
              <Link href="/app/decisions" className="font-bold text-primary hover:underline">
                очередь решений
              </Link>
              .
            </p>
          ) : (
            <ul className="mt-4 grid gap-2">
              {data.orders.map((order) => (
                <li key={order.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-surface-muted px-4 py-3 text-sm">
                  <span className="min-w-0">
                    <span className="block font-semibold">{order.supplier}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {order.statusLabel} · {order.itemCount} поз. · ждём {day(order.expectedAt)}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    {order.isUrgent && (
                      <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[11px] font-bold text-rose-800">срочный</span>
                    )}
                    <span className="font-mono text-sm font-bold">{money(order.totalCostMinor)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Надёжность поставщиков */}
        <section className="rounded-3xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-bold">
              <Truck className="size-4 text-muted-foreground" aria-hidden="true" />
              Ваши поставщики
            </h2>
            <Link href="/app/suppliers" className="inline-flex min-h-9 items-center text-xs font-bold text-primary hover:underline">
              Сравнить
            </Link>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Считается по вашим приёмкам, а не по обещаниям поставщика.
          </p>

          {data.suppliers.length === 0 ? (
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              Пока не было ни одной приёмки — надёжность считать не из чего.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[420px] text-left text-sm">
                <caption className="sr-only">Надёжность поставщиков по приёмкам магазина</caption>
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="pb-2 font-semibold">Поставщик</th>
                    <th scope="col" className="pb-2 font-semibold">Вовремя и полностью</th>
                    <th scope="col" className="pb-2 font-semibold">Недовоз</th>
                    <th scope="col" className="pb-2 font-semibold">Задержка</th>
                  </tr>
                </thead>
                <tbody>
                  {data.suppliers.map((supplier) => (
                    <tr key={supplier.supplierId} className="border-t border-border">
                      <td className="py-2 pr-3">
                        <span className="block font-semibold">{supplier.name}</span>
                        <span className="font-mono text-[11px] text-muted-foreground">{supplier.ordersTotal} поставок</span>
                      </td>
                      <td className="py-2 pr-3 font-mono">
                        {/* Процент от нуля поставок — не ноль процентов, а
                            отсутствие ответа, и выглядеть он должен иначе. */}
                        {supplier.otifPpm === null ? <span className="text-muted-foreground">нет данных</span> : percent(supplier.otifPpm)}
                      </td>
                      <td className="py-2 pr-3 font-mono">{percent(supplier.shortfallRatePpm)}</td>
                      <td className="py-2 font-mono">
                        {supplier.avgDelayHours > 0 ? `${supplier.avgDelayHours} ч` : 'нет'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* Эффект: три строки, которые не складываются между собой. */}
      <section className="rounded-3xl border border-border bg-surface p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold">Эффект</h2>
          <Link href="/app/impact" className="inline-flex min-h-9 items-center text-xs font-bold text-primary hover:underline">
            Подробно
          </Link>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            ['Прогноз', data.impact.forecastMinor, 'что расчёт обещает до действия'],
            ['Влияние', data.impact.influencedMinor, 'что произошло рядом с действием'],
            ['Подтверждено', data.impact.verifiedMinor, 'что доказано замером'],
          ].map(([label, value, note]) => (
            <article key={String(label)} className="rounded-2xl border border-border bg-surface-muted p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="mt-2 font-mono text-2xl font-extrabold">{money(Number(value))}</p>
              <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{note}</p>
            </article>
          ))}
        </div>

        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          Три числа не складываются: это одни и те же деньги на разной стадии доказанности. {data.impact.verifiedNote}
        </p>
      </section>

      {/* Истории. Они внизу не потому, что не важны, а потому, что отвечают на
          «что было», когда вопрос «что делать» уже закрыт. */}
      <div className="grid gap-4 lg:grid-cols-3">
        <HistoryCard
          title="Списания"
          empty="Списаний не было."
          href="/app/inventory"
          hrefLabel="Витрина"
          entries={data.wasteHistory}
        />
        <HistoryCard
          title="Движение остатка"
          empty="Событий пока нет."
          href="/app/inventory"
          hrefLabel="Журнал"
          entries={data.eventHistory}
        />
        <HistoryCard
          title="Решения"
          empty="Решений пока не было."
          href="/app/decisions"
          hrefLabel="Все решения"
          entries={data.decisionHistory}
        />
      </div>
    </div>
  );
}

function HistoryCard({
  title,
  empty,
  href,
  hrefLabel,
  entries,
}: {
  title: string;
  empty: string;
  href: string;
  hrefLabel: string;
  entries: { id: string; at: string; title: string; detail: string; quantity: string | null }[];
}) {
  return (
    <section className="rounded-3xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold">{title}</h2>
        <Link href={href} className="inline-flex min-h-9 items-center text-xs font-bold text-primary hover:underline">
          {hrefLabel}
        </Link>
      </div>
      {entries.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-3 grid gap-2">
          {entries.slice(0, 6).map((entry) => (
            <li key={entry.id} className="border-t border-border pt-2 text-sm first:border-0 first:pt-0">
              <p className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="min-w-0 font-semibold">{entry.title}</span>
                {entry.quantity && <span className="font-mono text-xs">{entry.quantity}</span>}
              </p>
              <p className="text-xs leading-5 text-muted-foreground">
                {entry.detail} · {when(entry.at)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
