'use client';

import React from 'react';
import Link from 'next/link';
import { ChevronRight, Home } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

/**
 * The links carry vertical padding so each one is at least a 24px target rather
 * than the bare height of 12px text. The trail is also a labelled landmark and
 * marks the current page, so assistive technology can say where it is instead
 * of reading an unlabelled run of links.
 */
export function Breadcrumbs({ items }: BreadcrumbsProps) {
  const { t } = useLanguage();
  const linkClass = 'inline-flex min-h-6 items-center gap-1 py-1 hover:text-foreground transition-colors';
  return (
    <nav aria-label={t.breadcrumbsLabel} className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground py-2 overflow-x-auto no-scrollbar">
      <Link href="/" className={linkClass}>
        <Home className="w-3.5 h-3.5" aria-hidden="true" />
        <span>{t.navHome}</span>
      </Link>

      {items.map((item, idx) => (
        <React.Fragment key={idx}>
          <ChevronRight className="w-3.5 h-3.5 opacity-50 shrink-0" aria-hidden="true" />
          {item.href ? (
            <Link href={item.href} className={`${linkClass} whitespace-nowrap`}>
              {item.label}
            </Link>
          ) : (
            <span aria-current="page" className="inline-flex min-h-6 items-center py-1 text-foreground font-semibold whitespace-nowrap">
              {item.label}
            </span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}
