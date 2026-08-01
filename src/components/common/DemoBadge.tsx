'use client';

import React from 'react';
import { Info } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

interface DemoBadgeProps {
  label?: string;
  className?: string;
}

export function DemoBadge({ label, className = '' }: DemoBadgeProps) {
  const { t } = useLanguage();
  const text = label || t.demoBadge;

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium bg-amber-500/10 text-amber-800 border border-amber-500/20 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30 ${className}`}
      title={t.backendNotice}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
      <span>{text}</span>
      <Info className="w-3.5 h-3.5 opacity-75" aria-hidden="true" />
    </div>
  );
}
