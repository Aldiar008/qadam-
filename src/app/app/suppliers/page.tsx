import { Clock, Flower2, Package, Truck, Users } from 'lucide-react';

import { readCommunityTrust } from '@/domain/community-trust';

import { formatQuantity } from '@/domain/inventory';
import { requireBusinessContext } from '@/server/qadam/repository';

export const dynamic = 'force-dynamic';

const money = (minor: number | null | undefined) =>
  minor === null || minor === undefined ? '—' : `${Math.round(Number(minor)).toLocaleString('ru-RU')} ₸`;

const KIND_LABEL: Record<string, string> = {
  wholesale: 'оптовая база',
  farm: 'ферма',
  local: 'локальный поставщик',
};

function humanHours(hours: number): string {
  if (hours < 24) return `${hours} ч`;
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return rest === 0 ? `${days} дн.` : `${days} дн. ${rest} ч`;
}

/**
 * Поставщики: рейтинг по факту поставок, а не по обещаниям.
 *
 * «Возим вовремя» говорят все. Здесь вместо этого стоит доля поставок, которые
 * пришли вовремя и полностью, и рядом с ней — размер выборки: три удачные
 * машины не делают поставщика надёжным, и продукт не вправе делать вид, что
 * делают.
 *
 * Свежесть на приёмке вынесена отдельным числом. У базы в городе цветок уже
 * постоял день-два, у фермы это срез — и разница в два дня жизни цветка обычно
 * дороже разницы в цене.
 */
