'use client';

import { CinematicHero } from '@/components/ui/cinematic-landing-hero';
import { useLanguage } from '@/context/LanguageContext';

export function CinematicHeroSection() {
  const { language, t } = useLanguage();
  const isRussian = language === 'ru';

  return (
    <CinematicHero
      tagline1={isRussian ? 'Самое выгодное действие —' : 'Ең тиімді әрекет —'}
      tagline2={isRussian ? 'сегодня.' : 'бүгін.'}
      cardHeading={isRussian ? 'Рост, рассчитанный до деталей.' : 'Әр бөлшегіне дейін есептелген өсім.'}
      cardDescription={t.heroSubtitle}
      metricLabel={isRussian ? 'Потенциал роста' : 'Өсу әлеуеті'}
      ctaHeading={t.finalCtaTitle}
      ctaDescription={t.finalCtaSub}
      primaryCtaLabel={isRussian ? 'Найти клиентов' : 'Клиенттерді табу'}
      secondaryCtaLabel={isRussian ? 'Создать акцию' : 'Акция жасау'}
      primaryCtaHref="/signup?intent=find-customers"
      secondaryCtaHref="/signup?intent=create-campaign"
    />
  );
}
