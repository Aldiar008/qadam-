'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, ShieldCheck, QrCode, FileCheck, Sparkles, BarChart3, Sliders } from 'lucide-react';
import { PublicPageTemplate } from '@/components/templates/PublicPageTemplate';

export default function FeaturesIndexPage() {
  const featureList = [
    { title: 'Margin Shield', href: '/features/margin-shield', icon: ShieldCheck, desc: 'Защитник маржи и калькулятор безопасных скидок' },
    { title: 'QR Loyalty & Mini-CRM', href: '/features/qr-loyalty', icon: QrCode, desc: 'Оцифровка гостей на кассе без скачивания приложений' },
    { title: 'Growth Contract', href: '/features/growth-contract', icon: FileCheck, desc: 'Прозрачная сборка проверенных рекомендаций' },
    { title: 'Multilingual Content Studio', href: '/features/content-studio', icon: Sparkles, desc: 'Генерация постов, сообщений и видео на RU / KK' },
    { title: 'Сегодня (Today Hub)', href: '/features/today', icon: Sliders, desc: 'Дашборд сигналов роста с оценкой Opportunity Score' },
    { title: 'Impact Ledger Analytics', href: '/features/analytics', icon: BarChart3, desc: 'Раздельный учет прогнозов и фактической прибыли' },
  ];

  return (
    <PublicPageTemplate
      breadcrumbs={[{ label: 'Возможности' }]}
      tag="Full Feature Directory"
      titleRu="Все модули системы QADAM Growth OS"
      titleKk="QADAM Growth OS жүйесінің барлық модульдері"
      subtitleRu="Исследуйте глубокую архитектуру каждого модуля: от защиты маржи до автоматической сборки договоренностей."
      subtitleKk="Әр модульдің терең архитектурасын зерттеңіз: маржаны қорғаудан бастап келісімдерді автоматты түрде жинауға дейін."
      problemRu="Разрозненные сервисы рассылок, CRM и Excel-таблицы создают хаос и не позволяют оценить реальную прибыль акций."
      problemKk="Бытыраңқы хабарлама жіберу сервистері, CRM және Excel кестелері хаос тудырады және акциялардың нақты пайдасын бағалауға мүмкіндік бермейді."
      solutionRu="Модульная экосистема QADAM объединяет все инструменты роста в единый сквозной процесс."
      solutionKk="QADAM модульдік экожүйесі барлық өсу құралдарын бірыңғай үздіксіз процеске біріктіреді."
      featuresRu={[
        'Полная независимость от тяжелых сторонних CRM',
        'Интерактивные симуляторы перед каждым запуском',
        'Встроенная поддержка двух языков (RU / KK)',
        'Готовая подготовка к backend-интеграции Supabase',
      ]}
      featuresKk={[
        'Ауыр үшінші тарап CRM-дерінен толық тәуелсіздік',
        'Әрбір іске қосу алдындағы интерактивті симуляторлар',
        'Екі тілді кірістірілген қолдау (RU / KK)',
        'Supabase backend интеграциясына дайындық',
      ]}
      mockupNode={
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {featureList.map((f, i) => {
            const Icon = f.icon;
            return (
              <Link
                key={i}
                href={f.href}
                className="p-6 rounded-3xl bg-surface border border-border space-y-4 hover:border-primary/50 transition-all hover:shadow-lg group"
              >
                <div className="p-3 rounded-2xl bg-primary/10 text-primary w-fit">
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-foreground group-hover:text-primary transition-colors flex items-center justify-between">
                  <span>{f.title}</span>
                  <ArrowRight className="w-4 h-4" />
                </h3>
                <p className="text-sm text-muted-foreground">{f.desc}</p>
              </Link>
            );
          })}
        </div>
      }
      nextFeatureHref="/features/margin-shield"
      nextFeatureLabelRu="Открыть Margin Shield"
      nextFeatureLabelKk="Margin Shield ашу"
    />
  );
}
