import type { Metadata } from 'next';
import './globals.css';
import { LanguageProvider } from '@/context/LanguageContext';
import { LenisProvider } from '@/components/providers/LenisProvider';
import { ScrollRevealProvider } from '@/components/providers/ScrollRevealProvider';
import { siteConfig } from '@/config/site';
import { AppModeProvider } from '@/context/AppModeContext';
import { resolveLocale } from '@/lib/i18n/locale';
import { getDictionary } from '@/lib/dictionary';

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: `${siteConfig.name} — AI Growth Operating System`,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  keywords: ['AI Growth OS', 'Казахстан', 'малый бизнес', 'маркетинг', 'Margin Shield', 'Growth Contract', 'лояльность'],
  authors: [{ name: 'QADAM Team' }],
  openGraph: {
    title: siteConfig.name,
    description: siteConfig.description,
    url: siteConfig.url,
    siteName: siteConfig.name,
    locale: 'ru_RU',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: siteConfig.name,
    description: siteConfig.description,
  },
  robots: {
    index: true,
    follow: true,
  },
};

// The locale is read per request, so the layout cannot be statically cached
// across languages — otherwise a Kazakh visitor would be served a Russian
// prerender from someone else's request.
export const dynamic = 'force-dynamic';

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await resolveLocale();
  const t = getDictionary(locale);
  return (
    <html lang={locale}>
      <body className="bg-background text-foreground antialiased min-h-screen">
        <a href="#main-content" className="fixed left-3 top-3 z-[100] -translate-y-20 rounded-xl bg-foreground px-4 py-3 text-sm font-bold text-background focus:translate-y-0">{t.skipToContent}</a>
        <AppModeProvider demoEnabled={process.env.QADAM_APP_MODE === 'DEMO_MODE'}>
          <LanguageProvider initialLanguage={locale}>
            <LenisProvider>
              <ScrollRevealProvider>{children}</ScrollRevealProvider>
            </LenisProvider>
          </LanguageProvider>
        </AppModeProvider>
      </body>
    </html>
  );
}
