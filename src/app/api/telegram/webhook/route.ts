import { NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';

/**
 * The Telegram bot's inbox.
 *
 * This is a separate route from `/api/webhooks/delivery` on purpose: that one
 * expects QADAM's own envelope signed with `x-qadam-signature`, and Telegram
 * sends its own shape with `X-Telegram-Bot-Api-Secret-Token`. Bending one into
 * the other would mean weakening the signature check that protects provider
 * events.
 *
 * Two people arrive here:
 *
 *   - a **guest**, from the QR deep link `t.me/<bot>?start=q_<token>`. The bot
 *     is where they join the loyalty programme, which is also the moment they
 *     give consent — the same RPC the web page calls, with the same rate limits
 *     and the same idempotency;
 *   - an **owner**, from a linking code shown in the cabinet. Their chat is
 *     remembered so the assistant can send them the day's signal and take a
 *     confirmation back.
 *
 * Nothing here decides whether a message may be sent. That belongs to
 * `send_gate`, and it is re-evaluated at dispatch as it is for every channel.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface TelegramUpdate {
  message?: {
    chat?: { id?: number | string };
    from?: { id?: number | string; first_name?: string; username?: string };
    text?: string;
  };
}

const api = (method: string) => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN ?? ''}/${method}`;

async function reply(chatId: string, text: string): Promise<void> {
  if (!process.env.TELEGRAM_BOT_TOKEN) return;
  await fetch(api('sendMessage'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  }).catch(() => {
    // A reply that fails to send is not a reason to make Telegram retry the
    // whole update: the state change it carried has already been recorded.
  });
}

export async function POST(request: Request) {
  const secret = process.env.QADAM_TELEGRAM_WEBHOOK_SECRET ?? '';
  if (!secret) {
    return NextResponse.json({ error: 'telegram_not_configured' }, { status: 503 });
  }
  // Telegram echoes the secret we registered with setWebhook. Anyone can POST
  // to a public URL, so without this the bot would act on anybody's JSON.
  if (request.headers.get('x-telegram-bot-api-secret-token') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const chatId = update.message?.chat?.id;
  const text = String(update.message?.text ?? '').trim();
  // Telegram retries anything that is not 2xx. An update this bot has no answer
  // for is understood, not failed, so it is acknowledged rather than repeated.
  if (!chatId || !text) return NextResponse.json({ ok: true, ignored: 'no_text' });

  const chat = String(chatId);
  const db = createAdminClient();
  const startPayload = /^\/start(?:\s+(\S+))?$/.exec(text)?.[1] ?? '';

  if (startPayload.startsWith('o_')) {
    return ownerLink(db, chat, startPayload.slice(2));
  }
  if (startPayload.startsWith('q_')) {
    return guestJoin(db, chat, startPayload.slice(2), update.message?.from?.first_name ?? 'Гость');
  }

  await reply(chat, [
    'Это бот QADAM.',
    '',
    'Гостю: отсканируйте QR-код заведения — он откроет этот чат с нужной ссылкой, и карта лояльности заведётся сама.',
    'Владельцу: в кабинете, в разделе «Автоматизации», есть код привязки — откройте ссылку оттуда.',
  ].join('\n'));
  return NextResponse.json({ ok: true, handled: 'help' });
}

/** Attaches an owner's chat to their business, so the assistant can reach them. */
async function ownerLink(db: ReturnType<typeof createAdminClient>, chat: string, code: string) {
  const { data, error } = await db.rpc('claim_telegram_link', { p_code: code, p_chat_id: chat });
  if (error) {
    await reply(chat, 'Код привязки не подошёл. Откройте раздел «Автоматизации» в кабинете и получите новый — код действует один час.');
    return NextResponse.json({ ok: true, handled: 'owner_link_refused' });
  }
  const result = (data ?? {}) as { business_name?: string };
  await reply(chat, [
    `Готово. Этот чат привязан к заведению «${result.business_name ?? 'ваше заведение'}».`,
    '',
    'Каждое утро я буду присылать сюда один сигнал и одно предложенное действие. Запуск кампании всегда требует вашего подтверждения — я ничего не отправляю сам.',
  ].join('\n'));
  return NextResponse.json({ ok: true, handled: 'owner_linked' });
}

/**
 * Joins a guest to the loyalty programme from the bot.
 *
 * The identity is the Telegram chat, and it is passed to the same RPC the web
 * page uses, so consent, rate limiting and idempotency behave identically —
 * there is no second, looser path into the loyalty programme.
 */
async function guestJoin(db: ReturnType<typeof createAdminClient>, chat: string, token: string, displayName: string) {
  const { data, error } = await db.rpc('process_loyalty_join', {
    p_token: token,
    p_identity_type: 'telegram',
    p_identity_value: chat,
    p_display_name: displayName,
    p_loyalty_consent: true,
    // Marketing consent is a separate, explicit decision and is not implied by
    // scanning a code. The bot asks for it afterwards.
    p_marketing_consent: false,
    p_verification_kind: 'provider_verified',
    p_idempotency_key: `telegram:join:${token}:${chat}`,
    p_ip_key: `telegram:${chat}`,
  });

  if (error) {
    await reply(chat, 'Не получилось присоединиться: код мог устареть или быть отозван. Попробуйте отсканировать QR-код ещё раз.');
    return NextResponse.json({ ok: true, handled: 'guest_join_refused', reason: error.message });
  }

  const result = (data ?? {}) as { business_id?: string; customer_id?: string; stamps_balance?: number };
  if (result.business_id && result.customer_id) {
    await db.rpc('remember_channel_address', {
      p_business_id: result.business_id,
      p_channel: 'telegram',
      p_address: chat,
      p_customer_id: result.customer_id,
    });
  }

  await reply(chat, [
    'Карта заведена. Штампы будут копиться с каждым визитом.',
    `Сейчас на карте: ${result.stamps_balance ?? 1}.`,
    '',
    'Если хотите получать персональные предложения — напишите «да». Без этого я присылать ничего не буду.',
  ].join('\n'));
  return NextResponse.json({ ok: true, handled: 'guest_joined' });
}
