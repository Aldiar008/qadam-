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
  callback_query?: {
    id?: string;
    data?: string;
    message?: { chat?: { id?: number | string } };
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

  // A pressed button arrives as a callback, not a message. Telegram keeps the
  // spinner turning until it is answered, so it is answered even when the
  // action is refused — a button that appears stuck reads as a broken product.
  if (update.callback_query) {
    return handleCallback(update.callback_query);
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

  // Marketing consent is a separate decision from joining, so it is taken
  // separately — and can be withdrawn the same way, in the same chat.
  const wantsMarketing = /^(да|иә|yes|ok|ок)$/i.test(text);
  const refusesMarketing = /^(нет|жоқ|no|стоп|stop|отписаться)$/i.test(text);
  if (wantsMarketing || refusesMarketing) {
    return marketingConsent(db, chat, wantsMarketing);
  }

  await reply(chat, [
    'Это бот QADAM.',
    '',
    'Гостю: отсканируйте QR-код заведения — он откроет этот чат с нужной ссылкой, и карта лояльности заведётся сама.',
    'Владельцу: в кабинете, в разделе «Автоматизации», есть код привязки — откройте ссылку оттуда.',
  ].join('\n'));
  return NextResponse.json({ ok: true, handled: 'help' });
}

/**
 * Handles a pressed button.
 *
 * The callback carries a contract id and nothing else. Whether this chat may
 * launch that contract is decided in the database, from the linkage, not from
 * anything the button says about itself.
 */
async function handleCallback(query: NonNullable<TelegramUpdate['callback_query']>) {
  const chat = String(query.message?.chat?.id ?? '');
  const data = String(query.data ?? '');
  const answer = async (text: string) => {
    if (!process.env.TELEGRAM_BOT_TOKEN || !query.id) return;
    await fetch(api('answerCallbackQuery'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ callback_query_id: query.id, text, show_alert: false }),
    }).catch(() => {});
  };

  const contractId = /^launch:([0-9a-f-]{36})$/.exec(data)?.[1];
  if (!chat || !contractId) {
    await answer('Не понял эту кнопку.');
    return NextResponse.json({ ok: true, handled: 'callback_unknown' });
  }

  const db = createAdminClient();
  const { data: launched, error } = await db.rpc('launch_contract_from_chat', {
    p_chat_id: chat,
    p_contract_id: contractId,
    p_name: 'Запуск из Telegram',
    p_channel: 'telegram',
  });

  if (error) {
    await answer('Запуск отклонён.');
    await reply(chat, `Запустить не получилось: ${error.message}`);
    return NextResponse.json({ ok: true, handled: 'launch_refused', reason: error.message });
  }

  const result = (launched ?? {}) as { duplicate?: boolean };
  await answer(result.duplicate ? 'Эта кампания уже запущена.' : 'Принято.');
  await reply(chat, result.duplicate
    ? 'Эта кампания уже была запущена — второй раз она не уйдёт.'
    : [
        'Кампания подтверждена и поставлена в очередь.',
        '',
        'Перед каждой отправкой заново проверяются согласие, тихие часы и лимиты: получателей может оказаться меньше, чем в плане, и это нормально. Отчёт пришлю, когда цикл отработает.',
      ].join('\n'));
  return NextResponse.json({ ok: true, handled: 'launched' });
}

/**
 * Records a guest's decision about marketing, taken in the chat they are in.
 *
 * Withdrawal is handled by the same path as agreement. A channel that can only
 * collect consent and never release it is not consent.
 */
async function marketingConsent(db: ReturnType<typeof createAdminClient>, chat: string, granted: boolean) {
  const { data, error } = await db.rpc('customer_for_channel_address', { p_channel: 'telegram', p_address: chat });
  // The function returns a set, so the generated types describe a row array;
  // narrowing here keeps the shape explicit rather than asserting it away.
  const rows = (Array.isArray(data) ? data : [data]) as { business_id?: string; customer_id?: string }[];
  const found = rows[0];
  if (error || !found?.customer_id || !found.business_id) {
    await reply(chat, 'Сначала присоединитесь по QR-коду заведения — тогда я буду знать, чью карту менять.');
    return NextResponse.json({ ok: true, handled: 'consent_no_customer' });
  }

  const { error: consentError } = await db.rpc('record_channel_consent', {
    p_business_id: found.business_id,
    p_customer_id: found.customer_id,
    p_scope: 'marketing.telegram',
    p_granted: granted,
    p_source: 'telegram_bot',
    p_evidence: { chat_masked: `tg:***${chat.slice(-4)}` },
  });
  if (consentError) {
    await reply(chat, 'Не получилось записать решение. Попробуйте ещё раз через минуту.');
    return NextResponse.json({ ok: true, handled: 'consent_failed', reason: consentError.message });
  }

  await reply(chat, granted
    ? 'Записал: буду присылать персональные предложения этого заведения. Написать «нет» — и я перестану, без объяснений.'
    : 'Записал: предложения присылать не буду. Карта лояльности и штампы остаются при вас.');
  return NextResponse.json({ ok: true, handled: granted ? 'consent_granted' : 'consent_revoked' });
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
