'use client';

import React from 'react';
import { motion } from 'motion/react';
import { FileCheck, Shield, CheckCircle2, ArrowRight } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { mockGrowthContract } from '@/mock-data/signals';

export function GrowthContractSection() {
  const { t, language } = useLanguage();
  const gc = mockGrowthContract;

  const fields = [
    { labelRu: 'Сигнал', labelKk: 'Белгі', valRu: gc.signalDescriptionRu, valKk: gc.signalDescriptionKk },
    { labelRu: 'Причина', labelKk: 'Себеп', valRu: gc.reasonRu, valKk: gc.reasonKk },
    { labelRu: 'Уровень доверия (Confidence)', labelKk: 'Сенімділік деңгейі', valRu: `${gc.confidenceScore}% (Анализ по 142 чекам)`, valKk: `${gc.confidenceScore}% (142 чек бойынша талдау)` },
    { labelRu: 'Цель', labelKk: 'Мақсат', valRu: gc.targetGoal, valKk: gc.targetGoal },
    { labelRu: 'Аудитория', labelKk: 'Аудитория', valRu: gc.targetAudience, valKk: gc.targetAudience },
    { labelRu: 'Оффер', labelKk: 'Оффер', valRu: language === 'ru' ? gc.offerDescriptionRu : gc.offerDescriptionKk, valKk: gc.offerDescriptionKk },
    { labelRu: 'Экономика', labelKk: 'Экономика', valRu: `Мин. чек: ${gc.economics.minCheck} ₸ • Сейф-маржа: ${gc.economics.marginAfterPercent}% • Ожидаемый прирост: +${gc.economics.projectedContributionProfit} ₸`, valKk: `Мин. чек: ${gc.economics.minCheck} ₸ • Маржа: ${gc.economics.marginAfterPercent}%` },
    { labelRu: 'Канал связи', labelKk: 'Байланыс арнасы', valRu: `${gc.channel} (Персональный шаблон)`, valKk: `${gc.channel} (Жеке үлгі)` },
    { labelRu: 'Срок действия', labelKk: 'Қолданылу мерзімі', valRu: `${gc.validityDays} дней со дня получения`, valKk: `Алынған күннен бастап ${gc.validityDays} күн` },
    { labelRu: 'Stop-rule', labelKk: 'Тоқтату ережесі', valRu: gc.stopRule, valKk: gc.stopRule },
    { labelRu: 'Способ измерения', labelKk: 'Өлшеу әдісі', valRu: gc.measurementMethod, valKk: gc.measurementMethod },
  ];

  return (
    <section id="growth-contract" className="py-24 md:py-36 bg-surface border-y border-border overflow-hidden">
      <div className="container max-w-5xl mx-auto px-4 sm:px-6">
        {/* Section Title */}
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-mono font-bold">
            <FileCheck className="w-4 h-4" />
            <span>Growth Contract Architecture</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-foreground tracking-tight">
            {t.contractTitle}
          </h2>
          <p className="text-lg text-muted-foreground">
            {t.contractSub}
          </p>
        </div>

        {/* Unified Growth Contract Document Frame */}
        <div className="bg-background rounded-3xl md:rounded-[40px] border border-border p-6 sm:p-10 shadow-2xl space-y-8 relative">
          {/* Document Header */}
          <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center font-mono font-bold">
                GC
              </div>
              <div>
                <h3 className="font-bold text-foreground text-lg sm:text-xl">
                  {language === 'ru' ? gc.titleRu : gc.titleKk}
                </h3>
                <p className="text-xs font-mono text-muted-foreground">
                  ID: {gc.id} • Signed & Executable
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-700 text-xs font-mono font-bold border border-emerald-500/20">
              <Shield className="w-3.5 h-3.5" />
              <span>Margin Verified</span>
            </div>
          </div>

          {/* Sequential Fields Grid */}
          <div className="space-y-4">
            {fields.map((f, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ duration: 0.4, delay: i * 0.05 }}
                className="p-4 rounded-2xl bg-surface border border-border/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm"
              >
                <span className="font-mono text-xs font-bold text-muted-foreground uppercase sm:w-1/3 shrink-0">
                  {language === 'ru' ? f.labelRu : f.labelKk}
                </span>
                <span className="font-medium text-foreground sm:w-2/3 text-left sm:text-right">
                  {language === 'ru' ? f.valRu : f.valKk}
                </span>
              </motion.div>
            ))}
          </div>

          {/* Document Footer */}
          <div className="pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs font-mono text-emerald-700">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Готов к отправке за 1 клик</span>
            </div>

            <a
              href="/demo"
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary-hover transition-all flex items-center justify-center gap-2"
            >
              <span>{language === 'ru' ? 'Запустить контракт' : 'Келісімшартты іске қосу'}</span>
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
