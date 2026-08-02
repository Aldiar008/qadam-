import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { readTelegramSession } from '@/server/telegram/session';
import { redeemFromCard, setMarketingConsentFromCard } from '../actions';

export const dynamic = 'force-dynamic';

const money = (minor: number) => `${Number(minor).toLocaleString('ru-RU')} ₸`;
const day = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });

interface Card {
  business: { name: string; isDemo: boolean; currency: string };
  card: null | {
    stamps: number;
    points: number;
    reward: null | { id: string; nameRu: string; costStamps: number; costPoints: number; remainingStamps: number; reachable: boolean };
  };
  visits: { occurredAt: string; amountMinor: number }[];
  menu: { name: string; priceMinor: number }[];
  offers: { slug: string; title: string; summary: string | null }[];
  marketingConsent: boolean;
}

export default async function GuestCardPage({ searchParams }: { searchParams: Promise<{ done?: string; error?: string }> }) {
  const params = await searchParams;
  const session = await readTelegramSession();
  if (!session) redirect('/tg');
  if (!session.customerId) redirect('/tg/owner');

  const db = createAdminClient();
  const { data, error } = await db.rpc('loyalty_card', { p_business_id: session.businessId, p_customer_id: session.customerId });
  if (error) {
    return (
      <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
        Не получилось прочитать карту. Попробуйте открыть приложение ещё раз через минуту.
      </p>
    );
  }

  const card = data as unknown as Card;
  const stamps = card.card?.stamps ?? 0;
  const reward = card.card?.reward ?? null;
  const progress = reward && reward.costStamps > 0 ? Math.min(1, stamps / reward.costStamps) : 0;

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          {card.business.name}{card.business.isDemo ? ' · DEMO DATA' : ''}
        </p>
        <h1 className="mt-1 text-2xl font-extrabold">Здравствуйте, {session.name}</h1>
      </header>

      {params.done && (
        <p role="status" className="rounded-2xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800">{decodeURIComponent(params.done)}</p>
      )}
      {params.error && (
        <p role="alert" className="rounded-2xl bg-amber-500/10 px-4 py-3 text-sm text-amber-900">{decodeURIComponent(params.error)}</p>
      )}

      {/* The one thing a loyalty card exists to answer: how much further. */}
      <section className="rounded-3xl border border-border bg-surface p-5">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-bold">Ваши штампы</p>
          <p className="font-mono text-3xl font-extrabold">{stamps}</p>
        </div>

        {reward ? (
          <>
            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-surface-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <p className="mt-3 text-sm leading-6">
              {reward.reachable
                ? <><strong>{reward.nameRu}</strong> уже ваш — можно забрать прямо сейчас.</>
                : <>До награды «{reward.nameRu}» осталось <strong>{reward.remainingStamps}</strong> {reward.remainingStamps === 1 ? 'штамп' : reward.remainingStamps < 5 ? 'штампа' : 'штампов'}.</>}
            </p>
            {reward.reachable && (
              <form action={redeemFromCard} className="mt-4">
                <input type="hidden" name="rewardId" value={reward.id} />
                <button className="min-h-12 w-full rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground">
                  Забрать награду
                </button>
              </form>
            )}
          </>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">У заведения пока нет действующих наград.</p>
        )}
      </section>

      <section className="rounded-3xl border border-border bg-surface p-5">
        <p className="text-sm font-bold">Личные предложения</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {card.marketingConsent
            ? 'Вы разрешили присылать вам предложения этого заведения. Отозвать можно в один клик, и это сразу вступит в силу.'
            : 'Сейчас предложения вам не присылают. Разрешение можно дать и забрать в любой момент.'}
        </p>
        <form action={setMarketingConsentFromCard} className="mt-4">
          <input type="hidden" name="granted" value={card.marketingConsent ? 'no' : 'yes'} />
          <button className={'min-h-11 w-full rounded-xl px-5 text-sm font-bold ' + (card.marketingConsent ? 'border border-border' : 'bg-primary text-primary-foreground')}>
            {card.marketingConsent ? 'Больше не присылать' : 'Присылать предложения'}
          </button>
        </form>
      </section>

      {card.offers.length > 0 && (
        <section className="rounded-3xl border border-border bg-surface p-5">
          <p className="text-sm font-bold">Сейчас в заведении</p>
          <ul className="mt-3 grid gap-3">
            {card.offers.map((offer) => (
              <li key={offer.slug} className="rounded-2xl bg-surface-muted p-3">
                <p className="text-sm font-bold">{offer.title}</p>
                {offer.summary && <p className="mt-1 text-xs leading-5 text-muted-foreground">{offer.summary}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-3xl border border-border bg-surface p-5">
        <p className="text-sm font-bold">Ваши визиты</p>
        {card.visits.length ? (
          <ul className="mt-3 grid gap-2">
            {card.visits.map((visit) => (
              <li key={visit.occurredAt} className="flex items-center justify-between rounded-xl bg-surface-muted px-3 py-2 text-sm">
                <span>{day(visit.occurredAt)}</span>
                <span className="font-mono">{money(visit.amountMinor)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">Покупок за вами пока не записано.</p>
        )}
      </section>

      {card.menu.length > 0 && (
        <section className="rounded-3xl border border-border bg-surface p-5">
          <p className="text-sm font-bold">Меню</p>
          <ul className="mt-3 grid gap-1.5">
            {card.menu.map((item) => (
              <li key={item.name} className="flex items-center justify-between text-sm">
                <span>{item.name}</span>
                <span className="font-mono text-muted-foreground">{money(item.priceMinor)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="pb-6 text-center text-xs leading-5 text-muted-foreground">
        Контакт хранится хешем и маской — полного номера у заведения нет.
      </p>
    </div>
  );
}
