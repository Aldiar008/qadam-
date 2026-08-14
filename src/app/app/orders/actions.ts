'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { canManage, canMarket, requireBusinessContext } from '@/server/qadam/repository';
import { describeDbError } from '@/server/qadam/errors';

/**
 * Заказы и приёмка.
 *
 * Отправка отделена от подтверждения решения намеренно: подтверждая решение,
 * владелец соглашается с расчётом, а отправляя заказ — берёт на себя деньги и
 * обязательство перед поставщиком. Это два разных действия, и продукт не вправе
 * склеивать их ради удобства.
 */

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();

function quantityMilli(form: FormData, key: string): number | null {
  const raw = text(form, key).replace(/\s/g, '').replace(',', '.');
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 1000);
}

function integer(form: FormData, key: string, fallback = 0): number {
  const raw = text(form, key).replace(/\s/g, '');
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.round(value) : fallback;
}

function back(query = ''): never {
  redirect(`/app/orders${query}`);
}

function fail(message: string): never {
  back('?error=' + encodeURIComponent(message));
}

/** Двигает заказ по его жизненному циклу. Правила переходов стережёт база. */
export async function advanceOrder(form: FormData) {
  const ctx = await requireBusinessContext();
  if (!canMarket(ctx.role)) throw new Error('FORBIDDEN');

  const id = text(form, 'id');
  const target = text(form, 'status');
  if (!id) fail('Заказ не выбран.');

  const now = new Date().toISOString();
  const patch = target === 'sent'
    ? { status: target, sent_at: now, updated_at: now }
    : { status: target, updated_at: now };

  const { error } = await ctx.supabase
    .from('purchase_orders')
    .update(patch)
    .eq('id', id)
    .eq('business_id', ctx.businessId);

  if (error) {
    const message = error.message.includes('cannot go from')
      ? 'Такой переход запрещён: заказ нельзя принять, минуя отправку.'
      : describeDbError(error);
    fail(message);
  }

  revalidatePath('/app/orders');
  back('?moved=1');
}

/** Отменяет заказ. Доступно только до того, как он уехал. */
export async function cancelOrder(form: FormData) {
  const ctx = await requireBusinessContext();
  if (!canManage(ctx.role)) fail('Отменить заказ может владелец или управляющий.');

  const id = text(form, 'id');
  if (!id) fail('Заказ не выбран.');

  const { error } = await ctx.supabase
    .from('purchase_orders')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('business_id', ctx.businessId);

  if (error) fail(describeDbError(error));
  revalidatePath('/app/orders');
  back('?cancelled=1');
}

/**
 * Принимает строку заказа.
 *
 * Одним вызовом: остаток, партия со сроком по фактической свежести, расхождения
 * и пересчёт надёжности поставщика. Половина приёмки хуже, чем её отсутствие —
 * остаток вырос бы, а заказ остался в пути, и следующее решение построилось бы
 * на лжи.
 */
export async function receiveItem(form: FormData) {
  const ctx = await requireBusinessContext();
  if (!canMarket(ctx.role)) throw new Error('FORBIDDEN');

  const itemId = text(form, 'itemId');
  const received = quantityMilli(form, 'received');
  const damaged = quantityMilli(form, 'damaged') ?? 0;
  const freshnessRaw = text(form, 'freshness');
  const delay = integer(form, 'delay', 0);

  if (!itemId) fail('Строка заказа не выбрана.');
  if (received === null) fail('Укажите, сколько реально привезли.');
  if (damaged > received) fail('Брака не может быть больше, чем привезли.');

  const { error } = await ctx.supabase.rpc('receive_order_item', {
    p_order_item_id: itemId,
    p_received_milli: received,
    p_damaged_milli: damaged,
    p_freshness_days: freshnessRaw ? integer(form, 'freshness', 0) : (null as unknown as number),
    p_delay_hours: delay,
    p_reason: text(form, 'reason') || (null as unknown as string),
  });

  if (error) {
    const message = error.message.includes('already been received')
      ? 'Эта строка заказа уже принята. Повторная приёмка удвоила бы остаток.'
      : error.message.includes('never sent')
        ? 'Нельзя принять заказ, который ещё не отправлен поставщику.'
        : describeDbError(error);
    fail(message);
  }

  revalidatePath('/app/orders');
  revalidatePath('/app/inventory');
  revalidatePath('/app/suppliers');
  back('?received=1');
}
