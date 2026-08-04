'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createAdminClient } from '@/lib/supabase/admin';
import { searchMarketForItem } from '@/server/qadam/supply-search';
import { readTelegramSession } from '@/server/telegram/session';
import { INQUIRY_CATEGORY_LABELS, triageInquiry } from '@/server/qadam/inquiry-desk';

/**
 * What a guest may do from inside their own card.
 *
 * Every action re-reads the session cookie and takes the business and customer
 * from it, never from the form. A form field naming somebody else's card would
 * simply be ignored, because it is never read.
 */

const back = (query: string): never => redirect(`/tg/card?${query}`);

export async function redeemFromCard(form: FormData) {
  const session = await readTelegramSession();
  if (!session?.customerId) redirect('/tg');

  const rewardId = String(form.get('rewardId') ?? '').trim();
  if (!rewardId) back(`error=${encodeURIComponent('Награда не выбрана.')}`);

  const db = createAdminClient();
  const { data, error } = await db.rpc('redeem_reward_for_customer', {
    p_business_id: session.businessId,
    p_customer_id: session.customerId,
    p_reward_id: rewardId,
    // One key per attempt: a double tap on a phone must not spend the stamps twice.
    p_idempotency_key: `tg:redeem:${session.chatId}:${rewardId}:${randomUUID()}`,
  });

  if (error) {
    const message = /insufficient/.test(error.message)
      ? 'Штампов пока не хватает — награда останется на месте.'
      : /inventory/.test(error.message)
        ? 'Эту награду уже разобрали. Заведение скоро добавит ещё.'
        : 'Не получилось списать награду. Попробуйте ещё раз через минуту.';
    back(`error=${encodeURIComponent(message)}`);
  }

  const result = (data ?? {}) as { reward_ru?: string; stamps_balance?: number; duplicate?: boolean };
  revalidatePath('/tg/card');
  back(`done=${encodeURIComponent(result.duplicate
    ? 'Эта награда уже была получена.'
    : `Готово: «${result.reward_ru ?? 'награда'}» ваша. Осталось штампов: ${result.stamps_balance ?? 0}. Покажите этот экран на кассе.`)}`);
}

export async function setMarketingConsentFromCard(form: FormData) {
  const session = await readTelegramSession();
  if (!session?.customerId) redirect('/tg');

  const returnTo = String(form.get('back') ?? '/tg/card');
  const granted = String(form.get('granted') ?? '') === 'yes';
  const db = createAdminClient();
  const { error } = await db.rpc('record_channel_consent', {
    p_business_id: session.businessId,
    p_customer_id: session.customerId,
    p_scope: 'marketing.telegram',
    p_granted: granted,
    p_source: 'telegram_mini_app',
    p_evidence: { chat_masked: `tg:***${session.chatId.slice(-4)}` },
  });

  if (error) redirect(`${returnTo}?error=${encodeURIComponent('Решение не записалось. Попробуйте ещё раз.')}`);

  await db.rpc('record_customer_interaction', {
    p_business_id: session.businessId, p_customer_id: session.customerId,
    p_channel: 'telegram', p_direction: 'inbound', p_kind: 'consent',
    p_body: granted ? 'Гость разрешил присылать предложения' : 'Гость отозвал согласие на рассылку',
    p_metadata: { granted, surface: 'mini_app' },
  });

  revalidatePath('/tg/card');
  revalidatePath('/tg/offers');
  redirect(`${returnTo}?done=${encodeURIComponent(granted
    ? 'Записали: будем присылать предложения этого заведения.'
    : 'Записали: предложения присылать не будем. Карта и штампы остаются при вас.')}`);
}

/**
 * The owner confirming a launch from the Mini App.
 *
 * The same path as the cabinet and the bot button: `launch_contract_from_chat`
 * re-checks the role behind this chat, Margin Shield and one-launch-per-contract
 * in the database. Nothing about being on a phone relaxes any of it.
 */
