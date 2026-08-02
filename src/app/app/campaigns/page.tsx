import Link from 'next/link';
import { ChevronRight, Plus, ShieldCheck, ShieldAlert } from 'lucide-react';
import { getCampaignsData } from '@/server/qadam/repository';

export const dynamic = 'force-dynamic';

const statusLabels: Record<string, string> = {
  draft: 'Черновик',
  pending_approval: 'Ждёт подтверждения',
  approved: 'Подтверждена',
  scheduled: 'Запланирована',
  running: 'Идёт',
  paused: 'На паузе',
  completed: 'Завершена',
  canceled: 'Отменена',
  failed: 'Ошибка',
};

const contractStatusLabels: Record<string, string> = {
  draft: 'Черновик',
  compiled: 'Экономика рассчитана',
  awaiting_approval: 'Ждёт подтверждения владельца',
  approved: 'Подтверждён',
  launching: 'Запускается',
  running: 'Идёт',
  simulated: 'Симуляция',
  paused: 'На паузе',
  completed: 'Завершён',
  cancelled: 'Отменён',
  failed: 'Ошибка',
};

// KZT minor unit is the tenge itself in this schema — no division.
const money = (minor: number | string | null | undefined) => `${Number(minor ?? 0).toLocaleString('ru-RU')} ₸`;

export default async function CampaignsPage() {
  const data = await getCampaignsData();

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Кампании</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Каждая кампания создаётся только из Growth Contract: экономика, Margin Shield и согласие
            пересчитываются на сервере перед запуском.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/app/campaigns/new"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-bold"
          >
            Быстрая кампания
          </Link>
          <Link
            href="/app/campaigns/studio"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground"
          >
            <Plus className="size-4" aria-hidden="true" /> Студия кампаний
          </Link>
        </div>
      </header>

      {data.openContracts.length > 0 && (
        <section className="rounded-3xl border border-border bg-surface p-6">
          <h2 className="text-lg font-bold">Незапущенные Growth Contracts</h2>
          <p className="mt-1 text-xs text-muted-foreground">Экономика рассчитана, но кампания ещё не создана.</p>
          <ul className="mt-4 grid gap-2">
            {data.openContracts.map((contract) => {
              const decision = (contract.margin_decision ?? {}) as { status?: string };
              return (
                <li key={contract.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-muted p-4">
                  <div className="min-w-0">
                    <p className="text-sm font-bold">
                      Контракт v{contract.version} · {contractStatusLabels[contract.status] ?? contract.status}
                    </p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      hash {String(contract.content_hash).slice(0, 12)}… · Margin Shield: {decision.status ?? 'n/a'}
                    </p>
                  </div>
                  <Link
                    href={`/app/campaigns/new?contract=${contract.id}`}
                    className="inline-flex min-h-11 items-center rounded-xl border border-border bg-surface px-4 text-sm font-bold"
                  >
                    Открыть
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {data.campaigns.length ? (
        <div className="grid gap-4">
          {data.campaigns.map((campaign) => {
            const decision = (campaign.contract?.margin_decision ?? {}) as { status?: string };
            const forecast = campaign.measurements.find((item) => item.kind === 'forecast');
            const verified = campaign.measurements.find((item) => item.kind === 'verified_fact');
            return (
              <Link
                key={campaign.id}
                href={`/app/campaigns/${campaign.id}`}
                className="group rounded-3xl border border-border bg-surface p-5 transition hover:border-primary/40 sm:p-6"
              >
                <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                        {statusLabels[campaign.status] ?? campaign.status}
                      </span>
                      <span className="rounded-full bg-surface-muted px-3 py-1 text-xs font-bold uppercase">{campaign.channel}</span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${
                          decision.status === 'allowed'
                            ? 'bg-emerald-500/10 text-emerald-700'
                            : decision.status === 'warning'
                              ? 'bg-amber-500/10 text-amber-800'
                              : 'bg-rose-500/10 text-rose-700'
                        }`}
                      >
                        {decision.status === 'allowed' ? <ShieldCheck className="size-3.5" /> : <ShieldAlert className="size-3.5" />}
                        Margin Shield: {decision.status ?? 'n/a'}
                      </span>
                    </div>
                    <h2 className="mt-3 font-bold leading-6">{campaign.name}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Создана {new Date(campaign.created_at).toLocaleDateString('ru-RU')}
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-5 text-center font-mono text-sm">
                    <div>
                      <strong className="block text-lg">{campaign.includedCount}</strong>
                      <span className="text-xs text-muted-foreground">в аудитории</span>
                    </div>
                    <div>
                      <strong className="block text-lg">{money(campaign.budget_minor)}</strong>
                      <span className="text-xs text-muted-foreground">бюджет</span>
                    </div>
                    <div>
                      <strong className="block text-lg text-primary">
                        {verified ? money(verified.value_minor) : forecast ? money(forecast.value_minor) : '—'}
                      </strong>
                      <span className="text-xs text-muted-foreground">
                        {verified ? 'verified fact' : forecast ? 'forecast' : 'нет измерений'}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="hidden size-5 text-muted-foreground transition group-hover:translate-x-1 lg:block" />
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <section className="rounded-3xl border border-dashed border-border p-10 text-center">
          <h2 className="text-lg font-bold">Кампаний пока нет</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            Начните с открытого сигнала: QADAM рассчитает экономику, проверит Margin Shield и подготовит
            кампанию к вашему подтверждению.
          </p>
          <Link
            href="/app/campaigns/studio"
            className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground"
          >
            <Plus className="size-4" aria-hidden="true" /> Открыть Campaign Studio
          </Link>
        </section>
      )}
    </div>
  );
}
