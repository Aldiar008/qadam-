'use client';

import React from 'react';
import { motion } from 'motion/react';
import { BarChart3, ShieldCheck } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { mockImpactMetrics } from '@/mock-data/campaigns';
import { DemoBadge } from '@/components/common/DemoBadge';

export function ImpactLedgerSection() {
  const { t, language } = useLanguage();

  const getTagBadge = (type: string) => {
    switch (type) {
      case 'forecast':
        return (
          <span className="px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-700 font-mono text-[10px] font-bold border border-blue-500/20 uppercase">
            Forecast
          </span>
        );
      case 'demo_result':
        return (
          <span className="px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-800 font-mono text-[10px] font-bold border border-amber-500/20 uppercase">
            Demo Result
          </span>
        );
      case 'verified_fact':
        return (
          <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 font-mono text-[10px] font-bold border border-emerald-500/20 uppercase">
            Verified Fact
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <section id="impact" className="py-24 md:py-36 bg-surface border-y border-border overflow-hidden">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6">
        {/* Section Header */}
        <div className="max-w-3xl mb-12 space-y-4">
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-mono font-bold">
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Impact Ledger Engine</span>
            </div>
            <DemoBadge />
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-foreground tracking-tight">
            {t.impactTitle}
          </h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            {t.impactSub}
          </p>
        </div>

        {/* Impact Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {mockImpactMetrics.map((m, i) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
              className="p-6 rounded-3xl bg-surface-muted border border-border space-y-4 flex flex-col justify-between hover:border-primary/40 transition-colors"
            >
              <div className="flex items-center justify-between">
                {getTagBadge(m.type)}
                <span className="text-xs font-mono text-muted-foreground">ID: {m.id}</span>
              </div>

              <div className="space-y-1">
                <span className="text-xs font-mono text-muted-foreground block">
                  {language === 'ru' ? m.labelRu : m.labelKk}
                </span>
                <p className="text-3xl font-extrabold font-mono text-foreground tracking-tight">
                  {typeof m.value === 'number' ? new Intl.NumberFormat('ru-RU').format(m.value) : m.value}
                  {m.unit && <span className="text-sm font-sans text-muted-foreground ml-1.5">{m.unit}</span>}
                </p>
              </div>

              <div className="pt-3 border-t border-border/80 flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
                <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                <span>Simulated Model Output</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
