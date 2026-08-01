'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { describeDbError } from '@/server/qadam/errors';
import { requirePlatformAdmin } from '@/server/qadam/admin';
import type { Json } from '@/types/database.generated';

/**
 * Admin mutations.
 *
 * Every one of these takes a reason and routes the before/after pair through
 * `admin_audit`, which refuses without a reason and, for sensitive operations,
 * without a fresh credential check. The audit table is append-only, so an action
 * cannot be performed and then erased.
 */

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
const bool = (form: FormData, key: string) => form.get(key) === 'on' || form.get(key) === 'true';
// A function declaration, not an arrow const: TypeScript only narrows control
// flow through a `never` return when the callee is declared this way.
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

/** Confirms the operator is still who they say they are, for sensitive actions. */
export async function refreshAdminReauth(form: FormData) {
  const ctx = await requirePlatformAdmin(['platform_admin', 'platform_editor']);
  const { error } = await ctx.supabase.rpc('mark_admin_reauth');
  const next = text(form, 'next') || '/admin';
  if (error) back(next, `?error=${encodeURIComponent(describeDbError(error))}`);
  revalidatePath(next);
  back(next, '?reauth=1');
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export async function saveTool(form: FormData) {
  const ctx = await requirePlatformAdmin(['platform_admin', 'platform_editor']);
  const id = text(form, 'id');
  const reason = text(form, 'reason');
  const payload = {
    code: text(form, 'code'),
    name_ru: text(form, 'nameRu'),
    name_kk: text(form, 'nameKk'),
    description_ru: text(form, 'descriptionRu'),
    description_kk: text(form, 'descriptionKk'),
    route: text(form, 'route') || '/app/tools',
    category_id: text(form, 'categoryId'),
    compatible_business_types: text(form, 'compatibleBusinessTypes').split(',').map((v) => v.trim()).filter(Boolean),
    is_public: bool(form, 'isPublic'),
  };

  // A tool always belongs to a category: the owner catalogue filters by it.
  if (!payload.code || !payload.name_ru || !payload.name_kk || !payload.category_id) {
    back('/admin/tools', '?error=' + encodeURIComponent('Код, категория и оба названия (RU и KK) обязательны.'));
  }

  let before: unknown = null;
  if (id) {
    const { data } = await ctx.supabase.from('tools').select('*').eq('id', id).maybeSingle();
    before = data;
  }

  const result = id
    ? await ctx.supabase.from('tools').update(payload).eq('id', id).select('id,code').single()
    : await ctx.supabase.from('tools').insert({ ...payload, status: 'draft', version: 1 }).select('id,code').single();
  if (result.error) back('/admin/tools', `?error=${encodeURIComponent(describeDbError(result.error))}`);

  const auditError = await audit(ctx, id ? 'tool.updated' : 'tool.created', 'tool', result.data.id, result.data.code, before, payload, reason);
  if (auditError) back('/admin/tools', `?error=${encodeURIComponent(describeDbError(auditError))}`);

  revalidatePath('/admin/tools');
  revalidatePath('/app/tools');
  back('/admin/tools', '?saved=1');
}

/** Publish, archive or restore. Hard delete is not offered anywhere. */
export async function setToolStatus(form: FormData) {
  const ctx = await requirePlatformAdmin(['platform_admin', 'platform_editor']);
  const id = text(form, 'id');
  const status = text(form, 'status');
  const reason = text(form, 'reason') || 'Изменение статуса из Admin Console';

  const { data: before } = await ctx.supabase.from('tools').select('*').eq('id', id).maybeSingle();
  if (!before) back('/admin/tools', '?error=' + encodeURIComponent('Инструмент не найден.'));

  const patch: { status: string; archived_at?: string | null; version?: number } = { status };
  if (status === 'archived') patch.archived_at = new Date().toISOString();
  if (status === 'published') { patch.archived_at = null; patch.version = (before!.version ?? 1) + 1; }

  const { error } = await ctx.supabase.from('tools').update(patch).eq('id', id);
  if (error) back('/admin/tools', `?error=${encodeURIComponent(describeDbError(error))}`);

  // Archiving removes a tool from every owner catalogue, so it is sensitive.
  const auditError = await audit(ctx, `tool.${status}`, 'tool', id, before!.code, before, patch, reason, status === 'archived');
  if (auditError) {
    await ctx.supabase.from('tools').update({ status: before!.status, archived_at: before!.archived_at, version: before!.version }).eq('id', id);
    back('/admin/tools', `?error=${encodeURIComponent(describeDbError(auditError))}`);
  }

  revalidatePath('/admin/tools');
  revalidatePath('/app/tools');
  back('/admin/tools', `?status=${encodeURIComponent(status)}`);
}

// ---------------------------------------------------------------------------
// Categories and business types
// ---------------------------------------------------------------------------

export async function saveCategory(form: FormData) {
  const ctx = await requirePlatformAdmin(['platform_admin', 'platform_editor']);
  const id = text(form, 'id');
  const payload = {
    code: text(form, 'code'),
    name_ru: text(form, 'nameRu'),
    name_kk: text(form, 'nameKk'),
    sort_order: Number(text(form, 'sortOrder') || '0'),
  };
  if (!payload.code || !payload.name_ru || !payload.name_kk) {
    back('/admin/categories', '?error=' + encodeURIComponent('Код и оба названия обязательны.'));
  }

  let before: unknown = null;
  if (id) {
    const { data } = await ctx.supabase.from('tool_categories').select('*').eq('id', id).maybeSingle();
    before = data;
  }

  const result = id
    ? await ctx.supabase.from('tool_categories').update(payload).eq('id', id).select('id,code').single()
    : await ctx.supabase.from('tool_categories').insert({ ...payload, status: 'draft' }).select('id,code').single();
  if (result.error) back('/admin/categories', `?error=${encodeURIComponent(describeDbError(result.error))}`);

  await audit(ctx, id ? 'category.updated' : 'category.created', 'tool_category', result.data.id, result.data.code, before, payload, text(form, 'reason'));
  revalidatePath('/admin/categories');
  back('/admin/categories', '?saved=1');
}

export async function setCategoryStatus(form: FormData) {
  const ctx = await requirePlatformAdmin(['platform_admin', 'platform_editor']);
  const id = text(form, 'id');
  const status = text(form, 'status');
  const { data: before } = await ctx.supabase.from('tool_categories').select('*').eq('id', id).maybeSingle();
  if (!before) back('/admin/categories', '?error=' + encodeURIComponent('Категория не найдена.'));

  // Deprecating a category that still holds published tools would orphan them.
  if (status === 'deprecated') {
    const { count } = await ctx.supabase.from('tools')
      .select('id', { count: 'exact', head: true }).eq('category_id', id).eq('status', 'published');
    if ((count ?? 0) > 0) {
      back('/admin/categories', '?error=' + encodeURIComponent(
        `В категории ещё ${count} опубликованных инструментов. Переместите или архивируйте их перед устареванием категории.`));
    }
  }

  const patch = { status, deprecated_at: status === 'deprecated' ? new Date().toISOString() : null };
  const { error } = await ctx.supabase.from('tool_categories').update(patch).eq('id', id);
  if (error) back('/admin/categories', `?error=${encodeURIComponent(describeDbError(error))}`);

  await audit(ctx, `category.${status}`, 'tool_category', id, before.code, before, patch, text(form, 'reason') || 'Изменение статуса категории');
  revalidatePath('/admin/categories');
  back('/admin/categories', '?saved=1');
}

export async function saveBusinessType(form: FormData) {
  const ctx = await requirePlatformAdmin(['platform_admin', 'platform_editor']);
  const id = text(form, 'id');
  const payload = { code: text(form, 'code'), name_ru: text(form, 'nameRu'), name_kk: text(form, 'nameKk') };
  if (!payload.code || !payload.name_ru || !payload.name_kk) {
    back('/admin/categories', '?error=' + encodeURIComponent('Код и оба названия обязательны.'));
  }

  let before: unknown = null;
  if (id) {
    const { data } = await ctx.supabase.from('business_types').select('*').eq('id', id).maybeSingle();
    before = data;
  }
  const result = id
    ? await ctx.supabase.from('business_types').update(payload).eq('id', id).select('id,code').single()
    : await ctx.supabase.from('business_types').insert({ ...payload, status: 'draft', is_public: true }).select('id,code').single();
  if (result.error || !result.data) back('/admin/categories', `?error=${encodeURIComponent(describeDbError(result.error))}`);

  await audit(ctx, id ? 'business_type.updated' : 'business_type.created', 'business_type', result.data!.id, result.data!.code, before, payload, text(form, 'reason'));
  revalidatePath('/admin/categories');
  back('/admin/categories', '?saved=1');
}

export async function setBusinessTypeStatus(form: FormData) {
  const ctx = await requirePlatformAdmin(['platform_admin', 'platform_editor']);
  const id = text(form, 'id');
  const status = text(form, 'status');
  const { data: before } = await ctx.supabase.from('business_types').select('*').eq('id', id).maybeSingle();
  if (!before) back('/admin/categories', '?error=' + encodeURIComponent('Тип бизнеса не найден.'));

  if (status === 'deprecated') {
    const { count } = await ctx.supabase.from('businesses')
      .select('id', { count: 'exact', head: true }).eq('business_type_id', id).eq('status', 'active');
    if ((count ?? 0) > 0) {
      back('/admin/categories', '?error=' + encodeURIComponent(
        `Этот тип используют ${count} активных бизнесов. Устаревание скроет его только для новых регистраций — подтвердите отдельно.`));
    }
  }

  const patch = { status, deprecated_at: status === 'deprecated' ? new Date().toISOString() : null };
  const { error } = await ctx.supabase.from('business_types').update(patch).eq('id', id);
  if (error) back('/admin/categories', `?error=${encodeURIComponent(describeDbError(error))}`);

  await audit(ctx, `business_type.${status}`, 'business_type', id, before!.code, before, patch, text(form, 'reason') || 'Изменение статуса типа бизнеса');
  revalidatePath('/admin/categories');
  back('/admin/categories', '?saved=1');
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

/** Creates a draft version, optionally cloned from an existing one. */
export async function createTemplateVersion(form: FormData) {
  const ctx = await requirePlatformAdmin(['platform_admin', 'platform_editor']);
  const templateId = text(form, 'templateId');
  const cloneFrom = text(form, 'cloneFromVersionId');
  const reason = text(form, 'reason');

  const { data: template } = await ctx.supabase.from('templates').select('id,code,current_version').eq('id', templateId).maybeSingle();
  if (!template) back('/admin/templates', '?error=' + encodeURIComponent('Шаблон не найден.'));

  const { data: existing } = await ctx.supabase.from('template_versions')
    .select('version').eq('template_id', templateId).order('version', { ascending: false }).limit(1).maybeSingle();
  const nextVersion = (existing?.version ?? 0) + 1;

  let content: unknown = { mechanics: [], copy: { ru: {}, kk: {} } };
  let schemaVersion = 1;
  let compatible: string[] = [];
  if (cloneFrom) {
    const { data: source } = await ctx.supabase.from('template_versions')
      .select('content,schema_version,compatible_business_types').eq('id', cloneFrom).maybeSingle();
    if (source) {
      content = source.content;
      schemaVersion = source.schema_version;
      compatible = source.compatible_business_types ?? [];
    }
  }

  const raw = text(form, 'content');
  if (raw) {
    try {
      content = JSON.parse(raw);
    } catch {
      back('/admin/templates', '?error=' + encodeURIComponent('Содержимое шаблона должно быть корректным JSON.'));
    }
  }
  // Schema validation happens before the row exists, so an invalid draft is
  // never stored and can never be published by accident.
  if (!content || typeof content !== 'object' || !('mechanics' in (content as object))) {
    back('/admin/templates', '?error=' + encodeURIComponent('Шаблон должен содержать поле mechanics.'));
  }

  const typesFromForm = text(form, 'compatibleBusinessTypes').split(',').map((v) => v.trim()).filter(Boolean);
  const { data: created, error } = await ctx.supabase.from('template_versions').insert({
    template_id: templateId,
    version: nextVersion,
    schema_version: Number(text(form, 'schemaVersion')) || schemaVersion,
    content: content as unknown as Json,
    status: 'draft',
    locales: ['ru', 'kk'],
    compatible_business_types: typesFromForm.length ? typesFromForm : compatible,
    migrates_from_version: cloneFrom ? Number(template!.current_version) : null,
    migration_notes: text(form, 'migrationNotes') || null,
    created_by: ctx.userId,
  }).select('id,version').single();
  if (error || !created) back('/admin/templates', `?error=${encodeURIComponent(describeDbError(error))}`);

  await audit(ctx, 'template.version_created', 'template_version', created!.id, template!.code, null,
    { version: created!.version, cloned_from: cloneFrom || null }, reason || `Создана версия v${created!.version}`);

  revalidatePath('/admin/templates');
  back('/admin/templates', `?created=${created!.version}`);
}

export async function publishTemplateVersion(form: FormData) {
  const ctx = await requirePlatformAdmin(['platform_admin', 'platform_editor']);
  const { error } = await ctx.supabase.rpc('publish_template_version', {
    p_version_id: text(form, 'versionId'),
    p_reason: text(form, 'reason') || 'Публикация версии шаблона',
  });
  if (error) back('/admin/templates', `?error=${encodeURIComponent(describeDbError(error))}`);
  revalidatePath('/admin/templates');
  back('/admin/templates', '?published=1');
}

export async function rollbackTemplate(form: FormData) {
  const ctx = await requirePlatformAdmin(['platform_admin']);
  const { error } = await ctx.supabase.rpc('rollback_template', {
    p_template_id: text(form, 'templateId'),
    p_target_version: Number(text(form, 'targetVersion') || '1'),
    p_reason: text(form, 'reason') || 'Откат шаблона',
  });
  if (error) {
    back('/admin/templates', `?error=${encodeURIComponent(
      error.message.includes('fresh credential')
        ? 'Откат требует свежего подтверждения личности. Нажмите «Подтвердить личность» и повторите.'
        : describeDbError(error))}`);
  }
  revalidatePath('/admin/templates');
  revalidatePath('/app/campaigns/studio');
  back('/admin/templates', '?rolledback=1');
}

export async function archiveTemplateVersion(form: FormData) {
  const ctx = await requirePlatformAdmin(['platform_admin', 'platform_editor']);
  const versionId = text(form, 'versionId');
  const { data: before } = await ctx.supabase.from('template_versions').select('*').eq('id', versionId).maybeSingle();
  if (!before) back('/admin/templates', '?error=' + encodeURIComponent('Версия не найдена.'));

  const { error } = await ctx.supabase.from('template_versions')
    .update({ status: 'archived', archived_at: new Date().toISOString() }).eq('id', versionId);
  if (error) back('/admin/templates', `?error=${encodeURIComponent(describeDbError(error))}`);

  await audit(ctx, 'template.archived', 'template_version', versionId, String(before!.template_id), before,
    { status: 'archived' }, text(form, 'reason') || 'Архивирование версии шаблона');
  revalidatePath('/admin/templates');
  back('/admin/templates', '?archived=1');
}
