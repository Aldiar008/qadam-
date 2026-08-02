import { NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import { verifyInitData } from '@/lib/telegram/init-data';
import { TG_COOKIE, encodeSession, sessionTtlSeconds } from '@/server/telegram/session';

/**
 * Exchanges Telegram's signed blob for a session this app will accept.
 *
 * The chat is already tied to a customer or an owner in
 * `private.channel_addresses`; this route only proves that the person holding
 * the page really is that chat, then writes what was resolved into a cookie.
 * It never takes a business or customer id from the request — those come from
 * the linkage, so a guest cannot ask for somebody else's card.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface Body {
  initData?: string;
  /** Which venue, when the chat is linked to more than one. */
  businessId?: string;
}

export async function POST(request: Request) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return NextResponse.json({ error: 'telegram_not_configured' }, { status: 503 });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const verified = verifyInitData(String(body.initData ?? ''), token);
  if (!verified.ok) {
    // The reason is returned because the page has to tell the person what to do
    // — "откройте из бота" and "подпись не сошлась" are different problems.
    return NextResponse.json({ error: verified.reason }, { status: 401 });
  }

  const chatId = verified.data.userId;
  const db = createAdminClient();
  const [{ data: guestRows }, { data: ownerRows }] = await Promise.all([
    db.rpc('customer_channels_for_address', { p_channel: 'telegram', p_address: chatId }),
    db.rpc('owner_businesses_for_chat', { p_chat_id: chatId }),
  ]);

  const guests = (guestRows ?? []) as { business_id: string; customer_id: string; business_name: string }[];
  const owners = (ownerRows ?? []) as { business_id: string; business_name: string }[];

  if (!guests.length && !owners.length) {
    return NextResponse.json({
      error: 'not_linked',
      message: 'Этот чат ещё не связан ни с одним заведением. Отсканируйте QR-код на кассе — карта заведётся сама.',
    }, { status: 404 });
  }

  // When a chat belongs to several venues the caller may name one; otherwise the
  // most recently used pairing wins, which is what the RPC already orders by.
  const requested = body.businessId;
  const guest = requested ? guests.find((row) => row.business_id === requested) : guests[0];
  const owner = requested ? owners.find((row) => row.business_id === requested) : owners[0];
  const chosen = guest ?? owner;
  if (!chosen) return NextResponse.json({ error: 'not_linked' }, { status: 404 });

  const businessId = chosen.business_id;
  const ownerHere = owners.find((row) => row.business_id === businessId) ?? null;
  const guestHere = guests.find((row) => row.business_id === businessId) ?? null;

  // The owner's own user id is not exposed to the page; only that this chat may
  // act as one, which is what the owner view checks.
  const session = {
    chatId,
    businessId,
    customerId: guestHere?.customer_id ?? null,
    ownerUserId: ownerHere ? 'linked' : null,
    name: verified.data.firstName,
    expiresAt: Date.now() + sessionTtlSeconds() * 1000,
  };

  const response = NextResponse.json({
    ok: true,
    businessName: guestHere?.business_name ?? ownerHere?.business_name ?? 'Заведение',
    isGuest: Boolean(guestHere),
    isOwner: Boolean(ownerHere),
    businesses: [...new Set([...guests, ...owners].map((row) => row.business_id))].map((id) => ({
      id,
      name: guests.find((row) => row.business_id === id)?.business_name
        ?? owners.find((row) => row.business_id === id)?.business_name ?? 'Заведение',
    })),
  });

  response.cookies.set(TG_COOKIE, encodeSession(session, token), {
    httpOnly: true,
    sameSite: 'none',
    secure: true,
    // Scoped to the Mini App: this cookie has no business being sent to the
    // cabinet, the API or anything else.
    path: '/tg',
    maxAge: sessionTtlSeconds(),
  });
  return response;
}
