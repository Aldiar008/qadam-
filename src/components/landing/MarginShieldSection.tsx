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
            <span>Margin Shield Engine</span>
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
              <span className="text-xs font-mono text-muted-foreground uppercase">Тестирование гипотезы</span>
              <h3 className="text-lg font-bold text-foreground">
                {selectedScenario === 'dangerous'
                  ? 'Опасный вариант: Скидка -20% для всех'
                  : 'Защищенный вариант QADAM: Подарок от 3 500 ₸'}
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
                1. Скидка -20% (Стандарт)
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
                2. Margin Shield (Безопасно)
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
                      Внимание: прямая скидка 20% уничтожает маржинальный доход
                    </p>
                    <p className="text-muted-foreground leading-relaxed">
                      При скидке 20% постоянные клиенты совершат покупки со скидкой, которые совершили бы и по полной цене. Маржа упадет с 62% до 34.2%, а чистый убыток акции составит -24 500 ₸.
                    </p>
                  </div>
                </div>

                {/* Metrics Breakdown Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono">
                  <div className="p-4 rounded-2xl bg-surface-muted border border-border">
                    <span className="text-xs text-muted-foreground block">Вклад-маржа</span>
                    <span className="text-2xl font-bold text-danger">34.2%</span>
                    <span className="text-xs text-danger block mt-1">Падение на 27.8%</span>
                  </div>
                  <div className="p-4 rounded-2xl bg-surface-muted border border-border">
                    <span className="text-xs text-muted-foreground block">Канибализация базы</span>
                    <span className="text-2xl font-bold text-danger">78%</span>
                    <span className="text-xs text-muted-foreground block mt-1">Высокий риск</span>
                  </div>
                  <div className="p-4 rounded-2xl bg-surface-muted border border-border">
                    <span className="text-xs text-muted-foreground block">Финансовый итог</span>
                    <span className="text-2xl font-bold text-danger">-24 500 ₸</span>
                    <span className="text-xs text-danger block mt-1">Убыток</span>
                  </div>
                </div>

                {/* QADAM Shield Action */}
                <div className="p-6 rounded-3xl bg-background border border-border flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-2xl bg-danger/10 text-danger">
                      <X className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-foreground">QADAM заблокировал скидку 20%</p>
                      <p className="text-xs text-muted-foreground">Система предлагает безопасную альтернативу</p>
                    </div>
                  </div>

                  <button
                    onClick={() => setSelectedScenario('safe')}
                    className="w-full sm:w-auto min-h-11 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary-hover transition-colors flex items-center justify-center gap-2 shadow-sm"
                  >
                    <span>Переключить на безопасный вариант</span>
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
                      Безопасный вариант утверждён: подарок при чеке от 3 500 ₸
                    </p>
                    <p className="text-muted-foreground leading-relaxed">
                      Вместо скидки 20% дарим миндальный круассан (себестоимость 450 ₸) только при достижении чека 3 500 ₸. Средний чек растет, маржа защищена на уровне 49.1%, а приращенная прибыль составит +18 200 ₸.
                    </p>
                  </div>
                </div>

                {/* Metrics Breakdown Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono">
                  <div className="p-4 rounded-2xl bg-surface-muted border border-border">
                    <span className="text-xs text-muted-foreground block">Защищенная маржа</span>
                    <span className="text-2xl font-bold text-primary">49.1%</span>
                    <span className="text-xs text-primary block mt-1">Оптимальный уровень</span>
                  </div>
                  <div className="p-4 rounded-2xl bg-surface-muted border border-border">
                    <span className="text-xs text-muted-foreground block">Целевая аудитория</span>
                    <span className="text-2xl font-bold text-primary">18 чел</span>
                    <span className="text-xs text-muted-foreground block mt-1">Точечный выбор</span>
                  </div>
                  <div className="p-4 rounded-2xl bg-surface-muted border border-border">
                    <span className="text-xs text-muted-foreground block">Приращенная маржа</span>
                    <span className="text-2xl font-bold text-primary">+18 200 ₸</span>
                    <span className="text-xs text-primary block mt-1">Чистый профит</span>
                  </div>
                </div>

                {/* Action Confirmed */}
                <div className="p-6 rounded-3xl bg-background border border-border flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-2xl bg-success/10 text-primary">
                      <Check className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-foreground">Growth Contract готовит запуск</p>
                      <p className="text-xs text-muted-foreground">Проверено на модели Margin Shield v2.4</p>
                    </div>
                  </div>

                  <a
                    href="#growth-contract"
                    className="w-full sm:w-auto min-h-11 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary-hover transition-colors flex items-center justify-center gap-2 shadow-sm"
                  >
                    <span>Принять безопасный вариант</span>
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
