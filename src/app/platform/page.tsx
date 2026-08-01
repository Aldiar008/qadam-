'use client';

import React from 'react';
import { PublicPageTemplate } from '@/components/templates/PublicPageTemplate';
import { QadamSignal } from '@/components/brand/QadamSignal';

export default function PlatformPage() {
  return (
    <PublicPageTemplate
      breadcrumbs={[{ label: 'Платформа' }]}
      tag="AI Growth Operating System"
      titleRu="Единый операционный движок роста для локального бизнеса"
      titleKk="Жергілікті бизнеске арналған бірыңғай өсу операциялық жүйесі"
      subtitleRu="QADAM объединяет транзакции, поведение гостей, алгоритмы защиты маржи и генерацию контента в прозрачный цикл роста."
      subtitleKk="QADAM транзакцияларды, қонақтардың мінез-құлқын, маржаны қорғау алгоритмдерін және контент генерациясын мөлдір өсу цикліне біріктіреді."
      problemRu="Малый бизнес тратит часы на ручную аналитику, запутанные CRM и безуспешный рекламный маркетинг без гарантированного возврата инвестиций."
      problemKk="Шағын бизнес қолмен талдауға, күрделі CRM жүйелеріне және инвистицияның қайтарылуынсыз нәтижесіз жарнамаға сағаттар жұмсайды."
      solutionRu="QADAM полностью автоматизирует цепочку от обнаружения проблемы до подтвержденной прибыли — без необходимости нанимать штатного маркетолога."
      solutionKk="QADAM мәселені анықтаудан бастап расталған пайдаға дейінгі тізбекті штаттағы маркетологты жалдамай-ақ толық автоматтандырады."
      featuresRu={[
        'Автоматический мониторинг чеков и трафика 24/7',
        'Интеллектуальный расчет маржинальности Margin Shield',
        'Сборка прозрачного контракта действия Growth Contract',
        'Мульти-канальный контент-генератор на RU / KK',
      ]}
      featuresKk={[
        'Чектер мен трафикті 24/7 автоматты мониторингтеу',
        'Margin Shield маржиналдылығын интеллектуалды есептеу',
        'Growth Contract әрекетінің мөлдір келісімшартын жинау',
        'RU / KK тілдеріндегі көп арналы контент генераторы',
      ]}
      mockupNode={
        <div className="bg-surface rounded-3xl border border-border p-8 shadow-xl flex items-center justify-between">
          <div className="space-y-2">
            <span className="text-xs font-mono text-primary font-bold">LIVE PLATFORM ENGINE</span>
            <h3 className="text-2xl font-bold text-foreground">Observe → Detect → Compile → Measure</h3>
            <p className="text-sm text-muted-foreground">4 стадии автоматического цикла QADAM Growth OS</p>
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
