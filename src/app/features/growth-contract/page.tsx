'use client';

import React from 'react';
import { PublicPageTemplate } from '@/components/templates/PublicPageTemplate';
import { GrowthContractSection } from '@/components/landing/GrowthContractSection';

export default function GrowthContractPage() {
  return (
    <PublicPageTemplate
      breadcrumbs={[{ label: 'Возможности', href: '/features' }, { label: 'Growth Contract' }]}
      tag="Executable Contract Compiler"
      titleRu="Growth Contract — Прозрачный протокол действия"
      titleKk="Growth Contract — Әрекеттің мөлдір хаттамасы"
      subtitleRu="Автоматическая компиляция сигналов, экономики и условий остановки в единый прозрачный контракт."
      subtitleKk="Сигналдарды, экономиканы және тоқтату шарттарын бірыңғай мөлдір келісімшартқа автоматты түрде жинау."
      problemRu="Идеи акций часто остаются на словах, не имеют четких границ бюджета и способа измерения результата."
      problemKk="Акция идеялары көбінесе сөз жүзінде қалады, бюджеттің нақты шекаралары мен нәтижені өлшеу әдісі болмайды."
      solutionRu="Growth Contract четко фикисирует цель, экономику, канал связи, stop-rule и способ проверки результатов."
      solutionKk="Growth Contract мақсатты, экономиканы, байланыс арнасын, stop-rule және нәтижені тексеру әдісін нақты бекітеді."
      featuresRu={[
        'Строгое описание сигнала и причины',
        'Автоматический контроллер бюджетов Stop-Rule',
        'Прозрачная оценка Confidence Score',
        'Запуск акции за 1 клик подтверждения',
      ]}
      featuresKk={[
        'Сигнал мен себептің қатаң сипаттамасы',
        'Бюджеттердің автоматты контроллері Stop-Rule',
        'Confidence Score мөлдір бағалауы',
        '1 растау арқылы акцияны іске қосу',
      ]}
      mockupNode={<GrowthContractSection />}
      nextFeatureHref="/features/content-studio"
      nextFeatureLabelRu="Перейти к Content Studio"
      nextFeatureLabelKk="Content Studio өту"
    />
  );
}
