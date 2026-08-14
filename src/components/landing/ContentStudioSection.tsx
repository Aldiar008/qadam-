'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Scale, Truck, Copy, Check, type LucideIcon } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

/**
 * Сравнение поставщиков: цена — только один из пяти параметров.
 *
 * Табы переключают не каналы, а поставщиков одной и той же позиции. Внизу
 * лежит готовое сообщение для выбранного: решение доводится до отправки, но
 * отправка остаётся отдельным действием владельца.
 */
export function ContentStudioSection() {
  const { language, setLanguage } = useLanguage();
  const [activeSupplier, setActiveSupplier] = useState<'bereke' | 'aisu' | 'dala'>('aisu');
  const [copied, setCopied] = useState(false);

  const suppliers: { id: 'bereke' | 'aisu' | 'dala'; name: string; icon: LucideIcon }[] = [
    { id: 'bereke', name: 'База «Барыс»', icon: Truck },
    { id: 'aisu', name: 'Ферма «Талгар»', icon: Truck },
    { id: 'dala', name: 'Green Line', icon: Truck },
  ];

  const offers = {
    bereke: {
      price: '820 ₸/шт',
      lead: '10 часов',
      otif: '96%',
      sample: '24 поставки',
      moq: 'от 10 стеблей, кратность 10',
      score: '0.81',
      verdictRu: 'Самый быстрый и единственный, кто успевает до пустой витрины. Дороже на 130 ₸ за стебель — берём только срочную часть.',
      verdictKk: 'Ең жылдам және бос витринаға дейін үлгеретін жалғыз. Сабағына 130 ₸ қымбат — тек жедел бөлігін аламыз.',
      messageRu: 'Здравствуйте! TAMYR Flowers, Бостандыкский.\nСрочный заказ на сегодня до 15:00:\n• Роза красная 60 см — 40 стеблей\nСумма: 32 800 ₸. Оплата при получении.',
      messageKk: 'Сәлеметсіз бе! TAMYR Flowers, Бостандық.\nБүгінге 15:00-ге дейінгі жедел тапсырыс:\n• Қызыл раушан 60 см — 40 сабақ\nСома: 32 800 ₸.',
    },
    aisu: {
      price: '690 ₸/шт',
      lead: '42 часа',
      otif: '88%',
      sample: '17 поставок',
      moq: 'от 20 стеблей, кратность 10',
      score: '0.74',
      verdictRu: 'Дешевле и свежее: срез шесть дней против четырёх. Но 42 часа не закрывают разрыв — берём основной объём, не срочный.',
      verdictKk: 'Арзан әрі сергегірек: кесік алты күн, төртеудің орнына. Бірақ 42 сағат алшақтықты жаппайды — негізгі көлемді аламыз.',
      messageRu: 'Здравствуйте! TAMYR Flowers, Бостандыкский.\nЗаказ на 17 августа:\n• Роза красная 60 см — 120 стеблей\nСумма: 82 800 ₸. Оплата по счёту.',
      messageKk: 'Сәлеметсіз бе! TAMYR Flowers, Бостандық.\n17 тамызға тапсырыс:\n• Қызыл раушан 60 см — 120 сабақ\nСома: 82 800 ₸.',
    },
    dala: {
      price: '640 ₸/шт',
      lead: '18 часов',
      otif: 'недостаточно данных',
      sample: '3 поставки',
      moq: 'от 10 стеблей, кратность 10',
      score: '—',
      verdictRu: 'Дешевле всех и везёт быстро, но у него только пятидесятка: сорт не совпадает с нужным. Отклонён по сорту, а не по цене — и это видно в списке.',
      verdictKk: 'Бәрінен арзан әрі жылдам, бірақ онда тек 50 см бар: сұрып сәйкес келмейді. Бағасы емес, сұрыбы бойынша қабылданбады.',
      messageRu: 'Поставщик не прошёл ограничения решения: нужен сорт «красная 60 см», в наличии только 50 см.',
      messageKk: 'Жеткізуші шешім шектеулерінен өтпеді: «қызыл 60 см» сұрыбы қажет, тек 50 см бар.',
    },
  };

  const current = offers[activeSupplier];

  const handleCopy = () => {
    const text = language === 'ru' ? current.messageRu : current.messageKk;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const rows = [
    { labelRu: 'Цена', labelKk: 'Бағасы', value: current.price },
    { labelRu: 'Срок поставки', labelKk: 'Жеткізу мерзімі', value: current.lead },
    { labelRu: 'Вовремя и полностью', labelKk: 'Уақытында әрі толық', value: `${current.otif} · ${current.sample}` },
    { labelRu: 'Партия и упаковка', labelKk: 'Партия мен қаптама', value: current.moq },
    { labelRu: 'Общая оценка', labelKk: 'Жалпы баға', value: current.score },
  ];

  return (
    <section className="py-24 md:py-36 bg-background relative overflow-hidden">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6">
        {/* Section Header */}
        <div className="max-w-3xl mb-12 space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-mono font-bold">
            <Scale className="w-3.5 h-3.5" />
            <span>Supplier Compare</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-foreground tracking-tight">
            {language === 'ru' ? 'Дешевле — не значит выгоднее' : 'Арзан — тиімді дегенді білдірмейді'}
          </h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            {language === 'ru'
              ? 'Поставщики сравниваются по пяти параметрам: цена, срок, доля поставок вовремя и полностью, минимальная партия и условия. Обязательные ограничения отсекают вариант до подсчёта оценки.'
              : 'Жеткізушілер бес параметр бойынша салыстырылады: баға, мерзім, уақытында әрі толық жеткізу үлесі, ең аз партия және шарттар.'}
          </p>
        </div>

        {/* Compare Box */}
        <div className="bg-surface rounded-3xl border border-border p-6 sm:p-10 shadow-xl max-w-4xl mx-auto space-y-6">
          {/* Header Controls */}
          <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-border">
            {/* Supplier Tabs */}
            <div className="flex items-center gap-2 overflow-x-auto">
              {suppliers.map((s) => {
                const Icon = s.icon;
                const isActive = activeSupplier === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => setActiveSupplier(s.id)}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all ${
                      isActive
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'bg-surface-muted text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{s.name}</span>
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

          {/* Active Supplier Preview */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeSupplier + language}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              <div className="p-6 rounded-2xl bg-surface-muted border border-border space-y-4">
                <div className="flex items-center justify-between text-xs font-mono text-muted-foreground">
                  <span>Роза красная 60 см · потребность 160 стеблей</span>
                  <span className="px-2 py-0.5 rounded bg-primary/10 text-primary font-bold">
                    {language === 'ru' ? 'Оценка' : 'Баға'}: {current.score}
                  </span>
                </div>

                <div className="space-y-2">
                  {rows.map((row) => (
                    <div key={row.labelRu} className="flex items-center justify-between gap-4 text-sm">
                      <span className="font-mono text-xs text-muted-foreground">
                        {language === 'ru' ? row.labelRu : row.labelKk}
                      </span>
                      <span className="font-semibold text-foreground text-right">{row.value}</span>
                    </div>
                  ))}
                </div>

                <p className="pt-3 border-t border-border text-base text-foreground font-sans leading-relaxed">
                  {language === 'ru' ? current.verdictRu : current.verdictKk}
                </p>
              </div>

              <div className="p-6 rounded-2xl bg-surface-muted border border-border space-y-3">
                <div className="text-xs font-mono text-muted-foreground">
                  {language === 'ru' ? 'Готовое сообщение поставщику' : 'Жеткізушіге дайын хабарлама'}
                </div>
                <p className="text-sm text-foreground font-sans leading-relaxed whitespace-pre-line">
                  {language === 'ru' ? current.messageRu : current.messageKk}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <button
                  onClick={handleCopy}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-surface-muted transition-all flex items-center justify-center gap-2"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  <span>{copied ? (language === 'ru' ? 'Скопировано!' : 'Көшірілді!') : (language === 'ru' ? 'Скопировать заказ' : 'Тапсырысты көшіру')}</span>
                </button>

                <a
                  href="/demo"
                  className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary-hover transition-all text-center"
                >
                  {language === 'ru' ? 'Выбрать поставщика' : 'Жеткізушіні таңдау'}
                </a>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
