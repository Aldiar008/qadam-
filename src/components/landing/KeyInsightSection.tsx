'use client';

import React from 'react';
import { motion } from 'motion/react';
import { useLanguage } from '@/context/LanguageContext';

export function KeyInsightSection() {
  const { t } = useLanguage();

  return (
    <section className="py-24 sm:py-36 md:py-48 bg-surface-muted border-y border-border overflow-hidden">
      <div className="container max-w-5xl mx-auto px-4 sm:px-6">
        <div className="space-y-8 text-center md:text-left">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.8 }}
            className="text-3xl sm:text-5xl md:text-6xl font-semibold text-muted-foreground tracking-tight leading-tight"
          >
            {t.keyInsight1}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-3xl sm:text-5xl md:text-6xl font-semibold text-foreground tracking-tight leading-tight"
          >
            {t.keyInsight2}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold text-primary tracking-tight leading-tight pt-4"
          >
            {t.keyInsight3}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
