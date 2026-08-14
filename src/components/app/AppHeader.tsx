'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search, Bell, Menu, X, LogOut } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { Breadcrumbs, BreadcrumbItem } from '@/components/navigation/Breadcrumbs';
import { siteConfig } from '@/config/site';

interface AppHeaderProps {
  breadcrumbs: BreadcrumbItem[];
  /** The signed-in person. Rendering a fixed name here would be a decorative lie. */
  userName: string;
  userEmail: string;
  /** Real unread count. The badge is shown only when there is something to read. */
  unreadCount: number;
}

/** Two initials from a display name, falling back to the email local part. */
function initialsOf(name: string, email: string) {
  const source = name.trim() || email.split('@')[0] || '?';
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : source.slice(0, 2);
  return letters.toUpperCase();
}

export function AppHeader({ breadcrumbs, userName, userEmail, unreadCount }: AppHeaderProps) {
  const { language, setLanguage } = useLanguage();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const isAdmin = pathname.startsWith('/admin');
  // На телефоне раздел и его подпункты идут одним списком с отступом: место
  // экономит не сокрытие ссылок, а то, что их не приходится искать.
  const mobileItems: { titleRu: string; titleKk: string; href: string; nested?: boolean }[] = isAdmin
    ? [...siteConfig.adminNav]
    : [
        ...siteConfig.appNav.flatMap((item) => [
          item,
          ...('children' in item && item.children ? item.children.map((child) => ({ ...child, nested: true })) : []),
        ]),
        ...siteConfig.appServiceNav,
      ];

  return (
    <header className="min-h-16 border-b border-border bg-surface/95 backdrop-blur px-4 sm:px-6 flex items-center justify-between gap-3 sticky top-0 z-30">
      {/* `min-w-0` is what makes the breadcrumb trail's own overflow-x work: a
          flex child defaults to min-width:auto and refuses to shrink below its
          content, which pushed the whole header past the viewport at every
          width below 1440px. */}
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <button onClick={() => setMenuOpen((value) => !value)} className="md:hidden size-11 rounded-xl border border-border grid place-items-center" aria-label={menuOpen ? 'Закрыть меню' : 'Открыть меню'} aria-expanded={menuOpen}>
          {menuOpen ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
        </button>
        <Breadcrumbs items={breadcrumbs} />
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {/* Search leads to the screen that actually searches, rather than
            imitating a search field that swallows what you type. */}
        <Link
          href="/app/inventory"
          className="hidden lg:flex min-h-11 items-center gap-2 px-3 rounded-full bg-surface-muted border border-border text-xs font-mono text-muted-foreground w-40 xl:w-56 hover:text-foreground hover:border-primary"
        >
          <Search className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Поиск по остаткам</span>
        </Link>

        <div className="hidden md:flex items-center gap-1 bg-surface-muted p-1 rounded-full border text-xs font-semibold">
          <button
            onClick={() => setLanguage('ru')}
            aria-pressed={language === 'ru'}
            className={`min-h-8 px-2.5 rounded-full ${language === 'ru' ? 'bg-surface text-foreground shadow-xs' : 'text-muted-foreground'}`}
          >
            RU
          </button>
          <button
            onClick={() => setLanguage('kk')}
            aria-pressed={language === 'kk'}
            className={`min-h-8 px-2.5 rounded-full ${language === 'kk' ? 'bg-surface text-foreground shadow-xs' : 'text-muted-foreground'}`}
          >
            KK
          </button>
        </div>

        <Link
          href="/app/notifications"
          className="grid size-11 place-items-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-surface-muted relative border border-border"
          aria-label={unreadCount > 0 ? `Уведомления, непрочитанных: ${unreadCount}` : 'Уведомления, непрочитанных нет'}
        >
          <Bell className="w-4 h-4" aria-hidden="true" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-5 rounded-full bg-rose-600 px-1 text-[10px] font-bold leading-5 text-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Link>

        <div className="flex items-center gap-2 border-l border-border pl-2">
          <div className="size-8 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-xs" aria-hidden="true">
            {initialsOf(userName, userEmail)}
          </div>
          <span className="hidden xl:inline max-w-32 truncate text-xs font-bold text-foreground" title={userEmail}>{userName || userEmail}</span>
          {/* POST, never GET: signing out must not be triggerable by a link
              someone else can make the browser follow. */}
          <form action="/auth/signout" method="post">
            <button className="grid size-11 place-items-center rounded-xl border border-border text-muted-foreground hover:text-foreground hover:bg-surface-muted" aria-label="Выйти из аккаунта">
              <LogOut className="w-4 h-4" aria-hidden="true" />
            </button>
          </form>
        </div>
      </div>
      {menuOpen && (
        <div className="absolute left-3 right-3 top-[4.5rem] rounded-3xl border border-border bg-surface p-3 shadow-2xl md:hidden">
          <nav aria-label="Мобильная навигация кабинета" className="grid gap-1">
            {mobileItems.map((item) => {
              const active = item.href === '/admin' ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + '/');
              return <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)} className={'min-h-11 rounded-xl flex items-center text-sm font-semibold ' + (item.nested ? 'pl-9 pr-4 text-[13px] ' : 'px-4 ') + (active ? 'bg-primary text-primary-foreground' : 'hover:bg-surface-muted')}>{language === 'ru' ? item.titleRu : item.titleKk}</Link>;
            })}
          </nav>
        </div>
      )}
    </header>
  );
}
