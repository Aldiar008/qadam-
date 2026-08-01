'use client';

import React from 'react';
import { PublicPageTemplate } from '@/components/templates/PublicPageTemplate';
import { BusinessSolutionsSection } from '@/components/landing/BusinessSolutionsSection';

export default function SolutionsPage() {
  return (
    <PublicPageTemplate
      breadcrumbs={[{ label: 'Для бизнеса' }]}
      tag="Tailored Growth Strategies"
      titleRu="Решения QADAM под каждый формат бизнеса"
      titleKk="Бизнестің әр форматына арналған QADAM шешімдері"
      subtitleRu="От одиночной кофейни у дома до небольшой сети из 5 филиалов."
      subtitleKk="Үй жанындағы жалғыз кофеханадан бастап 5 филиалдан тұратын шағын желіге дейін."
      problemRu="Универсальные маркетинговые платформы не учитывают специфику офлайн-трафика и тихих часов."
      problemKk="Универсалды маркетингтік платформалар офлайн трафик пен тыныш сағаттардың ерекшеліктерін ескермейді."
      solutionRu="QADAM поставляется с готовыми шаблонами гипотез под кофейни, салоны красоты, магазины и сервисы."
      solutionKk="QADAM кофеханалар, сұлулық салондары, дүкендер мен сервистерге арналған гипотеза үлгілерімен келеді."
      featuresRu={[
        'Специализированные профили для кофейен',
        'Готовые сценарии заполнения записей для бьюти-салонов',
        'Модели реактивации клиентов для ритейла',
        'Автоматические ТО-напоминания для сервисных центров',
      ]}
      featuresKk={[
        'Кофеханаларға арналған мамандандырылған профильдер',
        'Сұлулық салондарына арналған жазбаларды толтыру сценарийлері',
        'Ритейлге арналған клиенттерді қайта белсендіру модельдері',
        'Сервис орталықтары үшін автоматты еске салулар',
      ]}
      mockupNode={<BusinessSolutionsSection />}
      nextFeatureHref="/pricing"
      nextFeatureLabelRu="Перейти к Тарифам"
      nextFeatureLabelKk="Тарифтерге өту"
    />
  );
}
