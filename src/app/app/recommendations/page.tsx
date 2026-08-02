import Link from 'next/link';
import { randomUUID } from 'node:crypto';
import { RefreshCw } from 'lucide-react';
import { getRecommendationsData } from '@/server/qadam/repository';
import { refreshRecommendations, updateRecommendation } from '../actions';

export const dynamic = 'force-dynamic';

const money = (minor: number) => `${Number(minor).toLocaleString('ru-RU')} ₸`;

interface Economics {
  known?: boolean;
  missing?: string[];
  expectedContributionMinor?: number;
  expectedRevenueMinor?: number;
  expectedOrders?: number;
  contributionMarginBps?: number;
  assumptions?: string[];
}

export default async function RecommendationsPage({ searchParams }: { searchParams: Promise<{ refreshed?: string; error?: string }> }) {
  const params = await searchParams;
  const data = await getRecommendationsData();
  const open = data.recommendations.filter((item) => item.status === 'open' || item.status === 'snoozed');

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Рекомендации</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Каждая рождается из измеренного сигнала и несёт свою экономику: сколько человек можно
            затронуть и какой вклад-маржи от этого ждать. Прогноз — это допущение, и допущения
            перечислены рядом с числом.
          </p>
        </div>
        {/* Rejecting every suggestion used to be a dead end: nothing regenerated
            them, and Campaign Studio refuses to work without one. */}
        <form action={refreshRecommendations}>
          <button className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-bold transition-all hover:bg-surface-muted">
            <RefreshCw className="size-4" /> Пересобрать по сигналам
          </button>
        </form>
      </header>

      {params.refreshed && (
        <p role="status" className="rounded-2xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800">
          Пересобрано. Новых: {params.refreshed.split(':')[0]}, обновлено: {params.refreshed.split(':')[1] ?? '0'}.
        </p>
      )}
      {params.error && (
        <p role="alert" className="rounded-2xl bg-amber-500/10 px-4 py-3 text-sm text-amber-900">{params.error}</p>
      )}

      {open.length ? (
        <div className="grid gap-4">
          {open.map((item) => {
            const explanation = (item.explanation ?? {}) as Record<string, unknown>;
            const economics = (explanation.economics ?? {}) as Economics;
            const eligible = typeof explanation.eligible === 'number' ? explanation.eligible : null;

            return (
              <article key={item.id} className="rounded-3xl border border-border bg-surface p-6">
                <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
                  <div>
                    <div className="flex flex-wrap gap-2 text-xs font-bold text-primary">
                      {/* GOS scores an opportunity found in the numbers. A
                          recommendation raised by a rule has no signal behind
                          it, and saying «GOS —» would look like a missing value
                          rather than an inapplicable one. */}
                      {explanation.gos !== undefined && explanation.gos !== null
                        ? <span>GOS {String(explanation.gos)}</span>
                        : <span>Из автоматизации</span>}
                      <span>Уверенность {item.confidence}%</span>
                      <span>{item.status === 'snoozed' ? 'Отложена' : 'Открыта'}</span>
                      {eligible !== null && <span>Можно написать: {eligible}</span>}
                    </div>
                    <h2 className="mt-3 text-xl font-bold">{item.title_ru}</h2>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {String(explanation.reason ?? 'Причина сохранена вместе с рекомендацией.')}
                    </p>
                    {Array.isArray(economics.assumptions) && economics.assumptions.length > 0 && (
                      <ul className="mt-4 grid gap-1 text-xs leading-5 text-muted-foreground">
                        {economics.assumptions.map((line) => <li key={line}>· {line}</li>)}
                      </ul>
                    )}
                  </div>

                  <div className="rounded-2xl bg-surface-muted p-4">
                    <p className="text-xs text-muted-foreground">Ожидаемая вклад-маржа</p>
                    {economics.known && typeof economics.expectedContributionMinor === 'number' ? (
                      <>
                        <p className="mt-2 font-mono text-xl font-bold">{money(economics.expectedContributionMinor)}</p>
                        <p className="mt-2 text-xs leading-5 text-muted-foreground">
                          ≈ {economics.expectedOrders} заказов, выручка {money(economics.expectedRevenueMinor ?? 0)},
                          вклад-маржа {Math.round((economics.contributionMarginBps ?? 0) / 100)}%.
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="mt-2 font-mono text-lg font-bold">—</p>
                        <p className="mt-2 text-xs leading-5 text-muted-foreground">
                          Не хватает: {(economics.missing ?? ['данных']).join(', ')}. Пока это не заполнено,
                          прогноз был бы выдумкой.
                        </p>
                      </>
                    )}
                  </div>
                </div>

                {item.status === 'open' && (
                  <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
                    <form action={updateRecommendation}>
                      <input type="hidden" name="id" value={item.id} />
                      <input type="hidden" name="version" value={item.optimistic_version} />
                      <input type="hidden" name="status" value="accepted" />
                      <input type="hidden" name="idempotencyKey" value={`rec:${item.id}:accept:${randomUUID()}`} />
                      <button className="min-h-11 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground">Принять</button>
                    </form>
                    <Link href={`/app/campaigns/new?recommendation=${item.id}`} className="inline-flex min-h-11 items-center rounded-xl border border-border px-4 text-sm font-bold">
                      Собрать кампанию
                    </Link>
                    <form action={updateRecommendation}>
                      <input type="hidden" name="id" value={item.id} />
                      <input type="hidden" name="version" value={item.optimistic_version} />
                      <input type="hidden" name="status" value="snoozed" />
                      <input type="hidden" name="idempotencyKey" value={`rec:${item.id}:snooze:${randomUUID()}`} />
                      <button className="min-h-11 rounded-xl border border-border px-4 text-sm font-bold">Отложить</button>
                    </form>
                    <form action={updateRecommendation} className="flex gap-2">
                      <input type="hidden" name="id" value={item.id} />
                      <input type="hidden" name="version" value={item.optimistic_version} />
                      <input type="hidden" name="status" value="rejected" />
                      <input type="hidden" name="idempotencyKey" value={`rec:${item.id}:reject:${randomUUID()}`} />
                      <input name="reason" required aria-label="Причина отклонения" placeholder="Причина" className="min-h-11 rounded-xl bg-surface-muted px-3 text-sm" />
                      <button className="min-h-11 rounded-xl border border-border px-4 text-sm font-bold">Отклонить</button>
                    </form>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-border p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Открытых рекомендаций нет. Они появляются из измеренных сигналов — нажмите
            «Пересобрать по сигналам», и если сигналы есть, список наполнится.
          </p>
        </div>
      )}
    </div>
  );
}
