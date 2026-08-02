import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * A guest session, which this product did not previously have.
 *
 * Everywhere else a customer is identified per request by a hash of their
 * contact; nobody ever "logs in" as a guest, and there is no `auth.users` row
 * behind them. A Mini App cannot re-prove identity on every navigation, so this
 * mints a short signed cookie after `initData` has been verified once.
 *
 * Deliberately narrow:
 *   - it carries only the ids the app needs, never a contact;
 *   - it is scoped to `/tg`, so it is not sent to the cabinet or the API;
 *   - it expires in an hour, because a card left open on a shared phone should
 *     stop being a card;
 *   - it is signed with the bot token, the same secret the initData check uses,
 *     so a forged cookie is exactly as hard as a forged initData.
 */

export const TG_COOKIE = 'qadam_tg';
const TTL_SECONDS = 60 * 60;

export interface TelegramSession {
  chatId: string;
  businessId: string;
  /** Present for a guest; absent for an owner-only chat. */
  customerId: string | null;
  /** Present when this chat may act for the business. */
  ownerUserId: string | null;
  name: string;
  expiresAt: number;
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function encodeSession(session: TelegramSession, secret: string): string {
  const payload = Buffer.from(JSON.stringify(session), 'utf8').toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

export function decodeSession(raw: string | undefined, secret: string, now = Date.now()): TelegramSession | null {
  if (!raw) return null;
  const [payload, signature] = raw.split('.');
  if (!payload || !signature) return null;

  const expected = sign(payload, secret);
  const given = Buffer.from(signature);
  const mine = Buffer.from(expected);
  if (given.length !== mine.length || !timingSafeEqual(given, mine)) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as TelegramSession;
    if (!session.chatId || !session.businessId) return null;
    if (!Number.isFinite(session.expiresAt) || session.expiresAt <= now) return null;
    return session;
  } catch {
    return null;
  }
}

export function sessionTtlSeconds(): number {
  return TTL_SECONDS;
}
