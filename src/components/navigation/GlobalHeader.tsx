'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X, ArrowRight } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { useLanguage } from '@/context/LanguageContext';
import { siteConfig } from '@/config/site';
import { useAppMode } from '@/context/AppModeContext';

export function GlobalHeader() {
  const { language, setLanguage } = useLanguage();
  const { demoEnabled } = useAppMode();
  const pathname = usePathname();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Lock background scroll when mobile menu is open
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
      requestAnimationFrame(() => mobileMenuRef.current?.querySelector<HTMLElement>('a, button')?.focus());
    } else {
      document.body.style.overflow = previousOverflow;
    }
    return () => { document.body.style.overflow = previousOverflow; };
  }, [isMobileMenuOpen]);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMobileMenuOpen) {
        setIsMobileMenuOpen(false);
        mobileTriggerRef.current?.focus();
      }
      if (e.key === 'Tab' && isMobileMenuOpen && mobileMenuRef.current) {
        const focusable = Array.from(mobileMenuRef.current.querySelectorAll<HTMLElement>('a, button:not([disabled])'));
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileMenuOpen]);

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          isScrolled
            ? 'glass-panel py-3 border-b shadow-sm'
            : 'bg-background/80 backdrop-blur-md py-5 border-b border-transparent'
        }`}
      >
        <div className="container max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between">
          <Logo size="md" />

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium">
            {siteConfig.mainNav.map((item) => {
              const isActive = pathname === item.href;
              const title = language === 'ru' ? item.titleRu : item.titleKk;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`transition-colors duration-200 ${
                    isActive
                      ? 'text-primary font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {title}
                </Link>
              );
            })}
          </nav>

          {/* Desktop Right Controls */}
          <div className="hidden md:flex items-center gap-4">
            {/* RU / KK Toggle */}
            <div className="flex items-center p-1 rounded-full bg-surface-muted border border-border text-xs font-semibold">
              <button
                type="button"
                onClick={() => setLanguage('ru')}
                className={`px-2.5 py-1 rounded-full transition-all ${
                  language === 'ru'
                    ? 'bg-surface text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                RU
              </button>
              <button
                type="button"
                onClick={() => setLanguage('kk')}
                className={`px-2.5 py-1 rounded-full transition-all ${
                  language === 'kk'
                    ? 'bg-surface text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                KK
              </button>
            </div>

            <Link
              href="/login"
              className="text-sm font-medium text-muted-foreground hover:text-foreground px-3 py-2 transition-colors"
            >
              {language === 'ru' ? 'Войти' : 'Кіру'}
            </Link>

            <Link
              href={demoEnabled ? '/demo' : '/signup'}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary-hover transition-all shadow-sm hover:shadow group"
            >
              <span>{demoEnabled ? (language === 'ru' ? 'Посмотреть демо' : 'Демоны қарау') : (language === 'ru' ? 'Начать' : 'Бастау')}</span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            ref={mobileTriggerRef}
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-2.5 rounded-lg text-foreground bg-surface-muted border border-border"
            aria-label="Toggle menu"
            aria-expanded={isMobileMenuOpen}
            aria-controls="mobile-menu"
          >
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </header>

      {/* Mobile Drawer Sheet */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <div ref={mobileMenuRef} id="mobile-menu" role="dialog" aria-modal="true" aria-label="Навигация" className="fixed top-16 right-0 bottom-0 w-full max-w-sm bg-surface p-6 shadow-2xl flex flex-col justify-between border-l border-border overflow-y-auto">
            <div className="space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-border">
                <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                  {language === 'ru' ? 'Навигация' : 'Навигация'}
                </span>
                <div className="flex items-center gap-1 bg-surface-muted p-1 rounded-full border text-xs font-semibold">
                  <button
                    onClick={() => setLanguage('ru')}
                    className={`px-3 py-1 rounded-full ${
                      language === 'ru' ? 'bg-surface text-foreground shadow' : 'text-muted-foreground'
                    }`}
                  >
                    RU
                  </button>
                  <button
                    onClick={() => setLanguage('kk')}
                    className={`px-3 py-1 rounded-full ${
                      language === 'kk' ? 'bg-surface text-foreground shadow' : 'text-muted-foreground'
                    }`}
                  >
                    KK
                  </button>
                </div>
              </div>

              <nav className="flex flex-col gap-4 text-lg font-medium">
                {siteConfig.mainNav.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="py-2 text-foreground hover:text-primary transition-colors border-b border-border/40"
                  >
                    {language === 'ru' ? item.titleRu : item.titleKk}
                  </Link>
                ))}
              </nav>
            </div>

            <div className="pt-6 border-t border-border space-y-3">
              <Link
                href="/login"
                onClick={() => setIsMobileMenuOpen(false)}
                className="block text-center py-3 rounded-xl border border-border font-medium text-foreground"
              >
                {language === 'ru' ? 'Войти в систему' : 'Жүйеге кіру'}
              </Link>
              <Link
                href={demoEnabled ? '/demo' : '/signup'}
                onClick={() => setIsMobileMenuOpen(false)}
                className="block text-center py-3 rounded-xl bg-primary text-primary-foreground font-semibold shadow"
              >
                {demoEnabled ? (language === 'ru' ? 'Посмотреть демо' : 'Демоны қарау') : (language === 'ru' ? 'Начать' : 'Бастау')}
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
