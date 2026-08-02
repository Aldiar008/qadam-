import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Proving who opened the Mini App.
 *
 * Telegram hands the page a signed blob describing the person who opened it.
 * Everything the Mini App does afterwards rests on this check being right, so
 * it is written out plainly rather than pulled from a library:
 *
 *   secret        = HMAC_SHA256(key = "WebAppData", message = bot token)
 *   data string   = every field except `hash`, as `key=value`, sorted by key,
 *                   joined with newlines
 *   expected hash = HMAC_SHA256(key = secret, message = data string)
 *
 * A blob that fails, or one older than the freshness window, is refused. There
 * is no fallback path that trusts the user id "just this once": without a valid
 * signature anyone could open somebody else's loyalty card by editing a query
 * string.
 */

export interface TelegramInitData {
  userId: string;
  firstName: string;
  username: string | null;
  languageCode: string | null;
  /** Payload from a deep link, e.g. the QR token behind `?startapp=`. */
  startParam: string | null;
  authDate: number;
}

export type InitDataResult =
  | { ok: true; data: TelegramInitData }
  | { ok: false; reason: 'not_configured' | 'malformed' | 'bad_signature' | 'expired' };

const MAX_AGE_SECONDS = 24 * 60 * 60;

export function verifyInitData(initData: string, botToken: string | undefined, now = Date.now()): InitDataResult {
  if (!botToken) return { ok: false, reason: 'not_configured' };
  if (!initData || initData.length > 8192) return { ok: false, reason: 'malformed' };

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  const hash = params.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) return { ok: false, reason: 'malformed' };

  const pairs: string[] = [];
  for (const [key, value] of params.entries()) {
    if (key === 'hash') continue;
    pairs.push(`${key}=${value}`);
  }
  pairs.sort();

  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(pairs.join('\n')).digest('hex');

  const given = Buffer.from(hash.toLowerCase(), 'hex');
  const mine = Buffer.from(expected, 'hex');
  if (given.length !== mine.length || !timingSafeEqual(given, mine)) return { ok: false, reason: 'bad_signature' };

  const authDate = Number(params.get('auth_date') ?? 0);
  if (!Number.isFinite(authDate) || authDate <= 0) return { ok: false, reason: 'malformed' };
  // A valid signature stays valid forever, so freshness is a separate check:
  // an old blob copied out of one session must not open the app tomorrow.
  if (Math.floor(now / 1000) - authDate > MAX_AGE_SECONDS) return { ok: false, reason: 'expired' };

  let user: { id?: number; first_name?: string; username?: string; language_code?: string };
  try {
    user = JSON.parse(params.get('user') ?? '{}');
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (!user.id || !Number.isFinite(user.id)) return { ok: false, reason: 'malformed' };

  return {
    ok: true,
    data: {
      userId: String(user.id),
      firstName: String(user.first_name ?? 'Гость').slice(0, 80),
      username: user.username ? String(user.username).slice(0, 80) : null,
      languageCode: user.language_code ? String(user.language_code).slice(0, 8) : null,
      startParam: params.get('start_param'),
      authDate,
    },
  };
}
