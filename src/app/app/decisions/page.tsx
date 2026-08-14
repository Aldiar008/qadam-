import Link from 'next/link';
import { ArrowRight, CheckCircle2, Clock, Flower2, RefreshCw, Trash2, Truck, XCircle } from 'lucide-react';

import { EvidenceDrawer } from '@/components/app/EvidenceDrawer';
import { formatQuantity } from '@/domain/inventory';
import { canManage, requireBusinessContext } from '@/server/qadam/repository';
import { loadRiskQueue } from '@/server/qadam/supply-core';
import { approveDecision, recomputeDecisions, rejectDecision, snoozeDecision } from './actions';

export const dynamic = 'force-dynamic';

function humanHours(hours: number | null): string {
  if (hours === null) return 'нет продаж';
  if (hours < 0) return 'срок вышел';
  if (hours < 24) return `${hours} ч`;
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return rest === 0 ? `${days} дн.` : `${days} дн. ${rest} ч`;
}

const money = (minor: number | null | undefined) =>
  minor === null || minor === undefined ? '—' : `${Math.round(Number(minor)).toLocaleString('ru-RU')} ₸`;

const field =
  'min-h-11 w-full rounded-xl border border-border bg-surface-muted px-3 text-sm outline-none focus:ring-2 focus:ring-primary';

interface PlanLine {
  supplierId: string;
  supplierName: string;
  quantityMilli: number;
  unitPriceMinor: number;
  costMinor: number;
  leadTimeP80Hours: number;
  urgent: boolean;
}

interface RejectedLine {
  supplierName: string;
  detail: string;
}

/**
 * Утренняя очередь и карточка решения.
 *
 * Складская программа заканчивается там, где начинается работа: показывает
 * остаток и оставляет владельцу вопрос «и что теперь». Здесь карточка отвечает
 * на него целиком — сколько добрать, у кого, во что встанет и что будет, если
 * не делать ничего, — а подтверждение занимает одно нажатие.
 *
 * Заказы при этом создаются черновиками. Подтверждение решения не отправляет
 * ничего поставщику: отправка — отдельное действие, потому что это уже деньги.
 */
