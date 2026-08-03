import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { generateSocialPack } from '@/server/ai/content-service.ts';

/**
 * Материалы обновляются сами, раз в полдня.
 *
 * The owner pressed «Reels, TikTok и фото» once during onboarding and the
 * library froze there. A month later the scripts still named an offer that had
 * ended — worse than an empty screen, because the owner would have posted it.
 *
 * The same routine now runs from the execution cycle and from the button, so
 * pressing it early is simply an early refresh: the schedule moves with it
 * rather than running again an hour later.
 */

/** The kinds this pack owns. Campaign copy lives elsewhere and is never touched here. */
export const SOCIAL_KINDS = ['reel_script', 'tiktok_script', 'photo_brief', 'story_series', 'push_notice'] as const;

export interface ContentSchedule {
  lastRefreshedAt: string | null;
  nextRefreshAt: string;
  intervalHours: number;
  lastSource: 'provider' | 'deterministic_fallback' | null;
  lastAssetCount: number;
}

/** Когда материалы обновятся в следующий раз. */
export async function readContentSchedule(db: SupabaseClient, businessId: string): Promise<ContentSchedule | null> {
  const { data } = await db
    .from('content_refresh_state')
    .select('last_refreshed_at,next_refresh_at,interval_hours,last_source,last_asset_count')
    .eq('business_id', businessId)
    .maybeSingle();
  if (!data) return null;
  return {
    lastRefreshedAt: data.last_refreshed_at,
    nextRefreshAt: data.next_refresh_at,
    intervalHours: data.interval_hours,
    lastSource: data.last_source,
    lastAssetCount: data.last_asset_count,
  };
}

export interface SocialRefreshOutcome {
  assets: number;
  source: 'provider' | 'deterministic_fallback';
  runId: string | null;
  nextRefreshAt: string | null;
}

/**
 * Пересобирает пакет материалов и сдвигает расписание.
 *
 * `actorId` is null when the scheduler did it. That distinction is kept in the
 * activity log, because «кто это переписал» is a question the owner will ask the
 * first time a script changes overnight.
 */
export async function refreshSocialPack(
  db: SupabaseClient,
  input: { businessId: string; businessType: string; isMock: boolean; actorId?: string | null; idempotencyKey?: string },
): Promise<SocialRefreshOutcome> {
  const pack = await generateSocialPack(db, {
    businessId: input.businessId,
    businessType: input.businessType,
    idempotencyKey: input.idempotencyKey,
  });

  // Regenerating replaces its own drafts rather than piling up another ten.
  // Approved material is left alone: the owner approved that wording, and a
  // scheduler is not entitled to overwrite it.
  await db.from('content_items').delete()
    .eq('business_id', input.businessId).is('campaign_id', null)
    .eq('status', 'draft').in('content_kind', SOCIAL_KINDS as unknown as string[]);

  const { error } = await db.from('content_items').insert(pack.assets.map((asset, index) => ({
    business_id: input.businessId,
    campaign_id: null,
    content_kind: asset.kind,
    channel: asset.kind === 'push_notice' ? 'telegram' : 'instagram',
    locale: asset.locale,
    ordinal: index + 1,
    body: `${asset.title}\n\n${asset.body}${asset.needs.length ? `\n\nПодготовить: ${asset.needs.join('; ')}` : ''}`,
    alt_text: asset.title,
    cta: asset.cta,
    status: 'draft',
    source: pack.source === 'provider' ? 'provider' : 'template',
    generation_run_id: pack.runId,
    is_mock: input.isMock,
  })));
  if (error) throw new Error(error.message);

  await db.from('activity_logs').insert({
    business_id: input.businessId,
    actor_id: input.actorId ?? null,
    action: 'content.social_generated',
    resource_type: 'business',
    resource_id: input.businessId,
    metadata: { items: pack.assets.length, source: pack.source, run_id: pack.runId, by: input.actorId ? 'owner' : 'schedule' },
    is_mock: input.isMock,
  });

  // The schedule moves only after the material is actually stored. A failed
  // generation must come back on the next cycle, not wait another twelve hours.
  const { data: next } = await db.rpc('mark_content_refreshed', {
    p_business_id: input.businessId,
    p_source: pack.source,
    p_asset_count: pack.assets.length,
  });

  return {
    assets: pack.assets.length,
    source: pack.source,
    runId: pack.runId,
    nextRefreshAt: typeof next === 'string' ? next : null,
  };
}

/**
 * Обновляет материалы всем, кому пора. Вызывается циклом исполнения.
 *
 * One venue whose generation fails must not stop the others, so each failure is
 * reported in the cycle's report and the loop continues.
 */
export async function refreshDueContent(
  db: SupabaseClient,
  options: { businessId?: string; limit?: number } = {},
): Promise<{ refreshed: { businessId: string; assets: number; source: string; nextRefreshAt: string | null }[]; failed: { businessId: string; error: string }[] }> {
  const refreshed: { businessId: string; assets: number; source: string; nextRefreshAt: string | null }[] = [];
  const failed: { businessId: string; error: string }[] = [];

  const { data: due, error } = await db.rpc('businesses_due_for_content', { p_limit: options.limit ?? 20 });
  if (error) return { refreshed, failed: [{ businessId: options.businessId ?? '*', error: error.message }] };

  let ids = ((due ?? []) as { business_id: string }[]).map((row) => row.business_id);
  if (options.businessId) ids = ids.filter((id) => id === options.businessId);
  if (!ids.length) return { refreshed, failed };

  const { data: businesses } = await db.from('businesses').select('id,mode,business_type_id').in('id', ids);
  const { data: types } = await db.from('business_types').select('id,name_ru');
  const typeName = new Map((types ?? []).map((row) => [row.id, row.name_ru]));

  for (const business of businesses ?? []) {
    try {
      const outcome = await refreshSocialPack(db, {
        businessId: business.id,
        businessType: typeName.get(business.business_type_id) ?? 'Локальный бизнес',
        isMock: business.mode === 'demo',
        actorId: null,
      });
      refreshed.push({ businessId: business.id, assets: outcome.assets, source: outcome.source, nextRefreshAt: outcome.nextRefreshAt });
    } catch (cause) {
      failed.push({ businessId: business.id, error: cause instanceof Error ? cause.message : String(cause) });
    }
  }

  return { refreshed, failed };
}
