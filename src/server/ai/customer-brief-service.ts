import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { BRIEF_PROMPT_VERSION, BRIEF_SCHEMA_VERSION, parseCustomerBrief, type CustomerBrief, type CustomerBriefInput } from '@/ai/contract.ts';
import { composeDeterministicBrief } from '@/ai/deterministic.ts';
import { generateStructured } from '@/ai/generator.ts';
import { buildCustomerBriefPrompt } from '@/ai/prompt.ts';
import { generatorOptionsFor } from '@/ai/providers.ts';
import { analyseCustomerFromReceipts, insightsForBrief } from '@/server/qadam/customer-analysis';
import { loadBrandVoice } from './brand-voice.ts';
import { recordGenerationRun } from './run-recorder.ts';

/**
 * «Что мне нужно знать об этом госте» — в словах.
 *
 * The owner already had every figure on the customer card and no sentence
 * joining them up. This writes that sentence, and it is deliberately the
 * narrowest possible use of a model: the aggregates are read here, the model
 * only phrases them, and `parseCustomerBrief` rejects any figure that is not
 * one of this guest's own.
 */

export interface CustomerBriefResult {
  brief: CustomerBrief;
  source: 'provider' | 'deterministic_fallback';
  providerLabel: string;
  runId: string | null;
}

export interface CustomerBriefCommand {
  businessId: string;
  customerId: string;
  idempotencyKey?: string;
}

const days = (iso: string | null): number | null =>
  iso ? Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000)) : null;

export async function loadCustomerBriefInput(db: SupabaseClient, businessId: string, customerId: string): Promise<CustomerBriefInput> {
  const [{ data: customer }, { data: transactions }, { data: consents }, { data: accounts }, { data: audiences }, { data: business }, { data: type }] = await Promise.all([
    db.from('customers').select('display_name,lifecycle_stage,first_seen_at,last_seen_at').eq('business_id', businessId).eq('id', customerId).maybeSingle(),
    db.from('transactions').select('id,net_minor,occurred_at').eq('business_id', businessId).eq('customer_id', customerId).order('occurred_at', { ascending: false }).limit(200),
    db.from('customer_consents').select('scope,status,created_at').eq('business_id', businessId).eq('customer_id', customerId).order('created_at', { ascending: false }),
    db.from('loyalty_accounts').select('points_balance,stamps_balance').eq('business_id', businessId).eq('customer_id', customerId).limit(1).maybeSingle(),
    db.from('campaign_audiences').select('campaign_id').eq('business_id', businessId).eq('customer_id', customerId).eq('inclusion_status', 'included'),
    db.from('businesses').select('currency').eq('id', businessId).maybeSingle(),
    db.from('business_types').select('name_ru').limit(1).maybeSingle(),
  ]);
  if (!customer) throw new Error('CUSTOMER_NOT_FOUND');

  const purchases = transactions ?? [];
  const total = purchases.reduce((sum, row) => sum + Number(row.net_minor), 0);
  const stamps = purchases.map((row) => new Date(row.occurred_at).getTime()).filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  const spanMonths = stamps.length > 1 ? (stamps[stamps.length - 1] - stamps[0]) / (30 * 86_400_000) : 0;

  // Latest decision per scope wins: consent rows are append-only.
  const latest = new Map<string, string>();
  for (const row of consents ?? []) if (!latest.has(row.scope)) latest.set(row.scope, row.status);

  const behaviour = insightsForBrief(await analyseCustomerFromReceipts(db, businessId, purchases));

  return {
    businessType: type?.name_ru ?? 'Локальный бизнес',
    brandVoice: await loadBrandVoice(db, businessId),
    displayName: customer.display_name || 'Гость',
    lifecycleStage: customer.lifecycle_stage,
    visits: purchases.length,
    averageCheckMinor: purchases.length ? Math.round(total / purchases.length) : 0,
    totalSpentMinor: total,
    daysSinceLastVisit: days(customer.last_seen_at ?? (stamps.length ? new Date(stamps[stamps.length - 1]).toISOString() : null)),
    daysKnown: days(customer.first_seen_at),
    frequencyPerMonth: spanMonths >= 0.5 ? Math.round((purchases.length / spanMonths) * 10) / 10 : null,
    loyalty: accounts ? { stamps: Number(accounts.stamps_balance ?? 0), points: Number(accounts.points_balance ?? 0) } : null,
    consents: [...latest.entries()].map(([scope, status]) => ({ scope, status })),
    campaignsIncluded: (audiences ?? []).length,
    // Раньше здесь стоял пустой список с комментарием «поштучной истории у нас
    // нет» — и досье поневоле пересказывало шапку карточки. Теперь состав чеков
    // разбирается тем же кодом, что рисует блок «Досье» на экране: одно число в
    // двух местах не должно расходиться.
    favouriteItems: behaviour?.favourites.map((item) => item.name) ?? [],
    behaviour,
    currency: business?.currency ?? 'KZT',
  };
}

export async function generateCustomerBrief(db: SupabaseClient, command: CustomerBriefCommand): Promise<CustomerBriefResult> {
  const input = await loadCustomerBriefInput(db, command.businessId, command.customerId);
  const built = buildCustomerBriefPrompt(input);

  const result = await generateStructured<CustomerBrief>({
    request: built.request,
    redactedPayload: built.redactedPayload,
    injectionFlags: built.injectionFlags,
    redactionHits: built.redactionHits,
    promptVersion: BRIEF_PROMPT_VERSION,
    schemaVersion: BRIEF_SCHEMA_VERSION,
    parse: (raw) => parseCustomerBrief(raw, input),
    safetyTextOf: (brief) => [brief.summary, ...brief.observations, brief.nextStep, ...brief.cautions].join('\n'),
    fallback: () => composeDeterministicBrief(input),
  }, generatorOptionsFor());

  const runId = await recordGenerationRun(db, {
    businessId: command.businessId,
    purpose: 'customer_brief',
    output: result.value,
    source: result.source,
    telemetry: result.telemetry,
    idempotencyKey: command.idempotencyKey,
  });

  return {
    brief: result.value,
    source: result.source,
    providerLabel: result.source === 'provider' ? `${result.telemetry.provider} · ${result.telemetry.model}` : 'Встроенный шаблон QADAM',
    runId,
  };
}
