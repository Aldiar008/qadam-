import 'server-only';

import { cookies } from 'next/headers';

import { TG_COOKIE, decodeSession, type TelegramSession } from '@/lib/telegram/session-token';

export { TG_COOKIE, decodeSession, encodeSession, sessionTtlSeconds } from '@/lib/telegram/session-token';
export type { TelegramSession } from '@/lib/telegram/session-token';

/** Reads the current Mini App session, or null when there is none to trust. */
export async function readTelegramSession(): Promise<TelegramSession | null> {
  const secret = process.env.TELEGRAM_BOT_TOKEN;
  if (!secret) return null;
  const jar = await cookies();
  return decodeSession(jar.get(TG_COOKIE)?.value, secret);
}
