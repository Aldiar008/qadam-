import { AlertTriangle, ExternalLink, PackageSearch } from 'lucide-react';
import { canMarket, requireBusinessContext } from '@/server/qadam/repository';
import { addSupplyOffer, removeSupplyOffer, saveSupplyItem, toggleSupplyNeeded, verifySupplyOffer } from './actions';

export const dynamic = 'force-dynamic';

const money = (minor: number | null | undefined) =>
  minor === null || minor === undefined ? '—' : `${Number(minor).toLocaleString('ru-RU')} ₸`;

interface Saving {
  id: string;
  name: string;
  unit: string;
  needed: boolean;
  monthlyQuantity: number | null;
  currentPriceMinor: number | null;
  currentSupplier: string | null;
  offerCount: number;
  savingMinor: number | null;
  monthlySavingMinor: number | null;
  best: null | {
    id: string; supplier: string; unitPriceMinor: number; packSize: number;
    url: string | null; source: string; verified: boolean; foundAt: string;
  };
}

const field = 'min-h-11 w-full rounded-xl border border-border bg-surface-muted px-3 text-sm outline-none focus:ring-2 focus:ring-primary';

export default async function SupplyPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string; offer?: string; needed?: string; verified?: string }> }) {
  const params = await searchParams;
  const ctx = await requireBusinessContext();
  const canEdit = canMarket(ctx.role);

  const [{ data: savings }, { data: offers }] = await Promise.all([
    ctx.supabase.rpc('supply_savings', { p_business_id: ctx.businessId }),
    ctx.supabase.from('supply_offers')
      .select('id,supply_item_id,supplier,price_minor,pack_size,url,source,verified,found_at')
      .eq('business_id', ctx.businessId).order('price_minor'),
  ]);

  const rows = (savings ?? []) as unknown as Saving[];
  const offersByItem = new Map<string, typeof offers>();
  for (const offer of offers ?? []) {
    const list = offersByItem.get(offer.supply_item_id) ?? [];
    list.push(offer);
    offersByItem.set(offer.supply_item_id, list);
  }

  const totalMonthly = rows.reduce((sum, row) => sum + (row.monthlySavingMinor ?? 0), 0);
  const needed = rows.filter((row) => row.needed);

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <header>
        <div className="flex items-center gap-3">
          <PackageSearch className="size-6 text-primary" />
          <h1 className="text-3xl font-extrabold tracking-tight">Закупки</h1>
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Что вы покупаете, почём платите сейчас и где то же самое дешевле. Сравнение идёт
          <strong> за единицу</strong>, а не за упаковку — иначе «дешевле» превращается в «просто меньше».
        </p>
      </header>

      {params.error && (
        <p role="alert" className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4 text-sm font-semibold text-rose-800">
          <AlertTriangle className="mr-2 inline size-4" />{decodeURIComponent(params.error)}
        </p>
      )}
      {(params.saved || params.offer || params.verified) && (
        <p role="status" className="rounded-2xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800">Сохранено.</p>
      )}

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          ['Позиций в списке', String(rows.length), 'то, что вы регулярно покупаете'],
          ['Закончилось', String(needed.length), needed.length ? 'отмечено вами' : 'всё на месте'],
          ['Экономия в месяц', totalMonthly > 0 ? money(totalMonthly) : '—',
            totalMonthly > 0 ? 'если перейти на лучшие предложения' : 'нужны текущая цена и объём'],
        ].map(([label, value, note]) => (
          <article key={label} className="rounded-2xl border border-border bg-surface p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-2 font-mono text-xl font-bold">{value}</p>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{note}</p>
          </article>
        ))}
      </section>

      {canEdit && (
        <form action={saveSupplyItem} className="rounded-3xl border border-border bg-surface p-6">
          <h2 className="text-xl font-bold">Добавить позицию</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Например: стаканы 400 мл, зерно, молоко. Текущая цена нужна, чтобы было с чем сравнивать —
            без неё экономия не считается и показывается прочерком.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1.5 text-sm font-semibold sm:col-span-2">Что покупаем
              <input name="name" required placeholder="Стаканы 400 мл" className={field} />
            </label>
            <label className="grid gap-1.5 text-sm font-semibold">Единица
              <input name="unit" defaultValue="шт" className={field} />
            </label>
            <label className="grid gap-1.5 text-sm font-semibold">Платим сейчас, ₸ за единицу
              <input name="currentPrice" type="number" min="0" placeholder="не знаю — оставьте пустым" className={field} />
            </label>
            <label className="grid gap-1.5 text-sm font-semibold">Поставщик
              <input name="supplier" placeholder="кто сейчас возит" className={field} />
            </label>
            <label className="grid gap-1.5 text-sm font-semibold">Расход в месяц
              <input name="monthlyQuantity" type="number" min="0" placeholder="штук в месяц" className={field} />
            </label>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" name="needed" /> Закончилось — нужно закупить
          </label>
          <button className="mt-4 min-h-11 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground">Сохранить позицию</button>
        </form>
      )}

      {rows.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-border p-10 text-center">
          <h2 className="text-lg font-bold">Список закупок пуст</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            Добавьте первую позицию — то, что заканчивается чаще всего. Дальше можно вносить
            предложения поставщиков и видеть, где то же самое дешевле.
          </p>
        </section>
      ) : (
        <div className="grid gap-4">
          {rows.map((row) => {
            const list = offersByItem.get(row.id) ?? [];
            return (
              <article key={row.id} className={'rounded-3xl border bg-surface p-6 ' + (row.needed ? 'border-amber-500/40' : 'border-border')}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-bold">
                      {row.name}
                      {row.needed && <span className="ml-2 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-bold text-amber-900">закончилось</span>}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Платим {money(row.currentPriceMinor)} за {row.unit}
                      {row.currentSupplier ? ` · ${row.currentSupplier}` : ''}
                      {row.monthlyQuantity ? ` · ${row.monthlyQuantity} ${row.unit}/мес` : ''}
                    </p>
                  </div>
                  {canEdit && (
                    <form action={toggleSupplyNeeded}>
                      <input type="hidden" name="id" value={row.id} />
                      <input type="hidden" name="needed" value={row.needed ? 'no' : 'yes'} />
                      <button className="min-h-11 rounded-xl border border-border px-4 text-sm font-bold">
                        {row.needed ? 'Закупили' : 'Закончилось'}
                      </button>
                    </form>
                  )}
                </div>

                <div className="mt-4 rounded-2xl bg-surface-muted p-4">
                  {row.best ? (
                    <>
                      <p className="text-sm">
                        Дешевле всего: <strong>{row.best.supplier}</strong> — {money(row.best.unitPriceMinor)} за {row.unit}
                        {row.best.packSize > 1 ? ` (упаковка ${row.best.packSize})` : ''}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {row.savingMinor === null
                          ? 'Экономию не посчитать: не указано, сколько вы платите сейчас.'
                          : row.savingMinor === 0
                            ? 'Дешевле того, что у вас есть, пока не нашлось.'
                            : `Экономия ${money(row.savingMinor)} за ${row.unit}${row.monthlySavingMinor ? ` — это ${money(row.monthlySavingMinor)} в месяц` : ''}.`}
                        {' '}
                        {row.best.verified ? 'Цена подтверждена вами.' : 'Цена не подтверждена — откройте ссылку и проверьте.'}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Предложений пока нет. Внесите цену поставщика — сравнение появится сразу.
                    </p>
                  )}
                </div>

                {list.length > 0 && (
                  <ul className="mt-4 grid gap-2">
                    {list.map((offer) => (
                      <li key={offer.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 text-sm">
                        <span className="flex flex-wrap items-center gap-2">
                          <strong>{offer.supplier}</strong>
                          <span className="font-mono">{money(Math.round(Number(offer.price_minor) / Math.max(1, offer.pack_size)))} / {row.unit}</span>
                          {offer.pack_size > 1 && <span className="text-xs text-muted-foreground">упаковка {offer.pack_size} · {money(offer.price_minor)}</span>}
                          <span className={'rounded-full px-2 py-0.5 text-xs font-bold ' + (offer.verified ? 'bg-emerald-500/10 text-emerald-800' : 'bg-amber-500/10 text-amber-900')}>
                            {offer.verified ? 'проверено' : 'не проверено'}
                          </span>
                          {offer.url && (
                            <a href={offer.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-xs font-bold text-primary underline">
                              ссылка <ExternalLink className="size-3" />
                            </a>
                          )}
                        </span>
                        {canEdit && (
                          <span className="flex gap-2">
                            {!offer.verified && (
                              <form action={verifySupplyOffer}>
                                <input type="hidden" name="offerId" value={offer.id} />
                                <button className="min-h-9 rounded-lg border border-border px-3 text-xs font-bold">Подтвердить</button>
                              </form>
                            )}
                            <form action={removeSupplyOffer}>
                              <input type="hidden" name="offerId" value={offer.id} />
                              <button className="min-h-9 rounded-lg border border-border px-3 text-xs font-bold">Удалить</button>
                            </form>
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {canEdit && (
                  <form action={addSupplyOffer} className="mt-4 grid gap-2 sm:grid-cols-[1.5fr_1fr_0.8fr_1.5fr_auto]">
                    <input type="hidden" name="itemId" value={row.id} />
                    <input name="supplier" required placeholder="Поставщик" className={field} />
                    <input name="price" type="number" min="0" required placeholder="Цена, ₸" className={field} />
                    <input name="packSize" type="number" min="1" defaultValue="1" placeholder="в упаковке" className={field} />
                    <input name="url" placeholder="Ссылка на прайс (необязательно)" className={field} />
                    <button className="min-h-11 rounded-xl border border-border px-4 text-sm font-bold">Добавить</button>
                  </form>
                )}
              </article>
            );
          })}
        </div>
      )}

      <p className="pb-4 text-xs leading-5 text-muted-foreground">
        Автоматический поиск цен по маркетплейсам пока не подключён — у площадок нет открытого API,
        а цена, «найденная» без ссылки, это выдумка, по которой владелец сделает заказ. Пока сюда
        вносятся прайсы поставщиков; каждое предложение хранит источник, дату и признак «проверено».
      </p>
    </div>
  );
}
