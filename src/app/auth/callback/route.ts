import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ensureBusinessForUser } from '@/lib/supabase/onboarding';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const next = request.nextUrl.searchParams.get('next') ?? '/app/today';
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/app/today';
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data } = await supabase.auth.getUser();
      if (data.user) await ensureBusinessForUser(supabase, data.user);
      const { data: member } = await supabase.from('business_members').select('business_id').eq('user_id', data.user?.id ?? '').eq('status', 'active').limit(1).maybeSingle();
      const { data: profile } = member ? await supabase.from('business_profiles').select('business_id').eq('business_id', member.business_id).maybeSingle() : { data: null };
      return NextResponse.redirect(new URL(profile ? safeNext : '/onboarding', request.url));
    }
  }
  return NextResponse.redirect(new URL('/login?error=auth_callback_failed', request.url));
}
