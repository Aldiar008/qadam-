import {
  WEEKDAY_LABELS,
  areaPath,
  linePath,
  type FunnelStage,
  type LifecycleSlice,
  type RevenueSeries,
  type VisitHeatmap,
} from '@/domain/analytics-charts.ts';

/**
 * Дашборды: те же цифры, но в форме, по которой видно решение.
 *
 * Drawn as plain SVG on the server. A charting library would want script that
 * this app's nonce-only CSP has no reason to admit, and none of these shapes is
 * hard enough to justify the exception — a line, a grid and four bars.
 *
 * Every chart states what it cannot show. An empty week is drawn as an empty
 * week, and a sample too small to have a shape says so instead of drawing one.
 */

const money = (minor: number) => `${Math.round(minor).toLocaleString('ru-RU')} ₸`;
const shortMoney = (minor: number) =>
  (minor >= 1_000_000 ? `${(minor / 1_000_000).toFixed(1)} млн` : minor >= 1_000 ? `${Math.round(minor / 1_000)} тыс` : String(Math.round(minor)));
const pct = (bps: number | null) => (bps == null ? '—' : `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`);
const dayLabel = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });

/** Выручка по дням. */
export function RevenueTrend({ series, days }: { series: RevenueSeries; days: number }) {
  const values = series.points.map((point) => point.valueMinor);
  const width = 720;
  const height = 200;
  const traded = series.points.length - series.emptyDays;

  if (traded < 2) {
    return (
      <section className="rounded-3xl border border-dashed border-border p-8 text-center text-sm leading-6 text-muted-foreground">
        За {days} дн. записано продаж меньше чем за два дня. Линию тренда по одной точке не строим —
        она была бы рисунком, а не измерением.
      </section>
    );
  }

  const rising = (series.changeBps ?? 0) >= 0;
  const ticks = [0, Math.floor(series.points.length / 2), series.points.length - 1];

  return (
    <section className="rounded-3xl border border-border bg-surface p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Выручка по дням</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            По записанным продажам за {days} дн. Дни без продаж показаны нулём, а не пропуском.
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-2xl font-extrabold">{money(series.totalMinor)}</p>
          <p className={`text-xs font-bold ${series.changeBps == null ? 'text-muted-foreground' : rising ? 'text-emerald-700' : 'text-rose-700'}`}>
            {series.changeBps == null
              ? 'сравнивать не с чем: предыдущий период пуст'
              : `${rising ? '+' : ''}${pct(series.changeBps)} к предыдущим ${days} дн.`}
          </p>
        </div>
      </div>

      <figure className="mt-5">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-44 w-full"
          role="img"
          aria-label={`Выручка по дням за ${days} дней, всего ${money(series.totalMinor)}${series.peak ? `, максимум ${money(series.peak.valueMinor)} ${dayLabel(series.peak.date)}` : ''}`}
        >
          <defs>
            <linearGradient id="revenue-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {/* Four guide lines, so a peak can be read as a level and not just a bump. */}
          {[0.25, 0.5, 0.75].map((fraction) => (
            <line
              key={fraction}
              x1="4" x2={width - 4}
              y1={height - 4 - fraction * (height - 8)} y2={height - 4 - fraction * (height - 8)}
              className="stroke-border" strokeWidth="1" strokeDasharray="3 5"
            />
          ))}
          <path d={areaPath(values, width, height)} fill="url(#revenue-fill)" className="text-primary" />
          <path d={linePath(values, width, height)} fill="none" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" className="stroke-primary" />
        </svg>
        <figcaption className="mt-2 flex justify-between text-[11px] text-muted-foreground">
          {ticks.map((index) => <span key={index}>{dayLabel(series.points[index].date)}</span>)}
        </figcaption>
      </figure>

      <p className="mt-4 text-xs leading-5 text-muted-foreground">
        {series.peak && <>Лучший день — {dayLabel(series.peak.date)}, {money(series.peak.valueMinor)}. </>}
        {series.emptyDays > 0 && <>Дней без единой записанной продажи: {series.emptyDays} из {series.points.length}.</>}
      </p>
    </section>
  );
}

