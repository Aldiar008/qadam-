'use client';

import React, { useRef, useState } from 'react';
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
} from 'motion/react';
import {
  AlertTriangle,
  BarChart3,
  Eye,
  FileCheck,
  Search,
  ShieldCheck,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { QadamSignal } from '@/components/brand/QadamSignal';
import type { Language } from '@/types';

interface StoryStep {
  id: string;
  icon: LucideIcon;
  tag: string;
  title: Record<Language, string>;
  description: Record<Language, string>;
}

const steps: StoryStep[] = [
  {
    id: 'observe',
    icon: Eye,
    tag: '01. Observe',
    title: {
      ru: 'Система видит данные и изменения',
      kk: 'Жүйе деректерді және өзгерістерді көреді',
    },
    description: {
      ru: 'QADAM агрегирует транзакции, истории визитов и время покупок без участия человека.',
      kk: 'QADAM транзакцияларды, келу тарихын және сатып алу уақытын адамның қатысуынсыз біріктіреді.',
    },
  },
  {
    id: 'detect',
    icon: Search,
    tag: '02. Detect',
    title: {
      ru: 'Находит проблему или возможность',
      kk: 'Мәселені немесе мүмкіндікті табады',
    },
    description: {
      ru: 'Выявляет скрытые паттерны: провал чеков в будни с 15:00 до 18:00 и 64 «спящих» клиента.',
      kk: 'Жасырын үлгілерді анықтайды: жұмыс күндері 15:00-ден 18:00-ге дейінгі чектердің төмендеуі.',
    },
  },
  {
    id: 'compile',
    icon: FileCheck,
    tag: '03. Compile',
    title: {
      ru: 'Собирает безопасный Growth Contract',
      kk: 'Қауіпсіз Growth Contract жинайды',
    },
    description: {
      ru: 'Margin Shield блокирует убыточные скидки 20% и формирует подарок при чеке от 3 500 ₸.',
      kk: 'Margin Shield 20% тиімсіз жеңілдіктерді бұғаттайды және 3 500 ₸ чегіне сыйлық қалыптастырады.',
    },
  },
  {
    id: 'measure',
    icon: BarChart3,
    tag: '04. Measure',
    title: {
      ru: 'Показывает влияние на прибыль',
      kk: 'Пайдаға әсерін көрсетеді',
    },
    description: {
      ru: 'Автоматически сопоставляет отклики клиентов и сэкономленный бюджет в Impact Ledger.',
      kk: 'Impact Ledger-де клиенттердің жауаптарын және үнемделген бюджетті автоматты түрде салыстырады.',
    },
  },
];

function StepCard({
  step,
  index,
  active,
  language,
  onSelect,
}: {
  step: StoryStep;
  index: number;
  active: boolean;
  language: Language;
  onSelect?: (index: number) => void;
}) {
  const Icon = step.icon;
  const className =
    'w-full rounded-3xl border p-6 text-left transition-[background-color,border-color,box-shadow,opacity,transform] duration-300 ' +
    (active
      ? 'border-primary bg-surface opacity-100 shadow-lg lg:scale-[1.015]'
      : 'border-border bg-surface/60 opacity-60 hover:border-primary/30 hover:bg-surface hover:opacity-100');
  const content = (
    <>
      <div className="mb-3 flex items-center gap-3">
        <span
          className={
            'grid size-10 place-items-center rounded-xl transition-colors ' +
            (active ? 'bg-primary text-primary-foreground' : 'bg-surface-muted text-muted-foreground')
          }
        >
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <span className="font-mono text-xs font-bold text-primary">{step.tag}</span>
      </div>
      <h3 className="text-xl font-bold text-foreground">{step.title[language]}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.description[language]}</p>
    </>
  );

  if (!onSelect) {
    return <div className={className}>{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(index)}
      aria-current={active ? 'step' : undefined}
      className={className}
    >
      {content}
    </button>
  );
}

