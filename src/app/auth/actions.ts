'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ensureBusinessForUser } from '@/lib/supabase/onboarding';
import { demoTenantsEnabled } from '@/lib/app-mode';

const value = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
const errorRedirect = (path: string, message: string) => redirect(`${path}?error=${encodeURIComponent(message)}`);
const safeNext = (form: FormData, fallback: string) => {
  const next = value(form, 'next');
  return next.startsWith('/') && !next.startsWith('//') ? next : fallback;
};

async function postAuthPath(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, requested?: string) {
  const { data: member } = await supabase.from('business_members').select('business_id').eq('user_id', userId).eq('status', 'active').order('created_at').limit(1).maybeSingle();
  if (!member) {
    // A platform administrator holds no tenant membership by design, so the
    // absence of one is not evidence that they still have to onboard — it is
    // evidence that the console is where they belong. The role is read through
    // the same security-definer function the console itself trusts, never from
    // user metadata.
    const { data: isPlatformAdmin } = await supabase.rpc('is_current_platform_admin');
    return isPlatformAdmin ? '/admin' : '/onboarding';
  }
  const [{ data: profile }, { data: session }] = await Promise.all([
    supabase.from('business_profiles').select('business_id').eq('business_id', member.business_id).maybeSingle(),
    supabase.from('onboarding_sessions').select('status').eq('business_id', member.business_id).eq('user_id', userId).maybeSingle(),
  ]);
  if (!profile || (session && session.status !== 'completed')) return '/onboarding';
  return requested && requested.startsWith('/') && !requested.startsWith('//') ? requested : '/app/today';
}

export async function signIn(form: FormData) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email: value(form, 'email'), password: value(form, 'password') });
  if (error) errorRedirect('/login', error.message);
  if (data.user) await ensureBusinessForUser(supabase, data.user);
  redirect(data.user ? await postAuthPath(supabase, data.user.id, safeNext(form, '/app/today')) : '/login');
}

export async function signUp(form: FormData) {
  const supabase = await createClient();
  const origin = (await headers()).get('origin') ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const { data, error } = await supabase.auth.signUp({
    email: value(form, 'email'),
    password: value(form, 'password'),
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=/app/today`,
      data: {
        display_name: value(form, 'displayName'),
        business_name: value(form, 'businessName'),
        business_type: value(form, 'businessType') || 'cafe',
        business_size: value(form, 'businessSize') || 'single_location',
        primary_goal: value(form, 'goal') || 'reactivate',
        locale: 'ru',
        timezone: 'Asia/Almaty',
      },
    },
  });
  if (error) errorRedirect('/signup', error.message);
  if (data.user && data.session) {
    await ensureBusinessForUser(supabase, data.user);
    redirect('/onboarding');
  }
  redirect('/login?message=check_email');
}

export async function demoLogin() {
  if (!demoTenantsEnabled()) redirect('/signup?error=demo_disabled');
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: 'owner@qadam.local', password: 'QadamLocal!2026' });
  if (error) errorRedirect('/login', 'demo_login_failed');
  redirect('/app/today');
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function requestPasswordReset(form: FormData) {
  const supabase = await createClient();
  const origin = (await headers()).get('origin') ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const { error } = await supabase.auth.resetPasswordForEmail(value(form, 'email'), {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });
  if (error) errorRedirect('/forgot-password', error.message);
  redirect('/login?message=reset_email_sent');
}

export async function updatePassword(form: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: value(form, 'password') });
  if (error) errorRedirect('/reset-password', error.message);
  redirect('/app/today');
}