/** Когда приходят гости. */
export function VisitHeatmapCard({ heatmap }: { heatmap: VisitHeatmap }) {
  if (heatmap.transactions < 20) {
    return (
      <section className="rounded-3xl border border-dashed border-border p-8 text-center text-sm leading-6 text-muted-foreground">
        Для карты загрузки нужно хотя бы 20 записанных продаж — сейчас {heatmap.transactions}.
        По меньшему числу узор был бы случайным, а выглядел бы как закономерность.
      </section>
    );
  }

  const intensity = (value: number) => (heatmap.maxMinor > 0 ? value / heatmap.maxMinor : 0);

  return (
    <section className="rounded-3xl border border-border bg-surface p-6">
      <h2 className="text-lg font-bold">Когда в заведении деньги</h2>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        Выручка по дням недели и двухчасовым интервалам. Именно из этой картины берётся «сигнал дня»:
        пустая клетка в будни — это часы, которые можно наполнить.
      </p>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[520px] border-separate border-spacing-1 text-center">
          <caption className="sr-only">Выручка по дням недели и двухчасовым интервалам</caption>
          <thead>
            <tr>
              <th scope="col" className="w-10 text-left text-[11px] font-semibold text-muted-foreground" />
              {heatmap.hours.map((hour) => (
                <th key={hour} scope="col" className="text-[10px] font-semibold text-muted-foreground">
                  {String(hour).padStart(2, '0')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {WEEKDAY_LABELS.map((label, weekday) => (
              <tr key={label}>
                <th scope="row" className="pr-1 text-left text-[11px] font-bold text-muted-foreground">{label}</th>
                {heatmap.hours.map((hour) => {
                  const cell = heatmap.cells.find((item) => item.weekday === weekday && item.hour === hour);
                  const value = cell?.valueMinor ?? 0;
                  const share = intensity(value);
                  return (
                    <td key={hour} className="p-0">
                      <div
                        className={`relative h-9 overflow-hidden rounded-md ${value === 0 ? 'border border-dashed border-border' : ''}`}
                        title={`${label} ${String(hour).padStart(2, '0')}:00–${String(hour + 2).padStart(2, '0')}:00 — ${money(value)}`}
                      >
                        {/* Opacity on a layer of its own, not on the cell: tinting the
                            cell would fade the number written on it too. */}
                        {value > 0 && (
                          <span aria-hidden="true" className="absolute inset-0 bg-primary" style={{ opacity: 0.18 + share * 0.82 }} />
                        )}
                        <span className="sr-only">
                          {label}, {hour}:00–{hour + 2}:00: {money(value)}, продаж {cell?.transactions ?? 0}
                        </span>
                        <span
                          aria-hidden="true"
                          className={`relative block text-[10px] font-bold leading-9 ${value === 0 ? 'text-muted-foreground' : share > 0.5 ? 'text-primary-foreground' : 'text-foreground'}`}
                        >
                          {value === 0 ? '·' : shortMoney(value)}
                        </span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 grid gap-2 text-xs leading-5 sm:grid-cols-2">
        {heatmap.busiest && (
          <p className="rounded-xl bg-emerald-500/10 p-3">
            <strong>Пик:</strong> {WEEKDAY_LABELS[heatmap.busiest.weekday]}, {String(heatmap.busiest.hour).padStart(2, '0')}:00–{String(heatmap.busiest.hour + 2).padStart(2, '0')}:00 — {money(heatmap.busiest.valueMinor)}.
          </p>
        )}
        {heatmap.quietest && (
          <p className="rounded-xl bg-amber-500/10 p-3">
            <strong>Самый пустой будний интервал:</strong> {WEEKDAY_LABELS[heatmap.quietest.weekday]},
            {' '}{String(heatmap.quietest.hour).padStart(2, '0')}:00–{String(heatmap.quietest.hour + 2).padStart(2, '0')}:00 — {money(heatmap.quietest.valueMinor)}.
            Это наблюдение, а не установленная причина.
          </p>
        )}
      </div>
    </section>
  );
}

/** Воронка кампаний. */
export function CampaignFunnel({ stages }: { stages: FunnelStage[] }) {
  const top = stages[0]?.count ?? 0;
  if (!top) {
    return (
      <section className="rounded-3xl border border-dashed border-border p-8 text-center text-sm leading-6 text-muted-foreground">
        Отправок ещё не было — воронке нечего показывать. Она заполнится после первого подтверждённого запуска.
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-border bg-surface p-6">
      <h2 className="text-lg font-bold">Воронка кампаний</h2>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        Проценты считаются от предыдущего шага, а не от начала: «40% открыли» — это про тех, кому
        сообщение дошло, иначе текст отвечал бы за канал.
      </p>
      <ul className="mt-5 grid gap-3">
        {stages.map((stage) => (
          <li key={stage.key}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-semibold">{stage.label}</span>
              <span className="font-mono font-bold">
                {stage.count}
                {stage.ofPreviousBps !== null && (
                  <span className="ml-2 text-xs font-semibold text-muted-foreground">{pct(stage.ofPreviousBps)} от предыдущего</span>
                )}
              </span>
            </div>
            <div className="mt-1 h-3 overflow-hidden rounded-full bg-surface-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.max(2, Math.round((stage.count / top) * 100))}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Written out in full so Tailwind's scanner can see every class it must emit —
// a colour assembled from a variable would be dropped at build time.
const STAGE_TONE: Record<string, string> = {
  new: 'bg-sky-500',
  active: 'bg-emerald-500',
  loyal: 'bg-primary',
  vip: 'bg-violet-500',
  inactive: 'bg-amber-500',
  churned: 'bg-rose-500',
};

/** Состав базы гостей. */
export function LifecycleMix({ slices, total }: { slices: LifecycleSlice[]; total: number }) {
  if (!total) {
    return (
      <section className="rounded-3xl border border-dashed border-border p-8 text-center text-sm leading-6 text-muted-foreground">
        В базе пока нет гостей — состав показывать не из чего.
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-border bg-surface p-6">
      <h2 className="text-lg font-bold">Состав базы гостей</h2>
      <p className="mt-1 text-xs text-muted-foreground">Всего {total} — из них видно, какая доля перестала ходить.</p>

      <div
        className="mt-5 flex h-5 overflow-hidden rounded-full"
        role="img"
        aria-label={slices.map((slice) => `${slice.label}: ${slice.count}`).join(', ')}
      >
        {slices.map((slice) => (
          <div key={slice.stage} className={STAGE_TONE[slice.stage]} style={{ width: `${slice.shareBps / 100}%` }} />
        ))}
      </div>

      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {slices.map((slice) => (
          <li key={slice.stage} className="flex items-center gap-2 text-sm">
            <span className={`size-3 shrink-0 rounded-sm ${STAGE_TONE[slice.stage]}`} aria-hidden="true" />
            <span className="font-semibold">{slice.label}</span>
            <span className="ml-auto font-mono text-xs text-muted-foreground">{slice.count} · {pct(slice.shareBps)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
