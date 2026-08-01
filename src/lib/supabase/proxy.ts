import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isSupabaseConfigured, getPublicSupabaseEnv } from './env';
import { newNonce, securityHeaders } from '@/lib/security/headers';
import type { Database } from '@/types/database.generated';

const protectedPath = (pathname: string) => pathname.startsWith('/app') || pathname.startsWith('/admin') || pathname.startsWith('/onboarding');

/**
 * Applies the response security headers, and hands the CSP nonce to the
 * framework so Next stamps it on the scripts it emits.
 */
function withSecurity(response: NextResponse, nonce: string, pathname: string): NextResponse {
  const headers = securityHeaders(nonce, process.env.NEXT_PUBLIC_SUPABASE_URL, pathname);
  for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
  return response;
}

export async function updateSession(request: NextRequest) {
  const nonce = newNonce();
  const pathname = request.nextUrl.pathname;
  const headerSet = securityHeaders(nonce, process.env.NEXT_PUBLIC_SUPABASE_URL, pathname);
  // Next reads the nonce out of the Content-Security-Policy header on the
  // *request* and stamps it on every script tag it renders. Passing it only as
  // a custom header is not enough — the framework would emit unnonced scripts
  // and 'strict-dynamic' would then block its own bundle.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', headerSet['Content-Security-Policy']);
  const forward = { request: { headers: requestHeaders } };
  if (request.nextUrl.pathname.startsWith('/demo') && process.env.QADAM_APP_MODE !== 'DEMO_MODE') {
    const url = request.nextUrl.clone();
    url.pathname = '/signup';
    url.searchParams.set('message', 'demo_disabled');
    return withSecurity(NextResponse.redirect(url), nonce, pathname);
  }
  if (!isSupabaseConfigured()) {
    if (protectedPath(request.nextUrl.pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('error', 'supabase_not_configured');
      return withSecurity(NextResponse.redirect(url), nonce, pathname);
    }
    return withSecurity(NextResponse.next(forward), nonce, pathname);
  }

  const { url, publishableKey } = getPublicSupabaseEnv();
  let response = withSecurity(NextResponse.next(forward), nonce, pathname);
  const supabase = createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = withSecurity(NextResponse.next(forward), nonce, pathname);
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims && protectedPath(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
    return withSecurity(NextResponse.redirect(url), nonce, pathname);
  }
  if (claims && request.nextUrl.pathname.startsWith('/admin')) {
    const { data: allowed, error } = await supabase.rpc('is_current_platform_admin');
    if (error || !allowed) {
      const url = request.nextUrl.clone();
      url.pathname = '/app/today';
      url.searchParams.set('error', 'admin_access_required');
      return withSecurity(NextResponse.redirect(url), nonce, pathname);
    }
  }
  return response;
}
