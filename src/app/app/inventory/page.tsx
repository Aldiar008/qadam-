import { AlertTriangle, Clock, Flower2, PackagePlus, RefreshCw, Trash2 } from 'lucide-react';

import { EvidenceDrawer } from '@/components/app/EvidenceDrawer';
import { explainBalance, formatQuantity } from '@/domain/inventory';
import { canMarket, requireBusinessContext } from '@/server/qadam/repository';
import { loadSupplyPositions } from '@/server/qadam/supply-core';
import { createSupplyItem, recomputeRisks, recordMovement, updateSupplyPolicy } from './actions';

export const dynamic = 'force-dynamic';

const field =
  'min-h-11 w-full rounded-xl border border-border bg-surface-muted px-3 text-sm outline-none focus:ring-2 focus:ring-primary';
const label = 'block text-xs font-mono uppercase tracking-wide text-muted-foreground';

/** Часы в человеческую строку: 28 → «1 дн. 4 ч». */
function humanHours(hours: number | null): string {
  if (hours === null) return '—';
  if (hours < 24) return `${hours} ч`;
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return rest === 0 ? `${days} дн.` : `${days} дн. ${rest} ч`;
}

const LEVEL_STYLE: Record<string, string> = {
  critical: 'border-rose-500/40 bg-rose-500/10 text-rose-800',
  warning: 'border-amber-500/40 bg-amber-500/10 text-amber-900',
  watch: 'border-sky-500/40 bg-sky-500/10 text-sky-900',
  none: 'border-border bg-surface-muted text-muted-foreground',
};

const LEVEL_LABEL: Record<string, string> = {
  critical: 'Витрина опустеет раньше поставки',
  warning: 'Поставка не успевает',
  watch: 'Ниже точки перезаказа',
  none: 'Запаса хватает',
};

/** Как выглядит партия по остатку срока — тем же языком, что и ценник. */
const FRESHNESS_LABEL: Record<string, string> = {
  fresh: 'свежая',
  ageing: 'дозревает',
  last_day: 'последний день',
  expired: 'срок вышел',
  imperishable: 'не портится',
};

const FRESHNESS_STYLE: Record<string, string> = {
  fresh: 'bg-emerald-500/10 text-emerald-800 border-emerald-500/25',
  ageing: 'bg-amber-500/10 text-amber-900 border-amber-500/25',
  last_day: 'bg-orange-500/15 text-orange-900 border-orange-500/30',
  expired: 'bg-rose-500/15 text-rose-900 border-rose-500/30',
  imperishable: 'bg-surface-muted text-muted-foreground border-border',
};

const money = (minor: number | null) =>
  minor === null ? '—' : `${Number(minor).toLocaleString('ru-RU')} ₸`;

const CRITICALITY_LABEL: Record<string, string> = {
  critical: 'без неё нельзя',
  normal: 'обычная',
  optional: 'необязательная',
};

/**
 * Остатки и политика пополнения.
 *
 * Экран отвечает на два вопроса подряд: сколько лежит сейчас и когда это
 * кончится. Второй важнее первого — «14 литров» ничего не значит, пока рядом
 * не написано «на 28 часов при сроке поставки 48».
 */
