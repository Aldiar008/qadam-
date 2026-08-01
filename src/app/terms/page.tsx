'use client';

import React from 'react';
import { GlobalHeader } from '@/components/navigation/GlobalHeader';
import { Footer } from '@/components/navigation/Footer';
import { Breadcrumbs } from '@/components/navigation/Breadcrumbs';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between">
      <GlobalHeader />

      <main id="main-content" tabIndex={-1} className="pt-28 pb-20 flex-grow outline-none">
        <div className="container max-w-4xl mx-auto px-4 sm:px-6 space-y-8">
          <Breadcrumbs items={[{ label: 'Условия использования' }]} />

          <div className="space-y-4">
            <h1 className="text-4xl font-extrabold text-foreground">Условия использования QADAM Growth OS</h1>
            <p className="text-xs font-mono text-muted-foreground">Дата последнего обновления: 29 июля 2026 г.</p>
          </div>

          <div className="prose prose-slate max-w-none text-muted-foreground space-y-6 leading-relaxed">
            <p>
              Используя сервис QADAM Growth OS, вы соглашаетесь с настоящими Условиями использования.
            </p>

            <h3 className="text-xl font-bold text-foreground">1. Лицензия и доступ</h3>
            <p>
              QADAM предоставляет вам неисключительную лицензию на использование программного обеспечения для управления ростом и коммуникацией с клиентами.
            </p>

            <h3 className="text-xl font-bold text-foreground">2. Ответственность и симулятор Margin Shield</h3>
            <p>
              Алгоритмы Margin Shield предоставляют прогнозные финансовые модели. Финальное подтверждение каждой маркетинговой акции остается за владельцем бизнеса.
            </p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
