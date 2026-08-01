'use client';

import React from 'react';
import { PublicPageTemplate } from '@/components/templates/PublicPageTemplate';
import { AiCampaignsSection } from '@/components/landing/AiCampaignsSection';

export default function AiCampaignsPage() {
  return (
    <PublicPageTemplate
      breadcrumbs={[{ label: 'Возможности', href: '/features' }, { label: 'AI Campaigns' }]}
      tag="AI Campaign Generator"
      titleRu="AI-генератор безопасных маркетинговых кампаний"
      titleKk="Қауіпсіз маркетингтік кампаниялардың AI-генераторы"
      subtitleRu="Подбор лучших механик акции под бизнес-цель: возврат гостей, поднятие чека, заполнение тихих часов."
      subtitleKk="Бизнес мақсатына сәйкес акцияның ең жақсы механикасын таңдау."
      problemRu="Создание акций вручную занимает много времени, а тексты получаются сухими или не привлекательными."
      problemKk="Акцияларды қолмен құру көп уақытты алады, ал мәтіндер тартымсыз болып шығады."
      solutionRu="AI QADAM мгновенно генерирует 3 безопасных варианта с высокой конверсией на двух языках."
      solutionKk="QADAM AI екі тілде жоғары конверсиясы бар 3 қауіпсіз нұсқаны лезде генерациялайды."
      featuresRu={[
        'Интерактивный выбор бизнес-целей',
        'Персонализированные офферы под аудитории',
        'Проверка через фильтр Margin Shield',
        'Генерация текстов на русском и казахском',
      ]}
      featuresKk={[
        'Бизнес мақсаттарын интерактивті таңдау',
        'Аудиторияға арналған жеке офферлер',
        'Margin Shield фильтрі арқылы тексеру',
        'Орыс және қазақ тілдерінде мәтіндерді генерациялау',
      ]}
      mockupNode={<AiCampaignsSection />}
      nextFeatureHref="/features/margin-shield"
      nextFeatureLabelRu="Перейти к Margin Shield"
      nextFeatureLabelKk="Margin Shield өту"
    />
  );
}
