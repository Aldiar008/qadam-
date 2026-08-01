'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Sparkles,
  Users,
  PieChart,
  Send,
  PenTool,
  BarChart3,
  Wrench,
  Settings,
  ShieldAlert,
  LayoutDashboard,
  Bell,
  Sliders,
  FileText,
  FolderTree,
  TrendingUp,
  Store,
  type LucideIcon,
} from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { DemoBadge } from '@/components/common/DemoBadge';
import { useLanguage } from '@/context/LanguageContext';
import { siteConfig } from '@/config/site';

interface AppSidebarProps {
  isAdmin?: boolean;
  businessName?: string;
  locationLabel?: string;
  demo?: boolean;
  showAdmin?: boolean;
}

export function AppSidebar({ isAdmin = false, businessName = 'QADAM Business', locationLabel = 'Основная точка', demo = false, showAdmin = false }: AppSidebarProps) {
  const pathname = usePathname();
  const { language } = useLanguage();

  const iconMap: Record<string, LucideIcon> = {
    Sparkles,
    Users,
    PieChart,
    Send,
    PenTool,
    BarChart3,
    Wrench,
    Settings,
    LayoutDashboard,
    Bell,
    Sliders,
    FileText,
    FolderTree,
    TrendingUp,
  };

  const navItems = isAdmin ? siteConfig.adminNav : siteConfig.appNav;

  return (
    <aside className="w-64 bg-surface border-r border-border h-screen sticky top-0 flex flex-col justify-between p-4 hidden md:flex shrink-0">
      <div className="space-y-6">
        {/* Logo & Demo Badge */}
        <div className="space-y-3 pb-4 border-b border-border">
          <Logo size="md" href={isAdmin ? '/admin' : '/app/today'} />
          {demo && <div className="flex items-center justify-between"><DemoBadge label="DEMO DATA" /></div>}
        </div>

        {/* Business Selector Pill */}
        {!isAdmin && (
          <div className="p-3 rounded-2xl bg-surface-muted border border-border flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
              <Store className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="overflow-hidden">
              <h4 className="font-bold text-foreground text-xs truncate">{businessName}</h4>
              <p className="text-[10px] font-mono text-muted-foreground truncate">{locationLabel}</p>
            </div>
          </div>
        )}

        {/* Navigation Items */}
        <nav className="space-y-1">
          <div className="px-3 pb-2 text-[10px] font-mono text-muted-foreground uppercase tracking-wider font-bold">
            {isAdmin ? 'Администрирование' : 'Меню управления'}
          </div>

          {navItems.map((item) => {
            const Icon = iconMap[item.icon] || Sparkles;
            const isActive = item.href === '/admin'
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(item.href + '/');
            const title = language === 'ru' ? item.titleRu : item.titleKk;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-semibold transition-all ${
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-surface-muted'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{title}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer Switch to Admin / App */}
      <div className="pt-4 border-t border-border space-y-2">
        {isAdmin ? (
          <Link
            href="/app/today"
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-border text-xs font-bold text-foreground hover:bg-surface-muted transition-colors"
          >
            ← Личный кабинет
          </Link>
        ) : showAdmin ? (
          <Link
            href="/admin"
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-border text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-surface-muted transition-colors"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-amber-500" aria-hidden="true" />
            <span>Admin Console</span>
          </Link>
        ) : null}
      </div>
    </aside>
  );
}
