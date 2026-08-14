import Link from 'next/link';
import { AlertTriangle, ClipboardList, PackageCheck, Send, Truck } from 'lucide-react';

import { formatQuantity } from '@/domain/inventory';
import { canManage, canMarket, requireBusinessContext } from '@/server/qadam/repository';
import { advanceOrder, cancelOrder, receiveItem } from './actions';

export const dynamic = 'force-dynamic';

const field =
  'min-h-11 w-full rounded-xl border border-border bg-surface-muted px-3 text-sm outline-none focus:ring-2 focus:ring-primary';

const money = (minor: number | null | undefined) =>
  minor === null || minor === undefined ? '—' : `${Math.round(Number(minor)).toLocaleString('ru-RU')} ₸`;

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

const STATUS_LABEL: Record<string, string> = {
  draft: 'Черновик',
  sent: 'Отправлен',
  confirmed: 'Подтверждён',
  in_transit: 'В пути',
  delivered: 'Принят',
  failed: 'Сорван',
  cancelled: 'Отменён',
};

const STATUS_STYLE: Record<string, string> = {
  draft: 'border-border bg-surface-muted text-muted-foreground',
  sent: 'border-sky-500/30 bg-sky-500/10 text-sky-900',
  confirmed: 'border-primary/30 bg-primary/10 text-primary',
  in_transit: 'border-amber-500/30 bg-amber-500/10 text-amber-900',
  delivered: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800',
  failed: 'border-rose-500/30 bg-rose-500/10 text-rose-800',
  cancelled: 'border-border bg-surface-muted text-muted-foreground',
};

const NEXT_ACTION: Record<string, { status: string; label: string }> = {
  draft: { status: 'sent', label: 'Отправить поставщику' },
  sent: { status: 'confirmed', label: 'Поставщик подтвердил' },
  confirmed: { status: 'in_transit', label: 'Выехал' },
};

const DISCREPANCY_LABEL: Record<string, string> = {
  shortfall: 'недовоз',
  surplus: 'привезли больше',
  delay: 'опоздание',
  freshness: 'свежесть ниже обещанной',
  damage: 'брак',
};