export default async function SuppliersPage() {
  const ctx = await requireBusinessContext();

  const [{ data: suppliers }, { data: performance }, { data: offers }, { data: community }] = await Promise.all([
    ctx.supabase
      .from('suppliers')
      .select('id,name,kind,contact,payment_terms_days,is_active')
      .eq('business_id', ctx.businessId)
      .order('name'),
    ctx.supabase
      .from('supplier_performance')
      .select('supplier_id,orders_total,orders_on_time_in_full,shortfall_rate_ppm,avg_delay_hours,p80_delay_hours,avg_freshness_days,last_delivery_at')
      .eq('business_id', ctx.businessId),
    ctx.supabase
      .from('supplier_offers')
      .select('supplier_id,unit_price_minor,lead_time_p80_hours,freshness_on_arrival_days,moq_milli,available_milli,variety_note,supply_items(name_ru,unit)')
      .eq('business_id', ctx.businessId),
    // Общий рейтинг не принадлежит магазину: у таблицы нет `business_id`, и
    // читается она без фильтра по заведению — по каноническому имени поставщика.
    ctx.supabase
      .from('community_supplier_metrics')
      .select('canonical_supplier,region,category,window_days,n_orders,n_tenants,delivery_reliability_ppm,fill_rate_ppm,freshness_score_ppm'),
  ]);

  // Одному поставщику может соответствовать несколько категорий; берём ту, где
  // выборка больше — по ней и сигнал надёжнее.
  const communityByName = new Map<string, NonNullable<typeof community>[number]>();
  for (const row of community ?? []) {
    const current = communityByName.get(row.canonical_supplier);
    if (!current || row.n_orders > current.n_orders) communityByName.set(row.canonical_supplier, row);
  }

  const performanceBySupplier = new Map((performance ?? []).map((row) => [row.supplier_id, row]));
  const offersBySupplier = new Map<string, typeof offers>();
  for (const offer of offers ?? []) {
    const list = offersBySupplier.get(offer.supplier_id) ?? [];
    list.push(offer);
    offersBySupplier.set(offer.supplier_id, list);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="flex items-center gap-3 text-3xl font-extrabold tracking-tight">
          <Truck className="size-7 text-primary" aria-hidden="true" />
          Поставщики
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Надёжность считается из приёмок: вовремя и полностью — значит привезли не меньше заказанного и не
          позже согласованного. Рядом стоит размер выборки, потому что без него проценты ничего не значат.
        </p>
      </header>

      {(suppliers ?? []).length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          Поставщиков пока нет.
        </p>
      ) : (
        <ul className="space-y-4">
          {(suppliers ?? []).map((supplier) => {
            const stats = performanceBySupplier.get(supplier.id);
            const supplierOffers = offersBySupplier.get(supplier.id) ?? [];
            const total = stats?.orders_total ?? 0;
            const otif = stats?.orders_on_time_in_full ?? 0;
            const otifPct = total > 0 ? Math.round((otif / total) * 100) : null;

            return (
              <li key={supplier.id} className="rounded-3xl border border-border bg-surface p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold">{supplier.name}</h2>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                      {KIND_LABEL[supplier.kind] ?? supplier.kind}
                      {supplier.contact ? ` · ${supplier.contact}` : ''}
                      {' · '}
                      {supplier.payment_terms_days > 0 ? `отсрочка ${supplier.payment_terms_days} дн.` : 'предоплата'}
                    </p>
                  </div>
                  {otifPct !== null ? (
                    <span
                      className={
                        'shrink-0 rounded-full border px-3 py-1 font-mono text-xs font-bold ' +
                        (otifPct >= 90
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800'
                          : otifPct >= 70
                            ? 'border-amber-500/30 bg-amber-500/10 text-amber-900'
                            : 'border-rose-500/30 bg-rose-500/10 text-rose-800')
                      }
                    >
                      вовремя и полностью {otifPct}%
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full border border-border bg-surface-muted px-3 py-1 font-mono text-xs text-muted-foreground">
                      поставок ещё не было
                    </span>
                  )}
                </div>

                {stats && (
                  <div className="mt-4 grid gap-3 sm:grid-cols-4">
                    <div className="rounded-2xl bg-surface-muted p-3">
                      <p className="font-mono text-[11px] uppercase text-muted-foreground">Поставок в выборке</p>
                      <p className="mt-0.5 font-mono text-lg font-bold">{total}</p>
                    </div>
                    <div className="rounded-2xl bg-surface-muted p-3">
                      <p className="font-mono text-[11px] uppercase text-muted-foreground">Недовоз</p>
                      <p className="mt-0.5 font-mono text-lg font-bold">
                        {(stats.shortfall_rate_ppm / 10_000).toFixed(1)}%
                      </p>
                    </div>
                    <div className="rounded-2xl bg-surface-muted p-3">
                      <p className="font-mono text-[11px] uppercase text-muted-foreground">Худшая задержка</p>
                      <p className="mt-0.5 flex items-center gap-1.5 font-mono text-lg font-bold">
                        <Clock className="size-4 text-muted-foreground" aria-hidden="true" />
                        {stats.p80_delay_hours > 0 ? humanHours(stats.p80_delay_hours) : 'нет'}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-surface-muted p-3">
                      <p className="font-mono text-[11px] uppercase text-muted-foreground">Свежесть на приёмке</p>
                      <p className="mt-0.5 flex items-center gap-1.5 font-mono text-lg font-bold">
                        <Flower2 className="size-4 text-muted-foreground" aria-hidden="true" />
                        {stats.avg_freshness_days ? `${stats.avg_freshness_days} дн.` : '—'}
                      </p>
                    </div>
                  </div>
                )}

                {total > 0 && total < 10 && (
                  <p className="mt-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                    Выборка мала: {total} поставок. Проценты выше — наблюдение, а не характеристика поставщика.
                  </p>
                )}

                {(() => {
                  const aggregate = communityByName.get(supplier.name);
                  if (!aggregate) return null;
                  const trust = readCommunityTrust(
                    {
                      canonicalSupplier: aggregate.canonical_supplier,
                      region: aggregate.region,
                      category: aggregate.category,
                      windowDays: aggregate.window_days,
                      nOrders: aggregate.n_orders,
                      nTenants: aggregate.n_tenants,
                      deliveryReliabilityPpm: aggregate.delivery_reliability_ppm,
                      fillRatePpm: aggregate.fill_rate_ppm,
                      freshnessScorePpm: aggregate.freshness_score_ppm,
                    },
                    true,
                  );

                  return (
                    <div className="mt-4 rounded-2xl border border-violet-500/30 bg-violet-500/5 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wide text-violet-900">
                          <Users className="size-3.5" aria-hidden="true" />
                          Рейтинг по всем магазинам
                        </p>
                        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-[11px] font-bold text-amber-800">
                          [MOCK AGGREGATE]
                        </span>
                      </div>

                      {trust.visibility === 'published' ? (
                        <>
                          <div className="mt-3 grid gap-2 sm:grid-cols-3">
                            <div>
                              <p className="font-mono text-[11px] text-muted-foreground">Привозит вовремя</p>
                              <p className="font-mono text-lg font-bold">
                                {Math.round((trust.reliabilityPpm ?? 0) / 10_000)}%
                              </p>
                            </div>
                            <div>
                              <p className="font-mono text-[11px] text-muted-foreground">Привозит полностью</p>
                              <p className="font-mono text-lg font-bold">
                                {Math.round((trust.fillRatePpm ?? 0) / 10_000)}%
                              </p>
                            </div>
                            <div>
                              <p className="font-mono text-[11px] text-muted-foreground">Свежесть</p>
                              <p className="font-mono text-lg font-bold">
                                {Math.round((trust.freshnessScorePpm ?? 0) / 10_000)}%
                              </p>
                            </div>
                          </div>
                          <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                            {trust.nOrders} поставок из {trust.nTenants} магазинов · окно {aggregate.window_days} дн. ·
                            категория «{aggregate.category}» · сглажено по размеру выборки
                          </p>
                          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                            Личный опыт вашего магазина показан выше и с этим числом не смешивается.
                          </p>
                        </>
                      ) : (
                        <p className="mt-2 text-sm">
                          Недостаточно данных для публикации: нужно ещё {trust.missing.orders} поставок и{' '}
                          {trust.missing.tenants} независимых магазинов. Пока порог не пройден, рейтинг скрыт —
                          несколько отзывов не должны решать судьбу поставщика.
                        </p>
                      )}
                    </div>
                  );
                })()}

                {supplierOffers.length > 0 && (
                  <div className="mt-4">
                    <p className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                      Что и почём возит
                    </p>
                    <ul className="mt-2 space-y-1.5">
                      {supplierOffers.map((offer, index) => {
                        const product = Array.isArray(offer.supply_items) ? offer.supply_items[0] : offer.supply_items;
                        const unit = product?.unit ?? 'шт';
                        return (
                          <li
                            key={`${offer.supplier_id}-${index}`}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-muted px-3 py-2 text-sm"
                          >
                            <span className="flex items-center gap-2">
                              <Package className="size-4 text-muted-foreground" aria-hidden="true" />
                              <span className="font-semibold">{product?.name_ru ?? 'Позиция'}</span>
                              {offer.variety_note && (
                                <span className="font-mono text-[11px] text-muted-foreground">{offer.variety_note}</span>
                              )}
                            </span>
                            <span className="flex items-center gap-3 font-mono text-xs">
                              <span className="font-bold">{money(offer.unit_price_minor)}</span>
                              <span className="text-muted-foreground">{humanHours(offer.lead_time_p80_hours)}</span>
                              {offer.freshness_on_arrival_days !== null && (
                                <span className="text-muted-foreground">свежесть {offer.freshness_on_arrival_days} дн.</span>
                              )}
                              <span className="text-muted-foreground">
                                от {formatQuantity(Number(offer.moq_milli), unit)}
                              </span>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
