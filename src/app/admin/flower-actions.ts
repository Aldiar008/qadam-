'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { describeDbError } from '@/server/qadam/errors';
import { requirePlatformAdmin } from '@/server/qadam/admin';
import type { Json } from '@/types/database.generated';

/**
 * Справочники цветочного магазина в руках администратора платформы.
 *
 * Правила те же, что у остальной консоли: у каждого изменения есть причина, и
 * оно проходит через `admin_audit`, который без причины отказывает. Удаления
 * нет нигде — только архивирование, потому что на любую строку справочника уже
 * могли сослаться настройки живого магазина.
 */

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
const number = (form: FormData, key: string, fallback: number) => {
  const raw = text(form, key);
  const value = Number(raw);
  return raw && Number.isFinite(value) ? value : fallback;
};
const optionalNumber = (form: FormData, key: string) => {
  const raw = text(form, key);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
};
const bool = (form: FormData, key: string) => form.get(key) === 'on' || form.get(key) === 'true';

function back(path: string, extra = ''): never {
  redirect(`${path}${extra}`);
}

async function audit(
  ctx: Awaited<ReturnType<typeof requirePlatformAdmin>>,
  action: string, resourceType: string, resourceId: string | null, resourceCode: string,
  before: unknown, after: unknown, reason: string, sensitive = false,
) {
  const { error } = await ctx.supabase.rpc('admin_audit', {
    p_action: action,
    p_resource_type: resourceType,
    p_resource_id: (resourceId ?? null) as unknown as string,
    p_resource_code: resourceCode,
    p_before: (before ?? null) as unknown as Json,
    p_after: (after ?? null) as unknown as Json,
    p_reason: reason,
    p_sensitive: sensitive,
  });
  return error;
}

// ---------------------------------------------------------------------------
// Категории цветов
// ---------------------------------------------------------------------------

export async function saveFlowerCategory(form: FormData) {
  const ctx = await requirePlatformAdmin(['platform_admin', 'platform_editor']);
  const id = text(form, 'id');
  const payload = {
    code: text(form, 'code'),
    name_ru: text(form, 'nameRu'),
    name_kk: text(form, 'nameKk'),
    // Псевдонимы — это то, как категорию называют у себя магазины. Без них
    // справочник пришлось бы навязывать переименованием чужого ассортимента.
    aliases: text(form, 'aliases').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean),
    sort_order: number(form, 'sortOrder', 0),
  };

  if (!payload.code || !payload.name_ru || !payload.name_kk) {
    back('/admin/flower-categories', '?error=' + encodeURIComponent('Код и оба названия обязательны.'));
  }

  let before: unknown = null;
  if (id) {
    const { data } = await ctx.supabase.from('flower_categories').select('*').eq('id', id).maybeSingle();
    before = data;
  }

  const result = id
    ? await ctx.supabase.from('flower_categories').update(payload).eq('id', id).select('id,code').single()
    : await ctx.supabase.from('flower_categories').insert({ ...payload, status: 'draft' }).select('id,code').single();
  if (result.error) back('/admin/flower-categories', `?error=${encodeURIComponent(describeDbError(result.error))}`);

  await audit(ctx, id ? 'flower_category.updated' : 'flower_category.created', 'flower_category',
    result.data.id, result.data.code, before, payload, text(form, 'reason'));

  revalidatePath('/admin/flower-categories');
  revalidatePath('/onboarding');
  back('/admin/flower-categories', '?saved=1');
}

export async function setFlowerCategoryStatus(form: FormData) {
  const ctx = await requirePlatformAdmin(['platform_admin', 'platform_editor']);
  const id = text(form, 'id');
  const status = text(form, 'status');

  const { data: before } = await ctx.supabase.from('flower_categories').select('*').eq('id', id).maybeSingle();
  if (!before) back('/admin/flower-categories', '?error=' + encodeURIComponent('Категория не найдена.'));

  const { error } = await ctx.supabase.from('flower_categories').update({ status }).eq('id', id);
  if (error) back('/admin/flower-categories', `?error=${encodeURIComponent(describeDbError(error))}`);

  // Архивирование убирает категорию из анкеты новых магазинов, но не трогает
  // тех, кто её уже выбрал: их настройка не должна исчезать от чужого решения.
  await audit(ctx, `flower_category.${status}`, 'flower_category', id, before.code, before, { status },
    text(form, 'reason') || 'Изменение статуса категории цветов', status === 'archived');

  revalidatePath('/admin/flower-categories');
  back('/admin/flower-categories', '?saved=1');
}

