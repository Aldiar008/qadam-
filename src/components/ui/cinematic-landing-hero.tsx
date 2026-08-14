'use client';

import React, { useEffect, useLayoutEffect, useRef } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Play, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { cn } from '@/lib/utils';

if (typeof window !== 'undefined') gsap.registerPlugin(ScrollTrigger);

const INJECTED_STYLES = `
  .gsap-reveal { visibility: hidden; }
  .film-grain { position: absolute; inset: 0; pointer-events: none; z-index: 50; opacity: .045; mix-blend-mode: overlay; background: url('data:image/svg+xml;utf8,<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"><filter id="noiseFilter"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(%23noiseFilter)"/></svg>'); }
  .cinematic-grid { background-size: 60px 60px; background-image: linear-gradient(to right, color-mix(in srgb, var(--foreground) 5%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--foreground) 5%, transparent) 1px, transparent 1px); mask-image: radial-gradient(ellipse at center, black 0%, transparent 70%); -webkit-mask-image: radial-gradient(ellipse at center, black 0%, transparent 70%); }
  .cinematic-text-3d { color: var(--foreground); text-shadow: 0 10px 30px color-mix(in srgb, var(--foreground) 20%, transparent), 0 2px 4px color-mix(in srgb, var(--foreground) 10%, transparent); }
  .cinematic-text-silver { background: linear-gradient(180deg, var(--foreground) 0%, color-mix(in srgb, var(--foreground) 42%, transparent) 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; transform: translateZ(0); filter: drop-shadow(0 10px 20px color-mix(in srgb, var(--foreground) 15%, transparent)); }
  .cinematic-card-silver { background: linear-gradient(180deg, #fff 0%, #a1a1aa 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; filter: drop-shadow(0 12px 24px rgba(0,0,0,.8)); }
  .cinematic-depth-card { background: linear-gradient(145deg, #103d3a 0%, #071510 48%, #090f1d 100%); box-shadow: 0 40px 100px -20px rgba(0,0,0,.9), 0 20px 40px -20px rgba(0,0,0,.8), inset 0 1px 2px rgba(255,255,255,.18), inset 0 -2px 4px rgba(0,0,0,.8); border: 1px solid rgba(255,255,255,.06); }
  .cinematic-card-sheen { position: absolute; inset: 0; border-radius: inherit; pointer-events: none; z-index: 50; background: radial-gradient(800px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(255,255,255,.08), transparent 40%); mix-blend-mode: screen; }
  .cinematic-phone { background: #111; box-shadow: inset 0 0 0 2px #52525b, inset 0 0 0 7px #000, 0 40px 80px -15px rgba(0,0,0,.9), 0 15px 25px -5px rgba(0,0,0,.7); transform-style: preserve-3d; }
  .cinematic-widget { background: linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.01)); box-shadow: 0 10px 20px rgba(0,0,0,.3), inset 0 1px 1px rgba(255,255,255,.06), inset 0 -1px 1px rgba(0,0,0,.5); border: 1px solid rgba(255,255,255,.04); }
  .cinematic-badge { background: linear-gradient(135deg, rgba(255,255,255,.09), rgba(255,255,255,.02)); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px); box-shadow: 0 0 0 1px rgba(255,255,255,.1), 0 25px 50px -12px rgba(0,0,0,.8), inset 0 1px 1px rgba(255,255,255,.18); }
  .cinematic-button { transition: transform 220ms cubic-bezier(.16,1,.3,1), box-shadow 220ms cubic-bezier(.16,1,.3,1), background-color 220ms ease; }
  .cinematic-button:hover { transform: translateY(-3px); }
  .cinematic-button:active { transform: translateY(1px); }
  .cinematic-progress { transform: rotate(-90deg); transform-origin: center; stroke-dasharray: 402; stroke-dashoffset: 402; stroke-linecap: round; }
  @media (prefers-reduced-motion: reduce) { .gsap-reveal { visibility: visible; } }
  /* The hidden state above exists only to stop a flash of un-animated content
     before GSAP takes over. It must never become the final state: the primary
     conversion CTAs live inside .gsap-reveal, so a browser that will not run
     the animation has to see them. */
  @media (scripting: none) { .gsap-reveal { visibility: visible; } }
  .gsap-reveal-failsafe .gsap-reveal { visibility: visible; }
`;

