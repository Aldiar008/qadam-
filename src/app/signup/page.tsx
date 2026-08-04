'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, Lock, Mail, Store, User } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { DemoBadge } from '@/components/common/DemoBadge';
import { useLanguage } from '@/context/LanguageContext';
import { signUp } from '@/app/auth/actions';

function SignupContent() {
  const { language } = useLanguage();
  const searchParams = useSearchParams();
  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-background flex flex-col justify-center items-center p-4 outline-none">
      <div className="w-full max-w-md bg-surface rounded-3xl border border-border p-8 shadow-2xl space-y-6">
        <div className="text-center space-y-3">
          <Logo size="lg" className="justify-center" />
          <DemoBadge label="Supabase Auth Ready" />
          <h1 className="text-2xl font-extrabold text-foreground">
            {language === 'ru' ? 'Регистрация заведения' : 'Орынды тіркеу'}
          </h1>
        </div>

        {/* Sign-up failures redirect back with ?error=; without this the form
            silently reappeared and looked like nothing had happened. */}
        {searchParams.get('error') && (
          <p role="alert" className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-3 text-sm font-semibold text-rose-800">
            Не удалось зарегистрироваться: {searchParams.get('error')}
          </p>
        )}

        {/* Someone signed in whose account is not attached to any business is
            sent here. Without saying why, the sign-up form appearing after a
            successful sign-in reads as the sign-in having failed. */}
        {searchParams.get('message') === 'no_business' && (
          <p role="status" className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm font-semibold text-amber-900">
            Вы вошли, но ваш аккаунт не привязан ни к одному заведению. Создайте его здесь —
            или попросите владельца пригласить вас в команду.
          </p>
        )}

        <form className="space-y-4" action={signUp}>
          <div className="space-y-1">
            <label className="text-xs font-mono text-muted-foreground">Название заведения</label>
            <div className="relative">
              <input
                type="text"
                name="businessName"
                required
                placeholder="TAMYR Coffee"
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-surface-muted border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <Store className="w-4 h-4 text-muted-foreground absolute left-3.5 top-3.5" />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="signup-display-name" className="text-xs font-mono text-muted-foreground">Ваше имя</label>
            <div className="relative">
              <input
                type="text"
                id="signup-display-name" name="displayName"
                required
                placeholder="Ербол"
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-surface-muted border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <User className="w-4 h-4 text-muted-foreground absolute left-3.5 top-3.5" />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="signup-email" className="text-xs font-mono text-muted-foreground">Email</label>
            <div className="relative">
              <input
                type="email"
                id="signup-email" name="email"
                autoComplete="email"
                required
                placeholder="owner@mycafe.kz"
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-surface-muted border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <Mail className="w-4 h-4 text-muted-foreground absolute left-3.5 top-3.5" />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="signup-password" className="text-xs font-mono text-muted-foreground">Пароль</label>
            <div className="relative">
              <input type="password" id="signup-password" name="password" minLength={8} autoComplete="new-password" required className="w-full pl-10 pr-4 py-3 rounded-xl bg-surface-muted border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              <Lock className="w-4 h-4 text-muted-foreground absolute left-3.5 top-3.5" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-xs font-mono text-muted-foreground">Тип бизнеса<select name="businessType" defaultValue="cafe" className="min-h-11 rounded-xl border border-border bg-surface-muted px-3 text-sm text-foreground"><option value="cafe">Кофейня</option><option value="beauty">Салон красоты</option><option value="retail">Магазин</option><option value="service">Сервисная точка</option><option value="dental">Стоматология</option></select></label>
            <label className="grid gap-1 text-xs font-mono text-muted-foreground">Размер<select name="businessSize" defaultValue="single_location" className="min-h-11 rounded-xl border border-border bg-surface-muted px-3 text-sm text-foreground"><option value="single_location">1 точка</option><option value="multi_location">Несколько точек</option></select></label>
          </div>
          <label className="grid gap-1 text-xs font-mono text-muted-foreground">Главная цель<select name="goal" defaultValue="reactivate" className="min-h-11 rounded-xl border border-border bg-surface-muted px-3 text-sm text-foreground"><option value="reactivate">Вернуть клиентов</option><option value="acquire">Привлечь новых</option><option value="average_check">Повысить средний чек</option></select></label>

          <button
            type="submit"
            className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary-hover transition-all flex items-center justify-center gap-2 shadow"
          >
            <span>{language === 'ru' ? 'Создать аккаунт (14 дней тестов)' : 'Тіркелу (14 күн тегін)'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="pt-4 border-t border-border text-center text-xs text-muted-foreground">
          <p>
            {language === 'ru' ? 'Уже есть аккаунт?' : 'Аккаунтыңыз бар ма?'}{' '}
            <Link href="/login" className="text-primary font-bold hover:underline">
              {language === 'ru' ? 'Войти' : 'Кіру'}
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupContent />
    </Suspense>
  );
}