export async function launchFromMiniApp(form: FormData) {
  const session = await readTelegramSession();
  if (!session?.ownerUserId) redirect('/tg');

  const contractId = String(form.get('contractId') ?? '').trim();
  if (!contractId) redirect(`/tg/owner?error=${encodeURIComponent('Контракт не выбран.')}`);

  const db = createAdminClient();
  const { data, error } = await db.rpc('launch_contract_from_chat', {
    p_chat_id: session.chatId,
    p_contract_id: contractId,
    p_name: 'Запуск из Telegram',
    p_channel: 'telegram',
  });

  if (error) redirect(`/tg/owner?error=${encodeURIComponent(`Запуск отклонён: ${error.message}`)}`);

  const result = (data ?? {}) as { duplicate?: boolean };
  revalidatePath('/tg/owner');
  redirect(`/tg/owner?done=${encodeURIComponent(result.duplicate
    ? 'Эта кампания уже была запущена — второй раз она не уйдёт.'
    : 'Кампания подтверждена и поставлена в очередь. Перед каждой отправкой заново проверяются согласие, тихие часы и лимиты.')}`);
}

/**
 * Гость пишет заведению.
 *
 * Сообщение сначала разбирается: тема, настроение, срочность и проект ответа.
 * Бытовой вопрос, ответ на который есть в данных заведения и тема которого
 * разрешена владельцем, уходит гостю сразу — будить человека ради «во сколько
 * вы открываетесь» незачем.
 *
 * Жалоба и всё денежное не отвечаются машиной никогда: у продукта нет на них
 * ответа, а бодрый факт о часах работы в ответ на «у меня проблема» хуже
 * молчания. Такое обращение ждёт владельца, и его чат об этом узнаёт.
 */
export async function sendMessageToVenue(form: FormData) {
  const session = await readTelegramSession();
  if (!session?.customerId) redirect('/tg');

  const body = String(form.get('body') ?? '').trim().slice(0, 1500);
  if (body.length < 3) redirect(`/tg/chat?error=${encodeURIComponent('Напишите чуть подробнее.')}`);

  const db = createAdminClient();
  const { data: inquiryId, error } = await db.rpc('record_customer_interaction', {
    p_business_id: session.businessId,
    p_customer_id: session.customerId,
    p_channel: 'telegram',
    p_direction: 'inbound',
    p_kind: 'question',
    p_body: body,
    p_metadata: { surface: 'mini_app' },
  });
  if (error) redirect(`/tg/chat?error=${encodeURIComponent('Сообщение не сохранилось. Попробуйте ещё раз.')}`);

  // Разбор и, если тема разрешена владельцем, ответ — сразу. До этого любое
  // сообщение будило владельца, включая вопрос о часах работы, ответ на который
  // лежит в его же данных.
  const outcome = await triageInquiry(db, {
    businessId: session.businessId,
    customerId: session.customerId,
    inquiryId: String(inquiryId),
    body,
  }).catch(() => null);

  // Уведомление — только о том, что действительно ждёт человека. Сообщать
  // владельцу о каждом отвеченном вопросе значит приучить его не читать
  // уведомления вовсе.
  if (!outcome?.sent) {
    await db.from('notifications').insert({
      business_id: session.businessId,
      user_id: null,
      notification_type: 'guest_message',
      category: outcome?.triage.sentiment === 'negative' ? 'risk' : 'approval',
      title: `${outcome ? INQUIRY_CATEGORY_LABELS[outcome.decision.category] : 'Сообщение'} от гостя: ${session.name}`,
      body: body.slice(0, 300),
      action_url: '/app/inbox',
      is_mock: false,
    });
  }

  // The owner's chat, if it is linked: a message a guest wrote is worth an
  // interruption, unlike most of what a product sends.
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (token && !outcome?.sent) {
    const { data: chats } = await db.rpc('owner_chats', { p_business_id: session.businessId });
    for (const row of (chats ?? []) as { chat_id: string }[]) {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: row.chat_id,
          text: `Гость ${session.name} написал вам:

«${body}»

Ответить можно в разделе «Обращения» — там уже готов проект ответа.`,
          disable_web_page_preview: true,
        }),
      }).catch(() => {});
    }
  }

  revalidatePath('/tg/chat');
  redirect(`/tg/chat?sent=${outcome?.sent ? 'answered' : '1'}`);
}

/** Пересобрать предложения прямо из приложения. */
export async function refreshRecommendationsFromMiniApp() {
  const session = await readTelegramSession();
  if (!session?.ownerUserId) redirect('/tg');

  const db = createAdminClient();
  const { data, error } = await db.rpc('recommend_from_signals', { p_business_id: session.businessId });
  if (error) redirect(`/tg/owner?error=${encodeURIComponent('Не получилось пересобрать: ' + error.message)}`);

  const result = (data ?? {}) as { created?: number; refreshed?: number };
  revalidatePath('/tg/owner');
  redirect(`/tg/owner?done=${encodeURIComponent(`Пересобрано. Новых: ${result.created ?? 0}, обновлено: ${result.refreshed ?? 0}.`)}`);
}

