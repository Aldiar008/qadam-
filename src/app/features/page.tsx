'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, FileCheck, Clock, TrendingUp, Scale, Split, MessagesSquare, Boxes, Sliders, BarChart3 } from 'lucide-react';
import { PublicPageTemplate } from '@/components/templates/PublicPageTemplate';

export default function FeaturesIndexPage() {
  const featureList = [
    { title: 'Карточка решения', href: '/features/decision-contract', icon: FileCheck, desc: 'Готовое действие вместо таблицы остатков — главная функция' },
    { title: 'Часы до нуля', href: '/features/stockout-clock', icon: Clock, desc: 'Остаток во времени и разрыв до ближайшей поставки' },
    { title: 'Прогноз спроса', href: '/features/local-pulse', icon: TrendingUp, desc: 'История продаж плюс Наурыз, жара и начало учебного года' },
    { title: 'Сравнение поставщиков', href: '/features/supplier-compare', icon: Scale, desc: 'Цена, срок, надёжность, партия и условия в одной оценке' },
    { title: 'Разделение заказа', href: '/features/split-order', icon: Split, desc: 'Срочная часть у быстрого, основная — у выгодного' },
    { title: 'Остатки из чата', href: '/features/messenger-stock', icon: MessagesSquare, desc: 'Сообщение, голос или фото превращаются в остаток' },
    { title: 'Рейтинг поставщиков', href: '/features/community-trust', icon: Boxes, desc: 'Обезличенная статистика поставок всех точек' },
    { title: 'Симулятор сценариев', href: '/features/what-if', icon: Sliders, desc: 'Что будет, если спрос вырастет или поставка опоздает' },
    { title: 'Доказанный эффект', href: '/features/impact-ledger', icon: BarChart3, desc: 'Прогноз, влияние и подтверждённый факт лежат отдельно' },
  ];

  return (
    <PublicPageTemplate
      breadcrumbs={[{ label: 'Возможности' }]}
      tag="Все модули платформы"
      titleRu="Все модули QOR Autopilot"
      titleKk="QOR Autopilot-тың барлық модульдері"
      subtitleRu="Один цикл: остаток → прогноз → риск → решение → заказ → приёмка → рейтинг поставщика. Каждый модуль — шаг этого цикла."
      subtitleKk="Бір цикл: қалдық → болжам → тәуекел → шешім → тапсырыс → қабылдау → жеткізуші рейтингі."
      problemRu="Учёт в тетради и переписке, закупка на глаз и выбор поставщика по одной лишь цене — три места, где малый бизнес теряет деньги на снабжении."
      problemKk="Дәптердегі есеп, көзбен сатып алу және тек баға бойынша жеткізушіні таңдау — шағын бизнес ақша жоғалтатын үш орын."
      solutionRu="Модули не живут по отдельности: остаток питает прогноз, прогноз — риск, риск — решение, а приёмка возвращает факт обратно в рейтинг поставщика."
      solutionKk="Модульдер бөлек өмір сүрмейді: қалдық болжамды, болжам тәуекелді, тәуекел шешімді қоректендіреді."
      featuresRu={[
        'Работает без ERP, кассовой интеграции и склада в тетради',
        'Каждое число раскрывается до формулы, источника и свежести',
        'Демонстрационные данные помечены и не выдаются за факт',
        'Два языка интерфейса: русский и казахский',
      ]}
      featuresKk={[
        'ERP-сіз, касса интеграциясынсыз жұмыс істейді',
        'Әр сан формула, дереккөз және жаңалығына дейін ашылады',
        'Демонстрациялық деректер белгіленген және факт ретінде берілмейді',
        'Интерфейстің екі тілі: орыс және қазақ',
      ]}
      mockupNode={
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {featureList.map((f, i) => {
            const Icon = f.icon;
            return (
              <Link
                key={i}
                href={f.href}
                className="p-6 rounded-3xl bg-surface border border-border space-y-4 hover:border-primary/50 transition-all hover:shadow-lg group"
              >
                <div className="p-3 rounded-2xl bg-primary/10 text-primary w-fit">
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-foreground group-hover:text-primary transition-colors flex items-center justify-between">
                  <span>{f.title}</span>
                  <ArrowRight className="w-4 h-4" />
                </h3>
                <p className="text-sm text-muted-foreground">{f.desc}</p>
              </Link>
            );
          })}
        </div>
      }
      nextFeatureHref="/features/decision-contract"
      nextFeatureLabelRu="Открыть карточку решения"
      nextFeatureLabelKk="Шешім картасын ашу"
    />
  );
}
