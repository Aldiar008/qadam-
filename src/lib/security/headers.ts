import 'server-only';

/**
 * Response security headers.
 *
 * Everything here is set on every response through the proxy, so a route added
 * tomorrow is covered without anyone remembering to opt in.
 *
 * `script-src` is `'self'` plus a per-request nonce. The proxy generates the
 * nonce, passes it to the framework on the request's own CSP header, and Next
 * stamps it on the scripts it renders — so an injected inline script without the
 * nonce cannot run, and no third-party origin can serve script at all.
 *
 * `'strict-dynamic'` is deliberately *not* used. It would be stronger, but it
 * makes `'self'` inert, and the marketing pages are statically prerendered:
 * their HTML is written at build time and cannot carry a per-request nonce, so
 * every chunk they load would be blocked. Mixing static and dynamic rendering
 * and keeping `'self'` is the correct trade-off here, and it is a trade-off
 * rather than an oversight.
 *
 * `style-src` still carries `'unsafe-inline'` for the same class of reason: the
 * cinematic hero injects a constant stylesheet and Tailwind emits inline style
 * attributes, and neither can carry a nonce today. Inline *style* cannot
 * execute, so the hazard is far smaller than inline script — but it is not zero,
 * and it is recorded as a known gap rather than quietly ignored.
 */
/**
 * Routes that render tenant or customer data, and therefore get the nonce-based
 * script policy. Everything else is a statically prerendered marketing page
 * whose HTML is written at build time: it cannot carry a per-request nonce, and
 * it renders no user input at all, so it gets `'unsafe-inline'` for scripts
 * instead of being forced into per-request rendering purely to satisfy the
 * policy. The distinction is deliberate — the strict policy covers every screen
 * where an injection would have something to steal.
 */
const NONCE_ENFORCED_PREFIXES = ['/app', '/admin', '/onboarding', '/q/', '/login', '/signup', '/customers', '/auth', '/api'];

export function isNonceEnforced(pathname: string): boolean {
  return NONCE_ENFORCED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

export function securityHeaders(nonce: string, supabaseUrl: string | undefined, pathname = '/app'): Record<string, string> {
  const connect = ["'self'", supabaseUrl, supabaseUrl?.replace(/^http/, 'ws')].filter(Boolean).join(' ');
  const scriptSrc = isNonceEnforced(pathname)
    ? `script-src 'self' 'nonce-${nonce}'`
    : "script-src 'self' 'unsafe-inline'";
  const csp = [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connect}`,
    "object-src 'none'",
    "base-uri 'self'",
    // A campaign launch or a team invitation must not be submittable to someone
    // else's server by an injected form.
    "form-action 'self'",
    // Clickjacking: nothing in this product should ever be framed.
    "frame-ancestors 'none'",
    "frame-src 'none'",
    'upgrade-insecure-requests',
  ].join('; ');

  return {
    'Content-Security-Policy': csp,
    // Belt and braces for browsers that predate frame-ancestors.
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    // Referrers may carry a QR token or a campaign id in the path, so they must
    // not travel to another origin.
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  };
}

/** 128 bits of randomness, base64 encoded, as the CSP nonce grammar requires. */
export function newNonce(): string {
  return Buffer.from(crypto.randomUUID().replace(/-/g, ''), 'hex').toString('base64');
}
