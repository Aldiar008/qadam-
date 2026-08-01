import 'server-only';

import { requireBusinessContext } from './repository';

/**
 * Impact dashboard data.
 *
 * The one rule that shapes this whole module: influenced revenue and
 * incremental estimate are never added together, never substituted for each
 * other, and never rendered without their kind. A mock result is labelled
 * mock everywhere it appears.
 */

export type MetricKind = 'forecast' | 'influenced' | 'incremental_estimate' | 'mock_actual' | 'verified_fact';

export const KIND_META: Record<MetricKind, { label: string; note: string; tone: string }> = {
  forecast: { label: 'Forecast', note: 'прогноз до запуска', tone: 'bg-amber-500/10 text-amber-900' },
  influenced: { label: 'Influenced', note: 'выручка контактировавших клиентов, не прирост', tone: 'bg-sky-500/10 text-sky-900' },
  incremental_estimate: { label: 'Incremental estimate', note: 'оценка прироста относительно базовой линии', tone: 'bg-primary/10 text-primary' },
  mock_actual: { label: 'Mock result', note: 'демонстрационный результат', tone: 'bg-surface-muted text-muted-foreground' },
  verified_fact: { label: 'Verified fact', note: 'подтверждённый факт из связанного источника', tone: 'bg-emerald-500/10 text-emerald-900' },
};

export interface PeriodWindow {
  start: Date;
  end: Date;
  previousStart: Date;
  previousEnd: Date;
  days: number;
}

export function resolvePeriod(days: number): PeriodWindow {
  const end = new Date();
  const start = new Date(end.getTime() - days * 86_400_000);
  return {
    start,
    end,
    previousStart: new Date(start.getTime() - days * 86_400_000),
    previousEnd: start,
    days,
  };
}

export interface ImpactDashboard {
  period: PeriodWindow;
  kpis: {
    newCustomers: number;
    newCustomersPrevious: number;
    reactivatedCustomers: number;
    repeatPurchases: number;
    influencedRevenueMinor: number;
    incrementalRevenueMinor: number;
    incrementalContributionMinor: number;
    roiBps: number | null;
    cacMinor: number | null;
    costPerReturnMinor: number | null;
    ownerMinutesSaved: number;
    automatedActions: number;
    forecastErrorBps: number | null;
    campaignCostMinor: number;
  };
  /** Whether an incremental figure exists at all; false means only influenced is known. */
  hasIncremental: boolean;
  /** True when every incremental figure on screen came from demo data. */
  incrementalIsMock: boolean;
  topAction: { campaignId: string; name: string; contributionMinor: number; kind: MetricKind } | null;
  ledger: {
    id: string;
    campaignId: string | null;
    campaignName: string;
    metricKey: string;
    kind: MetricKind;
    valueMinor: number;
    unit: string;
    confidence: number | null;
    source: string;
    methodVersion: string | null;
    periodStart: string;
    periodEnd: string;
    evidence: Record<string, unknown>;
    isMock: boolean;
    createdAt: string;
  }[];
  nextCursor: string | null;
  baselines: { campaignId: string; measurementVersion: string; method: string; baselineRevenueMinor: number; minSampleSize: number; audienceSize: number }[];
  /** Campaigns whose sample is still too small for an incremental claim. */
  underpowered: { campaignName: string; delivered: number; minSample: number }[];
}

const LEDGER_PAGE = 20;

