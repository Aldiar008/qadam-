import type React from 'react';
import { redirect } from 'next/navigation';

import { AppSidebar } from '@/components/app/AppSidebar';
import { AppHeader } from '@/components/app/AppHeader';
import { requirePlatformAdmin } from '@/server/qadam/admin';

export const dynamic = 'force-dynamic';

/**
 * Server-side gate for the whole console.
 *
 * Hiding the link in the navigation is not the control: this layout resolves the
 * platform role from the private assignment table on every request, and every
 * table these pages read enforces the same rule again through RLS. A direct URL,
 * a bookmarked route or a scripted request all land here first.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  let role: string;
  let adminName = '';
  try {
    const ctx = await requirePlatformAdmin();
    role = ctx.role;
    const { data: claims } = await ctx.supabase.auth.getClaims();
    adminName = (claims?.claims?.email as string | undefined) ?? '';
  } catch (error) {
    const code = error instanceof Error ? error.message : 'PLATFORM_ADMIN_REQUIRED';
    if (code === 'AUTH_REQUIRED') redirect('/login?next=%2Fadmin');
    redirect('/app/today?error=admin_access_required');
  }

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar isAdmin />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader
          breadcrumbs={[{ label: `Admin Console · ${role}`, href: '/admin' }]}
          userName={adminName}
          userEmail={adminName}
          unreadCount={0}
        />
        <main id="main-content" tabIndex={-1} className="flex-1 p-4 outline-none sm:p-6 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
