'use client';

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { QrCode, UserCheck, ShieldCheck, Heart } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { mockCustomers } from '@/mock-data/customers';

export function QrLoyaltySection() {
  const { t, language } = useLanguage();
  const [selectedCustomer] = useState(mockCustomers[0]);

  return (
    <section id="features" className="py-24 md:py-36 bg-surface border-y border-border overflow-hidden">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6">
        {/* Section Header */}
        <div className="max-w-3xl mb-16 space-y-4">
          <span className="text-xs font-mono font-bold text-primary uppercase tracking-widest">
            QR Loyalty & Mini-CRM
          </span>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-foreground tracking-tight">
            {t.qrTitle}
          </h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            {t.qrDesc}
          </p>
        </div>

        {/* 3-Step Visual Scenario Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Step 1: QR at checkout */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="p-8 rounded-3xl bg-surface-muted border border-border space-y-6 flex flex-col justify-between"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="w-8 h-8 rounded-full bg-primary/10 text-primary font-mono font-bold flex items-center justify-center text-sm">
                  1
                </span>
                <span className="text-xs font-mono text-muted-foreground">Без скачивания приложений</span>
              </div>
              <h3 className="text-xl font-bold text-foreground">
                {language === 'ru' ? 'QR-код на кассе' : 'Кассадағы QR-код'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {language === 'ru'
                  ? 'Гость сканирует QR на тейбл-тенте за 3 секунды, присоединяется к программе и дает согласие на персональные предложения.'
                  : 'Қонақ 3 секундта тейбл-тенттегі QR сканерлейді және жеке ұсыныстарға келісім береді.'}
              </p>
            </div>

            {/* QR Mockup */}
            <div className="p-6 rounded-2xl bg-surface border border-border text-center space-y-3 shadow-sm">
              <div className="w-28 h-28 mx-auto bg-primary/5 rounded-xl border border-primary/20 flex items-center justify-center text-primary">
                <QrCode className="w-20 h-20" />
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-700 text-xs font-mono font-semibold">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Consent Approved</span>
              </div>
            </div>
          </motion.div>

          {/* Step 2: Instant Customer Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="p-8 rounded-3xl bg-surface-muted border border-border space-y-6 flex flex-col justify-between"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="w-8 h-8 rounded-full bg-primary/10 text-primary font-mono font-bold flex items-center justify-center text-sm">
                  2
                </span>
                <span className="text-xs font-mono text-muted-foreground">Авто-обогащение</span>
              </div>
              <h3 className="text-xl font-bold text-foreground">
                {language === 'ru' ? 'Карточка клиента' : 'Клиент картасы'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {language === 'ru'
                  ? 'QADAM строит историю визитов, считает средний чек и определяет предпочитаемый канал связи (WhatsApp).'
                  : 'QADAM сапарлар тарихын тұрғызады, орташа чекті есептейді және артықшылықты арнаны анықтайды.'}
              </p>
            </div>

            {/* Customer Card Mockup */}
            <div className="p-5 rounded-2xl bg-surface border border-border space-y-3 shadow-sm text-left">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-foreground text-sm">{selectedCustomer.name}</h4>
                  <p className="text-xs font-mono text-muted-foreground">{selectedCustomer.phone}</p>
                </div>
                <span className="p-2 rounded-full bg-primary/10 text-primary">
                  <UserCheck className="w-4 h-4" />
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono border-t border-border pt-3">
                <div>
                  <span className="text-muted-foreground block">Визитов:</span>
                  <span className="font-bold text-foreground">{selectedCustomer.visitCount}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Средний чек:</span>
                  <span className="font-bold text-foreground">{selectedCustomer.avgCheck} ₸</span>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-surface-muted text-xs font-sans flex items-center gap-2">
                <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500" />
                <span className="text-muted-foreground truncate">{selectedCustomer.favoriteCategory}</span>
              </div>
            </div>
          </motion.div>

          {/* Step 3: Segment Placement */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="p-8 rounded-3xl bg-surface-muted border border-border space-y-6 flex flex-col justify-between"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="w-8 h-8 rounded-full bg-primary/10 text-primary font-mono font-bold flex items-center justify-center text-sm">
                  3
                </span>
                <span className="text-xs font-mono text-muted-foreground">Умный сегмент</span>
              </div>
              <h3 className="text-xl font-bold text-foreground">
                {language === 'ru' ? 'Персональный таргетинг' : 'Жеке таргетинг'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {language === 'ru'
                  ? 'Клиент автоматически попадает в соответствующую когорту для точной точечной акции.'
                  : 'Клиент дәл нүктелік акция үшін тиісті когортаға автоматты түрде түседі.'}
              </p>
            </div>

            {/* Segments Stack Mockup */}
            <div className="space-y-2">
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between text-xs">
                <span className="font-semibold text-amber-900">Спящие постоянники</span>
                <span className="font-mono font-bold text-amber-800">64 чел</span>
              </div>
              <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between text-xs">
                <span className="font-semibold text-emerald-900">Любители сетов</span>
                <span className="font-mono font-bold text-emerald-700">42 чел</span>
              </div>
              <div className="p-3.5 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-between text-xs">
                <span className="font-semibold text-blue-900">VIP Дневные</span>
                <span className="font-mono font-bold text-blue-700">28 чел</span>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