/**
 * Заказы и приёмка — место, где решение встречается с реальностью.
 *
 * До приёмки всё в продукте остаётся расчётом: прогноз, план, ожидаемая цена.
 * Приёмка — единственный момент, когда появляется факт, и именно из неё растёт
 * рейтинг поставщика. Поэтому здесь спрашивают не только количество: сколько
 * дней свежести реально осталось и сколько пришло битым — это тоже деньги.
 */
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; moved?: string; received?: string; cancelled?: string }>;
}) {
  const params = await searchParams;
  const ctx = await requireBusinessContext();
  const canEdit = canMarket(ctx.role);
  const canCancel = canManage(ctx.role);

  // Каждая сущность читается своим запросом и сшивается в коде. Вложенные
  // выборки здесь неоднозначны: к заказу ведёт несколько путей — через строку,
  // через приёмку, через поставщика, — и PostgREST не обязан угадывать нужный.
  const [{ data: orders }, { data: lineRows }, { data: receiptRows }, { data: supplierRows }, { data: itemRows }] =
    await Promise.all([
      ctx.supabase
        .from('purchase_orders')
        .select('id,status,is_urgent,expected_at,sent_at,delivered_at,total_cost_minor,created_at,supplier_id')
        .eq('business_id', ctx.businessId)
        .order('created_at', { ascending: false })
        .limit(40),
      ctx.supabase
        .from('purchase_order_items')
        .select('id,purchase_order_id,supply_item_id,quantity_milli,unit_price_minor,cost_minor')
        .eq('business_id', ctx.businessId),
      ctx.supabase
        .from('order_receipts')
        .select('id,purchase_order_id,purchase_order_item_id,expected_milli,received_milli,damaged_milli,freshness_days,delay_hours,received_at')
        .eq('business_id', ctx.businessId),
      ctx.supabase.from('suppliers').select('id,name,kind').eq('business_id', ctx.businessId),
      ctx.supabase.from('supply_items').select('id,name_ru,unit,shelf_life_days').eq('business_id', ctx.businessId),
    ]);

  const supplierById = new Map((supplierRows ?? []).map((row) => [row.id, row]));
  const productById = new Map((itemRows ?? []).map((row) => [row.id, row]));

  const linesByOrder = new Map<string, NonNullable<typeof lineRows>>();
  for (const line of lineRows ?? []) {
    const list = linesByOrder.get(line.purchase_order_id) ?? [];
    list.push(line);
    linesByOrder.set(line.purchase_order_id, list);
  }

  const receiptsByOrder = new Map<string, NonNullable<typeof receiptRows>>();
  for (const receipt of receiptRows ?? []) {
    const list = receiptsByOrder.get(receipt.purchase_order_id) ?? [];
    list.push(receipt);
    receiptsByOrder.set(receipt.purchase_order_id, list);
  }

  const { data: discrepancies } = await ctx.supabase
    .from('order_discrepancies')
    .select('id,kind,expected_value,actual_value,note,created_at,supplier_id')
    .eq('business_id', ctx.businessId)
    .order('created_at', { ascending: false })
    .limit(20);

  const rows = orders ?? [];
  const active = rows.filter((order) => !['delivered', 'cancelled', 'failed'].includes(order.status));
  const history = rows.filter((order) => ['delivered', 'cancelled', 'failed'].includes(order.status));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="flex items-center gap-3 text-3xl font-extrabold tracking-tight">
          <ClipboardList className="size-7 text-primary" aria-hidden="true" />
          Заказы и приёмка
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Подтверждённое решение создаёт черновики. Отправка поставщику — отдельное действие: это уже деньги.
          Приёмка возвращает факт обратно в остаток и в рейтинг поставщика.
        </p>
      </header>

      {params.error && (
        <p role="alert" className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm">
          {params.error}
        </p>
      )}
      {params.moved && <p className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm">Статус заказа обновлён.</p>}
      {params.received && (
        <p className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm">
          Приёмка записана: остаток пополнен, рейтинг поставщика пересчитан.
        </p>
      )}
      {params.cancelled && <p className="rounded-2xl border border-border bg-surface p-4 text-sm">Заказ отменён.</p>}

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Активные — {active.length}</h2>
        {active.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
            Активных заказов нет. Подтвердите решение на экране{' '}
            <Link href="/app/decisions" className="font-bold text-primary hover:underline">
              «Что решаем сегодня»
            </Link>
            .
          </p>
        ) : (
          <ul className="space-y-3">
            {active.map((order) => {
              const supplier = supplierById.get(order.supplier_id);
              const items = linesByOrder.get(order.id) ?? [];
              const receipts = receiptsByOrder.get(order.id) ?? [];
              const receivedIds = new Set(receipts.map((receipt) => receipt.purchase_order_item_id));
              const next = NEXT_ACTION[order.status];
              const canReceive = ['sent', 'confirmed', 'in_transit'].includes(order.status);

              return (
                <li key={order.id} className="rounded-3xl border border-border bg-surface p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="flex items-center gap-2 text-lg font-bold">
                        <Truck className="size-5 text-muted-foreground" aria-hidden="true" />
                        {supplier?.name ?? 'Поставщик'}
                        {order.is_urgent && (
                          <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 font-mono text-[11px] font-bold text-rose-800">
                            срочный
                          </span>
                        )}
                      </h3>
                      <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                        ждём {when(order.expected_at)} · {money(order.total_cost_minor)}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-3 py-1 font-mono text-xs font-bold ${STATUS_STYLE[order.status]}`}>
                      {STATUS_LABEL[order.status]}
                    </span>
                  </div>

                  <ul className="mt-3 space-y-3">
                    {items.map((line) => {
                      const product = productById.get(line.supply_item_id);
                      const unit = product?.unit ?? 'шт';
                      const already = receivedIds.has(line.id);

                      return (
                        <li key={line.id} className="rounded-2xl bg-surface-muted p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                            <span className="font-semibold">{product?.name_ru ?? 'Позиция'}</span>
                            <span className="font-mono text-xs">
                              заказано {formatQuantity(Number(line.quantity_milli), unit)} · {money(line.cost_minor)}
                            </span>
                          </div>

                          {already ? (
                            <p className="mt-2 font-mono text-xs text-emerald-700">Принято</p>
                          ) : canReceive && canEdit ? (
                            <form action={receiveItem} className="mt-3 grid gap-2 sm:grid-cols-5">
                              <input type="hidden" name="itemId" value={line.id} />
                              <input
                                name="received"
                                className={field}
                                placeholder={`Привезли, ${unit}`}
                                defaultValue={Number(line.quantity_milli) / 1000}
                                inputMode="decimal"
                                required
                                aria-label="Сколько привезли"
                              />
                              <input
                                name="damaged"
                                className={field}
                                placeholder="Брак"
                                inputMode="decimal"
                                aria-label="Сколько битого"
                              />
                              <input
                                name="freshness"
                                className={field}
                                placeholder={`Свежесть, дн.${product?.shelf_life_days ? ` (до ${product.shelf_life_days})` : ''}`}
                                inputMode="numeric"
                                aria-label="Сколько дней свежести осталось"
                              />
                              <input
                                name="delay"
                                className={field}
                                placeholder="Опоздание, ч"
                                inputMode="numeric"
                                aria-label="Опоздание в часах"
                              />
                              <button className="min-h-11 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground hover:bg-primary-hover">
                                <PackageCheck className="mr-1 inline size-4" aria-hidden="true" />
                                Принять
                              </button>
                              <input
                                name="reason"
                                className={`${field} sm:col-span-5`}
                                placeholder="Комментарий к приёмке (необязательно)"
                              />
                            </form>
                          ) : (
                            <p className="mt-2 font-mono text-xs text-muted-foreground">
                              {order.status === 'draft' ? 'Заказ ещё не отправлен' : 'Ожидает поставки'}
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ul>

                  {canEdit && (next || canCancel) && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                      {next && (
                        <form action={advanceOrder}>
                          <input type="hidden" name="id" value={order.id} />
                          <input type="hidden" name="status" value={next.status} />
                          <button className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground hover:bg-primary-hover">
                            <Send className="size-4" aria-hidden="true" />
                            {next.label}
                          </button>
                        </form>
                      )}
                      <form action={advanceOrder}>
                        <input type="hidden" name="id" value={order.id} />
                        <input type="hidden" name="status" value="failed" />
                        <button className="min-h-11 rounded-xl border border-border px-4 text-sm font-bold hover:bg-surface-muted">
                          Поставка сорвалась
                        </button>
                      </form>
                      {canCancel && order.status === 'draft' && (
                        <form action={cancelOrder}>
                          <input type="hidden" name="id" value={order.id} />
                          <button className="min-h-11 rounded-xl border border-border px-4 text-sm font-bold hover:bg-surface-muted">
                            Отменить
                          </button>
                        </form>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {discrepancies && discrepancies.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <AlertTriangle className="size-5 text-amber-600" aria-hidden="true" />
            Расхождения
          </h2>
          <ul className="space-y-2">
            {discrepancies.map((row) => {
              const supplier = supplierById.get(row.supplier_id);
              return (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-surface px-4 py-3 text-sm"
                >
                  <span>
                    <span className="font-semibold">{supplier?.name ?? 'Поставщик'}</span>
                    <span className="text-muted-foreground"> · {DISCREPANCY_LABEL[row.kind] ?? row.kind}</span>
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    ждали {row.expected_value} · получили {row.actual_value} · {when(row.created_at)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {history.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">История — последние {history.length}</h2>
          <ul className="space-y-2">
            {history.slice(0, 12).map((order) => {
              const supplier = supplierById.get(order.supplier_id);
              const receipts = receiptsByOrder.get(order.id) ?? [];
              return (
                <li
                  key={order.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-surface px-4 py-3 text-sm"
                >
                  <span className="font-semibold">{supplier?.name ?? 'Поставщик'}</span>
                  <span className="flex items-center gap-3 font-mono text-xs text-muted-foreground">
                    {receipts.length > 0 && (
                      <span>
                        принято {receipts.reduce((sum, receipt) => sum + Number(receipt.received_milli), 0) / 1000} из{' '}
                        {receipts.reduce((sum, receipt) => sum + Number(receipt.expected_milli), 0) / 1000}
                      </span>
                    )}
                    <span>{when(order.delivered_at ?? order.created_at)}</span>
                    <span className={`rounded-full border px-2 py-0.5 font-bold ${STATUS_STYLE[order.status]}`}>
                      {STATUS_LABEL[order.status]}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
