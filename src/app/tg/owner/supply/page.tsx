import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { readTelegramSession } from '@/server/telegram/session';
import { markSupplyFromMiniApp, searchMarketFromMiniApp } from '../../actions';
import { money } from '@/lib/telegram/card';

export const dynamic = 'force-dynamic';

interface Saving {
  id: string;
  name: string;
  unit: string;
  needed: boolean;
  currentPriceMinor: number | null;
  currentSupplier: string | null;
  savingMinor: number | null;
  monthlySavingMinor: number | null;
  offerCount: number;
  best: null | { supplier: string; title: string | null; unitPriceMinor: number; url: string | null; verified: boolean };
  candidate: null | { id: string; supplier: string; title: string | null; unitPriceMinor: number; url: string | null };
}

/**
 * Закупки на телефоне.
 *
 * The moment this is useful is standing in the storeroom seeing an empty shelf,
 * which is not the moment anybody opens a laptop. Marking «закончилось» here is
 * the same row the cabinet reads, and the cheapest offer is already next to it.
 */
export default async function OwnerSupplyPage({ searchParams }: { searchParams: Promise<{ done?: string; error?: string }> }) {
  const params = await searchParams;
  const session = await readTelegramSession();
  if (!session) redirect('/tg');
  if (!session.ownerUserId) redirect('/tg/card');

  const db = createAdminClient();
  const { data } = await db.rpc('supply_savings', { p_business_id: session.businessId });
  const rows = (data ?? []) as unknown as Saving[];
  const monthly = rows.reduce((sum, row) => sum + (row.monthlySavingMinor ?? 0), 0);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold">Закупки</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {monthly > 0
            ? <>Если перейти на лучшие предложения — <strong>{money(monthly)}</strong> в месяц.</>
            : 'Внесите текущие цены в кабинете, и здесь появится разница.'}
        </p>
      </header>

      {params.done && <p role="status" className="rounded-2xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800">{decodeURIComponent(params.done)}</p>}
      {params.error && <p role="alert" className="rounded-2xl bg-amber-500/10 px-4 py-3 text-sm text-amber-900">{decodeURIComponent(params.error)}</p>}

      {rows.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Список закупок пуст. Заполните его в кабинете — здесь удобно только отмечать.
        </p>
      ) : (
        rows.map((row) => (
          <section key={row.id} className={'rounded-3xl border bg-surface p-5 ' + (row.needed ? 'border-amber-500/40' : 'border-border')}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold">{row.name}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Платим {money(row.currentPriceMinor)} за {row.unit}
                  {row.currentSupplier ? ` · ${row.currentSupplier}` : ''}
                </p>
              </div>
              {row.needed && (
                <span className="shrink-0 rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-bold text-amber-900">закончилось</span>
              )}
            </div>

            <div className="mt-3 rounded-2xl bg-surface-muted p-3 text-sm leading-6">
              {row.best ? (
                <>
                  <p>
                    Дешевле всего: <strong>{row.best.title ?? row.best.supplier}</strong> — {money(row.best.unitPriceMinor)} за {row.unit}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {row.savingMinor === null
                      ? 'Экономию не посчитать: не указано, сколько платите сейчас.'
                      : row.savingMinor === 0
                        ? 'Дешевле того, что у вас есть, пока не нашлось.'
                        : `Экономия ${money(row.savingMinor)} за ${row.unit}${row.monthlySavingMinor ? ` · ${money(row.monthlySavingMinor)} в месяц` : ''}.`}
                    {' '}{row.best.verified ? 'Цена подтверждена.' : 'Цена не подтверждена — откройте ссылку.'}
                  </p>
                  {row.best.url && (
                    <a href={row.best.url} target="_blank" rel="noreferrer noopener" className="mt-2 inline-block text-xs font-bold text-primary underline">
                      Открыть прайс
                    </a>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground">Подтверждённой цены дешевле вашей пока нет.</p>
              )}

              {/* Кандидат — не экономия: площадка не знает, тот ли это товар. */}
              {row.candidate && (
                <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
                  <p className="text-[11px] font-bold text-amber-900">Нашли на Kaspi — проверьте, то ли это</p>
                  <p className="mt-1 text-sm leading-5">
                    {row.candidate.title ?? row.candidate.supplier} — {money(row.candidate.unitPriceMinor)} за {row.unit}
                  </p>
                  {row.candidate.url && (
                    <a href={row.candidate.url} target="_blank" rel="noreferrer noopener" className="mt-2 inline-block text-xs font-bold text-primary underline">
                      Открыть карточку
                    </a>
                  )}
                </div>
              )}
            </div>

            <div className="mt-3 grid gap-2">
              <form action={searchMarketFromMiniApp}>
                <input type="hidden" name="id" value={row.id} />
                <button className="min-h-11 w-full rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground">
                  Найти дешевле на Kaspi
                </button>
              </form>
              <form action={markSupplyFromMiniApp}>
                <input type="hidden" name="id" value={row.id} />
                <input type="hidden" name="needed" value={row.needed ? 'no' : 'yes'} />
                <button className="min-h-11 w-full rounded-xl border border-border px-4 text-sm font-bold">
                  {row.needed ? 'Закупили' : 'Закончилось'}
                </button>
              </form>
            </div>
          </section>
        ))
      )}
    </div>
  );
}
