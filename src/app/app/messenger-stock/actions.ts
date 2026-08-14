'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { parseStockMessage, suggestOperation, type KnownItem } from '@/domain/stock-message';
import { canMarket, requireBusinessContext } from '@/server/qadam/repository';
import { describeDbError } from '@/server/qadam/errors';

/**
 * Остатки из чата.
 *
 * Сообщение не меняет витрину. Оно превращается в предложение: позиция,
 * количество, единица и уверенность разбора. Остаток меняет человек, который
 * посмотрел на предложение и согласился — и он же может поправить всё, что
 * разбор понял неверно.
 *
 * Живого Telegram и WhatsApp здесь нет: канал помечен как тренажёр, и продукт
 * говорит об этом прямо, а не намекает интерфейсом.
 */

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();

function quantityMilli(form: FormData, key: string): number | null {
  const raw = text(form, key).replace(/\s/g, '').replace(',', '.');
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 1000);
}

function back(query = ''): never {
  redirect(`/app/messenger-stock${query}`);
}

function fail(message: string): never {
  back('?error=' + encodeURIComponent(message));
}

/** Принимает сообщение, разбирает его и сохраняет предложением. */
export async function receiveMessage(form: FormData) {
  const ctx = await requireBusinessContext();
  if (!canMarket(ctx.role)) throw new Error('FORBIDDEN');

  const body = text(form, 'body');
  const author = text(form, 'author') || 'Флорист';
  if (body.length < 2) fail('Сообщение пустое.');

  const { data: items } = await ctx.supabase
    .from('supply_items')
    .select('id,name_ru,unit,category')
    .eq('business_id', ctx.businessId);

  const known: KnownItem[] = (items ?? []).map((row) => ({
    id: row.id,
    name: row.name_ru,
    unit: row.unit,
    // Категория работает прозвищем: «зелени осталось два пучка» — про эвкалипт.
    aliases: row.category ? [row.category] : undefined,
  }));

  const parsed = parseStockMessage(body, known);

  // Идентификатор канала собирается детерминированно из текста и минуты: та же
  // фраза, отправленная дважды подряд, не создаст второе предложение.
  const minute = new Date().toISOString().slice(0, 16);
  const externalId = `sim-${Buffer.from(`${author}|${body}|${minute}`).toString('base64url').slice(0, 40)}`;

  const { error } = await ctx.supabase.from('stock_messages').insert({
    business_id: ctx.businessId,
    channel: 'simulator',
    external_id: externalId,
    author,
    body,
    parsed_item_id: parsed.itemId,
    parsed_quantity_milli: parsed.quantityMilli,
    parsed_unit: parsed.unit,
    confidence_ppm: parsed.confidencePpm,
    candidates: parsed.candidates as never,
    status: parsed.outcome,
    is_simulated: true,
    is_mock: ctx.business.mode === 'demo',
  });

  if (error) {
    // Повтор того же сообщения — не ошибка пользователя, а защита от дубля.
    const message = error.code === '23505'
      ? 'Это сообщение уже разобрано — посмотрите список ниже.'
      : describeDbError(error);
    fail(message);
  }

  revalidatePath('/app/messenger-stock');
  back(`?parsed=${parsed.outcome}&op=${suggestOperation(body)}`);
}

/**
 * Подтверждает предложение и меняет остаток.
 *
 * Позиция, количество и вид движения приходят из формы, а не из разбора:
 * человек мог поправить любое из них, и его правка важнее догадки парсера.
 */
export async function confirmMessage(form: FormData) {
  const ctx = await requireBusinessContext();
  if (!canMarket(ctx.role)) throw new Error('FORBIDDEN');

  const id = text(form, 'id');
  const itemId = text(form, 'itemId');
  const quantity = quantityMilli(form, 'quantity');
  const operation = text(form, 'operation') || 'adjust';
  const unit = text(form, 'unit');

  if (!id) fail('Сообщение не выбрано.');
  if (!itemId) fail('Выберите позицию: разбор мог понять её неверно.');
  if (quantity === null) fail('Укажите количество.');

  const { error } = await ctx.supabase.rpc('confirm_stock_message', {
    p_message_id: id,
    p_item_id: itemId,
    p_quantity_milli: quantity,
    p_event_type: operation,
    // Сверку с учётной единицей делает база: правило про целостность данных
    // должно жить рядом с данными, а не в одном из вызывающих экранов.
    p_unit: unit || (null as unknown as string),
  });

  if (error) {
    const message = error.message.includes('already been confirmed')
      ? 'Это сообщение уже подтверждено — остаток изменён один раз.'
      : error.message.includes('is measured in')
        ? 'Единица не совпадает с учётной. Пересчитайте количество в учётные единицы — иначе витрина разойдётся с журналом.'
        : error.message.includes('would leave')
          ? 'Столько списать нельзя: на витрине меньше. Проверьте количество.'
          : describeDbError(error);
    fail(message);
  }

  revalidatePath('/app/messenger-stock');
  revalidatePath('/app/inventory');
  revalidatePath('/app/decisions');
  back('?confirmed=1');
}

/** Отклоняет предложение: разбор ошибся, а витрина остаётся как была. */
export async function rejectMessage(form: FormData) {
  const ctx = await requireBusinessContext();
  if (!canMarket(ctx.role)) throw new Error('FORBIDDEN');

  const id = text(form, 'id');
  if (!id) fail('Сообщение не выбрано.');

  const { error } = await ctx.supabase
    .from('stock_messages')
    .update({ status: 'rejected' })
    .eq('id', id)
    .eq('business_id', ctx.businessId)
    .neq('status', 'confirmed');

  if (error) fail(describeDbError(error));
  revalidatePath('/app/messenger-stock');
  back('?rejected=1');
}
