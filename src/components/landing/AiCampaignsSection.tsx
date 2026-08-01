'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, ArrowRight, Gift, Clock, Tag, CheckCircle2 } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

export function AiCampaignsSection() {
  const { language } = useLanguage();

  const goals = [
    { id: 'winback', nameRu: 'Вернуть клиентов', nameKk: 'Клиенттерді қайтару' },
    { id: 'avg_check', nameRu: 'Повысить средний чек', nameKk: 'Орташа чекті көтеру' },
    { id: 'quiet_hours', nameRu: 'Заполнить тихие часы', nameKk: 'Тыныш сағаттарды толтыру' },
    { id: 'promote', nameRu: 'Продвинуть товар', nameKk: 'Тауарды жылжыту' },
  ];

  const [selectedGoal, setSelectedGoal] = useState('winback');

  const campaignOptions = {
    winback: [
      {
        icon: Gift,
        tag: 'Рекомендация #1',
        titleRu: 'Подарок при чеке от 3 500 ₸',
        titleKk: '3 500 ₸ чек үшін сыйлық',
        descRu: 'Миндальный круассан в подарок для 18 клиентов, не заходивших 30+ дней.',
        descKk: '30+ күн келмеген 18 клиентке миндаль круассаны сыйлыққа.',
        recommended: true,
      },
      {
        icon: Tag,
        tag: 'Вариант #2',
        titleRu: 'Персональный купон на 1 000 ₸',
        titleKk: '1 000 ₸ жеке купон',
        descRu: 'Ограниченный купон со сроком действия 5 дней при заказе сета.',
        descKk: 'Жиынтыққа тапсырыс бергенде 5 күн мерзімі бар шектеулі купон.',
        recommended: false,
      },
      {
        icon: Clock,
        tag: 'Вариант #3',
        titleRu: 'Счастливый час 15:00-18:00',
        titleKk: 'Бақытты сағат 15:00-18:00',
        descRu: 'Второй напиток за 50% в будни для гостей с пониженным чеком.',
        descKk: 'Төмендеген чегі бар қонақтар үшін екінші сусын 50%-ға.',
        recommended: false,
      },
    ],
    avg_check: [
      {
        icon: Gift,
        tag: 'Рекомендация #1',
        titleRu: 'Сет "Десерт + Напиток" за +15% к чеку',
        titleKk: 'Чекке +15% үшін "Десерт + Сусын" жиынтығы',
        descRu: 'Предложение фирменного десерта при сумме в корзине от 2 800 ₸.',
        descKk: 'Себет сомасы 2 800 ₸-ден бастап фирмалық десертті ұсыну.',
        recommended: true,
      },
      {
        icon: Tag,
        tag: 'Вариант #2',
        titleRu: 'Бесплатный топпинг / сироп',
        titleKk: 'Тегін топпинг / сироп',
        descRu: 'Добавление премиум сиропа в подарок при заказе большого объема.',
        descKk: 'Үлкен көлемге тапсырыс бергенде сыйлыққа премиум сироп қосу.',
        recommended: false,
      },
      {
        icon: Clock,
        tag: 'Вариант #3',
        titleRu: 'Бонусные балы х2 на вечерние заказы',
        titleKk: 'Кешкі тапсырыстарға х2 бонус ұпайлары',
        descRu: 'Двойное начисление баллов при покупке от 4 000 ₸ после 18:00.',
        descKk: '18:00-ден кейін 4 000 ₸-ден бастап сатып алғанда екі есе балл жинау.',
        recommended: false,
      },
    ],
    quiet_hours: [
      {
        icon: Clock,
        tag: 'Рекомендация #1',
        titleRu: 'Happy Hours 15:00–18:00',
        titleKk: 'Happy Hours 15:00–18:00',
        descRu: 'Минимальный чек 3 500 ₸ дает бесплатный круассан в тихие часы.',
        descKk: 'Ең төменгі чек 3 500 ₸ тыныш сағаттарда тегін круассан береді.',
        recommended: true,
      },
      {
        icon: Gift,
        tag: 'Вариант #2',
        titleRu: 'Скидка 30% на выпечку после 17:00',
        titleKk: '17:00-ден кейін пісірілген өнімдерге 30% жеңілдік',
        descRu: 'Распродажа дневного выпечного ассортимента для постоянных гостей.',
        descKk: 'Тұрақты қонақтар үшін күндізгі өнімдерді сату.',
        recommended: false,
      },
      {
        icon: Tag,
        tag: 'Вариант #3',
        titleRu: 'Комбо "Рабочий полдень"',
        titleKk: '"Жұмыс түсі" комбосы',
        descRu: 'Сэндвич + Кофе со скидкой 15% с 14:00 до 16:00.',
        descKk: '14:00-ден 16:00-ге дейін 15% жеңілдікпен сэндвич + кофе.',
        recommended: false,
      },
    ],
    promote: [
      {
        icon: Tag,
        tag: 'Рекомендация #1',
        titleRu: 'Презентация нового Мача Латте',
        titleKk: 'Жаңа Мача Латте презентациясы',
        descRu: 'Промокод на дегустационную порцию при любой покупке от 2 000 ₸.',
        descKk: '2 000 ₸-ден басталатын кез келген сатып алуда дегустациялық порцияға промокод.',
        recommended: true,
      },
      {
        icon: Gift,
        tag: 'Вариант #2',
        titleRu: '1+1 на сезонные напитки',
        titleKk: 'Маусымдық сусындарға 1+1',
        descRu: 'При покупке авторского чая второй аналогичный в подарок.',
        descKk: 'Авторлық шай сатып алғанда екінші ұқсас шай сыйлыққа.',
        recommended: false,
      },
      {
        icon: Clock,
        tag: 'Вариант #3',
        titleRu: 'Закрытый предпоказ меню для VIP',
        titleKk: 'VIP үшін мәзірді жабық алдын ала қарау',
        descRu: 'Персональное приглашение для сегмента с максимальным LTV.',
        descKk: 'Максималды LTV бар сегмент үшін жеке шақыру.',
        recommended: false,
      },
    ],
  };

  const currentOptions = campaignOptions[selectedGoal as keyof typeof campaignOptions] || campaignOptions.winback;

  return (
    <section className="py-24 md:py-36 bg-background relative overflow-hidden">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6">
        {/* Section Header */}
        <div className="max-w-3xl mb-12 space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-mono font-bold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI Offer Generator</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-foreground tracking-tight">
            {language === 'ru' ? 'AI-генератор безопасных акций' : 'Қауіпсіз акциялардың AI-генераторы'}
          </h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            {language === 'ru'
              ? 'Выберите цель вашего бизнеса — QADAM моментально сформирует 3 выверенных сценария с подготовленными текстами и просчитанной экономикой.'
              : 'Бизнесіңіздің мақсатын таңдаңыз — QADAM лезде дайындалған мәтіндері бар 3 сценарийді қалыптастырады.'}
          </p>
        </div>

        {/* Goal Selector Buttons */}
        <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto pb-4 mb-8 no-scrollbar">
          {goals.map((g) => {
            const isSelected = selectedGoal === g.id;
            return (
              <button
                key={g.id}
                onClick={() => setSelectedGoal(g.id)}
                className={`px-5 py-3 rounded-2xl text-sm font-bold whitespace-nowrap transition-all border ${
                  isSelected
                    ? 'bg-primary text-primary-foreground border-primary shadow-md'
                    : 'bg-surface text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground'
                }`}
              >
                {language === 'ru' ? g.nameRu : g.nameKk}
              </button>
            );
          })}
        </div>

        {/* Campaign Options Grid */}
        <AnimatePresence mode="wait">
          <motion.div
            key={selectedGoal}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.3 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6"
          >
            {currentOptions.map((opt, i) => {
              const Icon = opt.icon;
              return (
                <div
                  key={i}
                  className={`p-6 sm:p-8 rounded-3xl border transition-all relative flex flex-col justify-between ${
                    opt.recommended
                      ? 'bg-surface border-primary shadow-xl ring-2 ring-primary/20'
                      : 'bg-surface/70 border-border shadow-sm hover:border-foreground/20'
                  }`}
                >
                  {opt.recommended && (
                    <div className="absolute -top-3.5 left-6 px-3 py-1 rounded-full bg-primary text-primary-foreground text-xs font-mono font-bold flex items-center gap-1 shadow-sm">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{language === 'ru' ? 'Выбор QADAM' : 'QADAM таңдауы'}</span>
                    </div>
                  )}

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className={`p-3 rounded-2xl ${opt.recommended ? 'bg-primary/10 text-primary' : 'bg-surface-muted text-muted-foreground'}`}>
                        <Icon className="w-6 h-6" />
                      </div>
                      <span className="text-xs font-mono text-muted-foreground">{opt.tag}</span>
                    </div>

                    <h3 className="text-xl font-bold text-foreground">
                      {language === 'ru' ? opt.titleRu : opt.titleKk}
                    </h3>

                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {language === 'ru' ? opt.descRu : opt.descKk}
                    </p>
                  </div>

                  <div className="pt-6 mt-6 border-t border-border flex items-center justify-between">
                    <span className="text-xs font-mono text-emerald-600 font-bold">
                      Margin Shield OK
                    </span>
                    <button className="text-xs font-bold text-primary hover:underline flex items-center gap-1">
                      <span>{language === 'ru' ? 'Сформировать' : 'Қалыптастыру'}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
