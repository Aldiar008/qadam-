'use client';

import React from 'react';
import { motion } from 'motion/react';
import { Truck, Flower2, Leaf, Package, Boxes, Sparkles } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

/**
 * Общий рейтинг поставщиков.
 *
 * Новая точка не знает, кто из поставщиков срывает сроки, пока не обожжётся
 * сама. Обезличенная статистика поставок всех бизнесов даёт этот сигнал до
 * первого заказа. Публикуется только после порога выборки — иначе три отзыва
 * решали бы судьбу поставщика.
 */
export function NearbyDiscountsSection() {
  const { t, language } = useLanguage();

  const spots = [
    {
      nameRu: 'Ферма «Талгар» · срез',
      nameKk: '«Талғар» фермасы · кесік',
      type: 'Flower',
      icon: Flower2,
      descRu: 'Вовремя и полностью 88% · свежесть на приёмке 6 дней',
      descKk: 'Уақытында әрі толық 88% · қабылдаудағы сергектігі 6 күн',
      distance: '214 поставок из 34 магазинов',
    },
    {
      nameRu: 'База «Барыс» · опт',
      nameKk: '«Барыс» базасы · көтерме',
      type: 'Flower',
      icon: Truck,
      descRu: 'Вовремя и полностью 96% · срывов за квартал не было',
      descKk: 'Уақытында әрі толық 96% · тоқсанда бұзылу болмаған',
      distance: '167 поставок из 21 магазина',
    },
    {
      nameRu: 'Green Line · зелень',
      nameKk: 'Green Line · көгал',
      type: 'Greenery',
      icon: Leaf,
      descRu: 'Вовремя и полностью 71% · чаще всего недовоз по объёму',
      descKk: 'Уақытында әрі толық 71% · көбіне көлемі жетпейді',
      distance: '92 поставки из 14 магазинов',
    },
    {
      nameRu: 'Флора Пак · упаковка',
      nameKk: 'Флора Пак · қаптама',
      type: 'Packaging',
      icon: Package,
      descRu: 'Недостаточно данных: нужно 20 поставок от 10 разных магазинов',
      descKk: 'Дерек жеткіліксіз: 10 дүкеннен 20 жеткізілім қажет',
      distance: '6 поставок из 3 магазинов',
    },
  ];

  return (
    <section className="py-24 md:py-36 bg-background relative overflow-hidden">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="max-w-3xl mb-12 space-y-4">
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-mono font-bold">
              <Boxes className="w-3.5 h-3.5" />
              <span>Community Supplier Trust</span>
            </div>
            <span className="px-3 py-1 rounded-full bg-amber-500/10 text-amber-800 font-mono text-xs font-bold border border-amber-500/20">
              {t.nearbyBadge}
            </span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-foreground tracking-tight">
            {language === 'ru' ? 'Рейтинг поставщиков по факту' : 'Жеткізушілер рейтингі — факт бойынша'}
          </h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            {t.nearbySub}
          </p>
        </div>

        {/* Abstract Map Grid */}
        <div className="bg-surface rounded-3xl md:rounded-[40px] border border-border p-6 sm:p-10 shadow-xl relative min-h-[420px] flex flex-col justify-between overflow-hidden">
          {/* Background Grid Pattern */}
          <div className="absolute inset-0 opacity-15 pointer-events-none bg-[radial-gradient(#0D9488_1px,transparent_1px)] [background-size:24px_24px]" />

          <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 my-auto">
            {spots.map((s, i) => {
              const Icon = s.icon;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 15 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.1 }}
                  className="p-6 rounded-2xl bg-surface-muted border border-border space-y-4 shadow-sm hover:shadow-md transition-all hover:border-primary/40"
                >
                  <div className="flex items-center justify-between">
                    <div className="p-3 rounded-xl bg-primary/10 text-primary">
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-mono text-muted-foreground">{s.distance}</span>
                  </div>

                  <div className="space-y-1">
                    <h3 className="font-bold text-foreground text-base">
                      {language === 'ru' ? s.nameRu : s.nameKk}
                    </h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {language === 'ru' ? s.descRu : s.descKk}
                    </p>
                  </div>

                  <div className="pt-2 flex items-center justify-between text-xs font-mono text-primary font-bold">
                    <span>Скользящее окно 90 дней</span>
                    <Truck className="w-3.5 h-3.5" />
                  </div>
                </motion.div>
              );
            })}
          </div>

          <div className="relative z-10 pt-6 border-t border-border flex items-center justify-between text-xs font-mono text-muted-foreground">
            <span>Агрегат по синтетическим бизнесам · ни один арендатор не раскрывается</span>
            <div className="flex items-center gap-1.5 text-primary font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Trust Graph</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
