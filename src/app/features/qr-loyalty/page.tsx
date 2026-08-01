'use client';

import React from 'react';
import { PublicPageTemplate } from '@/components/templates/PublicPageTemplate';
import { QrLoyaltySection } from '@/components/landing/QrLoyaltySection';

export default function QrLoyaltyPage() {
  return (
    <PublicPageTemplate
      breadcrumbs={[{ label: 'Возможности', href: '/features' }, { label: 'QR Loyalty' }]}
      tag="Consent & Mini-CRM Engine"
      titleRu="QR Loyalty — Оцифровка гостей без скачивания приложений"
      titleKk="QR Loyalty — Қосымшаларсыз қонақтарды сандық жүйеге енгізу"
      subtitleRu="Один QR-код на кассе позволяет сформировать клиентскую базу, узнать постоянников и получить согласие на персональные офферы."
      subtitleKk="Кассадағы бір QR-код клиенттік базаны қалыптастыруға және жеке офферлерге келісім алуға мүмкіндік береді."
      problemRu="Классические приложения лояльности требуют установки, ввода паролей и забываются через 2 дня."
      problemKk="Классикалық лоялдылық қосымшалары орнатуды, құпия сөз енгізуді талап етеді және 2 күннен кейін ұмытылады."
      solutionRu="QR QADAM открывается в браузере за 3 секунды, сохраняет контакт и передает данные в Mini-CRM."
      solutionKk="QADAM QR браузерде 3 секундта ашылады, контактіні сақтайды және деректерді Mini-CRM-ге береді."
      featuresRu={[
        'Сканирование за 3 секунды без установки',
        'Автоматический подсчет LTV и истории визитов',
        'Сегментация на "Спящих", "VIP" и "Новичков"',
        'Подтвержденное согласие на коммуникацию',
      ]}
      featuresKk={[
        'Орнатусыз 3 секундта сканерлеу',
        'LTV мен сапарлар тарихын автоматты есептеу',
        '"Ұйықтаған", "VIP" және "Жаңадан келгендерге" сегменттеу',
        'Байланысқа расталған келісім',
      ]}
      mockupNode={<QrLoyaltySection />}
      nextFeatureHref="/features/growth-contract"
      nextFeatureLabelRu="Перейти к Growth Contract"
      nextFeatureLabelKk="Growth Contract өту"
    />
  );
}
