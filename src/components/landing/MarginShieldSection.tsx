'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldAlert, ShieldCheck, AlertTriangle, ArrowRight, Check, X } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

export function MarginShieldSection() {
  const { t } = useLanguage();
  const [selectedScenario, setSelectedScenario] = useState<'dangerous' | 'safe'>('dangerous');

  return (
    <section id="margin-shield" className="py-24 md:py-36 bg-surface-muted text-foreground relative overflow-hidden border-y border-border">
      {/* Glow Effects */}
      <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-[500px] h-[500px] bg-danger/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-1/4 w-[500px] h-[500px] bg-primary/10 rounded-full blur-3xl pointer-events-none" />

      <div className="container max-w-7xl mx-auto px-4 sm:px-6 relative z-10">
        {/* Section Header */}
        <div className="max-w-3xl mx-auto text-center space-y-4 mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-danger/10 border border-danger/20 text-danger text-xs font-mono font-bold">
            <ShieldAlert className="w-4 h-4" />
            <span>Split-order Rescue</span>
          </div>
          <h2 className="text-3xl sm:text-5xl md:text-6xl font-extrabold text-foreground tracking-tight">
            {t.marginShieldTitle}
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {t.marginShieldSub}
          </p>
        </div>

        {/* Interactive Scenario Card */}
        <div className="max-w-4xl mx-auto bg-surface border border-border rounded-3xl md:rounded-[40px] p-6 sm:p-10 shadow-xl">
          {/* Scenario Toggle Header */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-8 border-b border-border">
            <div className="space-y-1 text-center sm:text-left">
              <span className="text-xs font-mono text-muted-foreground uppercase">Тюльпаны: 240 стеблей на витрине, срок 4 дня, спрос 50 в день</span>
              <h3 className="text-lg font-bold text-foreground">
                {selectedScenario === 'dangerous'
                  ? 'Обычный вариант: взять с запасом, чтобы точно хватило'
                  : 'Решение QOR: заказать столько, сколько успеет продаться'}
              </h3>
            </div>

            <div className="flex items-center gap-2 p-1.5 rounded-full bg-surface-muted border border-border">
              <button
                type="button"
                onClick={() => setSelectedScenario('dangerous')}
                className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${
                  selectedScenario === 'dangerous'
                    ? 'bg-danger text-danger-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                1. С запасом (как обычно)
              </button>
              <button
                type="button"
                onClick={() => setSelectedScenario('safe')}
                className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${
                  selectedScenario === 'safe'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                2. Split-order (QOR)
              </button>
            </div>
          </div>

          {/* Scenario Details */}
          <AnimatePresence mode="wait">
            {selectedScenario === 'dangerous' ? (
              <motion.div
                key="dangerous"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.3 }}
                className="py-8 space-y-8"
              >
                {/* Status Alert Banner */}
                <div className="p-5 rounded-2xl bg-danger/5 border border-danger/20 flex items-start gap-4 text-danger">
                  <AlertTriangle className="w-6 h-6 text-danger shrink-0 mt-0.5" />
                  <div className="space-y-1 text-sm">
                    <p className="font-bold text-danger">
                      Внимание: 40 стеблей не доживут до продажи
                    </p>
                    <p className="text-muted-foreground leading-relaxed">
                      На витрине 240 стеблей, срок партии 4 дня, спрос 50 в день. До истечения успеет уйти 200. Оставшиеся 40 — это 10 400 ₸, уже потраченные и превращающиеся в мусор. Ваш порог списаний — 8%, здесь получается 17%.
                    </p>
                  </div>
                </div>

                {/* Metrics Breakdown Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono">
                  <div className="p-4 rounded-2xl bg-surface-muted border border-border">
                    <span className="text-xs text-muted-foreground block">Не успеет продаться</span>
                    <span className="text-2xl font-bold text-danger">40 стеблей</span>
                    <span className="text-xs text-danger block mt-1">17% партии при пороге 8%</span>
                  </div>
                  <div className="p-4 rounded-2xl bg-surface-muted border border-border">
                    <span className="text-xs text-muted-foreground block">Замороженные деньги</span>
                    <span className="text-2xl font-bold text-foreground">10 400 ₸</span>
                    <span className="text-xs text-muted-foreground block mt-1">260 ₸ × 40 стеблей</span>
                  </div>
                  <div className="p-4 rounded-2xl bg-surface-muted border border-border">
                    <span className="text-xs text-muted-foreground block">Уйдёт в мусор</span>
                    <span className="text-2xl font-bold text-danger">−10 400 ₸</span>
                    <span className="text-xs text-danger block mt-1">Закупочная стоимость, не выручка</span>
                  </div>
                </div>

                {/* QADAM Shield Action */}
                <div className="p-6 rounded-3xl bg-background border border-border flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-2xl bg-danger/10 text-danger">
                      <X className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-foreground">QOR поднял тревогу по этой партии</p>
                      <p className="text-xs text-muted-foreground">Доля под списанием выше вашего порога</p>
                    </div>
                  </div>

                  <button
                    onClick={() => setSelectedScenario('safe')}
                    className="w-full sm:w-auto min-h-11 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary-hover transition-colors flex items-center justify-center gap-2 shadow-sm"
                  >
                    <span>Показать решение радара</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="safe"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.3 }}
                className="py-8 space-y-8"
              >
                {/* Status Safe Banner */}
                <div className="p-5 rounded-2xl bg-success/10 border border-success/20 flex items-start gap-4 text-success">
                  <ShieldCheck className="w-6 h-6 text-success shrink-0 mt-0.5" />
                  <div className="space-y-1 text-sm">
                    <p className="font-bold text-primary">
                      Объём урезан до двухдневного покрытия: 100 стеблей вместо 240
                    </p>
                    <p className="text-muted-foreground leading-relaxed">
                      Радар считает не остаток, а сколько из него успеет продаться до срока каждой партии. Спрос, потраченный на раннюю партию, уже не спасёт позднюю — поэтому объём режется до двух дней покрытия, а следующая машина придёт в четверг.
                    </p>
                  </div>
                </div>

                {/* Metrics Breakdown Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono">
                  <div className="p-4 rounded-2xl bg-surface-muted border border-border">
                    <span className="text-xs text-muted-foreground block">Не успеет продаться</span>
                    <span className="text-2xl font-bold text-primary">0 стеблей</span>
                    <span className="text-xs text-primary block mt-1">Ниже вашего порога 8%</span>
                  </div>
                  <div className="p-4 rounded-2xl bg-surface-muted border border-border">
                    <span className="text-xs text-muted-foreground block">Заказано вместо 240</span>
                    <span className="text-2xl font-bold text-foreground">100 стеблей</span>
                    <span className="text-xs text-muted-foreground block mt-1">двухдневное покрытие</span>
                  </div>
                  <div className="p-4 rounded-2xl bg-surface-muted border border-border">
                    <span className="text-xs text-muted-foreground block">Не ушло в мусор</span>
                    <span className="text-2xl font-bold text-primary">10 400 ₸</span>
                    <span className="text-xs text-primary block mt-1">Прогноз, не факт</span>
                  </div>
                </div>

                {/* Action Confirmed */}
                <div className="p-6 rounded-3xl bg-background border border-border flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-2xl bg-success/10 text-primary">
                      <Check className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-foreground">Карточка решения готова к подтверждению</p>
                      <p className="text-xs text-muted-foreground">Упаковка, минимальная партия и бюджет соблюдены</p>
                    </div>
                  </div>

                  <a
                    href="#growth-contract"
                    className="w-full sm:w-auto min-h-11 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary-hover transition-colors flex items-center justify-center gap-2 shadow-sm"
                  >
                    <span>Открыть карточку решения</span>
                    <ArrowRight className="w-4 h-4" />
                  </a>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
