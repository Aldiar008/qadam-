import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { asBusinessMode } from '@/lib/app-mode';
import type { SegmentRule } from '@/lib/segment-rules';
import type { Json } from '@/types/database.generated';

export type BusinessRole = 'owner' | 'manager' | 'marketer' | 'analyst' | 'viewer';

/**
 * Raised when the database could not answer, as opposed to answering "no".
 *
 * The two used to be collapsed into MEMBERSHIP_REQUIRED, so a transient
 * PostgREST failure under load told the owner they had no membership and
 * produced a bare 500. A lookup that failed and a lookup that came back empty
 * mean different things and deserve different handling.
 */
export class DataUnavailableError extends Error {
  constructor(public readonly step: string, cause?: unknown) {
    super(`DATA_UNAVAILABLE:${step}`);
    this.name = 'DataUnavailableError';
    this.cause = cause;
  }
}

export async function requireBusinessContext() {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError) throw new DataUnavailableError('claims', claimsError);
  const userId = claimsData?.claims?.sub;
  if (!userId) throw new Error('AUTH_REQUIRED');
  const { data: member, error: memberError } = await supabase.from('business_members')
    .select('business_id,role').eq('user_id', userId).eq('status', 'active').order('created_at').limit(1).maybeSingle();
  if (memberError) throw new DataUnavailableError('membership', memberError);
  if (!member) throw new Error('MEMBERSHIP_REQUIRED');
  const [{ data: business, error: businessError }, { data: location }, { data: profile }, { data: person }] = await Promise.all([
    supabase.from('businesses').select('id,name,mode,status,currency,timezone').eq('id', member.business_id).single(),
    supabase.from('business_locations').select('id,name,city,district,address_text,capacity').eq('business_id', member.business_id).eq('is_active', true).order('created_at').limit(1).maybeSingle(),
    supabase.from('business_profiles').select('average_check_minor,margin_floor_bps,monthly_marketing_budget_minor,profile_confidence').eq('business_id', member.business_id).maybeSingle(),
    supabase.from('profiles').select('display_name,preferred_locale').eq('id', userId).maybeSingle(),
  ]);
  if (businessError) throw new DataUnavailableError('business', businessError);
  if (!business) throw new Error('BUSINESS_REQUIRED');
  // Narrowed once, here: every caller downstream decides behaviour from the
  // tenant's mode, and none of them should have to re-check what it can be.
  const scopedBusiness = { ...business, mode: asBusinessMode(business.mode) };
  return { supabase, userId, businessId: member.business_id, role: member.role as BusinessRole, business: scopedBusiness, location, profile, person };
}

export function canManage(role: BusinessRole) { return role === 'owner' || role === 'manager'; }
export function canMarket(role: BusinessRole) { return role === 'owner' || role === 'manager' || role === 'marketer'; }

