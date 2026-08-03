import { AlertTriangle, ExternalLink, PackageSearch, Search } from 'lucide-react';
import { canMarket, requireBusinessContext } from '@/server/qadam/repository';
import {
  addSupplyOffer,
  refreshMarketSalary,
  removeSupplyOffer,
  saveSupplyItem,
  searchMarketPrices,
  toggleSupplyNeeded,
  verifySupplyOffer,
} from './actions';

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
  unverifiedCount: number;
  best: null | {
    id: string; supplier: string; title: string | null; unitPriceMinor: number; packSize: number;
    url: string | null; source: string; verified: boolean; foundAt: string;
  };
  /** Найдено автоматически и никем не проверено — в экономию не идёт. */
  candidate: null | {
    id: string; supplier: string; title: string | null; unitPriceMinor: number; packSize: number;
    url: string | null; source: string; foundAt: string;
  };
}

const field = 'min-h-11 w-full rounded-xl border border-border bg-surface-muted px-3 text-sm outline-none focus:ring-2 focus:ring-primary';

const RUN_STATUS: Record<string, string> = {
  ok: 'нашёл предложений',
  empty: 'ничего не нашёл',
  blocked: 'площадка отклонила запрос',
  unavailable: 'площадка не ответила',
  disabled: 'источник выключен настройкой',
};

