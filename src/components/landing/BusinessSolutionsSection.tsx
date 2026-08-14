'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight, Flower2, Leaf, Package, CalendarHeart, Store, ArrowRight } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

export function BusinessSolutionsSection() {
  const { t, language } = useLanguage();
  const [currentIndex, setCurrentIndex] = useState(0);

  const solutions = [
    {
      id: 'shop',
      icon: Flower2,
      titleRu: 'Цветочный магазин у дома',
      titleKk: 'Үй жанындағы гүл дүкені',
      tag: 'Сегмент: Одна точка',
      oppRu: 'Розы, тюльпаны и зелень держат почти всю выручку и заканчиваются первыми. Учёт партиями со сроком показывает не только сколько стеблей, но и сколько дней им осталось.',
      oppKk: 'Раушан, қызғалдақ және көгал түсімнің барлығын дерлік ұстайды әрі бірінші бітеді. Мерзімі бар партиялық есеп неше сабақ бар екенін де, неше күн қалғанын да көрсетеді.',
      metricsRu: '29 ч до пустой витрины видно заранее • списание считается до того, как случилось',
      metricsKk: 'Бос витринаға дейінгі 29 сағат алдын ала көрінеді • есептен шығару болмай тұрып есептеледі',
      route: '/solutions/flower-shop',
    },
    {
      id: 'holiday',
      icon: CalendarHeart,
      titleRu: 'Подготовка к праздникам',
      titleKk: 'Мерекеге дайындық',
      tag: 'Сегмент: 8 марта и выпускные',
      oppRu: 'Восьмое марта делает месячную выручку и месячное списание. Повод попадает в прогноз за четыре дня — с коэффициентом, источником и пометкой, что это гипотеза.',
      oppKk: '8 наурыз айлық түсімді де, айлық есептен шығаруды да жасайды. Себеп болжамға төрт күн бұрын түседі.',
      metricsRu: '×1,8 к спросу на розы • коэффициент не двигает прогноз без вашего одобрения',
      metricsKk: 'Раушан сұранысына ×1,8 • коэффициент сіз мақұлдамай болжамды жылжытпайды',
      route: '/solutions/holidays',
    },
    {
      id: 'freshness',
      icon: Leaf,
      titleRu: 'Скоропортящийся ассортимент',
      titleKk: 'Тез бүлінетін ассортимент',
      tag: 'Сегмент: Свежесть',
      oppRu: 'Пион стоит три дня, роза пять, хризантема неделю. Заказ дробится на несколько поставок, чтобы поздняя партия не осталась непроданной.',
      oppKk: 'Пион үш күн, раушан бес күн, хризантема бір апта тұрады. Тапсырыс бірнеше жеткізілімге бөлінеді.',
      metricsRu: 'Порог списаний задаёте вы • тревога только выше него',
      metricsKk: 'Есептен шығару шегін өзіңіз белгілейсіз • дабыл тек одан жоғары',
      route: '/solutions/freshness',
    },
    {
      id: 'packaging',
      icon: Package,
      titleRu: 'Упаковка и аксессуары',
      titleKk: 'Қаптама және аксессуарлар',
      tag: 'Сегмент: Расходники',
      oppRu: 'Не портятся, но заканчиваются в самый неподходящий момент. Их выгоднее брать редко и крупно — и продукт про это знает.',
      oppKk: 'Бүлінбейді, бірақ ең қолайсыз сәтте бітеді. Оларды сирек әрі көп алған тиімді.',
      metricsRu: 'Заказ раз в две недели вместо еженедельного • срок не считается там, где его нет',
      metricsKk: 'Апта сайын емес, екі аптада бір тапсырыс • мерзімі жоқ жерде ол есептелмейді',
      route: '/solutions/packaging',
    },
    {
      id: 'chain',
      icon: Store,
      titleRu: 'Сеть цветочных (2-5 точек)',
      titleKk: 'Гүл дүкендер желісі (2-5 нүкте)',
      tag: 'Сегмент: Сеть',
      oppRu: 'Сначала перемещение излишка между точками, только потом закупка: на соседней точке розы часто уже есть, и они не доживут до завтра там, где не продаются.',
      oppKk: 'Алдымен нүктелер арасында артық қорды ауыстыру, содан кейін ғана сатып алу.',
      metricsRu: '4 из 10 заказов закрыты перемещением • единая витрина по сети',
      metricsKk: '10 тапсырыстың 4-і ауыстырумен жабылды • желі бойынша бірыңғай витрина',
      route: '/solutions/chain',
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
              Профили бизнеса
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
                  {language === 'ru' ? 'Что настраивается сразу:' : 'Бірден бапталатыны:'}
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
              {language === 'ru' ? 'Пороги и категории подставляются по типу бизнеса' : 'Шектер мен санаттар бизнес түріне қарай қойылады'}
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
