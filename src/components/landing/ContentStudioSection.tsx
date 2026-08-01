'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, MessageSquare, Instagram, Send, Copy, Check, type LucideIcon } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { mockContentStudioItems } from '@/mock-data/campaigns';

export function ContentStudioSection() {
  const { language, setLanguage } = useLanguage();
  const [activeChannel, setActiveChannel] = useState<'whatsapp' | 'instagram_post' | 'telegram'>('whatsapp');
  const [copied, setCopied] = useState(false);

  const channels: { id: 'whatsapp' | 'instagram_post' | 'telegram'; name: string; icon: LucideIcon }[] = [
    { id: 'whatsapp', name: 'WhatsApp', icon: MessageSquare },
    { id: 'instagram_post', name: 'Instagram', icon: Instagram },
    { id: 'telegram', name: 'Telegram', icon: Send },
  ];

  const currentContent = mockContentStudioItems.find((c) => c.channel === activeChannel) || mockContentStudioItems[0];

  const handleCopy = () => {
    const text = language === 'ru' ? currentContent.textRu : currentContent.textKk;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="py-24 md:py-36 bg-background relative overflow-hidden">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6">
        {/* Section Header */}
        <div className="max-w-3xl mb-12 space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-mono font-bold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Multilingual Content Studio</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-foreground tracking-tight">
            {language === 'ru' ? 'Адаптация оффера под все каналы' : 'Офферды барлық арналарға бейімдеу'}
          </h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            {language === 'ru'
              ? 'Один утвержденный Growth Contract мгновенно превращается в готовые посты, сообщения и видеосценарии на русском и казахском языках.'
              : 'Бір расталған Growth Contract орыс және қазақ тілдеріндегі дайын хабарламаларға лезде айналады.'}
          </p>
        </div>

        {/* Studio Box */}
        <div className="bg-surface rounded-3xl border border-border p-6 sm:p-10 shadow-xl max-w-4xl mx-auto space-y-6">
          {/* Header Controls */}
          <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-border">
            {/* Channel Tabs */}
            <div className="flex items-center gap-2 overflow-x-auto">
              {channels.map((ch) => {
                const Icon = ch.icon;
                const isActive = activeChannel === ch.id;
                return (
                  <button
                    key={ch.id}
                    onClick={() => setActiveChannel(ch.id)}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all ${
                      isActive
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'bg-surface-muted text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{ch.name}</span>
                  </button>
                );
              })}
            </div>

            {/* Language Switcher */}
            <div className="flex items-center gap-1 bg-surface-muted p-1 rounded-full border text-xs font-semibold">
              <button
                onClick={() => setLanguage('ru')}
                className={`px-3 py-1 rounded-full transition-all ${
                  language === 'ru' ? 'bg-surface text-foreground shadow' : 'text-muted-foreground'
                }`}
              >
                RU
              </button>
              <button
                onClick={() => setLanguage('kk')}
                className={`px-3 py-1 rounded-full transition-all ${
                  language === 'kk' ? 'bg-surface text-foreground shadow' : 'text-muted-foreground'
                }`}
              >
                KK
              </button>
            </div>
          </div>

          {/* Active Content Preview */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeChannel + language}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              <div className="p-6 rounded-2xl bg-surface-muted border border-border space-y-4">
                <div className="flex items-center justify-between text-xs font-mono text-muted-foreground">
                  <span>Предпросмотр сообщения</span>
                  {currentContent.promoCode && (
                    <span className="px-2 py-0.5 rounded bg-primary/10 text-primary font-bold">
                      Код: {currentContent.promoCode}
                    </span>
                  )}
                </div>

                <p className="text-base text-foreground font-sans leading-relaxed whitespace-pre-line">
                  {language === 'ru' ? currentContent.textRu : currentContent.textKk}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <button
                  onClick={handleCopy}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-surface-muted transition-all flex items-center justify-center gap-2"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  <span>{copied ? (language === 'ru' ? 'Скопировано!' : 'Көшірілді!') : (language === 'ru' ? 'Скопировать текст' : 'Мәтінді көшіру')}</span>
                </button>

                <a
                  href="/demo"
                  className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary-hover transition-all text-center"
                >
                  {language === 'ru' ? currentContent.ctaTextRu : currentContent.ctaTextKk}
                </a>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