const when = (iso: string) => new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default async function SupplyPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string; offer?: string; needed?: string; verified?: string; found?: string; notice?: string }>;
}) {
  const params = await searchParams;
  const ctx = await requireBusinessContext();
  const canEdit = canMarket(ctx.role);

  const [{ data: savings }, { data: offers }, { data: runs }, { data: salaries }] = await Promise.all([
    ctx.supabase.rpc('supply_savings', { p_business_id: ctx.businessId }),
    ctx.supabase.from('supply_offers')
      .select('id,supply_item_id,supplier,title,price_minor,pack_size,url,source,verified,found_at')
      .eq('business_id', ctx.businessId).order('price_minor'),
    ctx.supabase.from('supply_search_runs')
      .select('id,supply_item_id,source,status,offers_found,error,ran_at')
      .eq('business_id', ctx.businessId).order('ran_at', { ascending: false }).limit(60),
    ctx.supabase.from('market_salary_snapshots')
      .select('id,role_query,area_name,sample_size,median_minor,p25_minor,p75_minor,fetched_at')
      .eq('business_id', ctx.businessId).order('fetched_at', { ascending: false }).limit(6),
  ]);

  const rows = (savings ?? []) as unknown as Saving[];
  // Only the newest attempt per item: the history matters, but on this screen
  // the question is «когда в последний раз смотрели и чем это кончилось».
  const lastRun = new Map<string, NonNullable<typeof runs>[number]>();
  for (const run of runs ?? []) {
    if (run.supply_item_id && !lastRun.has(run.supply_item_id)) lastRun.set(run.supply_item_id, run);
  }
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
      {params.found && (
        <p role="status" className="rounded-2xl bg-emerald-500/10 px-4 py-3 text-sm leading-6 text-emerald-800">{decodeURIComponent(params.found)}</p>
      )}
      {/* Отказ площадки — тоже результат, и он должен быть виден целиком. */}
      {params.notice && (
        <p role="status" className="rounded-2xl bg-amber-500/10 px-4 py-3 text-sm leading-6 text-amber-900">{decodeURIComponent(params.notice)}</p>
      )}

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          ['Позиций в списке', String(rows.length), 'то, что вы регулярно покупаете'],
          ['Закончилось', String(needed.length), needed.length ? 'отмечено вами' : 'всё на месте'],
          ['Экономия в месяц', totalMonthly > 0 ? money(totalMonthly) : '—',
            totalMonthly > 0 ? 'по подтверждённым ценам' : 'считается только по подтверждённым ценам'],
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
            <label className="grid gap-1.5 text-sm font-semibold sm:col-span-2">Как искать в магазине
              <input name="searchQuery" placeholder="стаканы бумажные 400 мл — если название на складе своё" className={field} />
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
                    <div className="flex flex-wrap gap-2">
                      <form action={searchMarketPrices}>
                        <input type="hidden" name="itemId" value={row.id} />
                        <button className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground">
                          <Search className="size-4" aria-hidden="true" /> Найти дешевле
                        </button>
                      </form>
                      <form action={toggleSupplyNeeded}>
                        <input type="hidden" name="id" value={row.id} />
                        <input type="hidden" name="needed" value={row.needed ? 'no' : 'yes'} />
                        <button className="min-h-11 rounded-xl border border-border px-4 text-sm font-bold">
                          {row.needed ? 'Закупили' : 'Закончилось'}
                        </button>
                      </form>
                    </div>
                  )}
                </div>

                <div className="mt-4 rounded-2xl bg-surface-muted p-4">
                  {row.best ? (
                    <>
                      <p className="text-sm">
                        Дешевле всего: <strong>{row.best.title ?? row.best.supplier}</strong> — {money(row.best.unitPriceMinor)} за {row.unit}
                        {row.best.packSize > 1 ? ` (упаковка ${row.best.packSize})` : ''}
                      </p>
                      {row.best.title && <p className="mt-1 text-xs text-muted-foreground">{row.best.supplier}</p>}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {row.savingMinor === null
                          ? 'Экономию не посчитать: не указано, сколько вы платите сейчас.'
                          : row.savingMinor === 0
                            ? 'Дешевле того, что у вас есть, пока не нашлось.'
                            : `Экономия ${money(row.savingMinor)} за ${row.unit}${row.monthlySavingMinor ? ` — это ${money(row.monthlySavingMinor)} в месяц` : ''}.`}
                        {' '}Цена подтверждена вами.
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Подтверждённой цены дешевле вашей пока нет. Нажмите «Найти дешевле» — предложения
                      придут с Kaspi со ссылками, а решение остаётся за вами.
                    </p>
                  )}

                  {/* Кандидат — не экономия. Площадка не знает, тот ли это товар:
                      по запросу «салфетки барные» она однажды вернула набор
                      крючков по 31 ₸, и арифметика «за штуку» этого не различает.
                      Поэтому название, ссылка и кнопка «это то же самое». */}
                  {row.candidate && (
                    <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
                      <p className="text-xs font-bold text-amber-900">Нашли на Kaspi — но это ещё не экономия</p>
                      <p className="mt-1 text-sm">
                        {row.candidate.title ?? row.candidate.supplier} — {money(row.candidate.unitPriceMinor)} за {row.unit}
                        {/* И цена упаковки целиком: пересчёт за единицу читается
                            неправдоподобно, пока не видно, из чего он получен. */}
                        {row.candidate.packSize > 1
                          ? ` (упаковка ${row.candidate.packSize} — ${money(row.candidate.unitPriceMinor * row.candidate.packSize)})`
                          : ''}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        Площадка не знает, тот ли это товар. Откройте ссылку — если это то же самое,
                        нажмите «Это то же самое», и экономия начнёт считаться.
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {row.candidate.url && (
                          <a href={row.candidate.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-xs font-bold text-primary underline">
                            Открыть карточку <ExternalLink className="size-3" />
                          </a>
                        )}
                        {canEdit && (
                          <form action={verifySupplyOffer}>
                            <input type="hidden" name="offerId" value={row.candidate.id} />
                            <button className="min-h-9 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground">
                              Это то же самое
                            </button>
                          </form>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Когда в последний раз смотрели на рынок и чем это кончилось.
                      Без этой строки вчерашние цены выглядят как сегодняшние. */}
                  {(() => {
                    const run = lastRun.get(row.id);
                    if (!run) return null;
                    return (
                      <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
                        Поиск на Kaspi: {RUN_STATUS[run.status] ?? run.status}
                        {run.status === 'ok' ? ` (${run.offers_found})` : ''} · {when(run.ran_at)}
                        {run.error ? ` · ${run.error}` : ''}
                      </p>
                    );
                  })()}
                </div>

                {list.length > 0 && (
                  <ul className="mt-4 grid gap-2">
                    {list.map((offer) => (
                      <li key={offer.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 text-sm">
                        <span className="flex flex-wrap items-center gap-2">
                          <strong>{offer.title ?? offer.supplier}</strong>
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

      {/* Вторая половина расходов заведения — люди. */}
      <section className="rounded-3xl border border-border bg-surface p-6">
        <h2 className="text-xl font-bold">Сколько стоит нанять</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          По опубликованным вакансиям hh.kz. Рядом с медианой всегда стоит размер выборки: медиана по
          четырём объявлениям — это четыре объявления, а не «рынок».
        </p>

        {canEdit && (
          <form action={refreshMarketSalary} className="mt-4 flex flex-wrap items-end gap-2">
            <label className="grid gap-1.5 text-sm font-semibold">
              Должность
              <input name="role" required defaultValue="бариста" placeholder="бариста, повар, администратор" className={`${field} sm:w-72`} />
            </label>
            <button className="min-h-11 rounded-xl border border-border px-5 text-sm font-bold">Посмотреть вилку</button>
          </form>
        )}

        {(salaries ?? []).length > 0 ? (
          <ul className="mt-4 grid gap-2">
            {(salaries ?? []).map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3 text-sm">
                <span>
                  <strong>{row.role_query}</strong>
                  <span className="ml-2 text-xs text-muted-foreground">{row.area_name} · {when(row.fetched_at)}</span>
                </span>
                <span className="font-mono text-xs">
                  {row.median_minor === null
                    ? 'зарплата нигде не указана'
                    : <>медиана {money(row.median_minor)} · {money(row.p25_minor)} — {money(row.p75_minor)}</>}
                  <span className="ml-2 text-muted-foreground">выборка {row.sample_size}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            Данных пока нет. hh.kz отвечает не на каждый запрос — если площадка откажет, здесь появится
            именно это, а не выдуманная вилка.
          </p>
        )}
      </section>

      <p className="pb-4 text-xs leading-5 text-muted-foreground">
        Цены с Kaspi приходят со ссылкой на карточку и помечаются «не проверено», пока вы не откроете
        ссылку и не подтвердите. Сравнение всегда за единицу: тысяча стаканов за 14 500 ₸ дешевле
        пятидесяти за 900 ₸, хотя на ценнике число больше. Ни одна цена здесь не берётся из модели.
      </p>
    </div>
  );
}