// ---------------------------------------------------------------------------
// Товарная политика
// ---------------------------------------------------------------------------

export async function savePolicyTemplate(form: FormData) {
  const ctx = await requirePlatformAdmin(['platform_admin', 'platform_editor']);
  const categoryId = text(form, 'categoryId');
  if (!categoryId) back('/admin/policies', '?error=' + encodeURIComponent('Выберите категорию.'));

  const payload = {
    category_id: categoryId,
    // Пустой срок означает «не портится» — упаковка и лента, а не «неизвестно».
    shelf_life_days: optionalNumber(form, 'shelfLifeDays'),
    pack_size_milli: Math.max(1, Math.round(number(form, 'packSize', 1) * 1000)),
    moq_milli: Math.max(0, Math.round(number(form, 'moq', 0) * 1000)),
    lead_time_p80_hours: Math.min(720, Math.max(1, number(form, 'leadTimeHours', 48))),
    criticality: text(form, 'criticality') || 'normal',
    spoilage_tolerance_bps: Math.min(10000, Math.max(0, Math.round(number(form, 'tolerancePercent', 8) * 100))),
    unit: text(form, 'unit') || 'стебель',
  };

  const { data: before } = await ctx.supabase
    .from('product_policy_templates').select('*').eq('category_id', categoryId).maybeSingle();

  const result = await ctx.supabase
    .from('product_policy_templates')
    .upsert({ ...payload, status: 'published' }, { onConflict: 'category_id' })
    .select('id')
    .single();
  if (result.error) back('/admin/policies', `?error=${encodeURIComponent(describeDbError(result.error))}`);

  await audit(ctx, before ? 'product_policy.updated' : 'product_policy.created', 'product_policy_template',
    result.data.id, categoryId, before, payload, text(form, 'reason'));

  revalidatePath('/admin/policies');
  back('/admin/policies', '?saved=1');
}

// ---------------------------------------------------------------------------
// Правила автозаказа
// ---------------------------------------------------------------------------

export async function saveAutoOrderRule(form: FormData) {
  const ctx = await requirePlatformAdmin(['platform_admin', 'platform_editor']);
  const id = text(form, 'id');
  const payload = {
    code: text(form, 'code'),
    name_ru: text(form, 'nameRu'),
    description_ru: text(form, 'descriptionRu'),
    business_type_codes: text(form, 'businessTypeCodes').split(',').map((v) => v.trim()).filter(Boolean),
    category_code: text(form, 'categoryCode') || null,
    trigger: text(form, 'trigger') || 'reorder_point',
    threshold_hours: optionalNumber(form, 'thresholdHours'),
    cover_days: Math.min(60, Math.max(1, number(form, 'coverDays', 3))),
    round_to_pack: bool(form, 'roundToPack'),
  };

  if (!payload.code || !payload.name_ru || !payload.description_ru) {
    back('/admin/rules', '?error=' + encodeURIComponent('Код, название и описание обязательны: правило без объяснения нельзя проверить.'));
  }

  let before: unknown = null;
  if (id) {
    const { data } = await ctx.supabase.from('auto_order_rule_templates').select('*').eq('id', id).maybeSingle();
    before = data;
  }

  const result = id
    ? await ctx.supabase.from('auto_order_rule_templates').update(payload).eq('id', id).select('id,code').single()
    : await ctx.supabase.from('auto_order_rule_templates').insert({ ...payload, status: 'draft' }).select('id,code').single();
  if (result.error) back('/admin/rules', `?error=${encodeURIComponent(describeDbError(result.error))}`);

  await audit(ctx, id ? 'auto_order_rule.updated' : 'auto_order_rule.created', 'auto_order_rule_template',
    result.data.id, result.data.code, before, payload, text(form, 'reason'));

  revalidatePath('/admin/rules');
  back('/admin/rules', '?saved=1');
}