export default async function DecisionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    approved?: string;
    snoozed?: string;
    rejected?: string;
    recomputed?: string;
  }>;
}) {
  const params = await searchParams;
  const ctx = await requireBusinessContext();
  const canDecide = canManage(ctx.role);
  const { queue, totalPositions, isMock } = await loadRiskQueue();

  const { data: decisionRows } = await ctx.supabase
    .from('decision_contracts')
    .select(
      'id,version,status,supply_item_id,headline,consequence,recommended_quantity_milli,urgent_quantity_milli,expected_cost_minor,counterfactual,plan,rejected_offers,confidence_ppm,model_version,time_to_stockout_hours',
    )
    .eq('business_id', ctx.businessId)
    .eq('status', 'open');

  const decisionByItem = new Map((decisionRows ?? []).map((row) => [row.supply_item_id, row]));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-extrabold tracking-tight">
            <Flower2 className="size-7 text-primary" aria-hidden="true" />
            Что решаем сегодня
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {totalPositions} позиций в магазине. В очередь попадает только то, где цветы закончатся раньше
            поставки или не успеют продаться до потери свежести.
          </p>
        </div>
        <form action={recomputeDecisions}>
          <button className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-bold hover:bg-surface-muted">
            <RefreshCw className="size-4" aria-hidden="true" />
            Пересчитать решения
          </button>
        </form>
      </header>

      {params.error && (
        <p role="alert" className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm">
          {params.error}
        </p>
      )}
      {params.approved && (
        <p className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm">
          Решение подтверждено, заказы созданы черновиками. Отправка поставщику — на экране заказов.
        </p>
      )}
      {params.recomputed && (
        <p className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm">
          Пересчитано решений: {params.recomputed}.
        </p>
      )}
      {params.snoozed && <p className="rounded-2xl border border-border bg-surface p-4 text-sm">Решение отложено.</p>}
      {params.rejected && <p className="rounded-2xl border border-border bg-surface p-4 text-sm">Решение отклонено, причина сохранена.</p>}

      {queue.length === 0 ? (
        <div className="rounded-3xl border border-emerald-500/40 bg-emerald-500/5 p-8 text-center">
          <CheckCircle2 className="mx-auto size-8 text-emerald-600" aria-hidden="true" />
          <h2 className="mt-3 text-xl font-bold">Сегодня решать нечего</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Запаса хватает до ближайшей поставки, и ничего не вянет сверх допустимой доли.
          </p>
        </div>
      ) : (
        <ol className="space-y-4">
          {queue.map((entry, index) => {
            const { position, kind } = entry;
            const { item, assessment, forecast, spoilage } = position;
            const decision = decisionByItem.get(item.id);
            const plan = (decision?.plan ?? []) as unknown as PlanLine[];
            const rejected = (decision?.rejected_offers ?? []) as unknown as RejectedLine[];
            const counterfactual = (decision?.counterfactual ?? {}) as {
              allFastCostMinor?: number | null;
              differenceMinor?: number | null;
              note?: string;
            };

            return (
              <li
                key={`${item.id}-${kind}`}
                className={
                  'rounded-3xl border p-5 ' +
                  (kind === 'spoilage'
                    ? 'border-violet-500/50 bg-violet-500/5'
                    : assessment.level === 'critical'
                      ? 'border-rose-500/50 bg-rose-500/5'
                      : 'border-amber-500/50 bg-amber-500/5')
                }
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-muted-foreground">
                      Решение {index + 1} из {queue.length}
                      {decision ? ` · версия ${decision.version}` : ''}
                    </p>
                    <h2 className="mt-1 text-xl font-extrabold">
                      {decision?.headline ?? item.name}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {decision?.consequence ?? assessment.reason}
                    </p>
                  </div>
                  {isMock && (
                    <span className="shrink-0 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 font-mono text-[11px] font-bold text-amber-800">
                      [MOCK]
                    </span>
                  )}
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-4">
                  <div className="rounded-2xl border border-border bg-surface p-3">
                    <p className="font-mono text-[11px] uppercase text-muted-foreground">На витрине</p>
                    <p className="mt-0.5 font-mono text-lg font-bold">{formatQuantity(position.onHandMilli, item.unit)}</p>
                  </div>
                  <div className="rounded-2xl border border-border bg-surface p-3">
                    <p className="font-mono text-[11px] uppercase text-muted-foreground">
                      {kind === 'stockout' ? 'Закончится через' : 'Ближайший срок'}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 font-mono text-lg font-bold">
                      <Clock className="size-4 text-muted-foreground" aria-hidden="true" />
                      {humanHours(kind === 'stockout' ? assessment.timeToStockoutHours : spoilage.nearestExpiryHours)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border bg-surface p-3">
                    <p className="font-mono text-[11px] uppercase text-muted-foreground">Спрос в день</p>
                    <p className="mt-0.5 font-mono text-lg font-bold">
                      {formatQuantity(forecast.dailyForecastMilli, item.unit)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border bg-surface p-3">
                    <p className="font-mono text-[11px] uppercase text-muted-foreground">
                      {kind === 'stockout' ? 'Стоимость заказа' : 'Под списание'}
                    </p>
                    <p className="mt-0.5 font-mono text-lg font-bold">
                      {kind === 'stockout'
                        ? money(decision?.expected_cost_minor)
                        : formatQuantity(spoilage.atRiskMilli, item.unit)}
                    </p>
                  </div>
                </div>

                {forecast.appliedEvents.length > 0 && (
                  <p className="mt-3 rounded-2xl border border-primary/30 bg-primary/5 p-3 text-sm">
                    <span className="font-semibold">Учтён повод: </span>
                    {forecast.appliedEvents.map((event) => event.name).join(', ')} — спрос выше обычного в{' '}
                    {(forecast.eventFactorPpm / 1_000_000).toFixed(2)} раза
                    {forecast.appliedEvents.every((event) => event.verified) ? '' : ' (гипотеза, не проверена фактом)'}
                  </p>
                )}

                {plan.length > 0 && (
                  <section className="mt-4 rounded-2xl border border-border bg-surface p-4">
                    <h3 className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                      План закупки
                    </h3>
                    <ul className="mt-2 space-y-2">
                      {plan.map((line) => (
                        <li
                          key={line.supplierId}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-muted px-3 py-2 text-sm"
                        >
                          <span className="flex items-center gap-2">
                            <Truck className="size-4 text-muted-foreground" aria-hidden="true" />
                            <span className="font-semibold">{line.supplierName}</span>
                            {line.urgent && (
                              <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 font-mono text-[11px] font-bold text-rose-800">
                                срочно
                              </span>
                            )}
                          </span>
                          <span className="flex items-center gap-3 font-mono text-xs">
                            <span className="font-bold">{formatQuantity(line.quantityMilli, item.unit)}</span>
                            <span className="text-muted-foreground">{line.leadTimeP80Hours} ч</span>
                            <span className="font-bold">{money(line.costMinor)}</span>
                          </span>
                        </li>
                      ))}
                    </ul>

                    {counterfactual.differenceMinor !== null && counterfactual.differenceMinor !== undefined && (
                      <p className="mt-3 font-mono text-xs text-muted-foreground">
                        Всё у быстрого обошлось бы в {money(counterfactual.allFastCostMinor)} — разница{' '}
                        {money(counterfactual.differenceMinor)}. {counterfactual.note}
                      </p>
                    )}
                  </section>
                )}

                {rejected.length > 0 && (
                  <details className="mt-3 rounded-2xl border border-border bg-surface-muted/60 px-4 py-3 text-sm">
                    <summary className="cursor-pointer list-none font-mono text-xs text-muted-foreground">
                      Не подошли: {rejected.length} — почему
                    </summary>
                    <ul className="mt-2 space-y-1">
                      {rejected.map((item2) => (
                        <li key={item2.supplierName} className="flex gap-2 text-muted-foreground">
                          <XCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                          <span>
                            <span className="font-semibold text-foreground">{item2.supplierName}</span> — {item2.detail}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}

                <div className="mt-4 space-y-2">
                  {kind === 'stockout' && assessment.explanations.timeToStockout && (
                    <EvidenceDrawer
                      explanation={assessment.explanations.timeToStockout}
                      modelVersion={decision?.model_version ?? assessment.modelVersion}
                      displayValue={humanHours(assessment.timeToStockoutHours)}
                      label="Почему именно столько времени"
                      isMock={isMock}
                    />
                  )}
                  {kind === 'spoilage' && (
                    <EvidenceDrawer
                      explanation={spoilage.explanation}
                      modelVersion={spoilage.modelVersion}
                      displayValue={formatQuantity(spoilage.atRiskMilli, item.unit)}
                      label="Откуда взялось количество под списание"
                      isMock={isMock}
                    />
                  )}
                  <EvidenceDrawer
                    explanation={forecast.explanation}
                    modelVersion={forecast.modelVersion}
                    displayValue={`${formatQuantity(forecast.dailyForecastMilli, item.unit)} / день`}
                    label="Откуда взят спрос"
                    isMock={isMock}
                  />
                </div>

                {decision && plan.length > 0 && canDecide && (
                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
                    <form action={approveDecision}>
                      <input type="hidden" name="id" value={decision.id} />
                      <input type="hidden" name="version" value={decision.version} />
                      <button className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary-hover">
                        Подтвердить {plan.length === 1 ? 'заказ' : `${plan.length} заказа`}
                        <ArrowRight className="size-4" aria-hidden="true" />
                      </button>
                    </form>

                    <form action={snoozeDecision} className="flex items-center gap-2">
                      <input type="hidden" name="id" value={decision.id} />
                      <input type="hidden" name="hours" value="24" />
                      <button className="min-h-11 rounded-xl border border-border px-4 text-sm font-bold hover:bg-surface-muted">
                        Отложить на день
                      </button>
                    </form>

                    <details className="w-full">
                      <summary className="cursor-pointer list-none font-mono text-xs text-muted-foreground">
                        Изменить или отклонить
                      </summary>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <form action={approveDecision} className="space-y-2 rounded-2xl border border-border p-3">
                          <input type="hidden" name="id" value={decision.id} />
                          <input type="hidden" name="version" value={decision.version} />
                          <input type="hidden" name="mode" value="override" />
                          <input
                            name="overrideReason"
                            className={field}
                            placeholder="Почему меняете решение"
                            required
                            minLength={3}
                          />
                          <button className="min-h-11 w-full rounded-xl border border-border px-4 text-sm font-bold hover:bg-surface-muted">
                            Подтвердить с изменением
                          </button>
                        </form>

                        <form action={rejectDecision} className="space-y-2 rounded-2xl border border-border p-3">
                          <input type="hidden" name="id" value={decision.id} />
                          <input name="reason" className={field} placeholder="Почему не подходит" required minLength={3} />
                          <button className="min-h-11 w-full rounded-xl border border-border px-4 text-sm font-bold hover:bg-surface-muted">
                            Отклонить
                          </button>
                        </form>
                      </div>
                    </details>
                  </div>
                )}

                {decision && plan.length === 0 && (
                  <p className="mt-4 flex items-start gap-2 rounded-2xl border border-violet-500/30 bg-violet-500/10 p-3 text-sm">
                    <Trash2 className="mt-0.5 size-4 shrink-0 text-violet-600" aria-hidden="true" />
                    <span>
                      Здесь нечего заказывать — наоборот. Уменьшите ближайшую закупку или соберите промо-набор из
                      того, что вянет раньше.
                    </span>
                  </p>
                )}

                {!decision && (
                  <p className="mt-4 rounded-2xl border border-dashed border-border p-3 font-mono text-xs text-muted-foreground">
                    Решение ещё не собрано — нажмите «Пересчитать решения».
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <p className="text-center">
        <Link href="/app/orders" className="text-sm font-bold text-primary hover:underline">
          Открыть заказы и приёмку →
        </Link>
      </p>
    </div>
  );
}