function MockupContent({ step }: { step: number }) {
  if (step === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-2xl border border-accent/20 bg-accent/10 p-4 font-mono text-sm text-accent">
          <span>[STREAM DATA] Active POS Integration</span>
          <span className="inline-flex items-center gap-2 text-xs font-bold">
            <span className="size-2 rounded-full bg-accent" aria-hidden="true" />
            LIVE
          </span>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-2xl border border-border bg-surface-muted p-4">
            <p className="font-mono text-xs text-muted-foreground">Чеки за день</p>
            <p className="font-mono text-2xl font-bold text-foreground">142 шт</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface-muted p-4">
            <p className="font-mono text-xs text-muted-foreground">Средний чек</p>
            <p className="font-mono text-2xl font-bold text-foreground">3 150 ₸</p>
          </div>
        </div>
      </div>
    );
  }

  if (step === 1) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-2xl border border-warning/20 bg-warning/10 p-4 text-sm font-semibold text-foreground">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
          <span>Выявлена возможность: выручка с 15:00 до 18:00 упала на 27%</span>
        </div>
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface-muted p-4">
          <div>
            <p className="font-mono text-xs text-muted-foreground">Целевой сегмент</p>
            <p className="font-bold text-foreground">Спящие постоянники · 64 клиента</p>
          </div>
          <span className="shrink-0 rounded-full bg-warning/10 px-3 py-1 font-mono text-xs font-bold text-warning">
            Score 87
          </span>
        </div>
      </div>
    );
  }

  if (step === 2) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-2xl border border-success/20 bg-success/10 p-4 text-sm font-semibold text-foreground">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <span>Growth Contract сформирован: круассан при чеке от 3 500 ₸</span>
        </div>
        <div className="space-y-3 rounded-2xl border border-border bg-surface-muted p-4 font-mono text-xs text-muted-foreground">
          <div className="flex justify-between gap-4">
            <span>Минимальный чек</span>
            <strong className="text-foreground">3 500 ₸</strong>
          </div>
          <div className="flex justify-between gap-4">
            <span>Маржа до / после</span>
            <strong className="text-foreground">62% → 49.1%</strong>
          </div>
          <div className="flex justify-between gap-4">
            <span>Stop-rule</span>
            <strong className="text-primary">Max 15 купонов</strong>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/10 p-4 text-sm font-semibold text-foreground">
        <TrendingUp className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
        <span>Демонстрационный результат собран в Impact Ledger</span>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl border border-success/20 bg-success/10 p-4">
          <p className="font-mono text-xs text-primary">Simulated incremental revenue</p>
          <p className="font-mono text-2xl font-bold text-primary">+48 700 ₸</p>
        </div>
        <div className="rounded-2xl border border-accent/20 bg-accent/10 p-4">
          <p className="font-mono text-xs text-accent">Simulated ROI</p>
          <p className="font-mono text-2xl font-bold text-accent">168%</p>
        </div>
      </div>
    </div>
  );
}

