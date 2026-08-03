import type { Metadata } from 'next';
import Link from 'next/link';
import { readTelegramSession } from '@/server/telegram/session';

export const metadata: Metadata = {
  title: 'QADAM',
  // A Mini App is opened from a chat, not found in a search engine.
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * Оболочка Telegram-приложения.
 *
 * Deliberately bare above the fold — it opens inside a chat on a phone, where
 * chrome is in the way — but it does carry the one thing a phone app cannot do
 * without: a bottom bar, so every screen is one thumb away instead of a back
 * button away.
 */
export default async function TelegramAppLayout({ children }: { children: React.ReactNode }) {
  const session = await readTelegramSession();
  const isOwner = Boolean(session?.ownerUserId);
  const isGuest = Boolean(session?.customerId);

  const guestTabs = [
    { href: '/tg/card', label: 'Карта', icon: '🎟' },
    { href: '/tg/menu', label: 'Меню', icon: '☕️' },
    { href: '/tg/offers', label: 'Акции', icon: '🎁' },
    { href: '/tg/chat', label: 'Написать', icon: '✉️' },
  ];
  const ownerTabs = [
    { href: '/tg/owner', label: 'Сегодня', icon: '📈' },
    { href: '/tg/owner/customers', label: 'Гости', icon: '👥' },
    { href: '/tg/owner/inbox', label: 'Вопросы', icon: '💬' },
    { href: '/tg/owner/supply', label: 'Закупки', icon: '📦' },
  ];
  const tabs = isOwner ? ownerTabs : isGuest ? guestTabs : [];

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <main id="main-content" className={'mx-auto w-full max-w-md px-4 pt-4 ' + (tabs.length ? 'pb-24' : 'pb-6')}>
        {children}
      </main>

      {tabs.length > 0 && (
        <nav
          aria-label="Разделы приложения"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur"
        >
          <div className="mx-auto flex max-w-md items-stretch">
            {tabs.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                className="flex min-h-16 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-bold text-muted-foreground transition-colors hover:text-foreground"
              >
                <span aria-hidden className="text-lg leading-none">{tab.icon}</span>
                {tab.label}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
