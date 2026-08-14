import { CalendarDays, FlaskConical, TrendingUp } from 'lucide-react';

import { EvidenceDrawer } from '@/components/app/EvidenceDrawer';
import { formatQuantity } from '@/domain/inventory';
import { canManage, requireBusinessContext } from '@/server/qadam/repository';
import { loadSupplyPositions } from '@/server/qadam/supply-core';
import { toggleEventApproval } from './actions';

export const dynamic = 'force-dynamic';

const day = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });

/**
 * Прогноз спроса и календарь поводов.
 *
 * База считается из истории продаж и видна отдельно от сценария: владелец
 * должен различать «столько уходит обычно» и «столько уйдёт, если праздник
 * действительно сработает». Второе — предположение, и пока он его не принял,
 * заказ строится по первому.
 */
export default async function ForecastPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; approved?: string; revoked?: string }>;
}) {
  const params = await searchParams;
  const ctx = await requireBusinessContext();
  const canDecide = canManage(ctx.role);
  const { positions, isMock } = await loadSupplyPositions();

  const { data: events } = await ctx.supabase
    .from('demand_events')
    .select('id,code,name_ru,event_date,lead_days,lift_ppm,categories,source,verified,approved,business_id,actual_lift_ppm,region,confidence_ppm')
    .or(`business_id.is.null,business_id.eq.${ctx.businessId}`)
    .order('event_date')
    .limit(20);

  // Отсечка «со вчерашнего дня» берётся один раз до фильтрации: вызов часов
  // внутри рендера делает результат зависящим от момента отрисовки.
  const since = Date.parse(new Date().toISOString()) - 86_400_000;
  const upcoming = (events ?? []).filter(
    (event) => Date.parse(`${event.event_date}T23:59:59Z`) >= since,
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="flex items-center gap-3 text-3xl font-extrabold tracking-tight">
          <TrendingUp className="size-7 text-primary" aria-hidden="true" />
          Прогноз спроса
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          База считается из продаж за 28 дней и дня недели. Праздники добавляются отдельным коэффициентом — и
          только после того, как вы его приняли: до этого прогноз и заказ строятся по базе.
        </p>
      </header>

      {params.error && (
        <p role="alert" className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm">
          {params.error}
        </p>
      )}
      {params.approved && (
        <p className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm">
          Повод принят: прогноз, риски и решения пересчитаны.
        </p>
      )}
      {params.revoked && (
        <p className="rounded-2xl border border-border bg-surface p-4 text-sm">
          Повод отключён: прогноз вернулся к базе.
        </p>
      )}

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <CalendarDays className="size-5 text-muted-foreground" aria-hidden="true" />
          Календарь поводов
        </h2>

        {upcoming.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
            Ближайших поводов нет.
          </p>
        ) : (
          <ul className="space-y-2">
            {upcoming.map((event) => (
              <li
                key={event.id}
                className={
                  'rounded-2xl border p-4 ' +
                  (event.approved ? 'border-primary/40 bg-primary/5' : 'border-border bg-surface')
                }
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold">
                      {event.name_ru}
                      <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
                        {day(event.event_date)} · спрос растёт за {event.lead_days} дн.
                      </span>
                    </p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      ×{(event.lift_ppm / 1_000_000).toFixed(2)} на {(event.categories ?? []).join(', ') || 'все категории'} ·
                      {event.region} · уверенность {Math.round(event.confidence_ppm / 10_000)}% ·
                      источник: {event.source}
                      {event.business_id === null ? ' · общий календарь' : ' · ваше событие'}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {!event.verified && (
                      <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 font-mono text-[11px] font-bold text-amber-800">
                        [MOCK HYPOTHESIS]
                      </span>
                    )}
                    <span
                      className={
                        'rounded-full border px-3 py-1 font-mono text-xs font-bold ' +
                        (event.approved
                          ? 'border-primary/30 bg-primary/10 text-primary'
                          : 'border-border bg-surface-muted text-muted-foreground')
                      }
                    >
                      {event.approved ? 'учитывается' : 'не учитывается'}
                    </span>
                  </div>
                </div>

                {canDecide && event.business_id !== null && (
                  <form action={toggleEventApproval} className="mt-3">
                    <input type="hidden" name="id" value={event.id} />
                    <input type="hidden" name="approve" value={event.approved ? 'false' : 'true'} />
                    <button className="min-h-11 rounded-xl border border-border px-4 text-sm font-bold hover:bg-surface-muted">
                      {event.approved ? 'Не учитывать в прогнозе' : 'Учесть в прогнозе'}
                    </button>
                  </form>
                )}

                {event.business_id === null && (
                  <p className="mt-2 font-mono text-xs text-muted-foreground">
                    Общий праздник платформы. Чтобы применить его коэффициент у себя, заведите своё событие с этой
                    датой — так видно, кто именно взял на себя это предположение.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">База и сценарий по позициям</h2>
        <ul className="space-y-3">
          {positions.map((position) => {
            const { item, forecast } = position;
            const scenarioApplied = forecast.eventFactorPpm !== 1_000_000;
            const baselineDaily = Math.round((forecast.baselineMilli * forecast.weekdayFactorPpm) / 1_000_000);

            return (
              <li key={item.id} className="rounded-3xl border border-border bg-surface p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold">{item.name}</h3>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                      история {forecast.sampleDays} дн. · движение в {forecast.daysWithDemand} из них
                      {forecast.wapePpm !== null ? ` · ошибка ${(forecast.wapePpm / 10_000).toFixed(1)}%` : ''}
                    </p>
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">
                    уверенность {Math.round(forecast.confidencePpm / 10_000)}%
                  </span>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl bg-surface-muted p-3">
                    <p className="font-mono text-[11px] uppercase text-muted-foreground">База</p>
                    <p className="mt-0.5 font-mono text-lg font-bold">{formatQuantity(baselineDaily, item.unit)}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">продажи и день недели</p>
                  </div>
                  <div className={`rounded-2xl p-3 ${scenarioApplied ? 'bg-primary/10' : 'bg-surface-muted'}`}>
                    <p className="font-mono text-[11px] uppercase text-muted-foreground">Сценарий</p>
                    <p className="mt-0.5 font-mono text-lg font-bold">
                      {formatQuantity(forecast.dailyForecastMilli, item.unit)}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                      {scenarioApplied
                        ? `×${(forecast.eventFactorPpm / 1_000_000).toFixed(2)} за повод`
                        : 'поводов не учтено'}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-surface-muted p-3">
                    <p className="font-mono text-[11px] uppercase text-muted-foreground">Что учтено</p>
                    <p className="mt-0.5 text-sm font-semibold">
                      {forecast.appliedEvents.length > 0
                        ? forecast.appliedEvents.map((event) => event.name).join(', ')
                        : '—'}
                    </p>
                  </div>
                </div>

                {scenarioApplied && forecast.appliedEvents.some((event) => !event.verified) && (
                  <p className="mt-3 flex items-start gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                    <FlaskConical className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden="true" />
                    <span>
                      Коэффициент повода — гипотеза из отраслевого шаблона. После праздника он сравнивается с фактом
                      и уточняется; до этого база остаётся тем, на что можно опереться.
                    </span>
                  </p>
                )}

                <div className="mt-3">
                  <EvidenceDrawer
                    explanation={forecast.explanation}
                    modelVersion={forecast.modelVersion}
                    displayValue={`${formatQuantity(forecast.dailyForecastMilli, item.unit)} / день`}
                    label="Как посчитан прогноз"
                    isMock={isMock}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
