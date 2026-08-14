'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, Play, CheckCircle2 } from 'lucide-react';
import { GlobalHeader } from '@/components/navigation/GlobalHeader';
import { Footer } from '@/components/navigation/Footer';
import { Breadcrumbs } from '@/components/navigation/Breadcrumbs';
import { DemoBadge } from '@/components/common/DemoBadge';
import { useLanguage } from '@/context/LanguageContext';
import { demoLogin } from '@/app/auth/actions';

export default function DemoPage() {
  const { language } = useLanguage();

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between">
      <GlobalHeader />

      <main id="main-content" tabIndex={-1} className="pt-28 pb-20 flex-grow outline-none">
        <div className="container max-w-4xl mx-auto px-4 sm:px-6 space-y-8 text-center">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <Breadcrumbs items={[{ label: 'Демонстрационный режим' }]} />
            <DemoBadge label="Interactive Demo Sandbox" />
          </div>

          <div className="space-y-4">
            <h1 className="text-4xl sm:text-5xl font-extrabold text-foreground tracking-tight">
              {language === 'ru'
                ? 'Демонстрационный стенд QOR Autopilot'
                : 'QOR Autopilot демонстрациялық стенді'}
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto">
              {language === 'ru'
                ? 'Вы переходите в полностью готовый личный кабинет на демонстрационных данных.'
                : 'Сіз демонстрациялық деректердегі толық дайын жеке кабинетке өтесіз.'}
            </p>
          </div>

          <div className="p-8 rounded-3xl bg-surface border border-border text-left space-y-6 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-bold">
                <Play className="w-6 h-6 fill-primary" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-foreground">
                  {language === 'ru' ? 'Тестовое окружение готово' : 'Тестілеу ортасы дайын'}
                </h3>
                <p className="text-xs font-mono text-muted-foreground">Демо-бизнес: кофейня TAMYR, Алматы</p>
              </div>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>Загружены остатки по 64 позициям и история продаж за 28 дней</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>Три карточки решения ждут подтверждения, одна — с разделением заказа</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>Подключены четыре поставщика с историей поставок и рейтингом</span>
              </div>
            </div>

            <div className="pt-4 border-t border-border flex flex-col sm:flex-row items-center gap-4">
              <form action={demoLogin} className="w-full sm:w-auto"><button className="w-full px-8 py-4 rounded-xl bg-primary text-primary-foreground font-bold text-base hover:bg-primary-hover transition-all flex items-center justify-center gap-2 shadow"><span>{language === 'ru' ? 'Войти в Демо-кабинет' : 'Демо-кабинетке кіру'}</span><ArrowRight className="w-5 h-5" /></button></form>

              <Link
                href="/admin"
                className="w-full sm:w-auto px-6 py-4 rounded-xl bg-surface-muted border border-border font-semibold text-sm text-foreground hover:bg-surface transition-all text-center"
              >
                {language === 'ru' ? 'Открыть Admin Console' : 'Admin Console ашу'}
              </Link>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
