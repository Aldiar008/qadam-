import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AlertTriangle, ArrowLeft, ShieldAlert, ShieldCheck } from 'lucide-react';
import { canMarket, getCampaignDetail } from '@/server/qadam/repository';
import { transitionCampaign } from '../actions';

export const dynamic = 'force-dynamic';

// KZT minor unit is the tenge itself in this schema — no division.
const money = (minor: number | string | null | undefined) => `${Number(minor ?? 0).toLocaleString('ru-RU')} ₸`;

const statusLabels: Record<string, string> = {
  draft: 'Черновик', pending_approval: 'Ждёт подтверждения', approved: 'Подтверждена', scheduled: 'Запланирована',
  running: 'Идёт', paused: 'На паузе', completed: 'Завершена', canceled: 'Отменена', failed: 'Ошибка',
};

// Mirrors the database transition guard so the UI never offers an invalid move.
const nextStatuses: Record<string, { value: string; label: string; primary?: boolean }[]> = {
  approved: [{ value: 'running', label: 'Запустить сейчас', primary: true }, { value: 'scheduled', label: 'Запланировать' }, { value: 'canceled', label: 'Отменить' }],
  scheduled: [{ value: 'running', label: 'Запустить сейчас', primary: true }, { value: 'paused', label: 'Пауза' }, { value: 'canceled', label: 'Отменить' }],
  running: [{ value: 'paused', label: 'Пауза', primary: true }, { value: 'completed', label: 'Завершить' }],
  paused: [{ value: 'running', label: 'Возобновить', primary: true }, { value: 'completed', label: 'Завершить' }, { value: 'canceled', label: 'Отменить' }],
};

const kindLabels: Record<string, string> = {
  forecast: 'Forecast', influenced: 'Influenced', incremental_estimate: 'Incremental estimate',
  mock_actual: 'Mock result', verified_fact: 'Verified fact',
};

