'use client';

import React, { createContext, useContext, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Language } from '@/types';
import { getDictionary } from '@/lib/dictionary';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  /** True while the server is re-rendering in the newly chosen language. */
  switching: boolean;
  t: ReturnType<typeof getDictionary>;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

/** One year: the choice should outlive the session, not the tab. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Holds the language for client components.
 *
 * The value arrives already resolved on the server (`initialLanguage`), so the
 * first paint is in the right language and a Kazakh speaker sees no flash of
 * Russian. Switching writes a cookie — not `localStorage` — because the server
 * has to be able to read it, and then asks Next to re-render so server
 * components produce their own copy in the new language.
 */
export function LanguageProvider({
  children,
  initialLanguage = 'ru',
}: {
  children: React.ReactNode;
  initialLanguage?: Language;
}) {
  const [language, setLanguageState] = useState<Language>(initialLanguage);
  const [switching, startTransition] = useTransition();
  const router = useRouter();

  const setLanguage = (lang: Language) => {
    if (lang === language) return;
    setLanguageState(lang);
    // `SameSite=Lax` so the choice still applies when someone follows a link in
    // from outside; there is nothing sensitive in the value.
    document.cookie = `qadam_lang=${lang};path=/;max-age=${COOKIE_MAX_AGE};samesite=lax`;
    startTransition(() => router.refresh());
  };

  const t = getDictionary(language);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, switching, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
