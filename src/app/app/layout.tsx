import React from 'react';
import { redirect } from 'next/navigation';
import { AppSidebar } from '@/components/app/AppSidebar';
import { NotificationToast } from '@/components/app/NotificationToast';
import { AppHeader } from '@/components/app/AppHeader';
import { requireBusinessContext } from '@/server/qadam/repository';
import { LanguageProvider } from '@/context/LanguageContext';
import { resolveLocale } from '@/lib/i18n/locale';
import { getDictionary } from '@/lib/dictionary';
import { LocaleCoverageNotice } from '@/components/common/LocaleCoverageNotice';

export const dynamic = 'force-dynamic';
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // A missing session or membership is a routing decision, not a server error.
  // Throwing here used to escape the segment's own error boundary — an error
  // thrown in a layout is caught by the *parent* boundary, not its own — and
  // surfaced as a bare 500 page.
  let ctx: Awaited<ReturnType<typeof requireBusinessContext>>;
  try {
    ctx = await requireBusinessContext();
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'AUTH_REQUIRED') redirect('/login?next=%2Fapp%2Ftoday');
    if (code === 'MEMBERSHIP_REQUIRED' || code === 'BUSINESS_REQUIRED') redirect('/onboarding');
    // Anything else is a genuine failure: let the root boundary offer a retry.
    throw error;
  }
  const [{ data: isPlatformAdmin }, { count: unread }, { data: claims }, { data: newest }] = await Promise.all([
    ctx.supabase.rpc('is_current_platform_admin'),
    ctx.supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', ctx.businessId)
      .is('read_at', null)
      .is('dismissed_at', null),
    ctx.supabase.auth.getClaims(),
    // The bell carried a number and nothing ever came forward on its own, so a
    // paused campaign waited until somebody thought to look.
    ctx.supabase
      .from('notifications')
      .select('id,title,body,category,action_url')
      .eq('business_id', ctx.businessId)
      .is('read_at', null)
      .is('dismissed_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  // Inside the cabinet the person's own stored preference is the fallback, so a
  // Kazakh-speaking owner does not have to switch on every new device. An
  // explicit cookie still wins over it.
  const locale = await resolveLocale(ctx.person?.preferred_locale);
  const t = getDictionary(locale);
  return (
    <LanguageProvider initialLanguage={locale}>
    <div className="min-h-screen bg-background flex">
      <AppSidebar isAdmin={false} businessName={ctx.business.name} locationLabel={ctx.location ? `${ctx.location.city}${ctx.location.district ? ' · '+ctx.location.district : ''}` : t.locationNotConfigured} demo={ctx.business.mode === 'demo'} showAdmin={Boolean(isPlatformAdmin)} />
      <div className="flex-1 flex flex-col min-w-0">
        <AppHeader
          breadcrumbs={[{ label: t.cabinetBreadcrumb, href: '/app/today' }]}
          userName={ctx.person?.display_name ?? ''}
          userEmail={(claims?.claims?.email as string | undefined) ?? ''}
          unreadCount={unread ?? 0}
        />
        <main id="main-content" tabIndex={-1} className="p-4 sm:p-6 md:p-8 flex-1 overflow-y-auto outline-none">
          <LocaleCoverageNotice locale={locale} />
          {children}
        </main>
        <NotificationToast
          unread={unread ?? 0}
          notification={newest ? { id: newest.id, title: newest.title, body: newest.body, category: newest.category, actionUrl: newest.action_url } : null}
        />
      </div>
    </div>
    </LanguageProvider>
  );
}
