'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { canMarket, requireBusinessContext } from '@/server/qadam/repository';
import { describeDbError } from '@/server/qadam/errors';

/**
 * Закупки: что покупаем, почём сейчас и где дешевле.
 *
 * Every price here is a row somebody entered or imported, with a source and a
 * date. Nothing is «найдено в интернете» unless a link came with it, and even
 * then it stays unverified until a person opens that link — because an owner
 * ordering against a made-up price is the exact failure this product is built
 * not to produce.
 */

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
const positive = (form: FormData, key: string): number | null => {
  const raw = text(form, key);
  if (!raw) return null;
  const value = Number(raw.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
};

const back = (query = '') => redirect(`/app/supply${query}`);

export async function saveSupplyItem(form: FormData) {
  const ctx = await requireBusinessContext();
  if (!canMarket(ctx.role)) throw new Error('FORBIDDEN');

  const name = text(form, 'name');
  if (name.length < 2) back('?error=' + encodeURIComponent('Название позиции слишком короткое.'));

  const row = {
    business_id: ctx.businessId,
    name_ru: name,
    unit: text(form, 'unit') || 'шт',
    current_price_minor: positive(form, 'currentPrice'),
    current_supplier: text(form, 'supplier') || null,
    monthly_quantity: positive(form, 'monthlyQuantity'),
    needed: form.get('needed') === 'on',
    is_mock: ctx.business.mode === 'demo',
  };

  const { error } = await ctx.supabase.from('supply_items').upsert(row, { onConflict: 'business_id,name_ru' });
  if (error) back('?error=' + encodeURIComponent(describeDbError(error)));

  revalidatePath('/app/supply');
  back('?saved=1');
}

/** «Закончилось» и «есть» — одно нажатие, потому что так это и происходит. */
export async function toggleSupplyNeeded(form: FormData) {
  const ctx = await requireBusinessContext();
  if (!canMarket(ctx.role)) throw new Error('FORBIDDEN');
  const id = text(form, 'id');
  const needed = text(form, 'needed') === 'yes';

  const { error } = await ctx.supabase.from('supply_items')
    .update({ needed, updated_at: new Date().toISOString() })
    .eq('id', id).eq('business_id', ctx.businessId);
  if (error) back('?error=' + encodeURIComponent(describeDbError(error)));

  revalidatePath('/app/supply');
  back(needed ? '?needed=1' : '');
}

export async function addSupplyOffer(form: FormData) {
  const ctx = await requireBusinessContext();
  if (!canMarket(ctx.role)) throw new Error('FORBIDDEN');

  const itemId = text(form, 'itemId');
  const supplier = text(form, 'supplier');
  const price = positive(form, 'price');
  if (!itemId || supplier.length < 2 || price === null) {
    back('?error=' + encodeURIComponent('Нужны поставщик и цена.'));
    return;
  }

  const url = text(form, 'url');
  const { error } = await ctx.supabase.from('supply_offers').insert({
    business_id: ctx.businessId,
    supply_item_id: itemId,
    supplier,
    price_minor: price,
    pack_size: Math.max(1, positive(form, 'packSize') ?? 1),
    url: url || null,
    // Typed by the owner from a real price list or a call, so it counts as
    // checked. Anything found automatically arrives unverified.
    source: 'owner',
    verified: true,
    is_mock: ctx.business.mode === 'demo',
  });
  if (error) back('?error=' + encodeURIComponent(describeDbError(error)));

  revalidatePath('/app/supply');
  back('?offer=1');
}

export async function verifySupplyOffer(form: FormData) {
  const ctx = await requireBusinessContext();
  if (!canMarket(ctx.role)) throw new Error('FORBIDDEN');
  const id = text(form, 'offerId');

  const { error } = await ctx.supabase.from('supply_offers')
    .update({ verified: true }).eq('id', id).eq('business_id', ctx.businessId);
  if (error) back('?error=' + encodeURIComponent(describeDbError(error)));

  revalidatePath('/app/supply');
  back('?verified=1');
}

export async function removeSupplyOffer(form: FormData) {
  const ctx = await requireBusinessContext();
  if (!canMarket(ctx.role)) throw new Error('FORBIDDEN');
  const id = text(form, 'offerId');

  const { error } = await ctx.supabase.from('supply_offers').delete().eq('id', id).eq('business_id', ctx.businessId);
  if (error) back('?error=' + encodeURIComponent(describeDbError(error)));

  revalidatePath('/app/supply');
  back();
}