export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string; moved?: string; policy?: string; recomputed?: string }>;
}) {
  const params = await searchParams;
  const ctx = await requireBusinessContext();
  const canEdit = canMarket(ctx.role);
  const { positions, isMock } = await loadSupplyPositions();

  const atRisk = positions.filter((position) => position.assessment.level !== 'none').length;
  const atRiskSpoilage = positions.filter((position) => position.spoilage.overTolerance).length;
  // Что уже выброшено за окно истории — в деньгах по текущей цене закупки.
  const wasteCostMinor = positions.reduce(
    (sum, position) =>
      sum + Math.round((position.wastedMilli * (position.item.currentPriceMinor ?? 0)) / 1000),
    0,
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-extrabold tracking-tight">
            <Flower2 className="size-7 text-primary" aria-hidden="true" />
            Витрина и политика закупки
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Остаток нельзя переписать: он складывается из поставок, продаж, списаний и корректировок, и каждая
            строка помнит автора и время. Цветы лежат партиями — продаётся сначала то, что завянет раньше.
          </p>
        </div>
        {canEdit && (
          <form action={recomputeRisks}>
            <button className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-bold hover:bg-surface-muted">
              <RefreshCw className="size-4" aria-hidden="true" />
              Пересчитать риски
            </button>
          </form>
        )}
      </header>

      {params.error && (
        <p role="alert" className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm">
          {params.error}
        </p>
      )}
      {params.moved && <p className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm">Движение записано, остаток пересчитан.</p>}
      {params.saved && <p className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm">Позиция добавлена.</p>}
      {params.policy && <p className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm">Политика сохранена. Пересчитайте риски, чтобы увидеть новый порог.</p>}
      {params.recomputed && <p className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm">Прогноз и риски пересчитаны, снимки сохранены.</p>}

      <section className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">Позиций в магазине</p>
          <p className="mt-1 font-mono text-2xl font-bold">{positions.length}</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">Могут закончиться</p>
          <p className="mt-1 font-mono text-2xl font-bold">{atRisk}</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">Не успеют продаться</p>
          <p className="mt-1 font-mono text-2xl font-bold">{atRiskSpoilage}</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">Списано за 28 дней</p>
          <p className="mt-1 font-mono text-2xl font-bold">{money(wasteCostMinor)}</p>
        </div>
      </section>

      {positions.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          Позиций пока нет. Добавьте первую — и внесите приёмку, чтобы появился остаток.
        </p>
      ) : (
        <ul className="space-y-4">
          {positions.map((position) => {
            const { item, assessment, forecast } = position;
            const balanceExplanation = explainBalance({
              state: { onHandMilli: position.onHandMilli, appliedKeys: [], lastEventAt: position.lastEventAt, appliedCount: 0, duplicateCount: 0 },
              unit: item.unit,
              period: { start: position.lastEventAt ?? forecast.explanation.period.start, end: forecast.explanation.period.end },
              source: 'inventory_events',
              isMock,
            });

            return (
              <li key={item.id} className="rounded-3xl border border-border bg-surface p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold">{item.name}</h2>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                      {item.category ?? 'без категории'} · пачка {formatQuantity(item.packSizeMilli, item.unit)} ·
                      партия от {formatQuantity(item.moqMilli, item.unit)} · поставка {humanHours(item.leadTimeP80Hours)} ·
                      {item.shelfLifeDays === null ? ' не портится' : ` свежесть ${item.shelfLifeDays} дн.`} ·
                      {' '}{CRITICALITY_LABEL[item.criticality]}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-3 py-1 font-mono text-xs font-bold ${LEVEL_STYLE[assessment.level]}`}>
                    {LEVEL_LABEL[assessment.level]}
                  </span>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-4">
                  <div className="rounded-2xl bg-surface-muted p-3">
                    <p className="font-mono text-[11px] uppercase text-muted-foreground">Остаток</p>
                    <p className="mt-0.5 font-mono text-xl font-bold">{formatQuantity(position.onHandMilli, item.unit)}</p>
                  </div>
                  <div className="rounded-2xl bg-surface-muted p-3">
                    <p className="font-mono text-[11px] uppercase text-muted-foreground">До нуля</p>
                    <p className="mt-0.5 flex items-center gap-1.5 font-mono text-xl font-bold">
                      <Clock className="size-4 text-muted-foreground" aria-hidden="true" />
                      {humanHours(assessment.timeToStockoutHours)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-surface-muted p-3">
                    <p className="font-mono text-[11px] uppercase text-muted-foreground">Расход в день</p>
                    <p className="mt-0.5 font-mono text-xl font-bold">{formatQuantity(forecast.dailyForecastMilli, item.unit)}</p>
                  </div>
                  <div className="rounded-2xl bg-surface-muted p-3">
                    <p className="font-mono text-[11px] uppercase text-muted-foreground">Заказывать при</p>
                    <p className="mt-0.5 font-mono text-xl font-bold">{formatQuantity(assessment.reorderPointMilli, item.unit)}</p>
                  </div>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl bg-surface-muted p-3">
                    <p className="font-mono text-[11px] uppercase text-muted-foreground">Не успеет продаться</p>
                    <p className="mt-0.5 flex items-center gap-1.5 font-mono text-lg font-bold">
                      <Trash2 className="size-4 text-muted-foreground" aria-hidden="true" />
                      {formatQuantity(position.spoilage.atRiskMilli, item.unit)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-surface-muted p-3">
                    <p className="font-mono text-[11px] uppercase text-muted-foreground">Это в деньгах</p>
                    <p className="mt-0.5 font-mono text-lg font-bold">{money(position.spoilage.atRiskCostMinor)}</p>
                  </div>
                  <div className="rounded-2xl bg-surface-muted p-3">
                    <p className="font-mono text-[11px] uppercase text-muted-foreground">Списано за 28 дней</p>
                    <p className="mt-0.5 font-mono text-lg font-bold">{formatQuantity(position.wastedMilli, item.unit)}</p>
                  </div>
                </div>

                {position.lots.length > 0 && (
                  <div className="mt-3">
                    <p className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                      Партии на витрине — продаётся сначала верхняя
                    </p>
                    <ul className="mt-2 space-y-1.5">
                      {position.spoilage.lots.map((exposure) => (
                        <li
                          key={exposure.lot.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface-muted px-3 py-2 text-sm"
                        >
                          <span className="font-mono text-xs text-muted-foreground">
                            от {exposure.lot.receivedAt.slice(0, 10)}
                            {exposure.lot.expiresAt ? ` · до ${exposure.lot.expiresAt.slice(0, 10)}` : ''}
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="font-mono font-bold">
                              {formatQuantity(exposure.lot.remainingMilli, item.unit)}
                            </span>
                            {exposure.atRiskMilli > 0 && (
                              <span className="font-mono text-xs text-rose-700">
                                −{formatQuantity(exposure.atRiskMilli, item.unit)} под списание
                              </span>
                            )}
                            <span
                              className={`rounded-full border px-2 py-0.5 font-mono text-[11px] font-bold ${FRESHNESS_STYLE[exposure.state]}`}
                            >
                              {FRESHNESS_LABEL[exposure.state]}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {assessment.level !== 'none' && (
                  <p className="mt-3 flex items-start gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden="true" />
                    <span>{assessment.reason}</span>
                  </p>
                )}

                {position.spoilage.overTolerance && (
                  <p className="mt-3 flex items-start gap-2 rounded-2xl border border-violet-500/30 bg-violet-500/10 p-3 text-sm">
                    <Trash2 className="mt-0.5 size-4 shrink-0 text-violet-600" aria-hidden="true" />
                    <span>
                      Под списание {(position.spoilage.atRiskSharePpm / 10_000).toFixed(1)}% остатка при допустимых{' '}
                      {(position.spoilage.toleranceBps / 100).toFixed(1)}%.{' '}
                      {position.spoilage.expiredLots > 0
                        ? `Партий с вышедшим сроком: ${position.spoilage.expiredLots}.`
                        : 'Стоит уменьшить ближайший заказ.'}
                    </span>
                  </p>
                )}

                {forecast.appliedEvents.length > 0 && (
                  <p className="mt-3 rounded-2xl border border-primary/30 bg-primary/5 p-3 text-sm">
                    <span className="font-semibold">Повод в календаре: </span>
                    {forecast.appliedEvents.map((event) => event.name).join(', ')} — спрос выше обычного в{' '}
                    {(forecast.eventFactorPpm / 1_000_000).toFixed(2)} раза
                    {forecast.appliedEvents.every((event) => event.verified) ? '' : ' (гипотеза, не проверена фактом)'}
                  </p>
                )}

                <div className="mt-4 space-y-2">
                  <EvidenceDrawer
                    explanation={balanceExplanation}
                    displayValue={formatQuantity(position.onHandMilli, item.unit)}
                    label="Остаток на руках"
                    isMock={isMock}
                  />
                  <EvidenceDrawer
                    explanation={forecast.explanation}
                    modelVersion={forecast.modelVersion}
                    displayValue={`${formatQuantity(forecast.dailyForecastMilli, item.unit)} / день`}
                    label="Прогноз расхода"
                    isMock={isMock}
                  />
                  {assessment.explanations.timeToStockout && (
                    <EvidenceDrawer
                      explanation={assessment.explanations.timeToStockout}
                      modelVersion={assessment.modelVersion}
                      displayValue={humanHours(assessment.timeToStockoutHours)}
                      label="Время до дефицита"
                      isMock={isMock}
                    />
                  )}
                  <EvidenceDrawer
                    explanation={assessment.explanations.reorderPoint}
                    modelVersion={assessment.modelVersion}
                    displayValue={formatQuantity(assessment.reorderPointMilli, item.unit)}
                    label="Точка перезаказа"
                    isMock={isMock}
                  />
                  <EvidenceDrawer
                    explanation={position.spoilage.explanation}
                    modelVersion={position.spoilage.modelVersion}
                    displayValue={formatQuantity(position.spoilage.atRiskMilli, item.unit)}
                    label="Риск списания"
                    isMock={isMock}
                  />
                </div>

                {canEdit && (
                  <div className="mt-4 grid gap-4 border-t border-border pt-4 lg:grid-cols-2">
                    <form action={recordMovement} className="space-y-2">
                      <p className="text-sm font-bold">Внести движение</p>
                      <input type="hidden" name="itemId" value={item.id} />
                      <div className="flex gap-2">
                        <select name="type" className={field} aria-label="Тип движения" defaultValue="consume">
                          <option value="consume">Продажа</option>
                          <option value="receive">Поставка</option>
                          <option value="waste">Списание</option>
                          <option value="adjust">Корректировка</option>
                        </select>
                        <input
                          name="quantity"
                          className={field}
                          placeholder={`Сколько, ${item.unit}`}
                          inputMode="decimal"
                          aria-label="Количество"
                          required
                        />
                      </div>
                      <div className="flex gap-2">
                        <select name="wasteReason" className={field} aria-label="Причина списания" defaultValue="withered">
                          <option value="withered">Увяло</option>
                          <option value="damaged">Повредили</option>
                          <option value="unsold">Не продали</option>
                          <option value="other">Другое</option>
                        </select>
                        <input name="note" className={field} placeholder="Комментарий" />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Причина нужна только для списания: «увяло» меняет размер следующего заказа, «повредили» — нет.
                      </p>
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <input type="checkbox" name="allowNegative" className="size-4" />
                        Разрешить уйти ниже нуля — только для корректировки после инвентаризации
                      </label>
                      <button className="min-h-11 w-full rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground hover:bg-primary-hover">
                        Записать движение
                      </button>
                    </form>

                    <form action={updateSupplyPolicy} className="space-y-2">
                      <p className="text-sm font-bold">Политика пополнения</p>
                      <input type="hidden" name="id" value={item.id} />
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className={label} htmlFor={`pack-${item.id}`}>Упаковка</label>
                          <input id={`pack-${item.id}`} name="packSize" className={field} defaultValue={item.packSizeMilli / 1000} inputMode="decimal" />
                        </div>
                        <div>
                          <label className={label} htmlFor={`moq-${item.id}`}>Партия от</label>
                          <input id={`moq-${item.id}`} name="moq" className={field} defaultValue={item.moqMilli / 1000} inputMode="decimal" />
                        </div>
                        <div>
                          <label className={label} htmlFor={`min-${item.id}`}>Мин. остаток</label>
                          <input id={`min-${item.id}`} name="minStock" className={field} defaultValue={item.minStockMilli / 1000} inputMode="decimal" />
                        </div>
                        <div>
                          <label className={label} htmlFor={`lead-${item.id}`}>Поставка, ч</label>
                          <input id={`lead-${item.id}`} name="leadHours" className={field} defaultValue={item.leadTimeP80Hours} inputMode="numeric" />
                        </div>
                      </div>
                      <input name="shelfLife" className={field} placeholder="Срок годности, дней" defaultValue={item.shelfLifeDays ?? ''} inputMode="numeric" />
                      <button className="min-h-11 w-full rounded-xl border border-border px-4 text-sm font-bold hover:bg-surface-muted">
                        Сохранить политику
                      </button>
                    </form>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canEdit && (
        <section className="rounded-3xl border border-border bg-surface p-5">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <PackagePlus className="size-5 text-primary" aria-hidden="true" />
            Добавить позицию
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Позиция заводится вместе с политикой: без пачки, срока поставки и срока свежести ни заказ,
            ни риск списания не посчитать. У упаковки и лент срок свежести оставьте пустым.
          </p>
          <form action={createSupplyItem} className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className={label} htmlFor="new-name">Название</label>
              <input id="new-name" name="name" className={field} placeholder="Роза красная 60 см" required />
            </div>
            <div>
              <label className={label} htmlFor="new-unit">Единица</label>
              <input id="new-unit" name="unit" className={field} placeholder="стебель" defaultValue="шт" />
            </div>
            <div>
              <label className={label} htmlFor="new-category">Категория</label>
              <input id="new-category" name="category" className={field} placeholder="розы" />
            </div>
            <div>
              <label className={label} htmlFor="new-pack">Упаковка</label>
              <input id="new-pack" name="packSize" className={field} defaultValue="1" inputMode="decimal" />
            </div>
            <div>
              <label className={label} htmlFor="new-moq">Партия от</label>
              <input id="new-moq" name="moq" className={field} defaultValue="0" inputMode="decimal" />
            </div>
            <div>
              <label className={label} htmlFor="new-min">Мин. остаток</label>
              <input id="new-min" name="minStock" className={field} defaultValue="0" inputMode="decimal" />
            </div>
            <div>
              <label className={label} htmlFor="new-lead">Поставка, ч</label>
              <input id="new-lead" name="leadHours" className={field} defaultValue="48" inputMode="numeric" />
            </div>
            <div>
              <label className={label} htmlFor="new-shelf">Срок годности, дней</label>
              <input id="new-shelf" name="shelfLife" className={field} placeholder="необязательно" inputMode="numeric" />
            </div>
            <div className="sm:col-span-3">
              <button className="min-h-11 w-full rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground hover:bg-primary-hover sm:w-auto sm:px-8">
                Добавить позицию
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
