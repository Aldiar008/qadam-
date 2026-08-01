'use client';

import React from 'react';
import { PublicPageTemplate } from '@/components/templates/PublicPageTemplate';
import { GrowthContractSection } from '@/components/landing/GrowthContractSection';

export default function ServiceCenterSolutionPage() {
  return (
    <PublicPageTemplate
      breadcrumbs={[{ label: 'Для бизнеса', href: '/solutions' }, { label: 'Сервисные центры' }]}
      tag="Solution for Service & Repair"
      titleRu="QADAM для автосервисов и ремонтных центров"
      titleKk="Автосервистер мен жөндеу орталықтарына арналған QADAM"
      subtitleRu="Автоматический контроль регламентного обслуживания и повторных обращений."
      subtitleKk="Регламенттік қызмет көрсетуді және қайта хабарласуларды автоматты түрде бақылау."
      problemRu="Клиенты заезжают на сервис разово и забывают про регулярную диагностику и замену расходников."
      problemKk="Клиенттер сервисге бір рет кіріп, тұрақты диагностика мен шығыс материалдарын ауыстыруды ұмытады."
      solutionRu="QADAM строит календарь регулярного сервиса и отправляет точные персональные напоминания."
      solutionKk="QADAM тұрақты сервис күнтізбесін тұрғызады және дәл жеке еске салуларды жібереді."
      featuresRu={[
        'Автоматические ТО-уведомления через 90/180 дней',
        'Проверка истории замен и чеков',
        'Прозрачные контракты на комплексные услуги',
        'Оценка повторного возврата клиентов',
      ]}
      featuresKk={[
        '90/180 күннен кейін автоматты ТҚК хабарландырулары',
        'Ауыстырулар мен чектер тарихын тексеру',
        'Кешенді қызметтерге мөлдір келісімшарттар',
        'Клиенттердің қайта оралуын бағалау',
      ]}
      mockupNode={<GrowthContractSection />}
      nextFeatureHref="/pricing"
      nextFeatureLabelRu="Перейти к Тарифам"
      nextFeatureLabelKk="Тарифтерге өту"
    />
  );
}
