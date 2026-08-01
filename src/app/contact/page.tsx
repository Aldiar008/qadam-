'use client';

import React from 'react';
import { Mail, Phone, MapPin, Send } from 'lucide-react';
import { GlobalHeader } from '@/components/navigation/GlobalHeader';
import { Footer } from '@/components/navigation/Footer';
import { Breadcrumbs } from '@/components/navigation/Breadcrumbs';
import { useLanguage } from '@/context/LanguageContext';

export default function ContactPage() {
  const { language } = useLanguage();

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between">
      <GlobalHeader />

      <main id="main-content" tabIndex={-1} className="pt-28 pb-20 flex-grow outline-none">
        <div className="container max-w-5xl mx-auto px-4 sm:px-6 space-y-12">
          <Breadcrumbs items={[{ label: 'Контакты' }]} />

          <div className="space-y-4 max-w-2xl">
            <span className="text-xs font-mono font-bold text-primary uppercase">Связаться с командой</span>
            <h1 className="text-4xl sm:text-5xl font-extrabold text-foreground tracking-tight">
              {language === 'ru' ? 'Контакты QADAM Growth OS' : 'QADAM Growth OS байланыстары'}
            </h1>
            <p className="text-lg text-muted-foreground">
              {language === 'ru'
                ? 'Мы всегда на связи, чтобы помочь подключить демо или проконсультировать по интеграциям.'
                : 'Демоны қосуға көмектесу немесе интеграциялар бойынша кеңес беру үшін әрқашан байланыстамыз.'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Contact Form */}
            <form className="p-8 rounded-3xl bg-surface border border-border space-y-4 shadow-sm" onSubmit={(e) => e.preventDefault()}>
              <h3 className="text-xl font-bold text-foreground mb-4">
                {language === 'ru' ? 'Написать нам' : 'Бізге жазу'}
              </h3>

              <div className="space-y-1">
                <label className="text-xs font-mono text-muted-foreground">Ваше имя</label>
                <input
                  type="text"
                  placeholder="Ербол"
                  className="w-full px-4 py-3 rounded-xl bg-surface-muted border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-mono text-muted-foreground">Телефон или Email</label>
                <input
                  type="text"
                  placeholder="+7 701 *** ** **"
                  className="w-full px-4 py-3 rounded-xl bg-surface-muted border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-mono text-muted-foreground">Сообщение</label>
                <textarea
                  rows={4}
                  placeholder="Расскажите о вашем бизнесе..."
                  className="w-full px-4 py-3 rounded-xl bg-surface-muted border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary-hover transition-all flex items-center justify-center gap-2 shadow"
              >
                <Send className="w-4 h-4" />
                <span>Отправить сообщение</span>
              </button>
            </form>

            {/* Info Cards */}
            <div className="space-y-6">
              <div className="p-6 rounded-3xl bg-surface border border-border flex items-start gap-4 shadow-xs">
                <div className="p-3 rounded-2xl bg-primary/10 text-primary">
                  <MapPin className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-foreground text-base">Офис в Алматы</h4>
                  <p className="text-sm text-muted-foreground">г. Алматы, пр. Абая 44, Технопарк</p>
                </div>
              </div>

              <div className="p-6 rounded-3xl bg-surface border border-border flex items-start gap-4 shadow-xs">
                <div className="p-3 rounded-2xl bg-primary/10 text-primary">
                  <Mail className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-foreground text-base">Email</h4>
                  <p className="text-sm text-muted-foreground">hello@qadam.app</p>
                </div>
              </div>

              <div className="p-6 rounded-3xl bg-surface border border-border flex items-start gap-4 shadow-xs">
                <div className="p-3 rounded-2xl bg-primary/10 text-primary">
                  <Phone className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-foreground text-base">Телефон поддержки</h4>
                  <p className="text-sm text-muted-foreground">+7 (727) 355-01-99</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
