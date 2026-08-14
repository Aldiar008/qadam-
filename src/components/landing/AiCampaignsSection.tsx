'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, ArrowRight, Flower2, Leaf, Package, CheckCircle2 } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

export function AiCampaignsSection() {
  const { language } = useLanguage();

  const events = [
    { id: 'normal', nameRu: 'Обычная неделя', nameKk: 'Кәдімгі апта' },
    { id: 'nauryz', nameRu: '8 марта через 4 дня', nameKk: '8 наурызға 4 күн' },
    { id: 'heat', nameRu: 'Жара +35°', nameKk: 'Ыстық +35°' },
    { id: 'school', nameRu: 'Выпускные', nameKk: 'Бітіру кештері' },
  ];

  const [selectedEvent, setSelectedEvent] = useState('normal');

  // Каждый вариант — позиция с базовым прогнозом, коэффициентом события и
  // рекомендованным количеством. Источник коэффициента подписан на карточке:
  // без события это история продаж, с событием — отраслевой шаблон.
  const forecastOptions = {
    normal: [
      {
        icon: Flower2,
        tag: 'Расход по истории',
        titleRu: 'Роза красная 60 см — 32 стебля в день',
        titleKk: 'Қызыл раушан 60 см — күніне 32 сабақ',
        descRu: 'Базовый прогноз по 28 дням продаж с поправкой на день недели. Пятница и суббота дают половину недельного расхода.',
        descKk: '28 күндік сатылым бойынша базалық болжам, апта күніне түзетумен. Жұма мен сенбі апталық шығыстың жартысын береді.',
        recommended: true,
      },
      {
        icon: Leaf,
        tag: 'Расход по истории',
        titleRu: 'Эвкалипт — 6 пучков в день',
        titleKk: 'Эвкалипт — күніне 6 шоқ',
        descRu: 'Зелень уходит вместе с букетом, а не отдельно: её расход считается от числа собранных букетов.',
        descKk: 'Көгал букетпен бірге кетеді: оның шығысы жиналған букет санынан есептеледі.',
        recommended: false,
      },
      {
        icon: Package,
        tag: 'Расход по истории',
        titleRu: 'Упаковочная бумага — 21 лист в день',
        titleKk: 'Қаптама қағаз — күніне 21 парақ',
        descRu: 'Позиция без срока: выгоднее заказывать раз в две недели крупной партией и не думать о ней.',
        descKk: 'Мерзімі жоқ позиция: екі аптада бір рет ірі партиямен алған тиімді.',
        recommended: false,
      },
    ],
    nauryz: [
      {
        icon: Flower2,
        tag: 'Гипотеза · отраслевой шаблон',
        titleRu: 'Роза красная — 58 стеблей в день (×1,8)',
        titleKk: 'Қызыл раушан — күніне 58 сабақ (×1,8)',
        descRu: 'Главный день года. Коэффициент взят из отраслевого шаблона и помечен гипотезой: он не двигает прогноз, пока владелец его не одобрит.',
        descKk: 'Жылдың басты күні. Коэффициент салалық үлгіден алынған және болжам деп белгіленген.',
        recommended: true,
      },
      {
        icon: Leaf,
        tag: 'Гипотеза · отраслевой шаблон',
        titleRu: 'Эвкалипт — 11 пучков в день (×1,8)',
        titleKk: 'Эвкалипт — күніне 11 шоқ (×1,8)',
        descRu: 'Зелень растёт вместе с розой, но стоит на два дня меньше: заказ разбит на две поставки, чтобы не уйти в списание десятого.',
        descKk: 'Көгал раушанмен бірге өседі, бірақ екі күн аз тұрады: тапсырыс екі жеткізілімге бөлінген.',
        recommended: false,
      },
      {
        icon: Package,
        tag: 'Гипотеза · отраслевой шаблон',
        titleRu: 'Упаковка и лента — ×2,1',
        titleKk: 'Қаптама мен таспа — ×2,1',
        descRu: 'Растёт сильнее цветов: восьмого марта почти каждый стебель уходит в оформленном букете, а не поштучно.',
        descKk: 'Гүлден күштірек өседі: 8 наурызда әр сабақ дерлік безендірілген букетпен кетеді.',
        recommended: false,
      },
    ],
    heat: [
      {
        icon: Flower2,
        tag: 'Гипотеза · погода',
        titleRu: 'Роза красная — срок минус два дня',
        titleKk: 'Қызыл раушан — мерзімі екі күнге қысқа',
        descRu: 'При +35° срез стоит не пять дней, а три. Прогноз спроса не меняется, а вот риск списания вырастает вдвое.',
        descKk: '+35°-та кесік бес күн емес, үш күн тұрады. Сұраныс болжамы өзгермейді, ал есептен шығару қатері екі есе өседі.',
        recommended: true,
      },
      {
        icon: Leaf,
        tag: 'Гипотеза · погода',
        titleRu: 'Эвкалипт — без изменений',
        titleKk: 'Эвкалипт — өзгеріссіз',
        descRu: 'Сухая зелень переносит жару лучше срезанного цветка: ни спрос, ни срок заметно не двигаются.',
        descKk: 'Құрғақ көгал ыстықты кесілген гүлден жақсы көтереді: сұраныс та, мерзім де айтарлықтай өзгермейді.',
        recommended: false,
      },
      {
        icon: Package,
        tag: 'Гипотеза · погода',
        titleRu: 'Заказ роз урезан до двух дней покрытия',
        titleKk: 'Раушан тапсырысы екі күндік жабуға дейін қысқарды',
        descRu: 'Правило «тормоз на списание» режет объём, когда позиция уже под риском увядания. Лучше довезти в четверг, чем выбросить в среду.',
        descKk: '«Есептен шығару тежегіші» ережесі көлемді қысқартады. Сәрсенбіде тастағаннан гөрі бейсенбіде жеткізген жақсы.',
        recommended: false,
      },
    ],
    school: [
      {
        icon: Flower2,
        tag: 'Гипотеза · календарь',
        titleRu: 'Хризантема — ×2,4',
        titleKk: 'Хризантема — ×2,4',
        descRu: 'Выпускные идут волной с конца мая: даты плавают по школам, поэтому окно шире обычного — четыре дня вместо трёх.',
        descKk: 'Бітіру кештері мамырдың соңынан толқынмен жүреді: күндер мектеп бойынша ауысады, сондықтан терезе кеңірек.',
        recommended: true,
      },
      {
        icon: Flower2,
        tag: 'Гипотеза · календарь',
        titleRu: 'Роза красная — ×1,3',
        titleKk: 'Қызыл раушан — ×1,3',
        descRu: 'Растёт слабее хризантемы: на выпускной чаще берут светлые и смешанные букеты, а не монобукет из красных роз.',
        descKk: 'Хризантемадан әлсіз өседі: бітіру кешіне ашық және аралас букет жиірек алынады.',
        recommended: false,
      },
      {
        icon: Package,
        tag: 'Гипотеза · календарь',
        titleRu: 'Упаковка — ×2,4',
        titleKk: 'Қаптама — ×2,4',
        descRu: 'Повторяет цветы: букет без оформления на выпускной почти не берут. Позиция не портится, поэтому заказывается сразу на всю волну.',
        descKk: 'Гүлді қайталайды. Позиция бүлінбейді, сондықтан бірден бүкіл толқынға тапсырыс беріледі.',
        recommended: false,
      },
    ],
  };

  const currentOptions = forecastOptions[selectedEvent as keyof typeof forecastOptions] || forecastOptions.normal;

  return (
    <section className="py-24 md:py-36 bg-background relative overflow-hidden">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6">
        {/* Section Header */}
        <div className="max-w-3xl mb-12 space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-mono font-bold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Local Pulse Forecast</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-foreground tracking-tight">
            {language === 'ru' ? 'Flower Calendar: прогноз, который знает про восьмое марта' : 'Flower Calendar: 8 наурызды білетін болжам'}
          </h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            {language === 'ru'
              ? 'Базовый прогноз строится на истории продаж и дне недели. Поводы — восьмое марта, выпускные, жара — добавляются отдельным коэффициентом с указанием источника и уверенности. Пока владелец не одобрил повод, коэффициент лежит рядом и на прогноз не влияет.'
              : 'Базалық болжам сатылым тарихы мен апта күніне негізделеді. Себептер бөлек коэффициентпен, дереккөзі мен сенімділігі көрсетіліп қосылады. Иесі мақұлдамайынша, коэффициент болжамға әсер етпейді.'}
          </p>
        </div>

        {/* Event Selector Buttons */}
        <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto pb-4 mb-8 no-scrollbar">
          {events.map((g) => {
            const isSelected = selectedEvent === g.id;
            return (
              <button
                key={g.id}
                onClick={() => setSelectedEvent(g.id)}
                className={`px-5 py-3 rounded-2xl text-sm font-bold whitespace-nowrap transition-all border ${
                  isSelected
                    ? 'bg-primary text-primary-foreground border-primary shadow-md'
                    : 'bg-surface text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground'
                }`}
              >
                {language === 'ru' ? g.nameRu : g.nameKk}
              </button>
            );
          })}
        </div>

        {/* Forecast Options Grid */}
        <AnimatePresence mode="wait">
          <motion.div
            key={selectedEvent}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.3 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6"
          >
            {currentOptions.map((opt, i) => {
              const Icon = opt.icon;
              return (
                <div
                  key={i}
                  className={`p-6 sm:p-8 rounded-3xl border transition-all relative flex flex-col justify-between ${
                    opt.recommended
                      ? 'bg-surface border-primary shadow-xl ring-2 ring-primary/20'
                      : 'bg-surface/70 border-border shadow-sm hover:border-foreground/20'
                  }`}
                >
                  {opt.recommended && (
                    <div className="absolute -top-3.5 left-6 px-3 py-1 rounded-full bg-primary text-primary-foreground text-xs font-mono font-bold flex items-center gap-1 shadow-sm">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{language === 'ru' ? 'Главный риск' : 'Басты тәуекел'}</span>
                    </div>
                  )}

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className={`p-3 rounded-2xl ${opt.recommended ? 'bg-primary/10 text-primary' : 'bg-surface-muted text-muted-foreground'}`}>
                        <Icon className="w-6 h-6" />
                      </div>
                      <span className="text-xs font-mono text-muted-foreground">{opt.tag}</span>
                    </div>

                    <h3 className="text-xl font-bold text-foreground">
                      {language === 'ru' ? opt.titleRu : opt.titleKk}
                    </h3>

                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {language === 'ru' ? opt.descRu : opt.descKk}
                    </p>
                  </div>

                  <div className="pt-6 mt-6 border-t border-border flex items-center justify-between">
                    <span className="text-xs font-mono text-emerald-600 font-bold">
                      WAPE 12%
                    </span>
                    <button className="text-xs font-bold text-primary hover:underline flex items-center gap-1">
                      <span>{language === 'ru' ? 'Открыть решение' : 'Шешімді ашу'}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
