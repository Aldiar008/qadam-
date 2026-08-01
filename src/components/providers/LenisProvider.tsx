'use client';

import React, { useEffect } from 'react';
import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

export function LenisProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isMobile = window.innerWidth < 768;
    const hasCoarsePointer = window.matchMedia('(pointer: coarse)').matches;

    if (prefersReducedMotion || isMobile || hasCoarsePointer) return;

    gsap.registerPlugin(ScrollTrigger);

    const lenis = new Lenis({
      // Osmo Supply's public production configuration: quick enough to stay
      // attached to the wheel, soft enough to remove trackpad micro-jitter.
      lerp: 0.165,
      orientation: 'vertical',
      gestureOrientation: 'vertical',
      smoothWheel: true,
      wheelMultiplier: 1.25,
      prevent: (node) => node.closest('[data-lenis-prevent]') !== null,
    });

    const updateScrollTrigger = () => ScrollTrigger.update();
    const tick = (time: number) => lenis.raf(time * 1000);

    lenis.on('scroll', updateScrollTrigger);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(500, 33);

    return () => {
      gsap.ticker.remove(tick);
      lenis.off('scroll', updateScrollTrigger);
      lenis.destroy();
    };
  }, []);

  return <>{children}</>;
}
