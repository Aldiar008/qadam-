'use client';

import React from 'react';
import Link from 'next/link';
import { Check, Sparkles, ArrowRight } from 'lucide-react';
import { GlobalHeader } from '@/components/navigation/GlobalHeader';
import { Footer } from '@/components/navigation/Footer';
import { Breadcrumbs } from '@/components/navigation/Breadcrumbs';
import { DemoBadge } from '@/components/common/DemoBadge';
import { useLanguage } from '@/context/LanguageContext';

export default function PricingPage() {
  const { language } = useLanguage();

  const plans = [
    {
      nameRu: 'Старт (1 точка)',
      nameKk: 'Бастау (1 нүкте)',
      priceRu: '29 000 ₸',
      priceKk: '29 000 ₸',
      periodRu: '/ месяц',
      periodKk: '/ ай',
      descRu: 'Для одиночных кофеен, салонов красоты и локальных точек.',
      descKk: 'Жеке кофеханалар, сұлулық салондары мен жергілікті нүктелер үшін.',
      featuresRu: [
        'До 500 клиентов в базе',
        'Модуль «Сегодня» и 1 сигнал в день',
        'Margin Shield фильтр акций',
        'QR-лояльность и Mini-CRM',
        'Поддержка RU / KK контента',
      ],
      featuresKk: [
        'Базада 500-ге дейін клиент',
        '«Бүгін» модулі және күніне 1 сигнал',
        'Margin Shield акция сүзгісі',
        'QR-лоялдылық және Mini-CRM',
        'RU / KK контентін қолдау',
      ],
      popular: false,
      ctaRu: 'Начать 14 дней бесплатно',
      ctaKk: '14 күн тегін бастау',
    },
    {
      nameRu: 'Рост (Growth OS)',
      nameKk: 'Өсу (Growth OS)',
      priceRu: '59 000 ₸',
      priceKk: '59 000 ₸',
      periodRu: '/ месяц',
      periodKk: '/ ай',
      descRu: 'Для растущего бизнеса с активной базой гостей.',
      descKk: 'Белсенді қонақтар базасы бар өсіп келе жатқан бизнес үшін.',
      featuresRu: [
        'Неограниченная база клиентов',
        'Безлимитный генератор Growth Contract',
        'Multilingual Content Studio',
        'Impact Ledger расширенная аналитика',
        'Приоритетный доступ к модулю «Скидки рядом»',
      ],
      featuresKk: [
        'Шексіз клиенттер базасы',
        'Шексіз Growth Contract генераторы',
        'Multilingual Content Studio',
        'Impact Ledger кеңейтілген аналитикасы',
        '«Жақын маңдағы жеңілдіктер» модуліне басымдықты қолжетімділік',
      ],
      popular: true,
      ctaRu: 'Выбрать тариф Рост',
      ctaKk: 'Өсу тарифін таңдау',
    },
    {
      nameRu: 'Сеть (Multi-location)',
      nameKk: 'Желі (Multi-location)',
      priceRu: '99 000 ₸',
      priceKk: '99 000 ₸',
      periodRu: '/ месяц',
      periodKk: '/ ай',
      descRu: 'Для сетей из 2-5 филиалов и франшиз.',
      descKk: '2-5 филиалдан және франшизалардан тұратын желілер үшін.',
      featuresRu: [
        'До 5 филиалов в едином кабинете',
        'Сравнительная аналитика локаций',
        'Кросс-локационные акции',
        'Персональный менеджер успеха',
        'Индивидуальные интеграции POS',
      ],
      featuresKk: [
        'Бірыңғай кабинетте 5 филиалға дейін',
        'Локациялардың салыстырмалы аналитикасы',
        'Кросс-локациялық акциялар',
        'Жеке табыс менеджері',
        'Индивидуалды POS интеграциялары',
      ],
      popular: false,
      ctaRu: 'Связаться с нами',
      ctaKk: 'Бізбен байланысу',
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between">
      <GlobalHeader />

      <main id="main-content" tabIndex={-1} className="pt-28 pb-20 flex-grow outline-none">
        <div className="container max-w-7xl mx-auto px-4 sm:px-6 space-y-12">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <Breadcrumbs items={[{ label: 'Тарифы' }]} />
            <DemoBadge label="Прозрачное ценообразование" />
          </div>

          <div className="text-center max-w-3xl mx-auto space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-mono font-bold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Investment in Guaranteed Growth</span>
            </div>
            <h1 className="text-4xl sm:text-6xl font-extrabold text-foreground tracking-tight">
              {language === 'ru' ? 'Простые и прозрачные тарифы' : 'Қарапайым және мөлдір тарифтер'}
            </h1>
            <p className="text-lg text-muted-foreground">
              {language === 'ru'
                ? 'Без скрытых комиссий за транзакции. 14 дней тестового периода на все тарифы.'
                : 'Транзакциялар үшін жасырын комиссияларсыз. Барлық тарифтерге 14 күн сынық мерзімі.'}
            </p>
          </div>

          {/* Pricing Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch pt-6">
            {plans.map((p, i) => (
              <div
                key={i}
                className={`rounded-3xl p-8 border flex flex-col justify-between transition-all relative ${
                  p.popular
                    ? 'bg-surface border-primary shadow-2xl ring-2 ring-primary/20 scale-[1.02]'
                    : 'bg-surface/80 border-border shadow-sm hover:border-foreground/20'
                }`}
              >
                {p.popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-primary text-primary-foreground text-xs font-mono font-bold shadow-sm">
                    {language === 'ru' ? 'Выбор большинства' : 'Көпшілік таңдауы'}
                  </div>
                )}

                <div className="space-y-6">
                  <div>
                    <h2 className="text-xl font-bold text-foreground">
                      {language === 'ru' ? p.nameRu : p.nameKk}
                    </h2>
                    <p className="text-xs text-muted-foreground mt-1">
                      {language === 'ru' ? p.descRu : p.descKk}
                    </p>
                  </div>

                  <div className="flex items-baseline gap-1 font-mono">
                    <span className="text-4xl font-extrabold text-foreground">{p.priceRu}</span>
                    <span className="text-sm text-muted-foreground">{p.periodRu}</span>
                  </div>

                  <ul className="space-y-3 pt-4 border-t border-border text-sm">
                    {(language === 'ru' ? p.featuresRu : p.featuresKk).map((f, idx) => (
                      <li key={idx} className="flex items-center gap-2.5">
                        <Check className="w-4 h-4 text-primary shrink-0" />
                        <span className="text-muted-foreground">{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="pt-8">
                  <Link
                    href="/demo"
                    className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                      p.popular
                        ? 'bg-primary text-primary-foreground hover:bg-primary-hover shadow'
                        : 'bg-surface-muted border border-border text-foreground hover:bg-surface'
                    }`}
                  >
                    <span>{language === 'ru' ? p.ctaRu : p.ctaKk}</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
