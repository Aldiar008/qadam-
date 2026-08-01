'use client';

import React from 'react';
import { PublicPageTemplate } from '@/components/templates/PublicPageTemplate';
import { ImpactLedgerSection } from '@/components/landing/ImpactLedgerSection';

export default function AnalyticsFeaturePage() {
  return (
    <PublicPageTemplate
      breadcrumbs={[{ label: 'Возможности', href: '/features' }, { label: 'Impact Ledger Analytics' }]}
      tag="Impact Analytics Engine"
      titleRu="Impact Ledger — Измерение реального финансового результата"
      titleKk="Impact Ledger — Нақты қаржылық нәтижені өлшеу"
      subtitleRu="Прозрачный учет приращенной выручки, маржи и сохраненного бюджета."
      subtitleKk="Қосымша түсімнің, маржаның және үнемделген бюджеттің мөлдір есебі."
      problemRu="Классические отчеты показывают абстрактные «клики» и «показы», но не дают ответа на вопрос о чистой прибыли."
      problemKk="Классикалық есептер абстрактілі «басулар» мен «көрсетілімдерді» көрсетеді, бірақ таза пайда туралы сұраққа жауап бермейді."
      solutionRu="Impact Ledger разделяет Forecast, Demo Result и Verified Fact, точно измеряя приращенный ROI."
      solutionKk="Impact Ledger Forecast, Demo Result және Verified Fact-ті бөліп, қосымша ROI-ді дәл өлшейді."
      featuresRu={[
        'Визуальное разделение типов показателей (Forecast vs Verified)',
        'Подсчет чистой маржи (Incremental Contribution Profit)',
        'Трекинг сэкономленного времени владельца',
        'Выгрузка финансовой отчетности',
      ]}
      featuresKk={[
        'Көрсеткіштер түрлерін визуалды бөлу (Forecast vs Verified)',
        'Таза маржаны есептеу (Incremental Contribution Profit)',
        'Бизнес иесінің үнемделген уақытын бақылау',
        'Қаржылық есептілікті жүктеу',
      ]}
      mockupNode={<ImpactLedgerSection />}
      nextFeatureHref="/nearby"
      nextFeatureLabelRu="Перейти к Скидкам рядом"
      nextFeatureLabelKk="Жақын маңдағы жеңілдіктерге өту"
    />
  );
}
