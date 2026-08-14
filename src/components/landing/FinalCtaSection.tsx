'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, UserPlus } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { QadamSignal } from '@/components/brand/QadamSignal';

export function FinalCtaSection() {
  const { t, language } = useLanguage();

  return (
    <section id="start" className="py-24 sm:py-36 bg-background relative overflow-hidden">
      <div className="container max-w-5xl mx-auto px-4 sm:px-6">
        <div className="bg-surface rounded-3xl md:rounded-[48px] p-8 sm:p-14 md:p-20 border border-border shadow-2xl text-center space-y-8 relative overflow-hidden">
          {/* Subtle Glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-[300px] bg-primary/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 space-y-6">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-mono font-bold">
              <QadamSignal size={20} />
              <span>QOR Supply Engine</span>
            </div>

            <h2 className="text-3xl sm:text-5xl md:text-6xl font-extrabold text-foreground tracking-tight max-w-3xl mx-auto leading-tight">
              {t.finalCtaTitle}
            </h2>

            <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto font-normal leading-relaxed">
              {t.finalCtaSub}
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <Link
                href="/demo"
                className="w-full sm:w-auto px-8 py-4 rounded-full bg-primary text-primary-foreground font-bold text-base hover:bg-primary-hover transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-3 group"
              >
                <span>{language === 'ru' ? 'Проверить остатки' : 'Қалдықты тексеру'}</span>
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>

              <Link
                href="/signup"
                className="w-full sm:w-auto px-8 py-4 rounded-full bg-surface-muted border border-border text-foreground font-semibold text-base hover:bg-surface transition-all flex items-center justify-center gap-2"
              >
                <UserPlus className="w-4 h-4 text-primary" />
                <span>{language === 'ru' ? 'Начать использовать платформу' : 'Платформаны бастау'}</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