/**
 * Владелец отвечает гостю прямо из приложения.
 *
 * The reply is written to the same thread the guest reads in their own app and
 * pushed to their chat, so an answer given at midnight is not waiting to be
 * discovered. It is marked as coming from a person, because the guest asked for
 * a person.
 */
export async function answerGuestAsOwner(form: FormData) {
  const session = await readTelegramSession();
  if (!session?.ownerUserId) redirect('/tg');

  const customerId = String(form.get('customerId') ?? '').trim();
  const inquiryId = String(form.get('inquiryId') ?? '').trim();
  const body = String(form.get('body') ?? '').trim().slice(0, 1500);
  if (!customerId || body.length < 2) redirect(`/tg/owner/inbox?error=${encodeURIComponent('Пустой ответ не отправляется.')}`);

  const db = createAdminClient();
  // Когда ответ относится к конкретному обращению, он идёт через
  // `answer_inquiry`: одна запись создаёт сообщение гостю и закрывает
  // обращение. Раздельно они расходятся — гость получает ответ, а обращение
  // навсегда остаётся «ждёт владельца».
  const { error } = inquiryId
    ? await db.rpc('answer_inquiry', { p_inquiry_id: inquiryId, p_body: body, p_answered_by: 'owner' })
    : await db.rpc('record_customer_interaction', {
      p_business_id: session.businessId,
      p_customer_id: customerId,
      p_channel: 'telegram',
      p_direction: 'outbound',
      p_kind: 'answer',
      p_body: body,
      p_metadata: { source: 'owner', surface: 'mini_app' },
    });
  if (error) redirect(`/tg/owner/inbox?error=${encodeURIComponent('Ответ не сохранился.')}`);

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (token) {
    const { data: address } = await db.rpc('resolve_channel_address', {
      p_business_id: session.businessId, p_channel: 'telegram', p_customer_id: customerId,
    });
    if (address) {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: String(address), text: body, disable_web_page_preview: true }),
      }).catch(() => {});
    }
  }

  revalidatePath('/tg/owner/inbox');
  redirect('/tg/owner/inbox?sent=1');
}

/** Отметить, что позиция закончилась или закуплена — прямо со склада. */
export async function markSupplyFromMiniApp(form: FormData) {
  const session = await readTelegramSession();
  if (!session?.ownerUserId) redirect('/tg');

  const id = String(form.get('id') ?? '').trim();
  const needed = String(form.get('needed') ?? '') === 'yes';
  if (!id) redirect('/tg/owner/supply');

  const db = createAdminClient();
  const { error } = await db.from('supply_items')
    .update({ needed, updated_at: new Date().toISOString() })
    .eq('id', id).eq('business_id', session.businessId);
  if (error) redirect(`/tg/owner/supply?error=${encodeURIComponent('Не сохранилось. Попробуйте ещё раз.')}`);

  revalidatePath('/tg/owner/supply');
  redirect(`/tg/owner/supply?done=${encodeURIComponent(needed ? 'Отметили: закончилось.' : 'Отметили: закупили.')}`);
}

/**
 * «Найти дешевле» с телефона.
 *
 * The moment the owner sees an empty shelf is the moment to look, and that
 * moment happens in the storeroom, not at a desk. Same code as the cabinet:
 * prices come from Kaspi with their links and stay «не проверено».
 */
export async function searchMarketFromMiniApp(form: FormData) {
  const session = await readTelegramSession();
  if (!session?.ownerUserId) redirect('/tg');

  const itemId = String(form.get('id') ?? '').trim();
  if (!itemId) redirect('/tg/owner/supply');

  const db = createAdminClient();
  const [{ data: business }, { data: location }] = await Promise.all([
    db.from('businesses').select('mode').eq('id', session.businessId).maybeSingle(),
    db.from('business_locations').select('city').eq('business_id', session.businessId).eq('is_active', true).order('created_at').limit(1).maybeSingle(),
  ]);

  const outcome = await searchMarketForItem(db, {
    businessId: session.businessId,
    itemId,
    isMock: business?.mode === 'demo',
    city: location?.city ?? undefined,
  });

  revalidatePath('/tg/owner/supply');
  redirect(`/tg/owner/supply?${outcome.status === 'ok' ? 'done' : 'error'}=${encodeURIComponent(outcome.message)}`);
}