export async function getImpactDashboard(options: { days?: number; cursor?: string }): Promise<ImpactDashboard & { ctx: Awaited<ReturnType<typeof requireBusinessContext>> }> {
  const ctx = await requireBusinessContext();
  const period = resolvePeriod(options.days ?? 30);

  let ledgerQuery = ctx.supabase.from('impact_measurements')
    .select('id,campaign_id,metric_key,kind,value_minor,unit,currency,confidence,source,method_version,period_start,period_end,evidence,is_mock,created_at')
    .eq('business_id', ctx.businessId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(LEDGER_PAGE + 1);
  if (options.cursor) ledgerQuery = ledgerQuery.lt('created_at', options.cursor);

  const [
    { data: measurements }, { data: ledgerRows }, { data: campaigns }, { data: customers },
    { data: transactions }, { data: baselines }, { count: automatedActions }, { data: events },
  ] = await Promise.all([
    ctx.supabase.from('impact_measurements')
      .select('campaign_id,metric_key,kind,value_minor,unit,is_mock,period_start')
      .eq('business_id', ctx.businessId).gte('period_start', period.previousStart.toISOString()).limit(500),
    ledgerQuery,
    ctx.supabase.from('campaigns').select('id,name,status,budget_minor,created_at').eq('business_id', ctx.businessId).limit(100),
    ctx.supabase.from('customers').select('id,lifecycle_stage,first_seen_at,last_seen_at,created_at').eq('business_id', ctx.businessId).neq('lifecycle_stage', 'anonymized').limit(2000),
    ctx.supabase.from('transactions').select('customer_id,net_minor,occurred_at').eq('business_id', ctx.businessId).gte('occurred_at', period.previousStart.toISOString()).limit(4000),
    ctx.supabase.from('impact_baselines').select('campaign_id,measurement_version,method,baseline_revenue_minor,min_sample_size,audience_size').eq('business_id', ctx.businessId).limit(50),
    ctx.supabase.from('automation_runs').select('id', { count: 'exact', head: true }).eq('business_id', ctx.businessId).gte('scheduled_at', period.start.toISOString()),
    ctx.supabase.from('campaign_events').select('campaign_id,event_type').eq('business_id', ctx.businessId).limit(2000),
  ]);

  const campaignName = (id: string | null) => (campaigns ?? []).find((row) => row.id === id)?.name ?? 'Без кампании';
  const inPeriod = (iso: string | null) => Boolean(iso && new Date(iso) >= period.start && new Date(iso) <= period.end);
  const inPrevious = (iso: string | null) => Boolean(iso && new Date(iso) >= period.previousStart && new Date(iso) < period.previousEnd);

  const rows = measurements ?? [];
  const sumOf = (kinds: MetricKind[], metricKey: string) => rows
    .filter((row) => kinds.includes(row.kind as MetricKind) && row.metric_key === metricKey && inPeriod(row.period_start))
    .reduce((sum, row) => sum + Number(row.value_minor), 0);

  const influencedRevenueMinor = sumOf(['influenced'], 'influenced_revenue');
  const incrementalRows = rows.filter((row) =>
    ['incremental_estimate', 'mock_actual', 'verified_fact'].includes(row.kind)
    && row.metric_key === 'incremental_revenue' && inPeriod(row.period_start));
  const incrementalRevenueMinor = incrementalRows.reduce((sum, row) => sum + Number(row.value_minor), 0);
  const incrementalContributionMinor = sumOf(['incremental_estimate', 'mock_actual', 'verified_fact'], 'incremental_contribution');
  const campaignCostMinor = sumOf(['incremental_estimate', 'mock_actual', 'verified_fact'], 'campaign_cost')
    || (campaigns ?? []).reduce((sum, row) => sum + Number(row.budget_minor), 0);
  const ownerMinutesSaved = rows
    .filter((row) => row.metric_key === 'owner_minutes_saved' && inPeriod(row.period_start))
    .reduce((sum, row) => sum + Number(row.value_minor), 0);

  const forecastRevenue = sumOf(['forecast'], 'incremental_revenue');
  const forecastErrorBps = forecastRevenue > 0 && incrementalRevenueMinor > 0
    ? Math.round(((incrementalRevenueMinor - forecastRevenue) / forecastRevenue) * 10_000)
    : null;

  const customerRows = customers ?? [];
  const newCustomers = customerRows.filter((row) => inPeriod(row.first_seen_at ?? row.created_at)).length;
  const newCustomersPrevious = customerRows.filter((row) => inPrevious(row.first_seen_at ?? row.created_at)).length;
  // Reactivated: last seen inside the window, but first seen well before it.
  const reactivatedCustomers = customerRows.filter((row) =>
    inPeriod(row.last_seen_at) && row.first_seen_at != null && new Date(row.first_seen_at) < period.previousStart).length;

  const purchaseCounts = new Map<string, number>();
  for (const tx of transactions ?? []) {
    if (!tx.customer_id || !inPeriod(tx.occurred_at)) continue;
    purchaseCounts.set(tx.customer_id, (purchaseCounts.get(tx.customer_id) ?? 0) + 1);
  }
  const repeatPurchases = [...purchaseCounts.values()].filter((count) => count > 1).length;

  const redeemedCount = (events ?? []).filter((row) => row.event_type === 'redeemed').length;
  const roiBps = campaignCostMinor > 0 && incrementalContributionMinor > 0
    ? Math.round((incrementalContributionMinor / campaignCostMinor) * 10_000)
    : null;
  const cacMinor = newCustomers > 0 && campaignCostMinor > 0 ? Math.round(campaignCostMinor / newCustomers) : null;
  const costPerReturnMinor = redeemedCount > 0 && campaignCostMinor > 0 ? Math.round(campaignCostMinor / redeemedCount) : null;

  const contributionByCampaign = new Map<string, { value: number; kind: MetricKind }>();
  for (const row of rows) {
    if (row.metric_key !== 'incremental_contribution' || !row.campaign_id || !inPeriod(row.period_start)) continue;
    const current = contributionByCampaign.get(row.campaign_id);
    const value = (current?.value ?? 0) + Number(row.value_minor);
    contributionByCampaign.set(row.campaign_id, { value, kind: row.kind as MetricKind });
  }
  const top = [...contributionByCampaign.entries()].sort((a, b) => b[1].value - a[1].value)[0];

  const deliveredByCampaign = new Map<string, number>();
  for (const row of events ?? []) {
    if (row.event_type !== 'delivered' && row.event_type !== 'sent') continue;
    if (!row.campaign_id) continue;
    deliveredByCampaign.set(row.campaign_id, (deliveredByCampaign.get(row.campaign_id) ?? 0) + 1);
  }
  const underpowered = (baselines ?? [])
    .map((baseline) => ({
      campaignName: campaignName(baseline.campaign_id),
      delivered: deliveredByCampaign.get(baseline.campaign_id) ?? 0,
      minSample: baseline.min_sample_size,
    }))
    .filter((row) => row.delivered < row.minSample);

  const page = (ledgerRows ?? []).slice(0, LEDGER_PAGE);
  return {
    ctx,
    period,
    kpis: {
      newCustomers,
      newCustomersPrevious,
      reactivatedCustomers,
      repeatPurchases,
      influencedRevenueMinor,
      incrementalRevenueMinor,
      incrementalContributionMinor,
      roiBps,
      cacMinor,
      costPerReturnMinor,
      ownerMinutesSaved,
      automatedActions: automatedActions ?? 0,
      forecastErrorBps,
      campaignCostMinor,
    },
    hasIncremental: incrementalRows.length > 0,
    // If every incremental row is demo data, the whole figure must be labelled mock.
    incrementalIsMock: incrementalRows.length > 0 && incrementalRows.every((row) => row.is_mock || row.kind === 'mock_actual'),
    topAction: top ? { campaignId: top[0], name: campaignName(top[0]), contributionMinor: top[1].value, kind: top[1].kind } : null,
    ledger: page.map((row) => ({
      id: row.id,
      campaignId: row.campaign_id,
      campaignName: campaignName(row.campaign_id),
      metricKey: row.metric_key,
      kind: row.kind as MetricKind,
      valueMinor: Number(row.value_minor),
      unit: row.unit,
      confidence: row.confidence,
      source: row.source,
      methodVersion: row.method_version,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      evidence: (row.evidence ?? {}) as Record<string, unknown>,
      isMock: row.is_mock,
      createdAt: row.created_at,
    })),
    nextCursor: (ledgerRows ?? []).length > LEDGER_PAGE ? page.at(-1)?.created_at ?? null : null,
    baselines: (baselines ?? []).map((row) => ({
      campaignId: row.campaign_id,
      measurementVersion: row.measurement_version,
      method: row.method,
      baselineRevenueMinor: Number(row.baseline_revenue_minor),
      minSampleSize: row.min_sample_size,
      audienceSize: row.audience_size,
    })),
    underpowered,
  };
}
