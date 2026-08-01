'use client';

import React from 'react';
import { PublicPageTemplate } from '@/components/templates/PublicPageTemplate';
import { HeroScene } from '@/components/landing/HeroScene';

export default function TodayFeaturePage() {
  return (
    <PublicPageTemplate
      breadcrumbs={[{ label: 'Возможности', href: '/features' }, { label: 'Сегодня (Today)' }]}
      tag="Growth Signals Hub"
      titleRu="Сегодня — Главное рекомендованное действие на каждый день"
      titleKk="Бүгін — Күн сайынғы басты ұсынылған әрекет"
      subtitleRu="QADAM ежедневно находит ключевой сигнал роста и предлагает готовое безопасное решение."
      subtitleKk="QADAM күн сайын өсудің негізгі сигналын табады және дайын қауіпсіз шешімді ұсынады."
      problemRu="Владельцы бизнеса теряются в бесконечных графиках и не знают, за какую задачу взяться прямо сейчас."
      problemKk="Бизнес иелері шексіз графиктерде адасып, дәл қазір қай тапсырманы қолға аларын білмейді."
      solutionRu="Модуль «Сегодня» фокусирует внимание на 1 наиболее выгодном действии дня с высоким Opportunity Score."
      solutionKk="«Бүгін» модулі назарды жоғары Opportunity Score бар күннің ең тиімді 1 әрекетіне аударады."
      featuresRu={[
        'Growth Opportunity Score от 0 до 100',
        'Автоматический поиск провалов в выручке',
        'Формирование готовой акции за 1 клик',
        'Моментальная оценка готовности аудитории',
      ]}
      featuresKk={[
        '0-ден 100-ге дейінгі Growth Opportunity Score',
        'Түсімдегі төмендеулерді автоматты түрде іздеу',
        '1 басу арқылы дайын акцияны қалыптастыру',
        'Аудиторияның дайындығын лезде бағалау',
      ]}
      mockupNode={<HeroScene />}
      nextFeatureHref="/features/ai-campaigns"
      nextFeatureLabelRu="Перейти к AI-кампаниям"
      nextFeatureLabelKk="AI-кампанияларға өту"
    />
  );
}
