'use client';

import React from 'react';
import { motion } from 'motion/react';
import { FileCheck, Shield, CheckCircle2, ArrowRight } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

/**
 * Карточка решения — главная функция продукта.
 *
 * Остальные экраны показывают данные; этот показывает готовое действие вместе
 * с доказательствами, на которых оно построено, и с тем, что произойдёт, если
 * ничего не делать. Ниже — поля одной такой карточки целиком: жюри должно
 * увидеть, что за кнопкой «подтвердить» стоит проверяемый расчёт, а не текст
 * от модели.
 */
export function GrowthContractSection() {
  const { t, language } = useLanguage();

  const fields = [
    {
      labelRu: 'Риск',
      labelKk: 'Тәуекел',
      valRu: 'Красная роза закончится через 29 часов',
      valKk: 'Қызыл раушан 29 сағаттан кейін бітеді',
    },
    {
      labelRu: 'Откуда известно',
      labelKk: 'Қайдан белгілі',
      valRu: 'На витрине 70 стеблей · праздничный спрос 58 в день · 28 дней истории продаж',
      valKk: 'Витринада 70 сабақ · мерекелік сұраныс күніне 58 · 28 күндік сатылым тарихы',
    },
    {
      labelRu: 'Учтён повод',
      labelKk: 'Ескерілген себеп',
      valRu: '8 марта через 4 дня · ×1,8 · отраслевой шаблон, одобрен владельцем',
      valKk: '8 наурызға 4 күн · ×1,8 · салалық үлгі, иесі мақұлдаған',
    },
    {
      labelRu: 'Уверенность прогноза',
      labelKk: 'Болжам сенімділігі',
      valRu: '82% · WAPE 12% на скользящем бэктесте',
      valKk: '82% · жылжымалы бэктестте WAPE 12%',
    },
    {
      labelRu: 'Что сделать',
      labelKk: 'Не істеу керек',
      valRu: 'Заказать 160 стеблей: 40 срочно, 120 плановой поставкой',
      valKk: '160 сабаққа тапсырыс: 40 жедел, 120 жоспарлы жеткізіліммен',
    },
    {
      labelRu: 'У кого',
      labelKk: 'Кімнен',
      valRu: 'База «Барыс» — 10 ч, 820 ₸/шт, OTIF 96% · Ферма «Талгар» — 42 ч, 690 ₸/шт, свежесть 6 дн.',
      valKk: '«Барыс» базасы — 10 сағ, 820 ₸/дана, OTIF 96% · «Талғар» фермасы — 42 сағ, 690 ₸/дана, сергектігі 6 күн',
    },
    {
      labelRu: 'Сумма заказа',
      labelKk: 'Тапсырыс сомасы',
      valRu: '32 800 ₸ + 82 800 ₸ = 115 600 ₸',
      valKk: '32 800 ₸ + 82 800 ₸ = 115 600 ₸',
    },
    {
      labelRu: 'Ограничения соблюдены',
      labelKk: 'Шектеулер сақталды',
      valRu: 'Кратность 10 стеблей · минимальная партия 20 · сорт «красная 60 см» подтверждён у обоих',
      valKk: 'Еселігі 10 сабақ · ең аз партия 20 · сұрып «қызыл 60 см» екеуінде де расталған',
    },
    {
      labelRu: 'Альтернатива, которую отклонили',
      labelKk: 'Қабылданбаған балама',
      valRu: 'Всё у «Барыса»: 131 200 ₸ — на 15 600 ₸ дороже. Всё у «Талгара»: дешевле, но 13 часов пустой витрины',
      valKk: 'Барлығы «Барыстан»: 131 200 ₸ — 15 600 ₸ қымбат. Барлығы «Талғардан»: арзан, бірақ 13 сағат бос витрина',
    },
    {
      labelRu: 'Разница со сценарием «всё быстро»',
      labelKk: '«Барлығы жылдам» сценарийімен айырма',
      valRu: '15 600 ₸ — прогноз, а не фактическая экономия',
      valKk: '15 600 ₸ — болжам, нақты үнемдеу емес',
    },
    {
      labelRu: 'Кто подтверждает',
      labelKk: 'Кім растайды',
      valRu: 'Владелец или управляющий · отправка поставщику — отдельным действием',
      valKk: 'Иесі немесе басқарушы · жеткізушіге жіберу — бөлек әрекет',
    },
    {
      labelRu: 'Как проверим',
      labelKk: 'Қалай тексереміз',
      valRu: 'Приёмка сверит факт с заказом и пересчитает рейтинг поставщика',
      valKk: 'Қабылдау фактіні тапсырыспен салыстырып, рейтингті қайта санайды',
    },
  ];

  return (
    <section id="growth-contract" className="py-24 md:py-36 bg-surface border-y border-border overflow-hidden">
      <div className="container max-w-5xl mx-auto px-4 sm:px-6">
        {/* Section Title */}
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-mono font-bold">
            <FileCheck className="w-4 h-4" />
            <span>Split-order Flower Rescue</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-foreground tracking-tight">
            {t.contractTitle}
          </h2>
          <p className="text-lg text-muted-foreground">
            {t.contractSub}
          </p>
        </div>

        {/* Unified Decision Contract Document Frame */}
        <div className="bg-background rounded-3xl md:rounded-[40px] border border-border p-6 sm:p-10 shadow-2xl space-y-8 relative">
          {/* Document Header */}
          <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center font-mono font-bold">
                DC
              </div>
              <div>
                <h3 className="font-bold text-foreground text-lg sm:text-xl">
                  {language === 'ru'
                    ? 'Заказать розы: 40 стеблей срочно + 120 планово'
                    : 'Раушанға тапсырыс: 40 сабақ жедел + 120 жоспарлы'}
                </h3>
                <p className="text-xs font-mono text-muted-foreground">
                  ID: dc-2026-0814-03 • Ждёт подтверждения владельца
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-700 text-xs font-mono font-bold border border-emerald-500/20">
              <Shield className="w-3.5 h-3.5" />
              <span>Данные свежие: 2 мин</span>
            </div>
          </div>

          {/* Sequential Fields Grid */}
          <div className="space-y-4">
            {fields.map((f, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ duration: 0.4, delay: i * 0.05 }}
                className="p-4 rounded-2xl bg-surface border border-border/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm"
              >
                <span className="font-mono text-xs font-bold text-muted-foreground uppercase sm:w-1/3 shrink-0">
                  {language === 'ru' ? f.labelRu : f.labelKk}
                </span>
                <span className="font-medium text-foreground sm:w-2/3 text-left sm:text-right">
                  {language === 'ru' ? f.valRu : f.valKk}
                </span>
              </motion.div>
            ))}
          </div>

          {/* Document Footer */}
          <div className="pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs font-mono text-emerald-700">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Одно подтверждение — и заказ собран</span>
            </div>

            <a
              href="/demo"
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary-hover transition-all flex items-center justify-center gap-2"
            >
              <span>{language === 'ru' ? 'Подтвердить заказ' : 'Тапсырысты растау'}</span>
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
