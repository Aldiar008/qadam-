import Link from 'next/link';
import { ArrowRight, Download, FileSpreadsheet, Search } from 'lucide-react';
import { DemoBadge } from '@/components/common/DemoBadge';
import { canMarket, countSegmentAudience, getCustomersData } from '@/server/qadam/repository';
import { STAGE_OPTIONS } from '@/lib/segment-rules';

export const dynamic = 'force-dynamic';
const stages = STAGE_OPTIONS;

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; segment?: string; cursor?: string }>;
}) {
  const params = await searchParams;
  const data = await getCustomersData(params);
  const isMarketable = canMarket(data.role);
  // Shown only for a lifecycle filter, where the rule being counted is exactly
  // the rule the person selected. For a saved segment the membership is what
  // matters, and it is already on the card that sent them here.
  const audience = params.segment && stages.some(([code]) => code === params.segment)
    ? await countSegmentAudience({ stage: params.segment, consentFilter: 'marketing_required', channel: 'telegram' })
    : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-extrabold tracking-tight">Клиенты и Mini-CRM</h1>
            {data.business.mode === 'demo' && <DemoBadge label="DEMO DATA" />}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Cursor pagination, masked identity, аудируемый экспорт и импорт CSV.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {isMarketable && (
            <Link
              href="/customers/import"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-bold transition-all hover:bg-surface-muted"
            >
              <FileSpreadsheet className="size-4" /> Импорт CSV
            </Link>
          )}

          {/* This used to be a form that logged an export and produced no file. */}
          {isMarketable && (
            <a
              href="/api/customers/export"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-bold transition-all hover:bg-surface-muted"
            >
              <Download className="size-4" /> Экспорт CSV
            </a>
          )}

          <Link
            href="/app/campaigns/new?segment=inactive"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground transition-all hover:brightness-110"
          >
            Вернуть клиентов <ArrowRight className="size-4" />
          </Link>
        </div>
      </header>

      <form className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Поиск клиентов</span>
          <Search className="absolute left-4 top-3.5 size-4 text-muted-foreground" />
          <input
            name="q"
            defaultValue={params.q}
            placeholder="Поиск по имени"
            className="min-h-11 w-full rounded-xl bg-surface-muted pl-11 pr-4 text-sm outline-none focus:ring-2 focus:ring-primary"
          />
        </label>
        <select
          name="segment"
          aria-label="Фильтр по сегменту"
          defaultValue={params.segment ?? ''}
          className="min-h-11 rounded-xl border border-border bg-surface px-4 text-sm outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">Все сегменты</option>
          {stages.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button className="min-h-11 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground">
          Применить
        </button>
        <Link
          href="/app/customers"
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-4 text-sm font-bold"
        >
          Сбросить
        </Link>
      </form>

      {/* This used to print «64 inactive … даёт 18 eligible» for every tenant,
          whatever their data actually was. It is counted now, or not shown. */}
      {audience && (
        <section className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm leading-6">
          <strong>Из чего складывается аудитория:</strong> под фильтр подходят {audience.matched} чел., из них{' '}
          {audience.eligible} дали действующее согласие на рассылку в Telegram — только им и можно написать.
          Остальные {audience.matched - audience.eligible} останутся в базе, но не в кампании.
        </section>
      )}

      {data.segmentMissing && (
        <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
          Сегмент «{data.segmentMissing}» не найден в этом заведении, поэтому список пуст — это не «нет клиентов».
        </section>
      )}

      <div className="overflow-hidden rounded-3xl border border-border bg-surface shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-border bg-surface-muted text-xs text-muted-foreground">
              <tr>
                <th className="p-4">Клиент</th>
                <th className="p-4">Безопасный контакт</th>
                <th className="p-4">Сегмент</th>
                <th className="p-4">Визиты</th>
                <th className="p-4">Средний чек</th>
                <th className="p-4">Loyalty</th>
                <th className="p-4">Действие</th>
              </tr>
            </thead>
            <tbody>
              {data.customers.map((customer) => (
                <tr key={customer.id} className="border-b border-border last:border-0 hover:bg-surface-muted/50">
                  <td className="p-4 font-bold">{customer.display_name || 'Без имени'}</td>
                  <td className="p-4 font-mono text-xs text-muted-foreground">
                    {customer.identity?.masked_value ?? 'Не указан'}
                  </td>
                  <td className="p-4">
                    {stages.find(([code]) => code === customer.lifecycle_stage)?.[1] ?? customer.lifecycle_stage}
                  </td>
                  <td className="p-4 font-mono font-bold">{customer.visits}</td>
                  <td className="p-4 font-mono">{customer.aovMinor.toLocaleString('ru-RU')} ₸</td>
                  <td className="p-4 font-mono">
                    {customer.loyalty
                      ? `${customer.loyalty.stamps_balance} stamps / ${customer.loyalty.points_balance} pts`
                      : 'Нет'}
                  </td>
                  <td className="p-4">
                    <Link
                      href={`/app/customers/${customer.id}`}
                      className="inline-flex min-h-11 items-center text-xs font-bold text-primary"
                    >
                      Открыть <ArrowRight className="ml-1 size-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data.customers.length && <div className="p-10 text-center text-sm text-muted-foreground">Клиенты не найдены.</div>}
      </div>

      {data.nextCursor && (
        <div className="flex justify-center">
          <Link
            href={`/app/customers?segment=${params.segment ?? ''}&q=${encodeURIComponent(
              params.q ?? ''
            )}&cursor=${encodeURIComponent(data.nextCursor)}`}
            className="inline-flex min-h-11 items-center rounded-xl border border-border px-5 text-sm font-bold"
          >
            Следующая страница
          </Link>
        </div>
      )}
    </div>
  );
}
