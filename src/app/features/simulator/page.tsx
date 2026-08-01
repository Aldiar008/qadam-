'use client';

import React from 'react';
import { PublicPageTemplate } from '@/components/templates/PublicPageTemplate';
import { MarginShieldSection } from '@/components/landing/MarginShieldSection';

export default function SimulatorPage() {
  return (
    <PublicPageTemplate
      breadcrumbs={[{ label: 'Возможности', href: '/features' }, { label: 'Симулятор прибыли' }]}
      tag="Profit Impact Simulator"
      titleRu="Симулятор прибыли и финансового риска"
      titleKk="Пайда мен қаржылық тәуекел симуляторы"
      subtitleRu="Проверьте любую маркетинговую гипотезу до реальной отправки сообщений клиентам."
      subtitleKk="Клиенттерге нақты хабарлама жібергенге дейін кез келген маркетингтік гипотезаны тексеріңіз."
      problemRu="Предприниматели запускают скидки «на глаз», теряя выручку на постоянных покупателях."
      problemKk="Кәсіпкерлер тұрақты сатып алушылардан түсімді жоғалтып, жеңілдіктерді «көзбен» іске қосады."
      solutionRu="Симулятор QADAM визуализирует движение вкладной маржи и защищает от ошибочных акций."
      solutionKk="QADAM симуляторы маржаның қозғалысын визуализациялайды және қате акциялардан қорғайды."
      featuresRu={[
        'Моделирование поведения при скидках от -5% до -50%',
        'Расчет порога окупаемости (Break-even check)',
        'Оценка риска канибализации',
        'Мгновенная альтернатива Safe Gift Offer',
      ]}
      featuresKk={[
        '-5%-дан -50%-ға дейінгі жеңілдіктердегі мінез-құлықты модельдеу',
        'Өзін-өзі өтеу шегін есептеу (Break-even check)',
        'Канибализация тәуекелін бағалау',
        'Лезде Safe Gift Offer баламасы',
      ]}
      mockupNode={<MarginShieldSection />}
      nextFeatureHref="/features/analytics"
      nextFeatureLabelRu="Перейти к Аналитике"
      nextFeatureLabelKk="Аналитикаға өту"
    />
  );
}
