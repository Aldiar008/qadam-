'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight, Coffee, Scissors, ShoppingBag, Wrench, Store, ArrowRight } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

export function BusinessSolutionsSection() {
  const { t, language } = useLanguage();
  const [currentIndex, setCurrentIndex] = useState(0);

  const solutions = [
    {
      id: 'cafe',
      icon: Coffee,
      titleRu: 'Кофейни и кафе',
      titleKk: 'Кофеханалар мен кафелер',
      tag: 'Сегмент: Общепит',
      oppRu: 'Рост чека в полуденный спад 15:00-18:00 на +24% через комбо-подарок к выпечке.',
      oppKk: 'Пісірілген өнімге комбо-сыйлық арқылы 15:00-18:00 түскі төмендеуде чектің +24%-ға өсуі.',
      metricsRu: '48 700 ₸ доп. выручка в неделю • 145 мин сэкономлено',
      metricsKk: 'Аптасына 48 700 ₸ қосымша түсім • 145 мин үнемделді',
      route: '/solutions/cafe',
    },
    {
      id: 'beauty',
      icon: Scissors,
      titleRu: 'Салоны красоты & SPA',
      titleKk: 'Сұлулық салондары',
      tag: 'Сегмент: Услуги',
      oppRu: 'Заполнение горящих вечерних окон с помощью персональных приглашений постоянным клиентам.',
      oppKk: 'Тұрақты клиенттерге жеке шақырулар арқылы кешкі бос уақыттарды толтыру.',
      metricsRu: '86 000 ₸ приращенный чек • 92% заполняемость',
      metricsKk: '86 000 ₸ қосымша чек • 92% толтырылу',
      route: '/solutions/beauty',
    },
    {
      id: 'retail',
      icon: ShoppingBag,
      titleRu: 'Магазины и ритейл',
      titleKk: 'Дүкендер мен ритейл',
      tag: 'Сегмент: Торговля',
      oppRu: 'Реактивация "спящей" базы к выходу новой коллекции без потери маржинальности.',
      oppKk: 'Маржиналдылықты жоғалтпай жаңа коллекцияға "ұйықтаған" базаны қайта белсендіру.',
      metricsRu: '124 500 ₸ приращенная маржа • 18% реактивация',
      metricsKk: '124 500 ₸ қосымша маржа • 18% қайта белсендіру',
      route: '/solutions/retail',
    },
    {
      id: 'service',
      icon: Wrench,
      titleRu: 'Сервисные центры',
      titleKk: 'Сервис орталықтары',
      tag: 'Сегмент: Сервис',
      oppRu: 'Автоматическое напомнинание о ТО и повторном обслуживании через 90 дней.',
      oppKk: '90 күннен кейін ТҚК және қайта қызмет көрсету туралы автоматты еске салу.',
      metricsRu: '210 000 ₸ доп. выручка • 68% возвратность',
      metricsKk: '210 000 ₸ қосымша түсім • 68% қайтарымдылық',
      route: '/solutions/service-center',
    },
    {
      id: 'chain',
      icon: Store,
      titleRu: 'Небольшие сети (2-5 точек)',
      titleKk: 'Шағын желілер (2-5 нүкте)',
      tag: 'Сегмент: Сеть',
      oppRu: 'Сравнительный анализ филиалов и кросс-локационные акции для выравнивания трафика.',
      oppKk: 'Трафикті теңестіру үшін филиалдарды салыстырмалы талдау және кросс-локациялық акциялар.',
      metricsRu: '+34% кросс-посещения • 100% единая аналитика',
      metricsKk: '+34% кросс-сапарлар • 100% бірыңғай аналитика',
      route: '/solutions',
    },
  ];

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev === 0 ? solutions.length - 1 : prev - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev === solutions.length - 1 ? 0 : prev + 1));
  };

  const current = solutions[currentIndex];
  const Icon = current.icon;

  return (
    <section className="py-24 md:py-36 bg-surface border-y border-border overflow-hidden">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-12">
          <div className="space-y-4 max-w-2xl">
            <span className="text-xs font-mono font-bold text-primary uppercase tracking-widest">
              Industry Tailored
            </span>
            <h2 className="text-3xl sm:text-5xl font-extrabold text-foreground tracking-tight">
              {t.solutionsTitle}
            </h2>
          </div>

          {/* Carousel Controls */}
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrev}
              className="p-3 rounded-full bg-surface-muted border border-border text-foreground hover:bg-primary hover:text-primary-foreground transition-all shadow-xs"
              aria-label="Previous solution"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-xs font-mono font-bold text-muted-foreground px-2">
              {currentIndex + 1} / {solutions.length}
            </span>
            <button
              onClick={handleNext}
              className="p-3 rounded-full bg-surface-muted border border-border text-foreground hover:bg-primary hover:text-primary-foreground transition-all shadow-xs"
              aria-label="Next solution"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Carousel Card */}
        <div className="bg-background rounded-3xl md:rounded-[40px] border border-border p-8 sm:p-12 shadow-xl relative min-h-[340px] flex flex-col justify-between">
          <AnimatePresence mode="wait">
            <motion.div
              key={current.id}
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-3.5 rounded-2xl bg-primary/10 text-primary">
                    <Icon className="w-7 h-7" />
                  </div>
                  <div>
                    <span className="text-xs font-mono text-muted-foreground">{current.tag}</span>
                    <h3 className="text-2xl sm:text-3xl font-extrabold text-foreground">
                      {language === 'ru' ? current.titleRu : current.titleKk}
                    </h3>
                  </div>
                </div>
              </div>

              <div className="p-6 rounded-2xl bg-surface border border-border space-y-3">
                <span className="text-xs font-mono font-bold text-primary uppercase">
                  {language === 'ru' ? 'Типовая возможность роста:' : 'Типтік өсу мүмкіндігі:'}
                </span>
                <p className="text-base sm:text-lg font-semibold text-foreground leading-relaxed">
                  {language === 'ru' ? current.oppRu : current.oppKk}
                </p>
                <div className="pt-2 text-xs font-mono text-emerald-700 font-bold">
                  {language === 'ru' ? current.metricsRu : current.metricsKk}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          <div className="pt-6 mt-6 border-t border-border flex items-center justify-between">
            <span className="text-xs font-mono text-muted-foreground">
              {language === 'ru' ? 'Персонализировано под локальный бизнес' : 'Жергілікті бизнеске бейімделген'}
            </span>
            <a
              href={current.route}
              className="text-sm font-bold text-primary hover:underline flex items-center gap-1.5"
            >
              <span>{language === 'ru' ? 'Подробнее о решении' : 'Шешім туралы толығырақ'}</span>
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
