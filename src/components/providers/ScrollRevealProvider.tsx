'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const REVEAL_SELECTOR = [
  '[data-scroll-reveal]',
  'main > section',
  'main > article',
  'main > header',
  'main > form',
  'main > div > section',
  'main > div > article',
  'main > div > header',
  'main > div > form',
  'main > div > div',
].join(',');

export function ScrollRevealProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion || !('IntersectionObserver' in window)) return;

    const elements = Array.from(document.querySelectorAll<HTMLElement>(REVEAL_SELECTOR))
      .filter((element) => element.dataset.scrollReveal !== 'off');

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;

          const element = entry.target as HTMLElement;
          element.classList.add('scroll-reveal--visible');
          observer.unobserve(element);
        });
      },
      {
        threshold: 0.12,
        rootMargin: '0px 0px -8% 0px',
      },
    );

    elements.forEach((element, index) => {
      element.classList.add('scroll-reveal');
      element.style.setProperty('--scroll-reveal-delay', `${(index % 3) * 40}ms`);
      observer.observe(element);
    });

    return () => observer.disconnect();
  }, [pathname]);

  return children;
}