/** Reveals everything the animation would have revealed. Used when GSAP cannot run. */
function revealWithoutAnimation() {
  document.documentElement.classList.add('gsap-reveal-failsafe');
}

export interface CinematicHeroProps extends React.HTMLAttributes<HTMLElement> {
  brandName?: string;
  tagline1?: string;
  tagline2?: string;
  cardHeading?: string;
  cardDescription?: React.ReactNode;
  metricValue?: number;
  metricLabel?: string;
  ctaHeading?: string;
  ctaDescription?: string;
  primaryCtaLabel?: string;
  secondaryCtaLabel?: string;
  primaryCtaHref?: string;
  secondaryCtaHref?: string;
}

export function CinematicHero({
  brandName = 'QOR',
  tagline1 = 'Товар кончится в четверг.',
  tagline2 = 'Вы узнаете сегодня.',
  cardHeading = 'Свежие цветы вовремя. Деньги не в списании.',
  cardDescription = 'QOR считает часы до пустой витрины и срок каждой партии, сравнивает поставщиков и собирает готовый заказ.',
  metricValue = 18,
  metricLabel = 'Часов до нуля',
  ctaHeading = 'Полка пустеет предсказуемо.',
  ctaDescription = 'Запустите QOR на демонстрационных данных и получите первую карточку решения.',
  primaryCtaLabel = 'Посмотреть демо',
  secondaryCtaLabel = 'Как это работает',
  primaryCtaHref = '/demo',
  secondaryCtaHref = '#how-it-works',
  className,
  ...props
}: CinematicHeroProps) {
  const containerRef = useRef<HTMLElement>(null);
  const mainCardRef = useRef<HTMLDivElement>(null);
  const mockupRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
    if (reduceMotion || coarsePointer) return;

    const handleMouseMove = (event: MouseEvent) => {
      if (window.scrollY > window.innerHeight * 2) return;
      cancelAnimationFrame(requestRef.current);
      requestRef.current = requestAnimationFrame(() => {
        if (!mainCardRef.current || !mockupRef.current) return;
        const rect = mainCardRef.current.getBoundingClientRect();
        mainCardRef.current.style.setProperty('--mouse-x', `${event.clientX - rect.left}px`);
        mainCardRef.current.style.setProperty('--mouse-y', `${event.clientY - rect.top}px`);
        gsap.to(mockupRef.current, { rotationY: (event.clientX / window.innerWidth - 0.5) * 20, rotationX: -(event.clientY / window.innerHeight - 0.5) * 20, ease: 'power3.out', duration: 0.8, overwrite: 'auto' });
      });
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(requestRef.current);
    };
  }, []);

  useLayoutEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isMobile = window.matchMedia('(max-width: 767px)').matches;
    let ctx: ReturnType<typeof gsap.context> | undefined;
    try {
      ctx = gsap.context(() => {
      if (reduceMotion) {
        gsap.set('.hero-text-wrapper', { autoAlpha: 0 });
        gsap.set('.main-card', { autoAlpha: 0 });
        gsap.set('.cta-wrapper', { autoAlpha: 1, scale: 1, filter: 'none' });
        return;
      }

      gsap.set('.text-track', { autoAlpha: 0, y: 60, scale: 0.85, filter: 'blur(20px)', rotationX: -20 });
      gsap.set('.text-days', { autoAlpha: 1, clipPath: 'inset(0 100% 0 0)' });
      // Keep the card just below the fold: the first wheel delta now exposes
      // the green surface instead of leaving a blank background between scenes.
      gsap.set('.main-card', { y: window.innerHeight * 0.92, autoAlpha: 1 });
      gsap.set(['.card-left-text', '.card-right-text', '.mockup-scroll-wrapper', '.floating-badge', '.phone-widget'], { autoAlpha: 0 });
      gsap.set('.cta-wrapper', { autoAlpha: 0, scale: 0.8, filter: 'blur(30px)' });

      gsap.timeline({ delay: 0.2 })
        .to('.text-track', { duration: 1.2, autoAlpha: 1, y: 0, scale: 1, filter: 'blur(0px)', rotationX: 0, ease: 'expo.out' })
        .to('.text-days', { duration: 1, clipPath: 'inset(0 0% 0 0)', ease: 'power4.inOut' }, '-=0.7');

      gsap.timeline({ scrollTrigger: { trigger: containerRef.current, start: 'top top', end: `+=${isMobile ? 4300 : 6500}`, pin: true, scrub: 0.55, anticipatePin: 1, invalidateOnRefresh: true } })
        .to('.main-card', { y: 0, ease: 'power3.out', duration: 0.8 }, 0)
        .to('.hero-text-wrapper', { scale: 1.12, filter: 'blur(14px)', opacity: 0.45, ease: 'power2.inOut', duration: 0.9 }, 0.12)
        .to('.cinematic-grid', { scale: 1.1, filter: 'blur(10px)', opacity: 0.3, ease: 'power2.inOut', duration: 0.9 }, 0.12)
        .to('.main-card', { width: '100%', height: '100%', borderRadius: 0, ease: 'power3.inOut', duration: 1.5 })
        .fromTo('.mockup-scroll-wrapper', { y: 300, z: -500, rotationX: 50, rotationY: -30, autoAlpha: 0, scale: 0.6 }, { y: 0, z: 0, rotationX: 0, rotationY: 0, autoAlpha: 1, scale: 1, ease: 'expo.out', duration: 2.5 }, '-=0.8')
        .fromTo('.phone-widget', { y: 40, autoAlpha: 0, scale: 0.95 }, { y: 0, autoAlpha: 1, scale: 1, stagger: 0.12, ease: 'back.out(1.2)', duration: 1.2 }, '-=1.5')
        .to('.cinematic-progress', { strokeDashoffset: 60, duration: 2, ease: 'power3.inOut' }, '-=1.2')
        .to('.counter-val', { innerHTML: metricValue, snap: { innerHTML: 1 }, duration: 2, ease: 'expo.out' }, '-=2')
        .fromTo('.floating-badge', { y: 100, autoAlpha: 0, scale: 0.7 }, { y: 0, autoAlpha: 1, scale: 1, ease: 'back.out(1.5)', duration: 1.3, stagger: 0.16 }, '-=2')
        .fromTo('.card-left-text', { x: -50, autoAlpha: 0 }, { x: 0, autoAlpha: 1, ease: 'power4.out', duration: 1.3 }, '-=1.4')
        .fromTo('.card-right-text', { x: 50, autoAlpha: 0, scale: 0.8 }, { x: 0, autoAlpha: 1, scale: 1, ease: 'expo.out', duration: 1.3 }, '<')
        .to({}, { duration: 2 })
        .set('.hero-text-wrapper', { autoAlpha: 0 })
        .set('.cta-wrapper', { autoAlpha: 1 })
        .to({}, { duration: 1 })
        .to(['.mockup-scroll-wrapper', '.floating-badge', '.card-left-text', '.card-right-text'], { scale: 0.9, y: -40, z: -200, autoAlpha: 0, ease: 'power3.in', duration: 1.1, stagger: 0.04 })
        .to('.main-card', { width: isMobile ? '92vw' : '85vw', height: isMobile ? '92vh' : '85vh', borderRadius: isMobile ? 32 : 40, ease: 'expo.inOut', duration: 1.6 }, 'pullback')
        .to('.cta-wrapper', { scale: 1, filter: 'blur(0px)', ease: 'expo.inOut', duration: 1.6 }, 'pullback')
        .to('.main-card', { y: -window.innerHeight - 300, ease: 'power3.in', duration: 1.3 });
      }, containerRef);

      ScrollTrigger.refresh();
    } catch {
      // The animation is decoration; the CTAs inside it are not. If GSAP cannot
      // run for any reason, show the content rather than leaving the primary
      // call to action permanently invisible.
      revealWithoutAnimation();
    }
    return () => ctx?.revert();
  }, [metricValue]);

  return (
    <section ref={containerRef} id="overview" data-cinematic-hero data-scroll-reveal="off" className={cn('relative flex h-[100svh] w-full items-center justify-center overflow-hidden bg-background font-sans text-foreground antialiased', className)} style={{ perspective: '1500px' }} {...props}>
      <style dangerouslySetInnerHTML={{ __html: INJECTED_STYLES }} />
      <div className="film-grain" aria-hidden="true" />
      <div className="cinematic-grid pointer-events-none absolute inset-0 z-0 opacity-50" aria-hidden="true" />

      <div className="hero-text-wrapper absolute z-10 flex w-full flex-col items-center justify-center px-4 text-center [transform-style:preserve-3d]">
        <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-surface/80 px-4 py-2 text-xs font-bold text-primary shadow-sm backdrop-blur-xl"><Sparkles className="size-4" aria-hidden="true" /> Автопилот снабжения для малого офлайн-бизнеса</span>
        <h1 className="text-track gsap-reveal cinematic-text-3d mb-2 text-5xl font-bold tracking-tight md:text-7xl lg:text-[6rem]">{tagline1}</h1>
        <span className="text-days gsap-reveal cinematic-text-silver text-5xl font-extrabold tracking-tighter md:text-7xl lg:text-[6rem]">{tagline2}</span>
      </div>

      <div className="cta-wrapper gsap-reveal pointer-events-auto absolute z-10 flex w-full flex-col items-center justify-center px-4 text-center">
        <h2 className="cinematic-text-silver mb-6 text-4xl font-bold tracking-tight md:text-6xl lg:text-7xl">{ctaHeading}</h2>
        <p className="mb-10 max-w-xl text-lg leading-relaxed text-muted-foreground md:text-xl">{ctaDescription}</p>
        <div className="flex w-full max-w-xl flex-col gap-4 sm:flex-row sm:justify-center">
          <Link href={primaryCtaHref} className="cinematic-button inline-flex min-h-12 items-center justify-center gap-3 rounded-2xl bg-primary px-7 py-4 font-bold text-primary-foreground shadow-xl shadow-primary/20 hover:bg-primary-hover">{primaryCtaLabel}<ArrowRight className="size-5" aria-hidden="true" /></Link>
          <Link href={secondaryCtaHref} className="cinematic-button inline-flex min-h-12 items-center justify-center gap-3 rounded-2xl border border-border bg-surface px-7 py-4 font-bold text-foreground shadow-lg hover:bg-surface-muted"><Play className="size-5" aria-hidden="true" />{secondaryCtaLabel}</Link>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center" style={{ perspective: '1500px' }}>
        <div ref={mainCardRef} className="main-card cinematic-depth-card gsap-reveal pointer-events-auto relative flex h-[92vh] w-[92vw] items-center justify-center overflow-hidden rounded-[32px] md:h-[85vh] md:w-[85vw] md:rounded-[40px]">
          <div className="cinematic-card-sheen" aria-hidden="true" />
          <div className="relative z-10 mx-auto flex h-full w-full max-w-7xl flex-col items-center justify-evenly px-4 py-6 lg:grid lg:grid-cols-3 lg:gap-8 lg:px-12 lg:py-0">
            <div className="card-right-text gsap-reveal order-1 flex w-full justify-center lg:order-3 lg:justify-end"><h2 className="cinematic-card-silver text-5xl font-black uppercase tracking-tighter md:text-[6rem] lg:text-[7rem]">{brandName}</h2></div>
            <div className="mockup-scroll-wrapper order-2 flex h-[390px] w-full items-center justify-center lg:h-[600px]" style={{ perspective: '1000px' }}>
              <div className="relative flex h-full w-full scale-[0.66] items-center justify-center md:scale-[0.85] lg:scale-100">
                <div ref={mockupRef} className="cinematic-phone relative flex h-[580px] w-[280px] flex-col rounded-[3rem] will-change-transform [transform-style:preserve-3d]">
                  <div className="absolute inset-[7px] z-10 overflow-hidden rounded-[2.5rem] bg-[#050914] text-white shadow-[inset_0_0_15px_rgba(0,0,0,1)]">
                    <div className="absolute left-1/2 top-[5px] z-50 flex h-7 w-[100px] -translate-x-1/2 items-center justify-end rounded-full bg-black px-3"><div className="size-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,.8)]" /></div>
                    <div className="relative flex h-full w-full flex-col px-5 pb-8 pt-12">
                      <div className="phone-widget mb-8 flex items-center justify-between"><div><span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-emerald-300/60">Сегодня</span><span className="text-xl font-bold">Роза красная 60 см</span></div><div className="grid size-9 place-items-center rounded-full border border-white/10 bg-white/5"><TrendingUp className="size-4 text-emerald-300" /></div></div>
                      <div className="phone-widget relative mx-auto mb-8 flex size-44 items-center justify-center"><svg className="absolute inset-0 size-full" aria-hidden="true"><circle cx="88" cy="88" r="64" fill="none" stroke="rgba(255,255,255,.04)" strokeWidth="12" /><circle className="cinematic-progress" cx="88" cy="88" r="64" fill="none" stroke="#14b8a6" strokeWidth="12" /></svg><div className="z-10 flex flex-col items-center text-center"><span className="counter-val text-4xl font-extrabold tracking-tighter">0</span><span className="mt-1 text-[8px] font-bold uppercase tracking-[.12em] text-emerald-200/50">{metricLabel}</span></div></div>
                      <div className="space-y-3"><div className="phone-widget cinematic-widget flex items-center rounded-2xl p-3"><div className="mr-3 grid size-10 place-items-center rounded-xl border border-emerald-400/20 bg-emerald-500/10"><Check className="size-4 text-emerald-300" /></div><div><p className="text-xs font-bold">Ферма везёт 42 часа</p><p className="mt-1 text-[9px] text-white/40">Разрыв 13 часов</p></div></div><div className="phone-widget cinematic-widget flex items-center rounded-2xl p-3"><div className="mr-3 grid size-10 place-items-center rounded-xl border border-blue-400/20 bg-blue-500/10"><Sparkles className="size-4 text-blue-300" /></div><div><p className="text-xs font-bold">Заказ собран: 160 стеблей</p><p className="mt-1 text-[9px] text-white/40">Ждёт подтверждения</p></div></div></div>
                      <div className="absolute bottom-2 left-1/2 h-1 w-[120px] -translate-x-1/2 rounded-full bg-white/20" />
                    </div>
                  </div>
                </div>
                <div className="floating-badge cinematic-badge absolute -left-4 top-8 z-30 flex items-center gap-3 rounded-xl p-3 lg:-left-20 lg:top-12 lg:rounded-2xl lg:p-4"><div className="grid size-9 place-items-center rounded-full border border-emerald-400/30 bg-emerald-500/10"><TrendingUp className="size-4 text-emerald-300" /></div><div><p className="text-xs font-bold text-white lg:text-sm">15 600 ₸</p><p className="text-[10px] text-emerald-100/50 lg:text-xs">Прогноз разницы с «всё быстро»</p></div></div>
                <div className="floating-badge cinematic-badge absolute -right-4 bottom-14 z-30 flex items-center gap-3 rounded-xl p-3 lg:-right-20 lg:bottom-20 lg:rounded-2xl lg:p-4"><div className="grid size-9 place-items-center rounded-full border border-blue-400/30 bg-blue-500/10"><ShieldCheck className="size-4 text-blue-300" /></div><div><p className="text-xs font-bold text-white lg:text-sm">OTIF 94%</p><p className="text-[10px] text-blue-100/50 lg:text-xs">По факту 17 поставок</p></div></div>
              </div>
            </div>
            <div className="card-left-text gsap-reveal order-3 flex w-full flex-col justify-center px-4 text-center lg:order-1 lg:px-0 lg:text-left"><h3 className="text-2xl font-bold tracking-tight text-white md:text-3xl lg:mb-5 lg:text-4xl">{cardHeading}</h3><p className="hidden max-w-sm text-base leading-relaxed text-emerald-50/65 md:block lg:max-w-none lg:text-lg">{cardDescription}</p></div>
          </div>
        </div>
      </div>
    </section>
  );
}
