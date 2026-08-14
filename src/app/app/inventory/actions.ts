'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { canMarket, requireBusinessContext } from '@/server/qadam/repository';
import { describeDbError } from '@/server/qadam/errors';
import { loadSupplyPositions, persistSupplySnapshots } from '@/server/qadam/supply-core';

/**
 * Остатки: движение вносит человек, остаток считает база.
 *
 * Ни одно из этих действий не пишет остаток напрямую — все они записывают
 * событие, а сумму журнала обновляет функция в той же транзакции. Ключ
 * идемпотентности собирается здесь, а не в браузере: иначе двойной клик, ретрай
 * формы или вернувшийся назад пользователь списали бы товар дважды.
 */

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();

/** «12,5» → 12500 тысячных. Пустая строка — не ноль, а отсутствие ответа. */
function quantityMilli(form: FormData, key: string): number | null {
  const raw = text(form, key).replace(/\s/g, '').replace(',', '.');
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 1000);
}

function integer(form: FormData, key: string, fallback: number): number {
  const raw = text(form, key).replace(/\s/g, '');
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : fallback;
}

// Объявлены обычными функциями с явным `never`: только так TypeScript понимает,
// что после `fail(...)` выполнение не продолжается, и перестаёт считать
// проверенные значения возможно пустыми.
function back(query = ''): never {
  redirect(`/app/inventory${query}`);
}

function fail(message: string): never {
  back('?error=' + encodeURIComponent(message));
}

/** Заводит позицию вместе с политикой пополнения: без неё заказ не посчитать. */
export async function createSupplyItem(form: FormData) {
  const ctx = await requireBusinessContext();
  if (!canMarket(ctx.role)) throw new Error('FORBIDDEN');

  const name = text(form, 'name');
  if (name.length < 2) fail('Название позиции слишком короткое.');

  const packMilli = quantityMilli(form, 'packSize') ?? 1000;
  if (packMilli <= 0) fail('Размер упаковки должен быть больше нуля.');

  const { error } = await ctx.supabase.from('supply_items').insert({
    business_id: ctx.businessId,
    name_ru: name,
    unit: text(form, 'unit') || 'шт',
    category: text(form, 'category') || null,
    pack_size_milli: packMilli,
    moq_milli: quantityMilli(form, 'moq') ?? 0,
    min_stock_milli: quantityMilli(form, 'minStock') ?? 0,
    shelf_life_days: text(form, 'shelfLife') ? integer(form, 'shelfLife', 0) || null : null,
    lead_time_p80_hours: integer(form, 'leadHours', 48),
    is_mock: ctx.business.mode === 'demo',
  });

  if (error) fail(describeDbError(error));
  revalidatePath('/app/inventory');
  back('?saved=1');
}

/** Меняет политику: пороги, упаковку, партию, срок поставки. Остаток не трогает. */
export async function updateSupplyPolicy(form: FormData) {
  const ctx = await requireBusinessContext();
  if (!canMarket(ctx.role)) throw new Error('FORBIDDEN');

  const id = text(form, 'id');
  if (!id) fail('Позиция не выбрана.');

  const packMilli = quantityMilli(form, 'packSize');
  if (packMilli !== null && packMilli <= 0) fail('Размер упаковки должен быть больше нуля.');

  const { error } = await ctx.supabase
    .from('supply_items')
    .update({
      pack_size_milli: packMilli ?? undefined,
      moq_milli: quantityMilli(form, 'moq') ?? undefined,
      min_stock_milli: quantityMilli(form, 'minStock') ?? undefined,
      lead_time_p80_hours: integer(form, 'leadHours', 48),
      shelf_life_days: text(form, 'shelfLife') ? integer(form, 'shelfLife', 0) || null : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('business_id', ctx.businessId);

  if (error) fail(describeDbError(error));
  revalidatePath('/app/inventory');
  back('?policy=1');
}

/**
 * Вносит движение по позиции.
 *
 * Ключ идемпотентности собирается из позиции, типа, количества и минуты: два
 * одинаковых списания в одну минуту почти всегда означают двойную отправку
 * формы, а не два одинаковых расхода. Разные минуты дают разные ключи, поэтому
 * настоящий повторный расход через минуту пройдёт.
 */
export async function recordMovement(form: FormData) {
  const ctx = await requireBusinessContext();
  if (!canMarket(ctx.role)) throw new Error('FORBIDDEN');

  const itemId = text(form, 'itemId');
  const type = text(form, 'type');
  const amount = quantityMilli(form, 'quantity');

  if (!itemId) fail('Позиция не выбрана.');
  if (!['receive', 'consume', 'adjust', 'waste'].includes(type)) fail('Неизвестный тип движения.');
  if (amount === null || amount === 0) fail('Укажите количество, отличное от нуля.');

  // Направление задаёт тип, а не знак, введённый человеком. Исключение —
  // корректировка: там знак и есть смысл операции.
  const delta =
    type === 'consume' || type === 'waste'
      ? -Math.abs(amount)
      : type === 'receive'
        ? Math.abs(amount)
        : amount;

  // Списание обязано назвать причину: «увяло» и «повредили при сборке» ведут к
  // разным решениям — первое меняет размер заказа, второе учит сборщика.
  const wasteReason = type === 'waste' ? text(form, 'wasteReason') || 'withered' : null;

  const minute = new Date().toISOString().slice(0, 16);
  const idempotencyKey = `ui-${itemId}-${type}-${delta}-${minute}`;

  const { error } = await ctx.supabase.rpc('record_inventory_event', {
    p_business_id: ctx.businessId,
    p_supply_item_id: itemId,
    p_location_id: null as unknown as string,
    p_event_type: type,
    p_quantity_delta_milli: delta,
    p_source: 'manual',
    p_idempotency_key: idempotencyKey,
    p_occurred_at: new Date().toISOString(),
    p_note: text(form, 'note') || (null as unknown as string),
    p_allow_negative: type === 'adjust' && form.get('allowNegative') === 'on',
    p_expires_at: null as unknown as string,
    p_waste_reason: wasteReason as unknown as string,
    p_unit_cost_minor: null as unknown as number,
  });

  if (error) {
    const message = error.message.includes('would leave')
      ? 'Больше, чем стоит на витрине. Если цветы ушли раньше — внесите корректировку после ревизии.'
      : describeDbError(error);
    fail(message);
  }

  revalidatePath('/app/inventory');
  revalidatePath('/app/decisions');
  back('?moved=1');
}

/** Пересчитывает прогноз и риск и сохраняет снимки — то, что иначе сделал бы цикл. */
export async function recomputeRisks() {
  const ctx = await requireBusinessContext();
  if (!canMarket(ctx.role)) throw new Error('FORBIDDEN');

  const { positions } = await loadSupplyPositions();
  await persistSupplySnapshots(positions);

  revalidatePath('/app/inventory');
  revalidatePath('/app/decisions');
  back('?recomputed=1');
}
