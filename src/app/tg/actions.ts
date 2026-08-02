'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createAdminClient } from '@/lib/supabase/admin';
import { readTelegramSession } from '@/server/telegram/session';

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

  if (error) back(`error=${encodeURIComponent('Решение не записалось. Попробуйте ещё раз.')}`);

  revalidatePath('/tg/card');
  back(`done=${encodeURIComponent(granted
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