export async function getTodayData() {
  const ctx = await requireBusinessContext();
  const { supabase, businessId } = ctx;
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [{ data: transactions }, { count: customers }, { count: activeCampaigns }, { data: signal }, { data: recommendation }, { data: activations }, { data: campaigns }, { data: notifications }, { data: contribution }] = await Promise.all([
    supabase.from('transactions').select('customer_id,net_minor,occurred_at').eq('business_id', businessId).order('occurred_at', { ascending: false }).limit(3000),
    supabase.from('customers').select('id', { count: 'exact', head: true }).eq('business_id', businessId).neq('lifecycle_stage', 'anonymized'),
    supabase.from('campaigns').select('id', { count: 'exact', head: true }).eq('business_id', businessId).in('status', ['approved','scheduled','running','paused']),
    supabase.from('signals').select('id,signal_type,metric_key,change_bps,growth_opportunity_score,confidence,evidence,period_start,period_end,comparison_start,comparison_end,detected_at').eq('business_id', businessId).eq('status', 'open').order('growth_opportunity_score', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('recommendations').select('id,title_ru,title_kk,explanation,confidence,status,optimistic_version,signal_id').eq('business_id', businessId).in('status', ['open','snoozed']).order('confidence', { ascending: false }).limit(1).maybeSingle(),
    // Activated tools were fetched and then dropped by the screen, so «Активные
    // инструменты» listed campaigns only and activation had no visible effect
    // anywhere in the product. The name is joined here so it can be shown.
    supabase.from('business_tools').select('id,status,tool_id,tools(code,name_ru,route)').eq('business_id', businessId).eq('status', 'active').limit(6),
    supabase.from('campaigns').select('id,name,status,channel,created_at').eq('business_id', businessId).order('created_at', { ascending: false }).limit(5),
    supabase.from('notifications').select('id,title,body,read_at,action_url,created_at').eq('business_id', businessId).order('created_at', { ascending: false }).limit(5),
    // The KPI used to be the literal constant 0. It is a measurement or it is
    // «—»; a zero that means "we never looked" reads as "you earned nothing".
    supabase.from('impact_measurements').select('value_minor,kind').eq('business_id', businessId).eq('metric_key', 'incremental_contribution').gte('period_start', since).limit(200),
  ]);
  const rows = transactions ?? [];
  const revenue = rows.reduce((sum, row) => sum + Number(row.net_minor), 0);
  const visits = new Map<string, number>();
  rows.forEach((row) => { if (row.customer_id) visits.set(row.customer_id, (visits.get(row.customer_id) ?? 0) + 1); });
  const repeatCustomers = [...visits.values()].filter((value) => value > 1).length;
  const repeatRate = visits.size ? Math.round((repeatCustomers / visits.size) * 100) : 0;
  const contributionRows = contribution ?? [];
  const tools = (activations ?? []).map((row) => {
    const tool = (Array.isArray(row.tools) ? row.tools[0] : row.tools) as { code?: string; name_ru?: string; route?: string } | null;
    return { id: row.id, toolId: row.tool_id, code: tool?.code ?? '', name: tool?.name_ru ?? 'Инструмент', route: tool?.route ?? '/app/tools' };
  });
  return {
    ...ctx,
    kpis: {
      customers: customers ?? 0,
      salesMinor: revenue,
      repeatRate,
      activeCampaigns: activeCampaigns ?? 0,
      // null, not 0, when nothing has been measured yet.
      estimatedContributionMinor: contributionRows.length ? contributionRows.reduce((sum, row) => sum + Number(row.value_minor), 0) : null,
      contributionIsEstimate: contributionRows.some((row) => row.kind !== 'verified_fact'),
    },
    signal,
    recommendation,
    tools,
    campaigns: campaigns ?? [],
    notifications: notifications ?? [],
  };
}

export async function getToolsData(filters: { q?: string; category?: string; favorites?: boolean }) {
  const ctx = await requireBusinessContext();
  let query = ctx.supabase.from('tools').select('id,category_id,code,name_ru,name_kk,description_ru,description_kk,route,status,is_public').eq('status', 'published').eq('is_public', true).order('name_ru');
  if (filters.q) query = query.or(`name_ru.ilike.%${filters.q.replace(/[%_,()]/g, '')}%,description_ru.ilike.%${filters.q.replace(/[%_,()]/g, '')}%`);
  const [{ data: tools }, { data: categories }, { data: favoriteRows }, { data: activeRows }] = await Promise.all([
    query,
    ctx.supabase.from('tool_categories').select('id,code,name_ru,name_kk').eq('status', 'published').order('sort_order'),
    ctx.supabase.from('favorite_tools').select('tool_id').eq('business_id', ctx.businessId).eq('user_id', ctx.userId),
    ctx.supabase.from('business_tools').select('tool_id,status').eq('business_id', ctx.businessId),
  ]);
  const favorites = new Set((favoriteRows ?? []).map((row) => row.tool_id));
  const active = new Map((activeRows ?? []).map((row) => [row.tool_id, row.status]));
  let rows = (tools ?? []).map((tool) => ({ ...tool, favorite: favorites.has(tool.id), activationStatus: active.get(tool.id) ?? 'inactive', category: (categories ?? []).find((item) => item.id === tool.category_id) }));
  if (filters.category) rows = rows.filter((tool) => tool.category?.code === filters.category);
  if (filters.favorites) rows = rows.filter((tool) => tool.favorite);
  return { ...ctx, tools: rows, categories: categories ?? [] };
}

/**
 * Counts a segment rule against the tenant's own rows.
 *
 * Every audience number a person sees comes through here, so there is one place
 * where the count can be checked and no second, looser way to produce one.
 */
export async function countSegmentAudience(rule: SegmentRule): Promise<{ matched: number; eligible: number; scope: string }> {
  const ctx = await requireBusinessContext();
  const { data, error } = await ctx.supabase.rpc('preview_segment_audience', { p_business_id: ctx.businessId, p_rule: rule as unknown as Json });
  if (error) throw error;
  const result = (data ?? {}) as { matched?: number; eligible?: number; scope?: string };
  return { matched: Number(result.matched ?? 0), eligible: Number(result.eligible ?? 0), scope: String(result.scope ?? '') };
}

/**
 * The segment a guest already belongs to, for «Создать оффер» on their card.
 *
 * Returns null rather than inventing an audience when they are in none — a
 * campaign built for nobody is worse than a page that says why it cannot start.
 */
export async function segmentForCustomer(customerId: string): Promise<{ code: string; name: string; customerName: string } | null> {
  const ctx = await requireBusinessContext();
  const [{ data: customer }, { data: membership }] = await Promise.all([
    ctx.supabase.from('customers').select('display_name').eq('business_id', ctx.businessId).eq('id', customerId).maybeSingle(),
    ctx.supabase.from('segment_memberships').select('segment_id,customer_segments(code,name_ru,status)').eq('business_id', ctx.businessId).eq('customer_id', customerId).limit(5),
  ]);
  if (!customer) return null;
  for (const row of membership ?? []) {
    const segment = (Array.isArray(row.customer_segments) ? row.customer_segments[0] : row.customer_segments) as { code?: string; name_ru?: string; status?: string } | null;
    if (segment?.code && segment.status === 'active') {
      return { code: segment.code, name: segment.name_ru ?? segment.code, customerName: customer.display_name || 'гость' };
    }
  }
  return null;
}

/** Lifecycle stages, as opposed to segment codes — both arrive in the same query parameter. */
const LIFECYCLE_STAGES = new Set(['new', 'active', 'loyal', 'vip', 'inactive', 'churned']);

export async function getCustomersData(filters: { q?: string; segment?: string; cursor?: string }) {
  const ctx = await requireBusinessContext();
  const columns = 'id,display_name,lifecycle_stage,first_seen_at,last_seen_at,created_at';
  // «Просмотреть список» on a segment card passes the segment's code, while the
  // filter above passes a lifecycle stage. Both used to be compared against
  // `lifecycle_stage`, so every card whose code was not also a stage opened an
  // empty table and looked like a segment with nobody in it.
  const stage = filters.segment && LIFECYCLE_STAGES.has(filters.segment) ? filters.segment : null;
  let segmentId: string | null = null;
  if (filters.segment && !stage) {
    const { data: segment } = await ctx.supabase.from('customer_segments').select('id').eq('business_id', ctx.businessId).eq('code', filters.segment).maybeSingle();
    segmentId = segment?.id ?? null;
    // An unknown code must not silently widen the list to everybody.
    if (!segmentId) return { ...ctx, customers: [], nextCursor: null as string | null, segmentMissing: filters.segment };
  }
  type CustomerRow = { id: string; display_name: string | null; lifecycle_stage: string; first_seen_at: string | null; last_seen_at: string | null; created_at: string };
  const build = (select: string) => {
    let query = ctx.supabase.from('customers').select(select).eq('business_id', ctx.businessId).neq('lifecycle_stage', 'anonymized').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(26);
    if (filters.q) query = query.ilike('display_name', `%${filters.q.replace(/[%_,()]/g, '')}%`);
    if (stage) query = query.eq('lifecycle_stage', stage);
    if (filters.cursor) query = query.lt('created_at', filters.cursor);
    return query;
  };
  // The membership join is done by the database rather than by sending a list
  // of ids back to it: a segment of a few thousand people would not fit in a URL.
  const { data: customerRows } = segmentId
    ? await build(`${columns},segment_memberships!inner(segment_id)`).eq('segment_memberships.segment_id', segmentId).overrideTypes<CustomerRow[]>()
    : await build(columns).overrideTypes<CustomerRow[]>();
  const page = (customerRows ?? []).slice(0, 25);
  const ids = page.map((row) => row.id);
  const [{ data: tx }, { data: identities }, { data: consents }, { data: accounts }] = ids.length ? await Promise.all([
    ctx.supabase.from('transactions').select('customer_id,net_minor,occurred_at').eq('business_id', ctx.businessId).in('customer_id', ids),
    ctx.supabase.from('customer_identities').select('customer_id,masked_value,identity_type').eq('business_id', ctx.businessId).in('customer_id', ids).eq('is_primary', true),
    ctx.supabase.from('customer_consents').select('customer_id,scope,status,created_at').eq('business_id', ctx.businessId).in('customer_id', ids).order('created_at', { ascending: false }),
    ctx.supabase.from('loyalty_accounts').select('customer_id,points_balance,stamps_balance').eq('business_id', ctx.businessId).in('customer_id', ids),
  ]) : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];
  const customers = page.map((row) => {
    const purchases = (tx ?? []).filter((item) => item.customer_id === row.id);
    const spentMinor = purchases.reduce((sum, item) => sum + Number(item.net_minor), 0);
    return { ...row, identity: (identities ?? []).find((item) => item.customer_id === row.id), visits: purchases.length, spentMinor, aovMinor: purchases.length ? Math.round(spentMinor / purchases.length) : 0, consents: (consents ?? []).filter((item) => item.customer_id === row.id), loyalty: (accounts ?? []).find((item) => item.customer_id === row.id) };
  });
  return { ...ctx, customers, nextCursor: (customerRows ?? []).length > 25 ? page.at(-1)?.created_at ?? null : null, segmentMissing: null as string | null };
}

