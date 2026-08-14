'use client';

import React from 'react';
import { motion } from 'motion/react';
import { MessageSquare, PackageCheck, ShieldCheck, Clock } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

export function QrLoyaltySection() {
  const { t, language } = useLanguage();

  return (
    <section id="features" className="py-24 md:py-36 bg-surface border-y border-border overflow-hidden">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6">
        {/* Section Header */}
        <div className="max-w-3xl mb-16 space-y-4">
          <span className="text-xs font-mono font-bold text-primary uppercase tracking-widest">
            Messenger Stock
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
          {/* Step 1: сообщение из чата */}
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
                <span className="text-xs font-mono text-muted-foreground">Без обучения складским системам</span>
              </div>
              <h3 className="text-xl font-bold text-foreground">
                {language === 'ru' ? 'Сообщение в чате' : 'Чаттағы хабарлама'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {language === 'ru'
                  ? 'Флорист пишет как обычно, между двумя покупателями: «осталось 70 красных роз». Открывать таблицу в этот момент некогда — и не нужно.'
                  : 'Флорист екі сатып алушының арасында әдеттегідей жазады: «70 қызыл раушан қалды». Бұл сәтте кесте ашуға уақыт жоқ — қажет те емес.'}
              </p>
            </div>

            {/* Chat Mockup */}
            <div className="p-6 rounded-2xl bg-surface border border-border space-y-3 shadow-sm">
              <div className="p-3 rounded-2xl rounded-bl-sm bg-surface-muted text-sm text-foreground text-left">
                Айгуль (флорист), 09:14
                <p className="mt-1 font-medium">осталось 70 красных роз</p>
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-700 text-xs font-mono font-semibold">
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Сообщение получено</span>
              </div>
            </div>
          </motion.div>

          {/* Step 2: разбор в предложение */}
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
                <span className="text-xs font-mono text-muted-foreground">Разбор в структуру</span>
              </div>
              <h3 className="text-xl font-bold text-foreground">
                {language === 'ru' ? 'Предложенное изменение' : 'Ұсынылған өзгеріс'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {language === 'ru'
                  ? 'QOR определяет позицию, точку, количество и единицу, а при неуверенности показывает похожие сорта. Это предложение, а не факт: витрина пока не изменилась.'
                  : 'QOR позицияны, нүктені, санды және өлшем бірлігін анықтайды, күмән болса ұқсас сұрыптарды көрсетеді. Бұл ұсыныс, факт емес.'}
              </p>
            </div>

            {/* Parsed Card Mockup */}
            <div className="p-5 rounded-2xl bg-surface border border-border space-y-3 shadow-sm text-left">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-foreground text-sm">Роза красная 60 см</h4>
                  <p className="text-xs font-mono text-muted-foreground">TAMYR Flowers · Бостандыкский</p>
                </div>
                <span className="p-2 rounded-full bg-primary/10 text-primary">
                  <PackageCheck className="w-4 h-4" />
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono border-t border-border pt-3">
                <div>
                  <span className="text-muted-foreground block">Количество:</span>
                  <span className="font-bold text-foreground">70 стеблей</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Уверенность:</span>
                  <span className="font-bold text-foreground">0.92</span>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-surface-muted text-xs font-sans flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                <span className="text-muted-foreground truncate">Ждёт подтверждения владельца</span>
              </div>
            </div>
          </motion.div>

          {/* Step 3: подтверждение и риск */}
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
                <span className="text-xs font-mono text-muted-foreground">Одно подтверждение</span>
              </div>
              <h3 className="text-xl font-bold text-foreground">
                {language === 'ru' ? 'Остаток и риск' : 'Қалдық және тәуекел'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {language === 'ru'
                  ? 'После подтверждения витрина обновляется, позиции пересчитывают часы до нуля и срок партий — и попадают в очередь решений.'
                  : 'Растағаннан кейін витрина жаңарады, позициялар нөлге дейінгі сағатты және партия мерзімін қайта санайды.'}
              </p>
            </div>

            {/* Risk Stack Mockup */}
            <div className="space-y-2">
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between text-xs">
                <span className="font-semibold text-amber-900">Эвкалипт зелень</span>
                <span className="font-mono font-bold text-amber-800">
                  <Clock className="inline w-3 h-3 mr-1" />34 ч
                </span>
              </div>
              <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-between text-xs">
                <span className="font-semibold text-rose-900">Роза красная 60 см</span>
                <span className="font-mono font-bold text-rose-700">29 ч</span>
              </div>
              <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between text-xs">
                <span className="font-semibold text-emerald-900">Упаковочная бумага</span>
                <span className="font-mono font-bold text-emerald-700">11 дней</span>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
