import Link from 'next/link';
import { AlertTriangle, Clock, TrendingUp } from 'lucide-react';

import { KIND_META, getImpactDashboard, type MetricKind } from '@/server/qadam/impact';
import { canManage, canMarket } from '@/server/qadam/repository';
import { recomputeImpact, runDemoTimeJump } from './actions';

export const dynamic = 'force-dynamic';

const money = (minor: number | null | undefined) => `${Number(minor ?? 0).toLocaleString('ru-RU')} ₸`;
const pct = (bps: number | null | undefined) => (bps == null ? '—' : `${Math.round(bps / 100)}%`);

function KindBadge({ kind }: { kind: MetricKind }) {
  const meta = KIND_META[kind];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${meta.tone}`}>
      <span aria-hidden="true" className="font-mono">{kind === 'verified_fact' ? '✓' : kind === 'mock_actual' ? '◍' : '≈'}</span>
      {meta.label}
    </span>
  );
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; cursor?: string; error?: string; jump?: string; recomputed?: string }>;
}) {
  const params = await searchParams;
  const days = Math.min(365, Math.max(7, Number(params.days ?? 30) || 30));
  const data = await getImpactDashboard({ days, cursor: params.cursor });
  const isDemo = data.ctx.business.mode === 'demo';
  const canAct = canMarket(data.ctx.role);
  const isManager = canManage(data.ctx.role);

  const { kpis } = data;
  const newDelta = kpis.newCustomers - kpis.newCustomersPrevious;

  const { data: campaigns } = await data.ctx.supabase
    .from('campaigns').select('id,name,status').eq('business_id', data.ctx.businessId)
    .order('created_at', { ascending: false }).limit(20);

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Аналитика и Impact Ledger</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Влияние и прирост — разные величины. Выручка контактировавших клиентов никогда не выдаётся
            за прирост, а демонстрационные результаты помечены отдельно.
          </p>
        </div>
        <nav aria-label="Период" className="flex gap-2">
          {[7, 30, 90].map((option) => (
            <Link
              key={option}
              href={`/app/analytics?days=${option}`}
              className={`min-h-11 rounded-xl px-4 py-2 text-sm font-bold ${days === option ? 'bg-primary text-primary-foreground' : 'border border-border bg-surface'}`}
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
      {(params.jump || params.recomputed) && (
        <div role="status" className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm font-semibold text-emerald-800">
          {params.jump === 'repeat' && 'Скачок во времени уже выполнялся — повтор не создал новых событий.'}
          {params.jump === '1' && 'Демонстрационные события созданы. Все они помечены как MOCK RESULT.'}
          {params.recomputed && `Пересчёт выполнен: ${decodeURIComponent(params.recomputed)}.`}
        </div>
      )}

      {data.incrementalIsMock && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
          <strong className="font-bold">◍ MOCK RESULT · DEMO DATA.</strong>{' '}
          Все показатели прироста ниже получены из демонстрационного набора и не являются подтверждённым фактом.
        </div>
      )}

      {data.underpowered.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface-muted p-4 text-sm">
          <p className="font-bold">Выборки недостаточно для оценки прироста</p>
          <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">
            {data.underpowered.map((row) => (
              <li key={row.campaignName}>
                {row.campaignName}: доставлено {row.delivered} из минимально необходимых {row.minSample} — показана
                наблюдаемая разница с интервалом, а не оценка прироста.
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* KPI grid ---------------------------------------------------------- */}
      <section aria-label="Ключевые показатели" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Новые клиенты', value: String(kpis.newCustomers), note: `${newDelta >= 0 ? '+' : ''}${newDelta} к прошлому периоду` },
          { label: 'Возвращённые клиенты', value: String(kpis.reactivatedCustomers), note: 'вернулись после долгой паузы' },
          { label: 'Повторные покупки', value: String(kpis.repeatPurchases), note: 'клиентов с 2+ покупками' },
          { label: 'Автоматических действий', value: String(kpis.automatedActions), note: 'запусков правил за период' },
          { label: 'Influenced revenue', value: money(kpis.influencedRevenueMinor), note: 'не является приростом' },
          { label: 'Incremental revenue', value: data.hasIncremental ? money(kpis.incrementalRevenueMinor) : '—', note: data.hasIncremental ? (data.incrementalIsMock ? 'mock result' : 'оценка прироста') : 'базовая линия не зафиксирована' },
          { label: 'Incremental contribution', value: data.hasIncremental ? money(kpis.incrementalContributionMinor) : '—', note: 'вклад-маржа от прироста' },
          { label: 'ROI кампаний', value: pct(kpis.roiBps), note: kpis.roiBps == null ? 'недостаточно данных' : 'вклад-маржа / затраты' },
          { label: 'CAC', value: kpis.cacMinor == null ? '—' : money(kpis.cacMinor), note: 'затраты на нового клиента' },
          { label: 'Стоимость возврата', value: kpis.costPerReturnMinor == null ? '—' : money(kpis.costPerReturnMinor), note: 'затраты на одно погашение' },
          { label: 'Ошибка прогноза', value: pct(kpis.forecastErrorBps), note: kpis.forecastErrorBps == null ? 'нет пары прогноз/факт' : 'факт против прогноза' },
          { label: 'Время владельца', value: `${kpis.ownerMinutesSaved} мин`, note: 'оценка сэкономленного времени' },
        ].map((metric) => (
          <div key={metric.label} className="rounded-3xl border border-border bg-surface p-5">
            <p className="text-xs text-muted-foreground">{metric.label}</p>
            <p className="mt-2 font-mono text-2xl font-extrabold">{metric.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{metric.note}</p>
          </div>
        ))}
      </section>

      {data.topAction && (
        <section className="rounded-3xl border border-primary/30 bg-primary/5 p-6">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <TrendingUp className="size-5" aria-hidden="true" /> Лучшее действие периода
          </h2>
          <p className="mt-2 text-sm">
            <Link href={`/app/campaigns/${data.topAction.campaignId}`} className="font-bold text-primary underline">
              {data.topAction.name}
            </Link>
            {' — вклад-маржа '}
            <strong className="font-mono">{money(data.topAction.contributionMinor)}</strong>{' '}
            <KindBadge kind={data.topAction.kind} />
          </p>
        </section>
      )}

      {/* Baselines --------------------------------------------------------- */}
      {data.baselines.length > 0 && (
        <section className="rounded-3xl border border-border bg-surface p-6">
          <h2 className="text-lg font-bold">Зафиксированные базовые линии</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Базовая линия фиксируется до запуска и неизменна для своей версии измерения. Изменить её нельзя —
            можно только записать новую версию.
          </p>
          <ul className="mt-3 grid gap-2">
            {data.baselines.map((baseline) => (
              <li key={`${baseline.campaignId}:${baseline.measurementVersion}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3 text-xs">
                <span className="font-mono font-bold text-primary">{baseline.measurementVersion}</span>
                <span className="text-muted-foreground">
                  метод {baseline.method} · база {money(baseline.baselineRevenueMinor)} · аудитория {baseline.audienceSize} · минимальная выборка {baseline.minSampleSize}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Demo controls ----------------------------------------------------- */}
      {isDemo && isManager && (campaigns ?? []).length > 0 && (
        <section className="rounded-3xl border border-amber-500/40 bg-amber-500/5 p-6">
          <h2 className="flex items-center gap-2 text-lg font-bold text-amber-900">
            <Clock className="size-5" aria-hidden="true" /> Демонстрационный скачок во времени
          </h2>
          <p className="mt-1 text-xs leading-5">
            Создаёт детерминированный набор событий TAMYR: 18 доставок, 15 открытий, 9 погашений.
            Все записи помечены DEMO DATA и MOCK RESULT и никогда не считаются подтверждённым фактом.
            Повторное нажатие не удваивает события.
          </p>
          <form action={runDemoTimeJump} className="mt-4 flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-sm font-semibold">
              Кампания
              <select name="campaignId" className="min-h-11 rounded-xl border border-border bg-surface px-3 text-sm">
                {(campaigns ?? []).map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
              </select>
            </label>
            <button className="min-h-11 rounded-xl bg-amber-700 px-5 text-sm font-bold text-white">Выполнить скачок</button>
          </form>
        </section>
      )}

      {/* Ledger ------------------------------------------------------------ */}
      <section className="rounded-3xl border border-border bg-surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold">Impact Ledger</h2>
          {canAct && (campaigns ?? []).length > 0 && (
            <form action={recomputeImpact} className="flex flex-wrap items-end gap-2">
              <label className="grid gap-1 text-xs font-semibold">
                Пересчитать кампанию
                <select name="campaignId" className="min-h-11 rounded-xl border border-border bg-surface-muted px-3 text-xs">
                  {(campaigns ?? []).map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
                </select>
              </label>
              <button className="min-h-11 rounded-xl border border-border px-4 text-xs font-bold">Пересчитать</button>
            </form>
          )}
        </div>

        {data.ledger.length ? (
          <>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <caption className="sr-only">Записи Impact Ledger с типом, источником и допущениями</caption>
                <thead className="bg-surface-muted text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="p-3 font-semibold">Кампания</th>
                    <th scope="col" className="p-3 font-semibold">Метрика</th>
                    <th scope="col" className="p-3 font-semibold">Тип</th>
                    <th scope="col" className="p-3 font-semibold">Значение</th>
                    <th scope="col" className="p-3 font-semibold">Период</th>
                    <th scope="col" className="p-3 font-semibold">Как посчитано</th>
                  </tr>
                </thead>
                <tbody>
                  {data.ledger.map((row) => (
                    <tr key={row.id} className="border-t border-border">
                      <td className="p-3 font-semibold">{row.campaignName}</td>
                      <td className="p-3">{row.metricKey}</td>
                      <td className="p-3"><KindBadge kind={row.kind} /></td>
                      <td className="p-3 font-mono font-bold">
                        {row.unit === 'currency_minor' ? money(row.valueMinor) : row.unit === 'bps' ? pct(row.valueMinor) : `${row.valueMinor} ${row.unit}`}
                      </td>
                      <td className="p-3 font-mono text-xs">
                        {new Date(row.periodStart).toLocaleDateString('ru-RU')} — {new Date(row.periodEnd).toLocaleDateString('ru-RU')}
                      </td>
                      <td className="p-3">
                        <details>
                          <summary className="cursor-pointer text-xs font-semibold text-primary underline decoration-dotted">Формула и допущения</summary>
                          <dl className="mt-2 space-y-1 rounded-xl bg-surface-muted p-3 text-xs">
                            <div><dt className="inline font-semibold">Тип: </dt><dd className="inline text-muted-foreground">{KIND_META[row.kind].note}</dd></div>
                            <div><dt className="inline font-semibold">Источник: </dt><dd className="inline text-muted-foreground">{row.source}</dd></div>
                            <div><dt className="inline font-semibold">Версия метода: </dt><dd className="inline text-muted-foreground">{row.methodVersion ?? '—'}</dd></div>
                            <div><dt className="inline font-semibold">Уверенность: </dt><dd className="inline text-muted-foreground">{row.confidence == null ? 'не указана' : `${row.confidence}%`}</dd></div>
                            <div>
                              <dt className="font-semibold">Допущения и недостающие данные</dt>
                              <dd className="font-mono text-muted-foreground">{JSON.stringify(row.evidence)}</dd>
                            </div>
                            {row.isMock && <div className="font-bold text-amber-800">Запись из демонстрационного набора.</div>}
                          </dl>
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.nextCursor && (
              <Link
                href={`/app/analytics?days=${days}&cursor=${encodeURIComponent(data.nextCursor)}`}
                className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-border px-5 text-sm font-bold"
              >
                Показать ещё
              </Link>
            )}
          </>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-border p-10 text-center">
            <h3 className="font-bold">Измерений пока нет</h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              Ledger заполняется после запуска: прогноз фиксируется при подтверждении, влияние и прирост —
              по доставкам, откликам и погашениям.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