export async function getRecommendationsData() {
  const ctx = await requireBusinessContext();
  const { data } = await ctx.supabase.from('recommendations').select('id,signal_id,title_ru,title_kk,explanation,confidence,status,snoozed_until,optimistic_version,feedback,created_at').eq('business_id', ctx.businessId).order('created_at', { ascending: false });
  return { ...ctx, recommendations: data ?? [] };
}

export async function getCustomerDetail(customerId: string) {
  const ctx = await requireBusinessContext();
  const [{ data: customer }, { data: transactions }, { data: identities }, { data: consents }, { data: accounts }, { data: notes }, { data: activities }, { data: audiences }, { data: interactions }] = await Promise.all([
    ctx.supabase.from('customers').select('id,display_name,lifecycle_stage,first_seen_at,last_seen_at,anonymized_at').eq('business_id', ctx.businessId).eq('id', customerId).maybeSingle(),
    ctx.supabase.from('transactions').select('id,net_minor,discount_minor,currency,occurred_at,source').eq('business_id', ctx.businessId).eq('customer_id', customerId).order('occurred_at', { ascending: false }).limit(100),
    ctx.supabase.from('customer_identities').select('id,identity_type,masked_value,verified_at,is_primary').eq('business_id', ctx.businessId).eq('customer_id', customerId),
    ctx.supabase.from('customer_consents').select('id,scope,status,source,granted_at,revoked_at,created_at').eq('business_id', ctx.businessId).eq('customer_id', customerId).order('created_at', { ascending: false }),
    ctx.supabase.from('loyalty_accounts').select('id,points_balance,stamps_balance,loyalty_program_id,created_at').eq('business_id', ctx.businessId).eq('customer_id', customerId),
    ctx.supabase.from('customer_notes').select('id,note,author_id,created_at').eq('business_id', ctx.businessId).eq('customer_id', customerId).order('created_at', { ascending: false }),
    ctx.supabase.from('activity_logs').select('id,action,resource_type,resource_id,metadata,occurred_at').eq('business_id', ctx.businessId).or(`resource_id.eq.${customerId},metadata->>customer_id.eq.${customerId}`).order('occurred_at', { ascending: false }).limit(50),
    ctx.supabase.from('campaign_audiences').select('campaign_id,inclusion_status,exclusion_reason,consent_scope,consent_status,evaluated_at').eq('business_id', ctx.businessId).eq('customer_id', customerId).order('evaluated_at', { ascending: false }),
    // What the guest did outside the till: joined, asked, gave or withdrew
    // consent, took a reward. Half the relationship runs through Telegram now,
    // and until this the owner could not see any of it.
    ctx.supabase.from('customer_interactions').select('id,channel,direction,kind,body,metadata,occurred_at').eq('business_id', ctx.businessId).eq('customer_id', customerId).order('occurred_at', { ascending: false }).limit(30),
  ]);
  if (!customer) throw new Error('CUSTOMER_NOT_FOUND');
  const purchases = transactions ?? [];
  const totalMinor = purchases.reduce((sum, item) => sum + Number(item.net_minor), 0);
  // Frequency used to be `visits / 4` — a fixed four weeks for everybody,
  // whether the person had been coming for a fortnight or a year. It is the
  // span between their own first and last purchase or it is not shown.
  const stamps = purchases.map((item) => new Date(item.occurred_at).getTime()).filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  const spanMonths = stamps.length > 1 ? (stamps[stamps.length - 1] - stamps[0]) / (30 * 86_400_000) : 0;
  const frequencyPerMonth = spanMonths >= 0.5 ? Math.round((purchases.length / spanMonths) * 10) / 10 : null;
  return {
    ...ctx,
    customer,
    transactions: purchases,
    identities: identities ?? [],
    consents: consents ?? [],
    accounts: accounts ?? [],
    notes: notes ?? [],
    activities: activities ?? [],
    audiences: audiences ?? [],
    interactions: interactions ?? [],
    metrics: {
      visits: purchases.length,
      totalMinor,
      aovMinor: purchases.length ? Math.round(totalMinor / purchases.length) : 0,
      frequencyPerMonth,
      firstSeenAt: stamps.length ? new Date(stamps[0]).toISOString() : null,
      lastSeenAt: stamps.length ? new Date(stamps[stamps.length - 1]).toISOString() : null,
    },
  };
}

