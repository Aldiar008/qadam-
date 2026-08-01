'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { describeDbError } from '@/server/qadam/errors';
import { canManage, canMarket, requireBusinessContext } from '@/server/qadam/repository';

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
const back = (extra = ''): never => redirect(`/app/analytics${extra}`);

/**
 * TAMYR demo time jump.
 *
 * DEMO_MODE only, and the database enforces that independently of this check.
 * The RPC is idempotent, so pressing the button twice produces no extra events
 * and no extra measurements.
 */
export async function runDemoTimeJump(form: FormData) {
  const ctx = await requireBusinessContext();
  if (!canManage(ctx.role)) back('?error=forbidden');
  if (ctx.business.mode !== 'demo' || process.env.QADAM_APP_MODE !== 'DEMO_MODE') {
    back('?error=' + encodeURIComponent('Демонстрационный скачок во времени доступен только в DEMO_MODE.'));
  }

  const campaignId = text(form, 'campaignId');
  if (!campaignId) back('?error=' + encodeURIComponent('Выберите кампанию.'));

  const { data, error } = await ctx.supabase.rpc('demo_time_jump', {
    p_business_id: ctx.businessId,
    p_campaign_id: campaignId,
    // Keyed on the campaign, so a repeat is recognised as the same jump.
    p_idempotency_key: `demo-time-jump:${campaignId}`,
  });
  if (error) back(`?error=${encodeURIComponent(describeDbError(error))}`);

  const result = (data ?? {}) as { duplicate?: boolean };
  revalidatePath('/app/analytics');
  revalidatePath(`/app/campaigns/${campaignId}`);
  back(result.duplicate ? '?jump=repeat' : '?jump=1');
}

/** Recomputes the ledger for one campaign from raw events and the recorded baseline. */
export async function recomputeImpact(form: FormData) {
  const ctx = await requireBusinessContext();
  if (!canMarket(ctx.role)) back('?error=forbidden');
  const campaignId = text(form, 'campaignId');

  const { data, error } = await ctx.supabase.rpc('recompute_campaign_impact', {
    p_campaign_id: campaignId,
    p_measurement_version: text(form, 'measurementVersion') || `impact.v1:${randomUUID().slice(0, 8)}`,
  });
  if (error) back(`?error=${encodeURIComponent(describeDbError(error))}`);

  const result = (data ?? {}) as { status?: string };
  revalidatePath('/app/analytics');
  back(`?recomputed=${encodeURIComponent(result.status ?? 'done')}`);
}
