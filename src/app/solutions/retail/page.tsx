'use client';

import React from 'react';
import { PublicPageTemplate } from '@/components/templates/PublicPageTemplate';
import { AiCampaignsSection } from '@/components/landing/AiCampaignsSection';

export default function RetailSolutionPage() {
  return (
    <PublicPageTemplate
      breadcrumbs={[{ label: 'Для бизнеса', href: '/solutions' }, { label: 'Магазины одежды и ритейл' }]}
      tag="Solution for Retail"
      titleRu="QADAM для магазинов одежды и локального ритейла"
      titleKk="Киім дүкендері мен жергілікті ритейлге арналған QADAM"
      subtitleRu="Поднимайте средний чек и реактивируйте базу при поступлении новых коллекций."
      subtitleKk="Орташа чекті көтеріңіз және жаңа коллекциялар түскенде базаны қайта белсендіріңіз."
      problemRu="Ритейл дает скидки на весь ассортимент, сжигая маржу и привыкая клиентов покупателям только по акциям."
      problemKk="Ритейл маржаны өртеп, клиенттерді тек акциялар арқылы сатып алуға үйретеді."
      solutionRu="Margin Shield фильтрует убыточные скидки и предлагает подарки к чеку от пороговой суммы."
      solutionKk="Margin Shield тиімсіз жеңілдіктерді сүзгілейді және шекті сомадан бастап сыйлықтар ұсынады."
      featuresRu={[
        'Персональный таргетинг по категориям',
        'Офферы на закрытые предпоказы коллекций',
        'Контроль вкладной маржи одежды и аксессуаров',
        'Поддержка промокодов для касс',
      ]}
      featuresKk={[
        'Санаттар бойынша жеке таргетинг',
        'Коллекцияларды жабық алдын ала көрсетуге арналған офферлер',
        'Киім мен аксессуарлардың маржасын бақылау',
        'Кассаларға арналған промокодтарды қолдау',
      ]}
      mockupNode={<AiCampaignsSection />}
      nextFeatureHref="/solutions/service-center"
      nextFeatureLabelRu="Решение для Сервисных центров"
      nextFeatureLabelKk="Сервис орталықтарына арналған шешім"
    />
  );
}