export async function getSegmentsData() {
  const ctx = await requireBusinessContext();
  const [{ data: segments }, { data: memberships }] = await Promise.all([
    ctx.supabase.from('customer_segments').select('id,code,name_ru,name_kk,definition,rule_version,status,last_evaluated_at').eq('business_id', ctx.businessId).eq('status', 'active').order('name_ru'),
    ctx.supabase.from('segment_memberships').select('segment_id,customer_id').eq('business_id', ctx.businessId),
  ]);
  return { ...ctx, segments: (segments ?? []).map((segment) => ({ ...segment, count: (memberships ?? []).filter((item) => item.segment_id === segment.id).length })) };
}

export async function getCampaignsData() {
  const ctx = await requireBusinessContext();
  const [{ data: campaigns }, { data: contracts }, { data: audiences }, { data: measurements }] = await Promise.all([
    ctx.supabase.from('campaigns').select('id,name,status,channel,budget_minor,currency,starts_at,ends_at,growth_contract_id,optimistic_version,created_at').eq('business_id', ctx.businessId).order('created_at', { ascending: false }).limit(50),
    ctx.supabase.from('growth_contracts').select('id,status,version,optimistic_version,content_hash,consent_summary,simulator_result,margin_decision,created_at,recommendation_id,signal_id').eq('business_id', ctx.businessId).order('created_at', { ascending: false }).limit(50),
    ctx.supabase.from('campaign_audiences').select('campaign_id,inclusion_status').eq('business_id', ctx.businessId),
    ctx.supabase.from('impact_measurements').select('campaign_id,metric_key,kind,value_minor,unit').eq('business_id', ctx.businessId),
  ]);
  const rows = (campaigns ?? []).map((campaign) => ({
    ...campaign,
    contract: (contracts ?? []).find((item) => item.id === campaign.growth_contract_id),
    includedCount: (audiences ?? []).filter((item) => item.campaign_id === campaign.id && item.inclusion_status === 'included').length,
    measurements: (measurements ?? []).filter((item) => item.campaign_id === campaign.id),
  }));
  // Contracts that never reached launch are still owner work-in-progress.
  const openContracts = (contracts ?? []).filter((contract) => !(campaigns ?? []).some((campaign) => campaign.growth_contract_id === contract.id) && !['cancelled', 'failed'].includes(contract.status));
  return { ...ctx, campaigns: rows, openContracts };
}

