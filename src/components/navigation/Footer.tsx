'use client';

import React from 'react';
import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';
import { useLanguage } from '@/context/LanguageContext';

export function Footer() {
  const { language, setLanguage } = useLanguage();

  return (
    <footer className="bg-surface border-t border-border pt-16 pb-12 mt-24">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-10 pb-12 border-b border-border">
          {/* Col 1 & 2: Brand Info */}
          <div className="md:col-span-2 space-y-4">
            <Logo size="lg" />
            <p className="text-muted-foreground text-sm max-w-sm leading-relaxed">
              {language === 'ru'
                ? 'Автопилот снабжения для малого офлайн-бизнеса. От риска дефицита к готовому заказу за одно подтверждение.'
                : 'Шағын офлайн-бизнеске арналған жабдықтау автопилоты. Тапшылық тәуекелінен дайын тапсырысқа бір растаумен.'}
            </p>
          </div>

          {/* Col 3: Platform & Features */}
          <div className="space-y-3">
            <h2 className="text-xs font-mono font-bold text-foreground uppercase tracking-wider">
              {language === 'ru' ? 'Платформа' : 'Платформа'}
            </h2>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/platform" className="text-muted-foreground hover:text-foreground transition-colors">
                  {language === 'ru' ? 'Обзор платформы' : 'Платформа шолуы'}
                </Link>
              </li>
              <li>
                <Link href="/features/decision-contract" className="text-muted-foreground hover:text-foreground transition-colors">
                  {language === 'ru' ? 'Карточка решения' : 'Шешім картасы'}
                </Link>
              </li>
              <li>
                <Link href="/features/stockout-clock" className="text-muted-foreground hover:text-foreground transition-colors">
                  {language === 'ru' ? 'Часы до нуля' : 'Нөлге дейінгі сағат'}
                </Link>
              </li>
              <li>
                <Link href="/features/supplier-compare" className="text-muted-foreground hover:text-foreground transition-colors">
                  {language === 'ru' ? 'Сравнение поставщиков' : 'Жеткізушілерді салыстыру'}
                </Link>
              </li>
              <li>
                <Link href="/features/messenger-stock" className="text-muted-foreground hover:text-foreground transition-colors">
                  {language === 'ru' ? 'Остатки из чата' : 'Чаттан қалдықтар'}
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 4: Solutions & Pricing */}
          <div className="space-y-3">
            <h2 className="text-xs font-mono font-bold text-foreground uppercase tracking-wider">
              {language === 'ru' ? 'Решения' : 'Шешімдер'}
            </h2>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/solutions/flower-shop" className="text-muted-foreground hover:text-foreground transition-colors">
                  {language === 'ru' ? 'Цветочный магазин' : 'Гүл дүкені'}
                </Link>
              </li>
              <li>
                <Link href="/solutions/holidays" className="text-muted-foreground hover:text-foreground transition-colors">
                  {language === 'ru' ? 'Подготовка к праздникам' : 'Мерекеге дайындық'}
                </Link>
              </li>
              <li>
                <Link href="/solutions/freshness" className="text-muted-foreground hover:text-foreground transition-colors">
                  {language === 'ru' ? 'Скоропортящийся ассортимент' : 'Тез бүлінетін ассортимент'}
                </Link>
              </li>
              <li>
                <Link href="/solutions/chain" className="text-muted-foreground hover:text-foreground transition-colors">
                  {language === 'ru' ? 'Сеть цветочных' : 'Гүл дүкендер желісі'}
                </Link>
              </li>
              <li>
                <Link href="/pricing" className="text-muted-foreground hover:text-foreground transition-colors">
                  {language === 'ru' ? 'Тарифные планы' : 'Тарифтер'}
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 5: Company & Legal */}
          <div className="space-y-3">
            <h2 className="text-xs font-mono font-bold text-foreground uppercase tracking-wider">
              {language === 'ru' ? 'О компании' : 'Компания'}
            </h2>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/about" className="text-muted-foreground hover:text-foreground transition-colors">
                  {language === 'ru' ? 'О нас' : 'Біз туралы'}
                </Link>
              </li>
              <li>
                <Link href="/contact" className="text-muted-foreground hover:text-foreground transition-colors">
                  {language === 'ru' ? 'Контакты' : 'Байланыс'}
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="text-muted-foreground hover:text-foreground transition-colors">
                  {language === 'ru' ? 'Политика конфиденциальности' : 'Құпиялылық саясаты'}
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-muted-foreground hover:text-foreground transition-colors">
                  {language === 'ru' ? 'Условия использования' : 'Пайдалану шарттары'}
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <p>© 2026 QOR Autopilot. Все права защищены.</p>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-1.5">
              <span>Язык:</span>
              <button
                onClick={() => setLanguage('ru')}
                className={`font-semibold ${language === 'ru' ? 'text-primary' : 'hover:text-foreground'}`}
              >
                Русский
              </button>
              <span>/</span>
              <button
                onClick={() => setLanguage('kk')}
                className={`font-semibold ${language === 'kk' ? 'text-primary' : 'hover:text-foreground'}`}
              >
                Қазақша
              </button>
            </div>

            <Link href="/demo" className="text-primary font-semibold hover:underline">
              {language === 'ru' ? 'Посмотреть демо →' : 'Демоны қарау →'}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
