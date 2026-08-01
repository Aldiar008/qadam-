'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import { ArrowRight, Sparkles, TrendingDown, Users, CheckCircle2, Play, ShieldAlert } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { QadamSignal } from '@/components/brand/QadamSignal';

export function HeroScene() {
  const { t, language } = useLanguage();
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Disable parallax on mobile/small screens
      if (window.innerWidth < 768) return;
      const { clientX, clientY } = e;
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      setMousePos({
        x: (clientX - centerX) / 40,
        y: (clientY - centerY) / 40,
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <section id="overview" className="relative pt-32 pb-20 md:pt-40 md:pb-32 overflow-hidden bg-background">
      {/* Background Subtle Gradient Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 right-10 w-[400px] h-[400px] bg-accent/5 rounded-full blur-3xl pointer-events-none" />

      <div className="container max-w-7xl mx-auto px-4 sm:px-6 relative z-10">
        {/* Header Tag & Headings */}
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-surface border border-border shadow-xs text-xs sm:text-sm font-medium text-foreground"
          >
            <Sparkles className="w-4 h-4 text-primary animate-pulse" />
            <span>{t.heroTag}</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-extrabold text-foreground tracking-tight leading-[1.08]"
          >
            {t.heroTitle}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-lg sm:text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto font-normal leading-relaxed"
          >
            {t.heroSubtitle}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4"
          >
            <Link
              href="/demo"
              className="w-full sm:w-auto px-8 py-4 rounded-full bg-primary text-primary-foreground font-bold text-base hover:bg-primary-hover transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-3 group"
            >
              <span>{t.heroCtaDemo}</span>
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>

            <a
              href="#how-it-works"
              className="w-full sm:w-auto px-8 py-4 rounded-full bg-surface border border-border text-foreground font-semibold text-base hover:bg-surface-muted transition-all flex items-center justify-center gap-2"
            >
              <Play className="w-4 h-4 text-primary fill-primary" />
              <span>{t.heroCtaHow}</span>
            </a>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="text-xs sm:text-sm text-muted-foreground font-medium pt-2"
          >
            {t.heroSubtext}
          </motion.p>
        </div>

        {/* Hero Interactive Center Mockup Composition */}
        <div className="mt-16 md:mt-24 relative max-w-5xl mx-auto">
          {/* Floating Parallax Wrapper */}
          <motion.div
            animate={{
              x: mousePos.x,
              y: mousePos.y,
            }}
            transition={{ type: 'spring', stiffness: 80, damping: 20 }}
            className="relative"
          >
            {/* Main Center Card: "Сегодня" */}
            <div className="bg-surface rounded-3xl md:rounded-[40px] p-6 sm:p-8 md:p-10 border border-border shadow-2xl relative z-20 backdrop-blur-xl">
              {/* Card Header */}
              <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-border">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-primary/10 text-primary">
                    <QadamSignal size={28} />
                  </div>
                  <div>
                    <h3 className="text-xl sm:text-2xl font-extrabold text-foreground tracking-tight">
                      {t.todayCardTitle}
                    </h3>
                    <p className="text-xs font-mono text-muted-foreground">
                      QADAM Growth Engine • Live Data
                    </p>
                  </div>
                </div>

                {/* Opportunity Score Pill */}
                <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 font-mono font-bold text-sm">
                  <span>Growth Opportunity:</span>
                  <span className="text-lg text-emerald-600">87</span>
                  <span className="text-xs font-sans text-emerald-800">/ 100</span>
                </div>
              </div>

              {/* Signals Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-6">
                {/* Item 1: Drop Signal */}
                <div className="p-4 rounded-2xl bg-rose-500/5 border border-rose-500/15 space-y-2">
                  <div className="flex items-center justify-between text-rose-600 text-xs font-mono font-semibold">
                    <span className="flex items-center gap-1.5">
                      <TrendingDown className="w-4 h-4" />
                      {language === 'ru' ? 'Сигнал выручки' : 'Түсім белгісі'}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-rose-500/10 font-bold">-27%</span>
                  </div>
                  <p className="text-sm font-semibold text-foreground">
                    {t.todayCardSignal}
                  </p>
                </div>

                {/* Item 2: Sleeping segment */}
                <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/15 space-y-2">
                  <div className="flex items-center justify-between text-amber-800 text-xs font-mono font-semibold">
                    <span className="flex items-center gap-1.5">
                      <Users className="w-4 h-4" />
                      {language === 'ru' ? 'Аудитория' : 'Аудитория'}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-amber-500/10 font-bold">64 чел</span>
                  </div>
                  <p className="text-sm font-semibold text-foreground">
                    {t.todayCardSleeping}
                  </p>
                </div>

                {/* Item 3: Qualified offer */}
                <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/15 space-y-2">
                  <div className="flex items-center justify-between text-emerald-700 text-xs font-mono font-semibold">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" />
                      {language === 'ru' ? 'Безопасный оффер' : 'Қауіпсіз оффер'}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 font-bold">18 target</span>
                  </div>
                  <p className="text-sm font-semibold text-foreground">
                    {t.todayCardTarget}
                  </p>
                </div>
              </div>

              {/* Action Banner */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 rounded-2xl bg-surface-muted border border-border">
                <div className="space-y-1 text-left w-full sm:w-auto">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono uppercase font-bold text-primary tracking-wider">
                      {language === 'ru' ? 'Рекомендованное действие' : 'Усынылған әрекет'}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary font-mono">
                      Margin Shield Verified
                    </span>
                  </div>
                  <p className="text-sm font-bold text-foreground">
                    {language === 'ru'
                      ? 'Миндальный круассан в подарок при чеке от 3 500 ₸ в 15:00-18:00'
                      : '15:00-18:00 аралығында 3 500 ₸ чегі үшін миндаль круассаны сыйлыққа'}
                  </p>
                </div>

                <Link
                  href="/demo"
                  className="w-full sm:w-auto px-6 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary-hover transition-all shadow-sm hover:shadow whitespace-nowrap text-center"
                >
                  {t.todayCardCta}
                </Link>
              </div>
            </div>

            {/* Decorative Floating Element 1: Growth Contract Badge */}
            <motion.div
              animate={{ y: [-4, 4, -4] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
              className="hidden lg:flex absolute -top-8 -left-12 z-30 bg-surface rounded-2xl p-4 shadow-xl border border-border items-center gap-3"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-600 font-bold">
                +48.7k₸
              </div>
              <div>
                <p className="text-xs font-mono text-muted-foreground uppercase">Прогноз прироста</p>
                <p className="text-sm font-bold text-foreground">Simulated Incremental</p>
              </div>
            </motion.div>

            {/* Decorative Floating Element 2: Shield Badge */}
            <motion.div
              animate={{ y: [4, -4, 4] }}
              transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
              className="hidden lg:flex absolute -bottom-8 -right-10 z-30 bg-surface rounded-2xl p-4 shadow-xl border border-border items-center gap-3"
            >
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center text-amber-600">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-mono text-muted-foreground uppercase">Margin Shield</p>
                <p className="text-sm font-bold text-emerald-600">
                  {language === 'ru' ? 'Скидка 20% заблокирована' : '20% жеңілдік бұғатталды'}
                </p>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