export async function getCampaignDetail(campaignId: string) {
  const ctx = await requireBusinessContext();
  const { data: campaign } = await ctx.supabase.from('campaigns').select('id,name,status,channel,budget_minor,currency,starts_at,ends_at,stop_rule,growth_contract_id,optimistic_version,created_by,approved_by,created_at').eq('business_id', ctx.businessId).eq('id', campaignId).maybeSingle();
  if (!campaign) throw new Error('CAMPAIGN_NOT_FOUND');
  const [{ data: contract }, { data: audiences }, { data: content }, { data: deliveries }, { data: events }, { data: measurements }, { data: activities }] = await Promise.all([
    ctx.supabase.from('growth_contracts').select('id,status,version,optimistic_version,content_hash,accepted_snapshot,consent_summary,simulator_result,margin_decision,attribution_plan,owner_limits_snapshot,created_at').eq('business_id', ctx.businessId).eq('id', campaign.growth_contract_id).maybeSingle(),
    ctx.supabase.from('campaign_audiences').select('customer_id,inclusion_status,exclusion_reason,consent_scope,consent_status,evaluated_at').eq('business_id', ctx.businessId).eq('campaign_id', campaignId).limit(500),
    ctx.supabase.from('content_items').select('id,content_kind,channel,locale,body,cta,status,version,created_at').eq('business_id', ctx.businessId).eq('campaign_id', campaignId).order('created_at', { ascending: false }),
    ctx.supabase.from('campaign_deliveries').select('id,status,queued_at,sent_at').eq('business_id', ctx.businessId).eq('campaign_id', campaignId).limit(500),
    ctx.supabase.from('campaign_events').select('id,event_type,occurred_at').eq('business_id', ctx.businessId).eq('campaign_id', campaignId).limit(500),
    ctx.supabase.from('impact_measurements').select('id,metric_key,kind,value_minor,unit,currency,source,confidence,period_start,period_end').eq('business_id', ctx.businessId).eq('campaign_id', campaignId).order('created_at', { ascending: false }),
    ctx.supabase.from('activity_logs').select('id,action,resource_type,metadata,occurred_at').eq('business_id', ctx.businessId).eq('resource_id', campaignId).order('occurred_at', { ascending: false }).limit(30),
  ]);
  return {
    ...ctx,
    campaign,
    contract,
    audiences: audiences ?? [],
    content: content ?? [],
    deliveries: deliveries ?? [],
    events: events ?? [],
    measurements: measurements ?? [],
    activities: activities ?? [],
  };
}

