import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The assistant that writes to an owner in Telegram.
 *
 * It reports and asks; it never decides. The confirmation button carries a
 * contract id and nothing else, and pressing it goes through the same launch
 * path as the cabinet — same Margin Shield decision, same send gate, same
 * one-launch-per-contract rule. A second surface for the same action must not
 * become a second, softer set of rules.
 */

const api = (method: string) => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN ?? ''}/${method}`;

export interface DigestOutcome {
  businessId: string;
  chats: number;
  sent: number;
  skipped: string | null;
}

interface Digest {
  business_name?: string;
  signal?: { metric_key?: string; change_bps?: number; confidence?: number; score?: number } | null;
  contract?: { id?: string; audience?: string; margin_allowed?: string; contribution_minor?: string } | null;
}

const money = (minor: string | undefined) =>
  minor ? `${Number(minor).toLocaleString('ru-RU')} ₸` : '—';

/** Formats the day's news the way a person reads a chat: short, then the ask. */
export function composeDigest(digest: Digest): { text: string; contractId: string | null } {
  const lines: string[] = [`${digest.business_name ?? 'Ваше заведение'} — что важно сегодня`];

  if (digest.signal) {
    const percent = ((digest.signal.change_bps ?? 0) / 100).toFixed(2).replace(/\.?0+$/, '');
    lines.push('', `Сигнал: ${digest.signal.metric_key}`,
      `Изменение: ${percent}% за сопоставимый период, уверенность ${digest.signal.confidence ?? 0}%.`,
      'Это наблюдение, а не утверждение о причине.');
  }

  if (digest.contract?.id) {
    lines.push('', 'Готово к запуску:',
      `получателей — ${digest.contract.audience ?? '—'}`,
      `вклад-маржа по базовому сценарию — ${money(digest.contract.contribution_minor)}`,
      `Margin Shield — ${digest.contract.margin_allowed === 'allowed' ? 'разрешает' : digest.contract.margin_allowed ?? 'решение не записано'}`,
      '', 'Запуск — по вашему подтверждению. Сам я ничего не отправляю.');
  } else {
    lines.push('', 'Готового к запуску контракта нет. Соберите его в кабинете, когда будет время.');
  }

  return { text: lines.join('\n'), contractId: digest.contract?.id ?? null };
}

async function telegram(method: string, body: unknown): Promise<boolean> {
  if (!process.env.TELEGRAM_BOT_TOKEN) return false;
  try {
    const response = await fetch(api(method), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Sends today's digest to every chat linked to this business.
 *
 * A business with no linked chat is not a failure and not a warning: most
 * businesses will never link one, and treating that as a problem would fill the
 * cycle report with noise.
 */
export async function sendOwnerDigest(db: SupabaseClient, businessId: string): Promise<DigestOutcome> {
  const { data: chatRows, error: chatError } = await db.rpc('owner_chats', { p_business_id: businessId });
  if (chatError) throw new Error(`could not read linked chats for ${businessId}: ${chatError.message}`);
  const chats = ((chatRows ?? []) as { chat_id?: string }[]).map((row) => row.chat_id).filter(Boolean) as string[];
  if (!chats.length) return { businessId, chats: 0, sent: 0, skipped: 'no_linked_chat' };

  const { data: digestData, error: digestError } = await db.rpc('owner_digest', { p_business_id: businessId });
  if (digestError) throw new Error(`could not build the digest for ${businessId}: ${digestError.message}`);
  // Nothing to report is a legitimate answer, and sending an empty daily
  // message is how an assistant becomes something people mute.
  if (!digestData) return { businessId, chats: chats.length, sent: 0, skipped: 'nothing_to_report' };

  const { text, contractId } = composeDigest(digestData as Digest);
  const reply_markup = contractId
    ? { inline_keyboard: [[{ text: 'Подтвердить запуск', callback_data: `launch:${contractId}` }]] }
    : undefined;

  let sent = 0;
  for (const chat of chats) {
    if (await telegram('sendMessage', { chat_id: chat, text, disable_web_page_preview: true, reply_markup })) sent += 1;
  }
  return { businessId, chats: chats.length, sent, skipped: null };
}
