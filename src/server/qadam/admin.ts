import 'server-only';

import { createClient } from '@/lib/supabase/server';

/**
 * Platform admin context.
 *
 * The role is read from `private.platform_admin_assignments` through a security
 * definer function — never from `user_metadata`, which the user can edit on
 * themselves. Every admin page and action calls this, so hiding a link in the
 * navigation is decoration rather than the control.
 */

export type PlatformRole = 'platform_admin' | 'platform_editor' | 'platform_analyst';

const READ_ROLES: PlatformRole[] = ['platform_admin', 'platform_editor', 'platform_analyst'];
const WRITE_ROLES: PlatformRole[] = ['platform_admin', 'platform_editor'];

export async function requirePlatformAdmin(roles: PlatformRole[] = READ_ROLES) {
  const supabase = await createClient();
  const { data: claims, error } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (error || !userId) throw new Error('AUTH_REQUIRED');

  // Ask the database, and pass the exact role set the caller needs. RLS enforces
  // the same rule again on every table this page reads.
  const { data: allowed } = await supabase.rpc('is_current_platform_admin');
  if (!allowed) throw new Error('PLATFORM_ADMIN_REQUIRED');

  const { data: assignedRole } = await supabase.rpc('current_platform_role');
  const role = (assignedRole ?? 'platform_analyst') as PlatformRole;
  if (!roles.includes(role)) throw new Error('PLATFORM_ROLE_INSUFFICIENT');

  return { supabase, userId, role, canWrite: WRITE_ROLES.includes(role) };
}

export interface AdminFilters {
  days?: number;
  businessType?: string;
  city?: string;
}

export interface AdminOverviewData {
  from: Date;
  to: Date;
  suppressed: boolean;
  minCohort: number;
  cohortSize: number;
  metrics: Record<string, number>;
  popularTools: { code: string; name_ru: string; activations: number }[];
  templateAdoption: { code: string; current_version: number; published_versions: number }[];
  businessTypes: { code: string; name_ru: string }[];
  cities: string[];
}

/** Aggregated platform overview. Never returns a tenant's customer rows. */
export async function getAdminOverview(filters: AdminFilters) {
  const ctx = await requirePlatformAdmin();
  const days = Math.min(365, Math.max(1, filters.days ?? 30));
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);

  const [{ data: overview, error }, { data: types }, { data: locations }] = await Promise.all([
    ctx.supabase.rpc('platform_overview', {
      p_from: from.toISOString(),
      p_to: to.toISOString(),
      p_business_type: filters.businessType ?? (null as unknown as string),
      p_city: filters.city ?? (null as unknown as string),
    }),
    ctx.supabase.from('business_types').select('code,name_ru').order('name_ru'),
    ctx.supabase.from('business_locations').select('city').limit(500),
  ]);
  if (error) throw error;

  const raw = (overview ?? {}) as Record<string, unknown>;
  const number = (key: string) => Number(raw[key] ?? 0);

  return {
    ctx,
    from,
    to,
    days,
    suppressed: Boolean(raw.suppressed),
    minCohort: number('min_cohort') || 5,
    cohortSize: number('cohort_size'),
    suppressionMessage: typeof raw.message === 'string' ? raw.message : null,
    metrics: {
      activeBusinesses: number('active_businesses'),
      newBusinesses: number('new_businesses'),
      onboardingCompleted: number('onboarding_completed'),
      onboardingStarted: number('onboarding_started'),
      activeCampaigns: number('active_campaigns'),
      toolActivations: number('tool_activations'),
      aiRuns: number('ai_runs'),
      aiFallbackRuns: number('ai_fallback_runs'),
      aiErrorRuns: number('ai_error_runs'),
      automationRuns: number('automation_runs'),
      automationFailures: number('automation_failures'),
      outboxDeadLetters: number('outbox_dead_letters'),
      platformEvents: number('platform_events'),
    },
    popularTools: (raw.popular_tools ?? []) as AdminOverviewData['popularTools'],
    templateAdoption: (raw.template_adoption ?? []) as AdminOverviewData['templateAdoption'],
    businessTypes: types ?? [],
    cities: [...new Set((locations ?? []).map((row) => row.city).filter(Boolean))].sort() as string[],
  };
}

export async function getAdminCatalog() {
  const ctx = await requirePlatformAdmin();
  const [{ data: tools }, { data: categories }, { data: types }, { data: audit }] = await Promise.all([
    ctx.supabase.from('tools').select('id,code,name_ru,name_kk,description_ru,description_kk,route,status,version,is_public,category_id,compatible_business_types,archived_at,updated_at').order('name_ru'),
    ctx.supabase.from('tool_categories').select('id,code,name_ru,name_kk,status,sort_order,deprecated_at').order('sort_order'),
    ctx.supabase.from('business_types').select('id,code,name_ru,name_kk,status,is_public,deprecated_at').order('name_ru'),
    ctx.supabase.from('admin_audit_log').select('id,action,resource_type,resource_code,reason,occurred_at,actor_role').order('occurred_at', { ascending: false }).limit(20),
  ]);
  return { ctx, tools: tools ?? [], categories: categories ?? [], businessTypes: types ?? [], audit: audit ?? [] };
}

export async function getAdminTemplates() {
  const ctx = await requirePlatformAdmin();
  const [{ data: templates }, { data: versions }, { data: types }, { data: audit }] = await Promise.all([
    ctx.supabase.from('templates').select('id,code,name,status,current_version,business_type_codes,archived_at,updated_at').order('code'),
    ctx.supabase.from('template_versions').select('id,template_id,version,schema_version,status,content,locales,compatible_business_types,migration_notes,migrates_from_version,published_at,published_by,created_at').order('version', { ascending: false }),
    ctx.supabase.from('business_types').select('code,name_ru').eq('status', 'published').order('name_ru'),
    ctx.supabase.from('admin_audit_log').select('id,action,resource_code,reason,occurred_at').in('action', ['template.published', 'template.rolled_back', 'template.version_created', 'template.archived']).order('occurred_at', { ascending: false }).limit(20),
  ]);
  return { ctx, templates: templates ?? [], versions: versions ?? [], businessTypes: types ?? [], audit: audit ?? [] };
}
