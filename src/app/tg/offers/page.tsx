import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { readTelegramSession } from '@/server/telegram/session';
import { setMarketingConsentFromCard } from '../actions';
import type { GuestCard } from '@/lib/telegram/card';

export const dynamic = 'force-dynamic';

/** Персональные предложения и решение о рассылке — в одном месте. */
export default async function OffersPage({ searchParams }: { searchParams: Promise<{ done?: string; error?: string }> }) {
  const params = await searchParams;
  const session = await readTelegramSession();
  if (!session) redirect('/tg');
  if (!session.customerId) redirect('/tg/owner');

  const db = createAdminClient();
  const [{ data }, { data: campaigns }] = await Promise.all([
    db.rpc('loyalty_card', { p_business_id: session.businessId, p_customer_id: session.customerId }),
    // Что заведение адресовало лично этому гостю и что он уже получил.
    db.from('campaign_deliveries')
      .select('id,status,sent_at,campaigns(name)')
      .eq('business_id', session.businessId).eq('customer_id', session.customerId)
      .order('queued_at', { ascending: false }).limit(5),
  ]);
  const card = (data ?? {}) as unknown as GuestCard;
  const personal = (campaigns ?? []) as { id: string; status: string; sent_at: string | null; campaigns: { name?: string } | { name?: string }[] | null }[];

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{card.business?.name}</p>
        <h1 className="mt-1 text-2xl font-extrabold">Акции и предложения</h1>
      </header>

      {params.done && <p role="status" className="rounded-2xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800">{decodeURIComponent(params.done)}</p>}
      {params.error && <p role="alert" className="rounded-2xl bg-amber-500/10 px-4 py-3 text-sm text-amber-900">{decodeURIComponent(params.error)}</p>}

      <section className="rounded-3xl border border-border bg-surface p-5">
        <p className="text-sm font-bold">Персональные предложения</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {card.marketingConsent
            ? 'Вы разрешили присылать их. Забрать разрешение можно этой же кнопкой, и это подействует сразу.'
            : 'Сейчас вам ничего не присылают. Разрешение можно дать и забрать в любой момент.'}
        </p>
        <form action={setMarketingConsentFromCard} className="mt-4">
          <input type="hidden" name="granted" value={card.marketingConsent ? 'no' : 'yes'} />
          <input type="hidden" name="back" value="/tg/offers" />
          <button className={'min-h-12 w-full rounded-xl px-5 text-sm font-bold ' + (card.marketingConsent ? 'border border-border' : 'bg-primary text-primary-foreground')}>
            {card.marketingConsent ? 'Больше не присылать' : 'Присылать предложения'}
          </button>
        </form>
      </section>

      {personal.length > 0 && (
        <section className="rounded-3xl border border-border bg-surface p-5">
          <p className="text-sm font-bold">Что вам присылали</p>
          <ul className="mt-3 grid gap-2">
            {personal.map((row) => {
              const campaign = Array.isArray(row.campaigns) ? row.campaigns[0] : row.campaigns;
              return (
                <li key={row.id} className="flex items-center justify-between gap-3 rounded-xl bg-surface-muted px-3 py-2 text-sm">
                  <span>{campaign?.name ?? 'Предложение'}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {row.status === 'sent' || row.status === 'delivered' ? 'доставлено' : row.status === 'suppressed' ? 'не отправлено' : row.status}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="rounded-3xl border border-border bg-surface p-5">
        <p className="text-sm font-bold">Сейчас в заведении</p>
        {card.offers?.length ? (
          <ul className="mt-3 grid gap-3">
            {card.offers.map((offer) => (
              <li key={offer.slug} className="rounded-2xl bg-surface-muted p-3">
                <p className="text-sm font-bold">{offer.title}</p>
                {offer.summary && <p className="mt-1 text-xs leading-5 text-muted-foreground">{offer.summary}</p>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">Действующих предложений сейчас нет.</p>
        )}
      </section>
    </div>
  );
}
