'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { ArrowRight, Lock, Mail } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { DemoBadge } from '@/components/common/DemoBadge';
import { useLanguage } from '@/context/LanguageContext';
import { signIn } from '@/app/auth/actions';
import { demoLogin } from '@/app/auth/actions';
import { useSearchParams } from 'next/navigation';
import { useAppMode } from '@/context/AppModeContext';

/**
 * Turns an error code into a sentence a person can act on.
 *
 * `demo_login_failed` is the one that matters: the demo account exists only
 * while the demonstration data is loaded, and during a restore there is a short
 * window with no accounts at all. Showing the raw code there reads as "the
 * button is broken" when the honest answer is "wait a moment and try again".
 */
function loginErrorText(code: string) {
  if (code === 'demo_login_failed') {
    return 'Демонстрационные данные сейчас обновляются, поэтому демо-вход недоступен. Попробуйте через минуту.';
  }
  if (code === 'demo_disabled') {
    return 'Демонстрационный вход на этой установке отключён. Зарегистрируйте своё заведение.';
  }
  if (/invalid login credentials/i.test(code)) {
    return 'Неверная почта или пароль.';
  }
  return `Не удалось войти: ${code}`;
}

function LoginContent() {
  const { language } = useLanguage();
  const { demoEnabled } = useAppMode();
  const searchParams = useSearchParams();
  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-background flex flex-col justify-center items-center p-4 outline-none">
      <div className="w-full max-w-md bg-surface rounded-3xl border border-border p-8 shadow-2xl space-y-6">
        <div className="text-center space-y-3">
          <Logo size="lg" className="justify-center" />
          <DemoBadge label="Supabase Auth Ready" />
          <h1 className="text-2xl font-extrabold text-foreground">
            {language === 'ru' ? 'Вход в личный кабинет' : 'Жеке кабинетке кіру'}
          </h1>
        </div>

        {/* The sign-in action redirects back with ?error=. Without this the
            page simply reloaded and the person was left guessing. role="alert"
            means a screen reader announces it rather than leaving it unread. */}
        {searchParams.get('error') && (
          <p role="alert" className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-3 text-sm font-semibold text-rose-800">
            {loginErrorText(searchParams.get('error') as string)}
          </p>
        )}
        {searchParams.get('message') === 'check_email' && (
          <p role="status" className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm font-semibold text-emerald-900">
            Аккаунт создан. Подтвердите адрес по ссылке из письма, затем войдите.
          </p>
        )}

        <form className="space-y-4" action={signIn}>
          <input type="hidden" name="next" value={searchParams.get('next') ?? '/app/today'} />
          <div className="space-y-1">
            <label htmlFor="login-email" className="text-xs font-mono text-muted-foreground">Email / Логин</label>
            <div className="relative">
              <input
                type="email"
                id="login-email"
                name="email"
                autoComplete="email"
                required
                placeholder="owner@qadam.local"
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-surface-muted border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <Mail className="w-4 h-4 text-muted-foreground absolute left-3.5 top-3.5" />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="login-password" className="text-xs font-mono text-muted-foreground">Пароль</label>
            <div className="relative">
              <input
                type="password"
                id="login-password"
                name="password"
                autoComplete="current-password"
                required
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-surface-muted border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <Lock className="w-4 h-4 text-muted-foreground absolute left-3.5 top-3.5" />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary-hover transition-all flex items-center justify-center gap-2 shadow"
          >
            <span>{language === 'ru' ? 'Войти в систему' : 'Жүйеге кіру'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="pt-4 border-t border-border text-center text-xs text-muted-foreground space-y-2">
          <p>
            {language === 'ru' ? 'Нет аккаунта?' : 'Тіркелмегенсіз бе?'}{' '}
            <Link href="/signup" className="text-primary font-bold hover:underline">
              {language === 'ru' ? 'Зарегистрироваться' : 'Тіркелу'}
            </Link>
          </p>
          <p>
            <Link href="/forgot-password" className="text-primary font-bold hover:underline">
              {language === 'ru' ? 'Восстановить пароль' : 'Құпиясөзді қалпына келтіру'}
            </Link>
          </p>
          {demoEnabled && <form action={demoLogin}><button className="min-h-11 w-full rounded-xl border border-border font-bold text-foreground hover:bg-surface-muted">{language === 'ru' ? 'Войти в DEMO_MODE' : 'DEMO_MODE режиміне кіру'}</button></form>}
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return <Suspense fallback={<main className="min-h-screen bg-background" aria-busy="true"><span className="sr-only">Загрузка формы входа…</span></main>}><LoginContent /></Suspense>;
}
