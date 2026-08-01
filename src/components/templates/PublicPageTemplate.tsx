'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Sparkles, Database } from 'lucide-react';
import { GlobalHeader } from '@/components/navigation/GlobalHeader';
import { Footer } from '@/components/navigation/Footer';
import { Breadcrumbs, BreadcrumbItem } from '@/components/navigation/Breadcrumbs';
import { DemoBadge } from '@/components/common/DemoBadge';
import { useLanguage } from '@/context/LanguageContext';

interface PublicPageTemplateProps {
  breadcrumbs: BreadcrumbItem[];
  titleRu: string;
  titleKk: string;
  subtitleRu: string;
  subtitleKk: string;
  tag: string;
  problemRu: string;
  problemKk: string;
  solutionRu: string;
  solutionKk: string;
  featuresRu: string[];
  featuresKk: string[];
  mockupNode: React.ReactNode;
  nextFeatureHref?: string;
  nextFeatureLabelRu?: string;
  nextFeatureLabelKk?: string;
}

export function PublicPageTemplate({
  breadcrumbs,
  titleRu,
  titleKk,
  subtitleRu,
  subtitleKk,
  tag,
  problemRu,
  problemKk,
  solutionRu,
  solutionKk,
  featuresRu,
  featuresKk,
  mockupNode,
  nextFeatureHref,
  nextFeatureLabelRu,
  nextFeatureLabelKk,
}: PublicPageTemplateProps) {
  const { language } = useLanguage();

  const title = language === 'ru' ? titleRu : titleKk;
  const subtitle = language === 'ru' ? subtitleRu : subtitleKk;
  const problem = language === 'ru' ? problemRu : problemKk;
  const solution = language === 'ru' ? solutionRu : solutionKk;
  const features = language === 'ru' ? featuresRu : featuresKk;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between">
      <GlobalHeader />

      <main id="main-content" tabIndex={-1} className="pt-28 pb-20 flex-grow outline-none">
        <div className="container max-w-7xl mx-auto px-4 sm:px-6 space-y-12">
          {/* Breadcrumbs & Demo Badge */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
            <Breadcrumbs items={breadcrumbs} />
            <DemoBadge />
          </div>

          {/* Hero Header */}
          <div className="max-w-4xl space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-mono font-bold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{tag}</span>
            </div>

            <h1 className="text-4xl sm:text-6xl font-extrabold text-foreground tracking-tight leading-tight">
              {title}
            </h1>

            <p className="text-lg sm:text-xl text-muted-foreground leading-relaxed max-w-3xl">
              {subtitle}
            </p>
          </div>

          {/* Demonstration Mockup Node */}
          <div className="my-8">{mockupNode}</div>

          {/* 2-Column Problem & Solution Deep Dive */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 my-12">
            <div className="p-8 rounded-3xl bg-rose-500/5 border border-rose-500/15 space-y-4">
              <span className="text-xs font-mono font-bold text-rose-600 uppercase tracking-wider">
                {language === 'ru' ? 'Проблема локального бизнеса' : 'Жергілікті бизнес мәселесі'}
              </span>
              <p className="text-base text-foreground font-medium leading-relaxed">
                {problem}
              </p>
            </div>

            <div className="p-8 rounded-3xl bg-emerald-500/5 border border-emerald-500/15 space-y-4">
              <span className="text-xs font-mono font-bold text-emerald-600 uppercase tracking-wider">
                {language === 'ru' ? 'Решение QADAM' : 'QADAM шешімі'}
              </span>
              <p className="text-base text-foreground font-medium leading-relaxed">
                {solution}
              </p>
            </div>
          </div>

          {/* Feature List Grid */}
          <div className="p-8 sm:p-12 rounded-3xl bg-surface border border-border space-y-8 shadow-sm">
            <h3 className="text-2xl font-bold text-foreground">
              {language === 'ru' ? 'Ключевые возможности модуля' : 'Модульдің негізгі мүмкіндіктері'}
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {features.map((feat, i) => (
                <div key={i} className="flex items-start gap-3 p-4 rounded-2xl bg-surface-muted border border-border">
                  <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm font-semibold text-foreground">{feat}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Backend Readiness Callout */}
          <div className="p-6 rounded-2xl bg-surface-muted border border-border flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono">
            <div className="flex items-center gap-3">
              <Database className="w-5 h-5 text-primary" />
              <div>
                <p className="font-bold text-foreground">Supabase & RLS Architecture Ready</p>
                <p className="text-muted-foreground">Маршруты, состояния и типы подготовлены для прямого подключения PostgreSQL и API.</p>
              </div>
            </div>

            <Link
              href="/demo"
              className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary-hover transition-all shrink-0"
            >
              {language === 'ru' ? 'Тестировать в демо' : 'Демода тестілеу'}
            </Link>
          </div>

          {/* Next Feature Navigation */}
          {nextFeatureHref && (
            <div className="pt-8 border-t border-border flex items-center justify-between">
              <span className="text-xs font-mono text-muted-foreground">Следующая функция:</span>
              <Link
                href={nextFeatureHref}
                className="text-base font-bold text-primary hover:underline flex items-center gap-2"
              >
                <span>{language === 'ru' ? nextFeatureLabelRu : nextFeatureLabelKk}</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