export async function setAutoOrderRuleStatus(form: FormData) {
  const ctx = await requirePlatformAdmin(['platform_admin', 'platform_editor']);
  const id = text(form, 'id');
  const status = text(form, 'status');

  const { data: before } = await ctx.supabase.from('auto_order_rule_templates').select('*').eq('id', id).maybeSingle();
  if (!before) back('/admin/rules', '?error=' + encodeURIComponent('Правило не найдено.'));

  const { error } = await ctx.supabase.from('auto_order_rule_templates').update({ status }).eq('id', id);
  if (error) back('/admin/rules', `?error=${encodeURIComponent(describeDbError(error))}`);

  await audit(ctx, `auto_order_rule.${status}`, 'auto_order_rule_template', id, before.code, before, { status },
    text(form, 'reason') || 'Изменение статуса правила');

  revalidatePath('/admin/rules');
  back('/admin/rules', '?saved=1');
}

// ---------------------------------------------------------------------------
// Календарь поводов
// ---------------------------------------------------------------------------

export async function savePlatformDemandEvent(form: FormData) {
  const ctx = await requirePlatformAdmin(['platform_admin', 'platform_editor']);
  const id = text(form, 'id');

  const liftPercent = number(form, 'liftPercent', 50);
  const payload = {
    // Платформенный повод не принадлежит магазину: у него business_id пуст, и
    // именно поэтому он приходит магазинам предложением, а не настройкой.
    business_id: null,
    code: text(form, 'code') || text(form, 'name').toLowerCase().replace(/[^a-zа-я0-9]+/gi, '_').slice(0, 40),
    name_ru: text(form, 'name'),
    event_date: text(form, 'eventDate'),
    lead_days: Math.min(60, Math.max(0, number(form, 'windowDays', 3))),
    // Подъём хранится множителем: 50% сверх обычного — это ×1,5.
    lift_ppm: Math.min(10_000_000, Math.max(100_000, Math.round(liftPercent * 10_000) + 1_000_000)),
    categories: text(form, 'categories').split(',').map((v) => v.trim()).filter(Boolean),
    region: text(form, 'region') || 'Алматы',
    confidence_ppm: Math.min(1_000_000, Math.max(0, Math.round(number(form, 'confidencePercent', 40) * 10_000))),
    source: text(form, 'source') || 'отраслевой шаблон',
    // Платформенный повод всегда приходит непроверенным и неодобренным: подъём
    // из шаблона — предположение, и подтвердить его может только тот магазин, у
    // которого есть прошлогодний факт.
    verified: false,
    approved: false,
  };

  if (!payload.name_ru || !payload.event_date) {
    back('/admin/calendar', '?error=' + encodeURIComponent('Название и дата обязательны.'));
  }

  let before: unknown = null;
  if (id) {
    const { data } = await ctx.supabase.from('demand_events').select('*').eq('id', id).maybeSingle();
    before = data;
  }

  const result = id
    ? await ctx.supabase.from('demand_events').update(payload).eq('id', id).is('business_id', null).select('id,name_ru').single()
    : await ctx.supabase.from('demand_events').insert(payload).select('id,name_ru').single();
  if (result.error) back('/admin/calendar', `?error=${encodeURIComponent(describeDbError(result.error))}`);

  await audit(ctx, id ? 'demand_event.updated' : 'demand_event.created', 'demand_event',
    result.data.id, result.data.name_ru, before, payload, text(form, 'reason'));

  revalidatePath('/admin/calendar');
  revalidatePath('/app/forecast');
  back('/admin/calendar', '?saved=1');
}

// ---------------------------------------------------------------------------
// Наборы инструментов
// ---------------------------------------------------------------------------

