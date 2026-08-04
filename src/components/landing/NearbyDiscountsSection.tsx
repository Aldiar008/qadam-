'use client';

import React from 'react';
import { motion } from 'motion/react';
import { MapPin, Coffee, Scissors, ShoppingBag, Wrench, Sparkles } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

export function NearbyDiscountsSection() {
  const { t, language } = useLanguage();

  const spots = [
    { nameRu: 'Кофейня "Surf Coffee"', nameKk: '"Surf Coffee" кофеханасы', type: 'Coffee', icon: Coffee, descRu: 'Скидка 15% на капучино до 16:00', descKk: '16:00-ге дейін капучиноға 15% жеңілдік', distance: '120 м' },
    { nameRu: 'Салон "Beauty Lab"', nameKk: '"Beauty Lab" салоны', type: 'Beauty', icon: Scissors, descRu: 'Свободное окно на 17:30 со скидкой 20%', descKk: '17:30-да 20% жеңілдікпен бос уақыт', distance: '250 м' },
    { nameRu: 'Магазин "Local Store"', nameKk: '"Local Store" дүкені', type: 'Retail', icon: ShoppingBag, descRu: 'Подарок к покупке от 5 000 ₸', descKk: '5 000 ₸-ден басталатын сатып алуға сыйлық', distance: '340 м' },
    { nameRu: 'Автосервис "Pro Service"', nameKk: '"Pro Service" автосервисі', type: 'Service', icon: Wrench, descRu: 'Бесплатная диагностика подвески', descKk: 'Аспаны тегін диагностикалау', distance: '500 м' },
  ];

  return (
    <section className="py-24 md:py-36 bg-background relative overflow-hidden">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="max-w-3xl mb-12 space-y-4">
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-mono font-bold">
              <MapPin className="w-3.5 h-3.5" />
              <span>Hyperlocal Module</span>
            </div>
            <span className="px-3 py-1 rounded-full bg-amber-500/10 text-amber-800 font-mono text-xs font-bold border border-amber-500/20">
              {t.nearbyBadge}
            </span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-foreground tracking-tight">
            {language === 'ru' ? 'Скидки рядом' : 'Жақын маңдағы жеңілдіктер'}
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
                    <span>Действует сейчас</span>
                    <MapPin className="w-3.5 h-3.5" />
                  </div>
                </motion.div>
              );
            })}
          </div>

          <div className="relative z-10 pt-6 border-t border-border flex items-center justify-between text-xs font-mono text-muted-foreground">
            <span>Модуль находитя в разработке для этапа v2.0</span>
            <div className="flex items-center gap-1.5 text-primary font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Hyperlocal Engine</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
