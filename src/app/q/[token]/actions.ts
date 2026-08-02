'use server';

import { createHash } from 'node:crypto';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';

const value = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
const base = (token: string) => `/q/${encodeURIComponent(token)}`;
const tokenHash = (token: string) => '\\x' + createHash('sha256').update(token).digest('hex');
async function requestKey() { const h = await headers(); return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'local-demo'; }
async function verificationKind(admin: ReturnType<typeof createAdminClient>, token: string) {
  const { data } = await admin
    .from('qr_codes')
    .select('businesses!inner(mode)')
    .eq('token_hash', tokenHash(token))
    .eq('purpose', 'loyalty_join')
    .maybeSingle();
  const business = data?.businesses as { mode?: string } | { mode?: string }[] | null | undefined;
  const mode = Array.isArray(business) ? business[0]?.mode : business?.mode;
  if (mode === 'demo') return 'simulated';
  if (process.env.QADAM_IDENTITY_PROVIDER === 'connected') return 'provider_verified';
  return null;
}

export async function joinLoyalty(form: FormData) {
  const token=value(form,'token'); const admin=createAdminClient(); const verification=await verificationKind(admin, token);
  if (!verification) redirect(`${base(token)}?error=verification_not_connected`);
  const { data,error }=await admin.rpc('process_loyalty_join',{p_token:token,p_identity_type:value(form,'identityType'),p_identity_value:value(form,'identity'),p_display_name:value(form,'displayName'),p_loyalty_consent:form.get('loyaltyConsent')==='on',p_marketing_consent:form.get('marketingConsent')==='on',p_verification_kind:verification,p_idempotency_key:value(form,'idempotencyKey'),p_ip_key:await requestKey()});
  if(error) redirect(`${base(token)}?error=${encodeURIComponent(error.message)}`);
  const result=data as Record<string,unknown>;
  redirect(`${base(token)}?joined=1&points=${result.points_balance ?? 0}&stamps=${result.stamps_balance ?? 0}&duplicate=${result.duplicate ? 1 : 0}`);
}

export async function redeemReward(form: FormData) {
  const token=value(form,'token'); const admin=createAdminClient();
  if(!await verificationKind(admin, token)) redirect(`${base(token)}?error=verification_not_connected`);
  const { data,error }=await admin.rpc('process_loyalty_redeem',{p_token:token,p_identity_type:value(form,'identityType'),p_identity_value:value(form,'identity'),p_reward_id:value(form,'rewardId'),p_idempotency_key:value(form,'idempotencyKey'),p_ip_key:await requestKey()});
  if(error) redirect(`${base(token)}?error=${encodeURIComponent(error.message)}`);
  const result=data as Record<string,unknown>;
  redirect(`${base(token)}?redeemed=1&points=${result.points_balance ?? 0}&stamps=${result.stamps_balance ?? 0}&duplicate=${result.duplicate ? 1 : 0}`);
}

export async function customerPrivacyRequest(form: FormData) {
  const token=value(form,'token'); const admin=createAdminClient();
  if(!await verificationKind(admin, token)) redirect(`${base(token)}?error=verification_not_connected`);
  const { data,error }=await admin.rpc('process_customer_privacy_request',{p_token:token,p_identity_type:value(form,'identityType'),p_identity_value:value(form,'identity'),p_request_type:value(form,'requestType'),p_idempotency_key:value(form,'idempotencyKey'),p_ip_key:await requestKey()});
  if(error) redirect(`${base(token)}?error=${encodeURIComponent(error.message)}`);
  const result=data as Record<string,unknown>;
  redirect(`${base(token)}?privacy=${encodeURIComponent(String(result.request_type))}&done=1`);
}