export default async function CampaignDetailPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ launched?: string; updated?: string; error?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;

  let data;
  try {
    data = await getCampaignDetail(id);
  } catch (error) {
    if (error instanceof Error && error.message === 'CAMPAIGN_NOT_FOUND') notFound();
    throw error;
  }

  const { campaign, contract } = data;
  const decision = (contract?.margin_decision ?? null) as { status?: string; reasons?: string[] } | null;
  const consent = (contract?.consent_summary ?? null) as { granted?: number; excluded?: number; scope?: string } | null;
  const simulator = (contract?.simulator_result ?? null) as { scenarios?: Record<string, { incrementalContributionMinor?: number; campaignCostMinor?: number; roiBps?: number | null }> } | null;
  const base = simulator?.scenarios?.base;

  const included = data.audiences.filter((row) => row.inclusion_status === 'included');
  const excluded = data.audiences.filter((row) => row.inclusion_status === 'excluded');
  const opened = data.events.filter((event) => event.event_type === 'opened').length;
  const redeemed = data.events.filter((event) => event.event_type === 'redeemed').length;
  const canAct = canMarket(data.role);
  const moves = nextStatuses[campaign.status] ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <Link href="/app/campaigns" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-primary">
        <ArrowLeft className="size-4" /> Все кампании
      </Link>

      {query.error && (
        <div role="alert" className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4 text-sm font-semibold text-rose-800">
          <AlertTriangle className="mr-2 inline size-4" />{decodeURIComponent(query.error)}
        </div>
      )}
      {(query.launched || query.updated) && (
        <div role="status" className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm font-semibold text-emerald-800">
          {query.launched ? 'Кампания создана из подтверждённого Growth Contract.' : 'Статус кампании обновлён.'}
        </div>
      )}

      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
              {statusLabels[campaign.status] ?? campaign.status}
            </span>
            <span className="rounded-full bg-surface-muted px-3 py-1 text-xs font-bold uppercase">{campaign.channel}</span>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${
                decision?.status === 'allowed' ? 'bg-emerald-500/10 text-emerald-700' : decision?.status === 'warning' ? 'bg-amber-500/10 text-amber-800' : 'bg-rose-500/10 text-rose-700'
              }`}
            >
              {decision?.status === 'allowed' ? <ShieldCheck className="size-3.5" /> : <ShieldAlert className="size-3.5" />}
              Margin Shield: {decision?.status ?? 'n/a'}
            </span>
          </div>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight">{campaign.name}</h1>
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            Growth Contract v{contract?.version} · hash {String(contract?.content_hash ?? '').slice(0, 16)}…
          </p>
        </div>

        {canAct && moves.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {moves.map((move) => (
              <form key={move.value} action={transitionCampaign}>
                <input type="hidden" name="campaignId" value={campaign.id} />
                <input type="hidden" name="toStatus" value={move.value} />
                <input type="hidden" name="expectedVersion" value={campaign.optimistic_version} />
                <button
                  className={`inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-bold ${
                    move.primary ? 'bg-primary text-primary-foreground' : 'border border-border'
                  }`}
                >
                  {move.label}
                </button>
              </form>
            ))}
          </div>
        )}
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'В аудитории', value: String(included.length), note: `исключено ${excluded.length}` },
          { label: 'Бюджет', value: money(campaign.budget_minor), note: 'лимит владельца соблюдён' },
          { label: 'Открытия', value: String(opened), note: data.events.length ? 'события кампании' : 'событий пока нет' },
          { label: 'Использовано купонов', value: String(redeemed), note: data.events.length ? 'события кампании' : 'событий пока нет' },
        ].map((metric) => (
          <div key={metric.label} className="rounded-3xl border border-border bg-surface p-5">
            <p className="text-xs text-muted-foreground">{metric.label}</p>
            <p className="mt-2 font-mono text-2xl font-extrabold">{metric.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{metric.note}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-3xl border border-border bg-surface p-6">
          <h2 className="text-xl font-bold">Прогноз при подтверждении</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Значения зафиксированы в неизменяемом снимке контракта и не пересчитываются задним числом.
          </p>
          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between border-b border-border pb-2">
              <dt className="text-muted-foreground">Вклад-маржа (базовый)</dt>
              <dd className="font-mono font-bold">{money(base?.incrementalContributionMinor)}</dd>
            </div>
            <div className="flex justify-between border-b border-border pb-2">
              <dt className="text-muted-foreground">Затраты кампании</dt>
              <dd className="font-mono font-bold">{money(base?.campaignCostMinor)}</dd>
            </div>
            <div className="flex justify-between border-b border-border pb-2">
              <dt className="text-muted-foreground">ROI (forecast)</dt>
              <dd className="font-mono font-bold">{base?.roiBps == null ? '—' : `${Math.round(base.roiBps / 100)}%`}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Согласие ({consent?.scope})</dt>
              <dd className="font-mono font-bold">{consent?.granted ?? 0}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-3xl border border-border bg-surface p-6">
          <h2 className="text-xl font-bold">Impact Ledger</h2>
          <p className="mt-1 text-xs text-muted-foreground">Forecast, Mock result и Verified fact разведены по типу.</p>
          {data.measurements.length ? (
            <ul className="mt-5 space-y-2">
              {data.measurements.map((metric) => (
                <li key={metric.id} className="flex items-center justify-between rounded-2xl bg-surface-muted p-3 text-sm">
                  <div>
                    <p className="font-semibold">{metric.metric_key}</p>
                    <p className="text-xs text-muted-foreground">
                      {kindLabels[metric.kind] ?? metric.kind}
                      {metric.confidence != null && ` · уверенность ${metric.confidence}%`}
                    </p>
                  </div>
                  <span className="font-mono font-bold">
                    {metric.unit === 'currency_minor' ? money(metric.value_minor) : `${metric.value_minor} ${metric.unit}`}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-5 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Измерений ещё нет. Показатели появятся после доставок и откликов — QADAM не выдаёт прогноз за факт.
            </p>
          )}
        </section>
      </div>

      <section className="rounded-3xl border border-border bg-surface p-6">
        <h2 className="text-xl font-bold">Контент кампании</h2>
        {data.content.length ? (
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            {data.content.map((item) => (
              <article key={item.id} className="rounded-2xl bg-surface-muted p-4">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="uppercase">{item.channel} · {item.locale}</span>
                  <span className="rounded-full bg-surface px-2 py-0.5">{item.status}</span>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{item.body}</p>
                {item.cta && <p className="mt-3 text-xs font-bold text-primary">{item.cta}</p>}
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-border p-6 text-center">
            <p className="text-sm text-muted-foreground">Материалы ещё не созданы.</p>
            <Link href={`/app/content?campaign=${campaign.id}`} className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground">
              Открыть Контент-студию
            </Link>
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-border bg-surface p-6">
        <h2 className="text-xl font-bold">Журнал действий</h2>
        {data.activities.length ? (
          <ul className="mt-4 grid gap-2">
            {data.activities.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between rounded-xl border border-border p-3 text-xs">
                <span className="font-mono font-bold text-primary">{entry.action}</span>
                <span className="text-muted-foreground">{new Date(entry.occurred_at).toLocaleString('ru-RU')}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">Записей пока нет.</p>
        )}
      </section>
    </div>
  );
}
