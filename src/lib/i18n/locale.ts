import 'server-only';

import { cookies, headers } from 'next/headers';

import type { Language } from '@/types';

export const LOCALE_COOKIE = 'qadam_lang';
export const SUPPORTED: readonly Language[] = ['ru', 'kk'];
export const DEFAULT_LOCALE: Language = 'ru';

const isSupported = (value: string | undefined | null): value is Language =>
  value === 'ru' || value === 'kk';

/**
 * Picks the language on the server, before anything renders.
 *
 * The order is deliberate and goes from most explicit to least:
 *
 *   1. the cookie — the person clicked RU or KK, and that beats everything;
 *   2. the business's own `preferred_locale`, so a Kazakh-speaking team does not
 *      have to switch on every device;
 *   3. `Accept-Language`, for a first-time visitor who has expressed nothing;
 *   4. Russian.
 *
 * A cookie rather than `localStorage` is the whole point: the server can read a
 * cookie, so the first paint is already in the right language. With
 * `localStorage` the server had no idea, always rendered Russian, and a Kazakh
 * speaker saw Russian until hydration — if the copy came from a server component,
 * they saw Russian for good.
 */
export async function resolveLocale(businessLocale?: string | null): Promise<Language> {
  const store = await cookies();
  const fromCookie = store.get(LOCALE_COOKIE)?.value;
  if (isSupported(fromCookie)) return fromCookie;

  if (isSupported(businessLocale)) return businessLocale;

  const accept = (await headers()).get('accept-language') ?? '';
  return parseAcceptLanguage(accept) ?? DEFAULT_LOCALE;
}

/**
 * Reads the first supported language out of an Accept-Language header,
 * honouring quality values so `kk;q=0.9, ru;q=0.8` picks Kazakh.
 */
export function parseAcceptLanguage(header: string): Language | null {
  const ranked = header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.find((p) => p.trim().startsWith('q='));
      return { tag: tag.trim().toLowerCase(), quality: q ? Number(q.split('=')[1]) || 0 : 1 };
    })
    .filter((entry) => entry.tag)
    .sort((a, b) => b.quality - a.quality);

  for (const { tag } of ranked) {
    // `kk-KZ` and `kk` both mean Kazakh.
    const base = tag.split('-')[0];
    if (isSupported(base)) return base;
  }
  return null;
}