export async function getCampaignStudioData(filters: { segment?: string; recommendation?: string; channel?: string; contract?: string }) {
  const ctx = await requireBusinessContext();
  // WhatsApp needs Meta credentials nobody has, so a campaign that defaulted to
  // it resolved to zero consenting recipients and Margin Shield blocked on an
  // empty audience — which reads as a broken product, not a missing vendor.
  const channel = filters.channel || 'telegram';
  const [{ data: signals }, { data: recommendations }, { data: segments }, { data: profile }, { data: limits }, { data: contract }] = await Promise.all([
    ctx.supabase.from('signals').select('id,signal_type,metric_key,change_bps,growth_opportunity_score,confidence,evidence,period_start,period_end,detected_at').eq('business_id', ctx.businessId).eq('status', 'open').order('growth_opportunity_score', { ascending: false }).limit(10),
    ctx.supabase.from('recommendations').select('id,signal_id,title_ru,title_kk,explanation,confidence,status').eq('business_id', ctx.businessId).in('status', ['open', 'accepted']).order('confidence', { ascending: false }).limit(10),
    ctx.supabase.from('customer_segments').select('id,code,name_ru,name_kk,definition,rule_version').eq('business_id', ctx.businessId).eq('status', 'active').order('name_ru'),
    ctx.supabase.from('business_profiles').select('average_check_minor,margin_floor_bps,monthly_marketing_budget_minor').eq('business_id', ctx.businessId).maybeSingle(),
    ctx.supabase.from('business_limits').select('monthly_budget_minor,approval_threshold_minor').eq('business_id', ctx.businessId).maybeSingle(),
    filters.contract
      ? ctx.supabase.from('growth_contracts').select('id,status,version,optimistic_version,content_hash,accepted_snapshot,consent_summary,simulator_result,margin_decision,created_at').eq('business_id', ctx.businessId).eq('id', filters.contract).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const selectedSegment = (segments ?? []).find((segment) => segment.code === filters.segment) ?? (segments ?? []).find((segment) => segment.code === 'inactive_30') ?? (segments ?? [])[0];
  let segmentCustomerIds: string[] = [];
  if (selectedSegment) {
    const { data: members } = await ctx.supabase.from('segment_memberships').select('customer_id').eq('business_id', ctx.businessId).eq('segment_id', selectedSegment.id).limit(500);
    segmentCustomerIds = (members ?? []).map((row) => row.customer_id);
  }
  const { data: eligible } = segmentCustomerIds.length
    ? await ctx.supabase.rpc('effective_consent_customers', { p_business_id: ctx.businessId, p_scope: `marketing.${channel}`, p_customer_ids: segmentCustomerIds })
    : { data: [] as string[] };
  const eligibleIds = (eligible ?? []) as string[];

  return {
    ...ctx,
    channel,
    signals: signals ?? [],
    recommendations: recommendations ?? [],
    segments: segments ?? [],
    selectedSegment,
    segmentCustomerIds,
    eligibleIds,
    profile: profile ?? null,
    limits: limits ?? null,
    contract: contract ?? null,
    selectedRecommendation: (recommendations ?? []).find((item) => item.id === filters.recommendation) ?? (recommendations ?? [])[0],
  };
}

export async function getContentData(filters: { campaign?: string }) {
  const ctx = await requireBusinessContext();
  let query = ctx.supabase.from('content_items').select('id,campaign_id,content_kind,channel,locale,ordinal,body,alt_text,cta,status,version,source,created_at').eq('business_id', ctx.businessId).order('content_kind').order('locale').order('ordinal').limit(60);
  if (filters.campaign) query = query.eq('campaign_id', filters.campaign);
  const [{ data: content }, { data: campaigns }, { data: runs }, { data: codes }] = await Promise.all([
    query,
    ctx.supabase.from('campaigns').select('id,name,status,channel,growth_contract_id').eq('business_id', ctx.businessId).order('created_at', { ascending: false }).limit(20),
    ctx.supabase.from('ai_generation_runs').select('id,purpose,provider,model,source,status,failure_kind,fallback_reason,latency_ms,attempts,cost_micros,created_at').eq('business_id', ctx.businessId).order('created_at', { ascending: false }).limit(8),
    ctx.supabase.from('tracking_codes').select('id,campaign_id,public_code,purpose,created_at').eq('business_id', ctx.businessId).order('created_at', { ascending: false }).limit(20),
  ]);
  return { ...ctx, content: content ?? [], campaigns: campaigns ?? [], runs: runs ?? [], trackingCodes: codes ?? [] };
}

export async function getAnalyticsData() {
  const ctx = await requireBusinessContext();
  const [{ data: measurements }, { data: campaigns }, { data: transactions }, { count: customers }] = await Promise.all([
    ctx.supabase.from('impact_measurements').select('id,campaign_id,metric_key,kind,value_minor,unit,currency,source,confidence,period_start,period_end,created_at').eq('business_id', ctx.businessId).order('created_at', { ascending: false }).limit(100),
    ctx.supabase.from('campaigns').select('id,name,status').eq('business_id', ctx.businessId).limit(50),
    ctx.supabase.from('transactions').select('net_minor,occurred_at').eq('business_id', ctx.businessId).order('occurred_at', { ascending: false }).limit(3000),
    ctx.supabase.from('customers').select('id', { count: 'exact', head: true }).eq('business_id', ctx.businessId).neq('lifecycle_stage', 'anonymized'),
  ]);
  const byKind = (kind: string) => (measurements ?? []).filter((row) => row.kind === kind);
  return {
    ...ctx,
    measurements: measurements ?? [],
    campaigns: campaigns ?? [],
    customers: customers ?? 0,
    revenueMinor: (transactions ?? []).reduce((sum, row) => sum + Number(row.net_minor), 0),
    forecasts: byKind('forecast'),
    mockActuals: byKind('mock_actual'),
    verified: byKind('verified_fact'),
  };
}

export async function getAutomationsData() {
  const ctx = await requireBusinessContext();
  const [{ data: automations }, { data: runs }, { data: execState }, { data: channels }, { data: outbox }] = await Promise.all([
    ctx.supabase.from('automations').select('id,name,automation_type,trigger_rules,filters,action_rules,guardrails,status,mode,rule_version,approved_template_version,next_run_at,last_run_at,owner_id,optimistic_version,created_at').eq('business_id', ctx.businessId).order('created_at', { ascending: false }),
    ctx.supabase.from('automation_runs').select('id,automation_id,status,scheduled_at,completed_at,result,attempt,trigger_source,error').eq('business_id', ctx.businessId).order('scheduled_at', { ascending: false }).limit(30),
    ctx.supabase.from('business_execution_state').select('emergency_stopped_at,emergency_stop_reason,quiet_hours_start,quiet_hours_end,timezone,daily_send_cap').eq('business_id', ctx.businessId).maybeSingle(),
    ctx.supabase.from('business_channels').select('id,channel_type,adapter,status,connector_state,last_health_check_at,last_error,health_evidence').eq('business_id', ctx.businessId).order('channel_type'),
    ctx.supabase.from('outbox_events').select('id,event_type,status,attempts,attempts_max,available_at,last_error,dead_lettered_at,created_at').eq('business_id', ctx.businessId).order('created_at', { ascending: false }).limit(20),
  ]);
  return {
    ...ctx,
    automations: automations ?? [],
    runs: runs ?? [],
    executionState: execState,
    channels: channels ?? [],
    outbox: outbox ?? [],
    deadLetters: (outbox ?? []).filter((row) => row.status === 'dead_letter'),
  };
}

export async function getNotificationsData(filters: { unreadOnly?: boolean; category?: string }) {
  const ctx = await requireBusinessContext();
  let query = ctx.supabase.from('notifications')
    .select('id,notification_type,category,title,body,action_url,read_at,dismissed_at,created_at')
    .eq('business_id', ctx.businessId).is('dismissed_at', null)
    .order('created_at', { ascending: false }).limit(60);
  if (filters.unreadOnly) query = query.is('read_at', null);
  if (filters.category) query = query.eq('category', filters.category);

  const [{ data: notifications }, { data: preferences }, { count: unread }] = await Promise.all([
    query,
    ctx.supabase.from('notification_preferences').select('category,muted').eq('business_id', ctx.businessId).eq('user_id', ctx.userId),
    ctx.supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('business_id', ctx.businessId).is('read_at', null).is('dismissed_at', null),
  ]);
  const muted = new Set((preferences ?? []).filter((row) => row.muted).map((row) => row.category));
  return { ...ctx, notifications: (notifications ?? []).filter((row) => !muted.has(row.category)), muted, unread: unread ?? 0 };
}

export async function getSettingsData() {
  const ctx = await requireBusinessContext();
  const [{ data: locations }, { data: limits }, { data: channels }, { data: members }] = await Promise.all([
    ctx.supabase.from('business_locations').select('id,name,city,district,address_text,capacity,is_active').eq('business_id', ctx.businessId).order('created_at'),
    ctx.supabase.from('business_limits').select('monthly_budget_minor,approval_threshold_minor,max_campaigns_per_month,max_contacts_per_month').eq('business_id', ctx.businessId).maybeSingle(),
    ctx.supabase.from('business_channels').select('id,channel_type,status').eq('business_id', ctx.businessId).order('channel_type'),
    ctx.supabase.from('business_members').select('id,user_id,role,status').eq('business_id', ctx.businessId).order('created_at'),
  ]);
  return { ...ctx, locations: locations ?? [], limits, channels: channels ?? [], members: members ?? [] };
}

export async function getLoyaltyData() {
  const ctx = await requireBusinessContext();
  const [{ data: programs }, { data: rewards }, { data: scans }, { data: ledger }, { data: activities }, { data: qrCodes }] = await Promise.all([
    ctx.supabase.from('loyalty_programs').select('id,name,program_type,rules,status,created_at').eq('business_id', ctx.businessId).order('created_at', { ascending: false }),
    ctx.supabase.from('rewards').select('id,loyalty_program_id,name_ru,name_kk,cost_points,cost_stamps,status').eq('business_id', ctx.businessId),
    ctx.supabase.from('qr_scans').select('id,qr_code_id,customer_id,scan_kind,scanned_at').eq('business_id', ctx.businessId).order('scanned_at', { ascending: false }).limit(500),
    ctx.supabase.from('loyalty_ledger').select('id,loyalty_account_id,entry_type,points_delta,stamps_delta,occurred_at').eq('business_id', ctx.businessId).order('occurred_at', { ascending: false }).limit(20),
    ctx.supabase.from('activity_logs').select('id,action,resource_type,resource_id,metadata,occurred_at').eq('business_id', ctx.businessId).in('action', ['qr.scanned','loyalty.joined','loyalty.earned','loyalty.redeemed']).order('occurred_at', { ascending: false }).limit(30),
    ctx.supabase.from('qr_codes').select('id,loyalty_program_id,purpose,status,expires_at,revoked_at,rotated_from_id,created_at').eq('business_id', ctx.businessId).eq('purpose', 'loyalty_join').order('created_at', { ascending: false }).limit(50),
  ]);
  const scanRows = scans ?? [];
  const tokens = (qrCodes ?? []).map((qr) => {
    const own = scanRows.filter((scan) => scan.qr_code_id === qr.id);
    const lastScanAt = own.reduce<string | null>((latest, scan) => (!latest || scan.scanned_at > latest ? scan.scanned_at : latest), null);
    const expired = Boolean(qr.expires_at && new Date(qr.expires_at).getTime() <= Date.now());
    return {
      ...qr,
      scanCount: own.length,
      joinCount: own.filter((scan) => scan.scan_kind === 'join').length,
      lastScanAt,
      // A stored 'active' row is only really usable while its expiry is in the future.
      effectiveStatus: qr.status === 'active' && expired ? 'expired' : qr.status,
      programName: (programs ?? []).find((program) => program.id === qr.loyalty_program_id)?.name ?? '—',
    };
  });
  return { ...ctx, programs: programs ?? [], rewards: rewards ?? [], scans: scanRows.slice(0, 20), ledger: ledger ?? [], activities: activities ?? [], qrTokens: tokens };
}
