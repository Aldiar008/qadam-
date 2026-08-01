'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/context/LanguageContext';
import { siteConfig } from '@/config/site';

export function LocalSubnav() {
  const { language } = useLanguage();
  const [activeSection, setActiveSection] = useState('#overview');
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      // Show local subnav after scrolling past 450px
      setIsVisible(window.scrollY > 450);

      // Simple intersection check for active section
      const sections = ['overview', 'how-it-works', 'features', 'margin-shield', 'impact'];
      for (const section of sections) {
        const el = document.getElementById(section);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= 200 && rect.bottom >= 200) {
            setActiveSection(`#${section}`);
            break;
          }
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div
      aria-hidden={!isVisible}
      className={
        'fixed inset-x-0 top-20 z-40 w-full transition-[opacity,transform,visibility] duration-300 ease-out ' +
        (isVisible
          ? 'visible translate-y-0 opacity-100'
          : 'invisible pointer-events-none -translate-y-3 opacity-0')
      }
    >
      <div className="container max-w-4xl mx-auto px-4">
        <nav className="glass-panel rounded-full px-4 py-2 flex items-center justify-between shadow-lg border border-border/80">
          <div className="flex items-center gap-1 sm:gap-4 overflow-x-auto no-scrollbar py-1 text-xs sm:text-sm font-medium">
            {siteConfig.subnavLanding.map((item) => {
              const isActive = activeSection === item.href;
              const title = language === 'ru' ? item.titleRu : item.titleKk;
              return (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => setActiveSection(item.href)}
                  className={`px-3 py-1.5 rounded-full whitespace-nowrap transition-all ${
                    isActive
                      ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                      : 'text-muted-foreground hover:text-foreground hover:bg-surface-muted'
                  }`}
                >
                  {title}
                </a>
              );
            })}
          </div>

          <Link
            href="/demo"
            className="hidden sm:inline-flex px-3.5 py-1.5 rounded-full text-xs font-semibold bg-surface-muted text-foreground hover:bg-primary hover:text-primary-foreground transition-all border border-border"
          >
            {language === 'ru' ? 'Открыть демо' : 'Демоны ашу'}
          </Link>
        </nav>
      </div>
    </div>
  );
}
