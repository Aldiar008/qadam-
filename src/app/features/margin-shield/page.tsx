'use client';

import React from 'react';
import { PublicPageTemplate } from '@/components/templates/PublicPageTemplate';
import { MarginShieldSection } from '@/components/landing/MarginShieldSection';

export default function MarginShieldPage() {
  return (
    <PublicPageTemplate
      breadcrumbs={[{ label: 'Возможности', href: '/features' }, { label: 'Margin Shield' }]}
      tag="Margin Protection Engine"
      titleRu="Margin Shield — Защита от убыточных акций"
      titleKk="Margin Shield — Төмендетілген маржадан қорғау"
      subtitleRu="Симулятор маржинальности, который автоматически блокирует скидки, разрушающие прибыль вашего бизнеса."
      subtitleKk="Бизнесіңіздің пайдасын жоятын жеңілдіктерді автоматты түрде бұғаттайтын маржиналдылық симуляторы."
      problemRu="Без глубокого математического расчета скидка 20% привлекает клиентов, но сжигает вкладную маржу и приводит к прямому убытку."
      problemKk="Терең математикалық есептеусіз 20% жеңілдік клиенттерді тартады, бірақ маржаны өртеп, тікелей шығынға әкеледі."
      solutionRu="Margin Shield рассчитывает пороговый чек, себестоимость подарка и разрешает только акции с положительной приращенной прибылью."
      solutionKk="Margin Shield шекті чекті, сыйлықтың өзіндік құнын есептейді және тек оң қосымша пайдасы бар акцияларға рұқсат береді."
      featuresRu={[
        'Автоматический расчет вкладной маржи до и после',
        'Блокировка акций с канибализацией действующей базы',
        'Формирование целевого минимального чека (Threshold)',
        'Прогноз чистой приращенной прибыли (Incremental Profit)',
      ]}
      featuresKk={[
        'Дейін және кейінгі маржаны автоматты есептеу',
        'Ағымдағы базаны канибализациялайтын акцияларды бұғаттау',
        'Мақсатты ең төменгі чекті қалыптастыру (Threshold)',
        'Таза қосымша пайданы болжау (Incremental Profit)',
      ]}
      mockupNode={<MarginShieldSection />}
      nextFeatureHref="/features/qr-loyalty"
      nextFeatureLabelRu="Перейти к QR Loyalty"
      nextFeatureLabelKk="QR Loyalty өту"
    />
  );
}
