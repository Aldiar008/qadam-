'use client';

import React from 'react';
import { PublicPageTemplate } from '@/components/templates/PublicPageTemplate';
import { ContentStudioSection } from '@/components/landing/ContentStudioSection';

export default function ContentStudioPage() {
  return (
    <PublicPageTemplate
      breadcrumbs={[{ label: 'Возможности', href: '/features' }, { label: 'Content Studio' }]}
      tag="Multilingual Content Engine"
      titleRu="Multilingual Content Studio — Контент на двух языках"
      titleKk="Multilingual Content Studio — Екі тілдегі контент"
      subtitleRu="Автоматическая генерация постов, рассылок и видеосценариев на естественном русском и казахском языках."
      subtitleKk="Орыс және қазақ тілдерінде посттарды, хабарламаларды автоматты түрде генерациялау."
      problemRu="Перевод маркетинговых текстов вручную занимает время и часто выглядит как буквальная машинная калька."
      problemKk="Маркетингтік мәтіндерді қолмен аудару уақытты алады және көбінесе машиналық аударма сияқты көрінеді."
      solutionRu="Content Studio адаптирует формулировки с учетом особенностей языка и культурного контекста."
      solutionKk="Content Studio тіл мен мәдени контекст ерекшеліктерін ескере отырып, тұжырымдарды бейімдейді."
      featuresRu={[
        'Адаптация под WhatsApp, Instagram, Telegram',
        'Естественные тексты на казахском языке',
        'Сценарии для коротких Reels / TikTok видео',
        'Копирование промокодов и ссылок за 1 клик',
      ]}
      featuresKk={[
        'WhatsApp, Instagram, Telegram үшін бейімдеу',
        'Қазақ тіліндегі табиғи мәтіндер',
        'Қысқа Reels / TikTok видеоларына арналған сценарийлер',
        '1 басу арқылы промокодтар мен сілтемелерді көшіру',
      ]}
      mockupNode={<ContentStudioSection />}
      nextFeatureHref="/features/analytics"
      nextFeatureLabelRu="Перейти к Аналитике"
      nextFeatureLabelKk="Аналитикаға өту"
    />
  );
}
