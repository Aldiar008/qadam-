import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Моя карта',
  // A Mini App is opened from a chat, not found in a search engine.
  robots: { index: false, follow: false },
};

/**
 * The Mini App shell.
 *
 * Deliberately bare: no sidebar, no marketing chrome, no language switcher —
 * it opens inside a chat window on a phone, where every pixel of furniture is
 * in the way. Telegram themes its own frame, so the page keeps to the
 * product's colours and stays legible in both.
 */
export default function TelegramAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <main id="main-content" className="mx-auto w-full max-w-md px-4 py-5">
        {children}
      </main>
    </div>
  );
}
