'use client';

import { CinematicHero } from '@/components/ui/cinematic-landing-hero';
import { useLanguage } from '@/context/LanguageContext';

export function CinematicHeroSection() {
  const { language, t } = useLanguage();
  const isRussian = language === 'ru';

  return (
    <CinematicHero
      tagline1={isRussian ? 'Свежие цветы вовремя.' : 'Гүл уақытында әрі сергек.'}
      tagline2={isRussian ? 'Деньги не в списании.' : 'Ақша қоқысқа кетпейді.'}
      cardHeading={isRussian ? 'Витрина полная. Ведро пустое.' : 'Витрина толы. Шелек бос.'}
      cardDescription={t.heroSubtitle}
      metricLabel={isRussian ? 'Часов до пустой витрины' : 'Бос витринаға дейінгі сағат'}
      ctaHeading={t.finalCtaTitle}
      ctaDescription={t.finalCtaSub}
      primaryCtaLabel={isRussian ? 'Открыть демо-решение' : 'Демо-шешімді ашу'}
      secondaryCtaLabel={isRussian ? 'Сравнить поставщиков' : 'Жеткізушілерді салыстыру'}
      primaryCtaHref="/demo"
      secondaryCtaHref="/signup?intent=compare-suppliers"
    />
  );
}
