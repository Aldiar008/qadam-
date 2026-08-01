'use client';

import React from 'react';
import { PublicPageTemplate } from '@/components/templates/PublicPageTemplate';
import { QrLoyaltySection } from '@/components/landing/QrLoyaltySection';

export default function BeautySolutionPage() {
  return (
    <PublicPageTemplate
      breadcrumbs={[{ label: 'Для бизнеса', href: '/solutions' }, { label: 'Салоны красоты' }]}
      tag="Solution for Beauty & Spa"
      titleRu="QADAM для салонов красоты и бьюти-студий"
      titleKk="Сұлулық салондары мен бьюти-студияларға арналған QADAM"
      subtitleRu="Заполните горящие окна записи и возвращайте клиентов на повторные процедуры."
      subtitleKk="Бос уақыттарды толтырыңыз және клиенттерді қайта процедураларға қайтарыңыз."
      problemRu="Клиенты забывают записаться на повторную процедуру через 3-4 недели, а мастера простаивают."
      problemKk="Клиенттер 3-4 аптадан кейін қайта процедураға жазылуды ұмытып кетеді."
      solutionRu="QADAM отслеживает цикл визитов каждого гостя и автоматически готовит персональное предложение."
      solutionKk="QADAM әр қонақтың сапарлар циклін бақылайды және жеке ұсынысты автоматты түрде дайындайды."
      featuresRu={[
        'Напоминание о процедуре через 21-30 дней',
        'Персональный купон на уход при записи',
        'Авто-сегментация любимых мастеров',
        'Заполнение провалов в расписании',
      ]}
      featuresKk={[
        '21-30 күннен кейін процедура туралы еске салу',
        'Жазылған кезде күтімге арналған жеке купон',
        'Сүйікті шеберлерді авто-сегменттеу',
        'Кестедегі бос орындарды толтыру',
      ]}
      mockupNode={<QrLoyaltySection />}
      nextFeatureHref="/solutions/retail"
      nextFeatureLabelRu="Решение для Магазинов"
      nextFeatureLabelKk="Дүкендерге арналған шешім"
    />
  );
}
