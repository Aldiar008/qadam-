import { NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import { verifyInitData } from '@/lib/telegram/init-data';
import { TG_COOKIE, encodeSession, sessionTtlSeconds } from '@/server/telegram/session';

/**
 * Вход владельца по часовому ключу.
 *
 * The chat still has to prove it is a Telegram chat — the key alone would be a
 * password in a message. Both are required: a valid `initData` says *who is
 * asking*, the key says *which venue they may see*, and the key stops working
 * when the hour does.
 *
 * The key is never compared against a business the caller names: the database
 * answers «which venue does this key belong to», so a key cannot be probed
 * against a list of tenants.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return NextResponse.json({ error: 'telegram_not_configured' }, { status: 503 });

  let body: { initData?: string; key?: string };
  try {
    body = (await request.json()) as { initData?: string; key?: string };
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const verified = verifyInitData(String(body.initData ?? ''), token);
  if (!verified.ok) return NextResponse.json({ error: verified.reason }, { status: 401 });

  const key = String(body.key ?? '').trim().toUpperCase();
  if (!/^[A-Z2-9]{8}$/.test(key)) {
    return NextResponse.json({ error: 'bad_key', message: 'Ключ состоит из восьми букв и цифр. Возьмите свежий в кабинете.' }, { status: 400 });
  }

  const db = createAdminClient();
  const { data } = await db.rpc('business_for_admin_key', { p_key: key });
  const match = ((data ?? []) as { business_id: string; business_name: string }[])[0];
  if (!match) {
    return NextResponse.json({
      error: 'key_rejected',
      message: 'Ключ не подошёл. Он меняется каждый час — откройте кабинет и возьмите новый.',
    }, { status: 401 });
  }

  const chatId = verified.data.userId;
  const session = {
    chatId,
    businessId: match.business_id,
    customerId: null,
    ownerUserId: 'admin_key',
    name: verified.data.firstName,
    expiresAt: Date.now() + sessionTtlSeconds() * 1000,
  };

  const response = NextResponse.json({ ok: true, businessName: match.business_name });
  response.cookies.set(TG_COOKIE, encodeSession(session, token), {
    httpOnly: true, sameSite: 'none', secure: true, path: '/tg', maxAge: sessionTtlSeconds(),
  });

  // An admin session opened from a key is worth a line in the log: it is the
  // one way into the console that does not go through the cabinet's own login.
  await db.from('activity_logs').insert({
    business_id: match.business_id,
    actor_id: null,
    action: 'admin.telegram_key_used',
    resource_type: 'business',
    resource_id: match.business_id,
    metadata: { chat_masked: `tg:***${chatId.slice(-4)}` },
    is_mock: false,
  });

  return response;
}
