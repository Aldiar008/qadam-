import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { deriveGosInputs, type GosInputs } from '@/domain/gos.ts';

/**
 * Gathers the tenant facts the Growth Opportunity Score is derived from.
 *
 * Before this, every contract in the product carried the identical nine
 * constants, so two businesses with opposite data scored the same. These reads
 * are cheap counts against RLS-protected tables; the arithmetic stays in the
 * domain, where it is a pure function and testable.
 */
export interface GosContext {
  signalId?: string | null;
  segmentSize: number;
  consentEligible: number;
  contributionMargin: number;
  budgetMinor: number;
  expectedCostMinor: number;
}

export async function loadGosInputs(db: SupabaseClient, businessId: string, context: GosContext): Promise<GosInputs> {
  const [{ data: signal }, { count: total }, { count: inactive }, { count: consenting }, { count: withPurchase }, { count: loyal }] = await Promise.all([
    context.signalId
      ? db.from('signals').select('change_bps,confidence').eq('business_id', businessId).eq('id', context.signalId).maybeSingle()
      : Promise.resolve({ data: null }),
    db.from('customers').select('id', { count: 'exact', head: true }).eq('business_id', businessId).neq('lifecycle_stage', 'anonymized'),
    db.from('customers').select('id', { count: 'exact', head: true }).eq('business_id', businessId).eq('lifecycle_stage', 'inactive'),
    db.from('customer_consents').select('customer_id', { count: 'exact', head: true }).eq('business_id', businessId).eq('status', 'granted').like('scope', 'marketing%'),
    db.from('transactions').select('customer_id', { count: 'exact', head: true }).eq('business_id', businessId),
    db.from('loyalty_accounts').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
  ]);

  const base = total ?? 0;
  return deriveGosInputs({
    signalChangeBps: signal?.change_bps ?? null,
    signalConfidence: signal?.confidence ?? null,
    segmentSize: context.segmentSize,
    consentEligible: context.consentEligible,
    contributionMargin: context.contributionMargin,
    inactiveShare: base ? (inactive ?? 0) / base : 0,
    consentShare: base ? Math.min(base, consenting ?? 0) / base : 0,
    // A base with no purchase history behind it cannot support a confident
    // recommendation, and the score should say so rather than assume.
    dataQuality: base ? Math.min(1, (withPurchase ?? 0) / base) : 0,
    budgetMinor: context.budgetMinor,
    expectedCostMinor: context.expectedCostMinor,
    loyaltyShare: base ? Math.min(base, loyal ?? 0) / base : 0,
  });
}
