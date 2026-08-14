'use client';

import React from 'react';
import { PublicPageTemplate } from '@/components/templates/PublicPageTemplate';
import { QadamSignal } from '@/components/brand/QadamSignal';

export default function PlatformPage() {
  return (
    <PublicPageTemplate
      breadcrumbs={[{ label: 'Платформа' }]}
      tag="Автопилот снабжения"
      titleRu="Слой принятия решений поверх простого учёта"
      titleKk="Қарапайым есептің үстіндегі шешім қабылдау қабаты"
      subtitleRu="QOR — не ERP и не маркетплейс поставщиков. Это система, которая превращает остатки, продажи и историю поставок в короткую очередь решений."
      subtitleKk="QOR — ERP да, жеткізушілер маркетплейсі де емес. Бұл қалдықтарды қысқа шешімдер кезегіне айналдыратын жүйе."
      problemRu="Складские системы требуют внедрения, обучения и постоянного ввода данных. Малый бизнес не может себе позволить ни отдельного закупщика, ни трёх месяцев настройки."
      problemKk="Қойма жүйелері енгізуді, оқытуды және деректерді үнемі енгізуді талап етеді."
      solutionRu="QOR берёт на себя расчёт: часы до нуля, точку перезаказа, количество с учётом упаковки и партии, сравнение поставщиков. Владелец принимает решение, а не собирает его вручную."
      solutionKk="QOR есептеуді өз мойнына алады: нөлге дейінгі сағат, қайта тапсырыс нүктесі, қаптаманы ескерген сан."
      featuresRu={[
        'Остатки без ERP: приёмка, расход, списание, перемещение',
        'Прогноз спроса с честной оценкой собственной ошибки',
        'Сравнение поставщиков по пяти параметрам, а не по цене',
        'Приёмка возвращает факт в рейтинг поставщика',
      ]}
      featuresKk={[
        'ERP-сіз қалдықтар: қабылдау, шығыс, есептен шығару, ауыстыру',
        'Өз қатесін адал бағалайтын сұраныс болжамы',
        'Жеткізушілерді бес параметр бойынша салыстыру',
        'Қабылдау фактіні жеткізуші рейтингіне қайтарады',
      ]}
      mockupNode={
        <div className="bg-surface rounded-3xl border border-border p-8 shadow-xl flex items-center justify-between">
          <div className="space-y-2">
            <span className="text-xs font-mono text-primary font-bold">ЦИКЛ СНАБЖЕНИЯ</span>
            <h3 className="text-2xl font-bold text-foreground">Считает → Предупреждает → Решает → Проверяет</h3>
            <p className="text-sm text-muted-foreground">4 этапа автоматического цикла QOR Autopilot</p>
          </div>
          <QadamSignal size={64} />
        </div>
      }
      nextFeatureHref="/features"
      nextFeatureLabelRu="Перейти к функциям"
      nextFeatureLabelKk="Мүмкіндіктерге өту"
    />
  );
}
