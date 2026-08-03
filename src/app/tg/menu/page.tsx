import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { readTelegramSession } from '@/server/telegram/session';
import { money, type GuestCard } from '@/lib/telegram/card';

export const dynamic = 'force-dynamic';

/** Меню заведения — то, за чем гость чаще всего и открывает приложение. */
export default async function MenuPage() {
  const session = await readTelegramSession();
  if (!session) redirect('/tg');
  if (!session.customerId) redirect('/tg/owner');

  const db = createAdminClient();
  const { data } = await db.rpc('loyalty_card', { p_business_id: session.businessId, p_customer_id: session.customerId });
  const card = (data ?? {}) as unknown as GuestCard;

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{card.business?.name}</p>
        <h1 className="mt-1 text-2xl font-extrabold">Меню</h1>
      </header>

      {card.menu?.length ? (
        <ul className="divide-y divide-border overflow-hidden rounded-3xl border border-border bg-surface">
          {card.menu.map((item) => (
            <li key={item.name} className="flex items-center justify-between gap-3 px-5 py-3.5">
              <div>
                <p className="text-sm font-semibold">{item.name}</p>
                {item.nameKk && item.nameKk !== item.name && (
                  <p className="text-xs text-muted-foreground">{item.nameKk}</p>
                )}
              </div>
              <span className="shrink-0 font-mono text-sm font-bold">{money(item.priceMinor)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-3xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Заведение ещё не заполнило меню.
        </p>
      )}

      <p className="text-center text-xs leading-5 text-muted-foreground">
        Цены заведение обновляет само — здесь всегда то, что стоит на кассе.
      </p>
    </div>
  );
}
