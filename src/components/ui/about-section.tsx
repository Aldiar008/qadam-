"use client";

import { TimelineContent } from "@/components/ui/timeline-animation";
import { VerticalCutReveal } from "@/components/ui/vertical-cut-reveal";
import {
  ArrowRight,
  Blocks,
  Languages,
  Layers3,
  MessageSquare,
  Play,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useRef } from "react";
import type { Variants } from "framer-motion";

const quickLinks = [
  { href: "/platform", label: "Платформа", icon: Layers3 },
  { href: "/features", label: "Возможности", icon: Blocks },
  { href: "/demo", label: "Демо", icon: Play },
  { href: "/contact", label: "Контакты", icon: MessageSquare },
];

interface AboutSection3Props {
  headingLevel?: "h1" | "h2";
}

export default function AboutSection3({ headingLevel = "h1" }: AboutSection3Props) {
  const heroRef = useRef<HTMLDivElement>(null);
  const Heading = headingLevel;
  const revealVariants: Variants = {
    visible: (index: number) => ({
      y: 0,
      opacity: 1,
      filter: "blur(0px)",
      transition: { delay: index * 0.05, duration: 0.28, ease: "easeOut" },
    }),
    hidden: { filter: "blur(8px)", y: -14, opacity: 0 },
  };
  const scaleVariants: Variants = {
    visible: (index: number) => ({
      opacity: 1,
      scale: 1,
      filter: "blur(0px)",
      transition: { delay: index * 0.04, duration: 0.36, ease: "easeOut" },
    }),
    hidden: { filter: "blur(8px)", opacity: 0, scale: 0.985 },
  };

  return (
    <section id="about-qor" className="bg-background px-4 py-20 sm:px-6 sm:py-28" ref={heroRef}>
      <div className="mx-auto max-w-6xl">
        <div className="relative">
          <div className="absolute left-4 right-4 top-3 z-10 flex items-center justify-between sm:left-6 sm:right-6 sm:top-5">
            <div className="flex items-center gap-2">
              <Sparkles className="size-5 text-primary" aria-hidden="true" />
              <TimelineContent
                as="span"
                animationNum={0}
                timelineRef={heroRef}
                customVariants={revealVariants}
                className="text-xs font-bold uppercase tracking-[0.18em] text-foreground sm:text-sm"
              >
                Кто мы
              </TimelineContent>
            </div>
            <nav className="flex gap-2" aria-label="Быстрые ссылки">
              {quickLinks.map((item, index) => {
                const Icon = item.icon;
                return (
                  <TimelineContent
                    key={item.href}
                    as="a"
                    animationNum={index + 1}
                    timelineRef={heroRef}
                    customVariants={revealVariants}
                    href={item.href}
                    className="grid size-11 place-items-center rounded-xl border border-border bg-surface text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    <span className="sr-only">{item.label}</span>
                  </TimelineContent>
                );
              })}
            </nav>
          </div>

          <TimelineContent
            as="figure"
            animationNum={5}
            timelineRef={heroRef}
            customVariants={scaleVariants}
            className="relative aspect-[4/3] overflow-hidden bg-surface-muted sm:aspect-[5/2] [clip-path:polygon(3%_0,43%_0,46%_10%,88%_10%,91%_0,97%_0,100%_6%,100%_72%,97%_78%,82%_78%,79%_85%,79%_95%,76%_100%,8%_100%,5%_95%,5%_56%,2%_50%,0_50%,0_13%,3%_8%)]"
          >
            <Image
              src="/images/qadam-local-business.webp"
              alt="Владелец небольшого цветочного магазина за рабочим столом"
              fill
              sizes="(max-width: 640px) 100vw, 1152px"
              className="object-cover object-center"
            />
          </TimelineContent>

          <div className="grid gap-3 border-b border-border py-5 sm:grid-cols-3">
            {[
              { value: "4", label: "этапа цикла снабжения" },
              { value: "RU / KK", label: "языка интерфейса" },
              { value: "1", label: "подтверждение на заказ" },
            ].map((stat, index) => (
              <TimelineContent
                key={stat.label}
                as="div"
                animationNum={index + 6}
                timelineRef={heroRef}
                customVariants={revealVariants}
                className="flex items-baseline gap-3 rounded-2xl bg-surface-muted px-4 py-3"
              >
                <span className="font-mono text-lg font-bold text-primary">{stat.value}</span>
                <span className="text-sm text-muted-foreground">{stat.label}</span>
              </TimelineContent>
            ))}
          </div>
        </div>

        <div className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
          <div className="md:col-span-2">
            <Heading className="mb-8 text-3xl font-semibold leading-[1.08] tracking-tight text-foreground sm:text-5xl md:text-6xl">
              <VerticalCutReveal
                splitBy="words"
                staggerDuration={0.055}
                staggerFrom="first"
                reverse
                transition={{ type: "spring", stiffness: 250, damping: 30, delay: 0.18 }}
              >
                Технология, которая даёт маленькой точке снабжение уровня большой сети.
              </VerticalCutReveal>
            </Heading>

            <TimelineContent
              as="div"
              animationNum={9}
              timelineRef={heroRef}
              customVariants={revealVariants}
              className="grid gap-6 text-base leading-7 text-muted-foreground md:grid-cols-2"
            >
              <p>
                Крупные сети держат цену и наличие не за счёт удачи: у них посчитан расход каждой позиции, известна надёжность каждого поставщика и есть правило перезаказа.
              </p>
              <p>
                QOR собирает то же самое для точки с одним владельцем: остатки, прогноз спроса, сравнение поставщиков и готовый заказ — без ERP и без склада в тетради.
              </p>
            </TimelineContent>
          </div>

          <aside className="md:col-span-1">
            <TimelineContent
              as="div"
              animationNum={10}
              timelineRef={heroRef}
              customVariants={revealVariants}
              className="rounded-[2rem] border border-border bg-surface p-6"
            >
              <div className="flex items-center gap-2 text-primary">
                <ShieldCheck className="size-5" aria-hidden="true" />
                <span className="text-xs font-bold uppercase tracking-[0.16em]">Принцип QOR</span>
              </div>
              <p className="mt-5 text-xl font-semibold leading-8 text-foreground">
                От риска дефицита к готовому заказу за одно подтверждение.
              </p>
              <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
                <Languages className="size-4 text-primary" aria-hidden="true" />
                Создано с учётом локального контекста Казахстана
              </div>
              <Link
                href="/demo"
                className="mt-8 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-hover"
              >
                Посмотреть QOR в действии
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </TimelineContent>
          </aside>
        </div>
      </div>
    </section>
  );
}