function AppMockup({
  activeStep,
  onSelect,
  animated = true,
}: {
  activeStep: number;
  onSelect?: (index: number) => void;
  animated?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const content = <MockupContent step={activeStep} />;

  return (
    <div className="relative flex min-h-[420px] flex-col justify-between overflow-hidden rounded-3xl border border-border bg-surface p-6 shadow-2xl sm:p-8">
      <motion.div
        className="absolute inset-x-0 top-0 h-1 origin-left bg-primary"
        animate={{ scaleX: (activeStep + 1) / steps.length }}
        transition={{ duration: reduceMotion ? 0 : 0.28, ease: 'easeOut' }}
      />
      <div className="mb-6 flex items-center justify-between border-b border-border pb-4">
        <div className="flex items-center gap-2">
          <span className="size-3 rounded-full bg-danger/70" />
          <span className="size-3 rounded-full bg-warning/70" />
          <span className="size-3 rounded-full bg-success/70" />
          <span className="ml-2 font-mono text-xs text-muted-foreground">QADAM OS Engine</span>
        </div>
        <QadamSignal size={24} />
      </div>

      <div className="my-auto min-h-[148px]" aria-live="polite">
        {animated && !reduceMotion ? (
          <AnimatePresence initial={false} mode="wait">
            <motion.div
              key={activeStep}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
            >
              {content}
            </motion.div>
          </AnimatePresence>
        ) : (
          content
        )}
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-border pt-6 font-mono text-xs text-muted-foreground">
        <span>Шаг {activeStep + 1} из 4</span>
        <div className="flex gap-2" aria-label="Этапы Growth Loop">
          {steps.map((step, index) => (
            <button
              key={step.id}
              type="button"
              onClick={() => onSelect?.(index)}
              className="grid size-8 place-items-center rounded-full"
              aria-label={'Перейти к этапу ' + (index + 1)}
              aria-current={index === activeStep ? 'step' : undefined}
            >
              <span
                className={
                  'h-1.5 w-6 origin-center rounded-full transition-[transform,background-color] duration-200 ' +
                  (index === activeStep ? 'scale-x-100 bg-primary' : 'scale-x-[0.34] bg-border')
                }
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function HowItWorksSection() {
  const { t, language } = useLanguage();
  const [activeStep, setActiveStep] = useState(0);
  const storyRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: storyRef,
    offset: ['start center', 'end center'],
  });

  useMotionValueEvent(scrollYProgress, 'change', (progress) => {
    setActiveStep((current) => {
      const hysteresis = 0.015;
      const nextStep = Math.min(steps.length - 1, Math.max(0, Math.floor(progress * steps.length)));

      // Keep tiny trackpad/wheel reversals around a boundary from rapidly
      // toggling two scenes and restarting their enter/exit animations.
      if (nextStep > current && progress < (current + 1) / steps.length + hysteresis) return current;
      if (nextStep < current && progress > current / steps.length - hysteresis) return current;
      return nextStep;
    });
  });

  const selectStep = (index: number) => {
    setActiveStep(index);
    document.getElementById('how-step-' + steps[index].id)?.scrollIntoView({
      // Lenis already animates desktop scrolling. Avoid stacking a second
      // native smooth-scroll animation on top of it.
      behavior: document.documentElement.classList.contains('lenis-smooth') ? 'auto' : 'smooth',
      block: 'center',
    });
  };

  return (
    <section id="how-it-works" className="relative bg-background py-24 md:py-36">
      <div className="container mx-auto max-w-7xl px-4 sm:px-6">
        <header className="mb-12 max-w-3xl lg:sticky lg:top-36 lg:z-20 lg:w-[40%] lg:max-w-none lg:bg-background lg:py-4 lg:pr-4">
          <span className="font-mono text-xs font-bold uppercase tracking-widest text-primary">
            {language === 'ru' ? 'Архитектура действия' : 'Әрекет архитектурасы'}
          </span>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-foreground sm:text-5xl">
            {t.howTitle}
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
            {language === 'ru'
              ? 'Прокрутите вниз: каждый этап Growth Loop последовательно меняет интерфейс QADAM.'
              : 'Төмен айналдырыңыз: Growth Loop-тың әр кезеңі QADAM интерфейсін ретімен өзгертеді.'}
          </p>
        </header>

        <div ref={storyRef} className="relative hidden items-start gap-10 lg:grid lg:grid-cols-12">
          <div className="col-span-5">
            {steps.map((step, index) => (
              <div
                id={'how-step-' + step.id}
                key={step.id}
                className="flex min-h-[42vh] items-center"
              >
                <StepCard
                  step={step}
                  index={index}
                  active={activeStep === index}
                  language={language}
                  onSelect={selectStep}
                />
              </div>
            ))}
          </div>

          <div className="sticky top-[19rem] col-span-7 translate-x-3">
            <AppMockup activeStep={activeStep} onSelect={selectStep} />
          </div>
        </div>

        <div className="space-y-16 lg:hidden">
          {steps.map((step, index) => (
            <article key={step.id} className="space-y-5">
              <StepCard
                step={step}
                index={index}
                active
                language={language}
              />
              <AppMockup activeStep={index} animated={false} />
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