export async function saveToolBundle(form: FormData) {
  const ctx = await requirePlatformAdmin(['platform_admin', 'platform_editor']);
  const id = text(form, 'id');
  const payload = {
    code: text(form, 'code'),
    name_ru: text(form, 'nameRu'),
    description_ru: text(form, 'descriptionRu'),
    business_type_id: text(form, 'businessTypeId') || null,
  };

  if (!payload.code || !payload.name_ru || !payload.description_ru) {
    back('/admin/bundles', '?error=' + encodeURIComponent('Код, название и описание обязательны.'));
  }

  let before: unknown = null;
  if (id) {
    const { data } = await ctx.supabase.from('tool_bundles').select('*').eq('id', id).maybeSingle();
    before = data;
  }

  const result = id
    ? await ctx.supabase.from('tool_bundles').update(payload).eq('id', id).select('id,code').single()
    : await ctx.supabase.from('tool_bundles').insert({ ...payload, status: 'draft' }).select('id,code').single();
  if (result.error) back('/admin/bundles', `?error=${encodeURIComponent(describeDbError(result.error))}`);

  await audit(ctx, id ? 'tool_bundle.updated' : 'tool_bundle.created', 'tool_bundle',
    result.data.id, result.data.code, before, payload, text(form, 'reason'));

  revalidatePath('/admin/bundles');
  back('/admin/bundles', '?saved=1');
}

/**
 * Состав набора задаётся целиком, а не по одной галочке.
 *
 * Набор — это последовательность первого дня, и порядок в ней значит не меньше
 * состава. Собирать его добавлением по одному означало бы, что порядок зависит
 * от того, в каком настроении администратор кликал.
 */
export async function saveBundleItems(form: FormData) {
  const ctx = await requirePlatformAdmin(['platform_admin', 'platform_editor']);
  const bundleId = text(form, 'bundleId');
  const codes = form.getAll('toolCodes').map(String).filter(Boolean);

  const { data: bundle } = await ctx.supabase.from('tool_bundles').select('id,code').eq('id', bundleId).maybeSingle();
  if (!bundle) back('/admin/bundles', '?error=' + encodeURIComponent('Набор не найден.'));

  const { data: tools } = await ctx.supabase.from('tools').select('id,code').in('code', codes.length ? codes : ['__none__']);
  const byCode = new Map((tools ?? []).map((tool) => [tool.code, tool.id]));

  const { data: before } = await ctx.supabase.from('tool_bundle_items').select('tool_id,sort_order').eq('bundle_id', bundleId);

  const { error: clearError } = await ctx.supabase.from('tool_bundle_items').delete().eq('bundle_id', bundleId);
  if (clearError) back('/admin/bundles', `?error=${encodeURIComponent(describeDbError(clearError))}`);

  if (codes.length > 0) {
    const rows = codes
      .map((code, index) => ({ bundle_id: bundleId, tool_id: byCode.get(code), sort_order: index + 1 }))
      .filter((row): row is { bundle_id: string; tool_id: string; sort_order: number } => Boolean(row.tool_id));
    const { error } = await ctx.supabase.from('tool_bundle_items').insert(rows);
    if (error) back('/admin/bundles', `?error=${encodeURIComponent(describeDbError(error))}`);
  }

  await audit(ctx, 'tool_bundle.items_set', 'tool_bundle', bundleId, bundle.code, before,
    { codes }, text(form, 'reason') || 'Изменение состава набора');

  revalidatePath('/admin/bundles');
  revalidatePath('/app/tools');
  back('/admin/bundles', '?saved=1');
}

export async function setToolBundleStatus(form: FormData) {
  const ctx = await requirePlatformAdmin(['platform_admin', 'platform_editor']);
  const id = text(form, 'id');
  const status = text(form, 'status');

  const { data: before } = await ctx.supabase.from('tool_bundles').select('*').eq('id', id).maybeSingle();
  if (!before) back('/admin/bundles', '?error=' + encodeURIComponent('Набор не найден.'));

  const { error } = await ctx.supabase.from('tool_bundles').update({ status }).eq('id', id);
  if (error) back('/admin/bundles', `?error=${encodeURIComponent(describeDbError(error))}`);

  await audit(ctx, `tool_bundle.${status}`, 'tool_bundle', id, before.code, before, { status },
    text(form, 'reason') || 'Изменение статуса набора');

  revalidatePath('/admin/bundles');
  revalidatePath('/app/tools');
  back('/admin/bundles', '?saved=1');
}
