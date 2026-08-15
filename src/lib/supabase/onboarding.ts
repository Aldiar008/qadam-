import 'server-only';
import type { SupabaseClient, User } from '@supabase/supabase-js';

export async function ensureBusinessForUser(supabase: SupabaseClient, user: User) {
  const { data: existing, error: memberError } = await supabase
    .from('business_members').select('business_id').eq('user_id', user.id).limit(1);
  if (memberError) throw memberError;
  if (existing?.length) return existing[0].business_id as string;

  const meta = user.user_metadata ?? {};
  const businessName = typeof meta.business_name === 'string' ? meta.business_name.trim() : '';
  if (!businessName) return null;
  const typeCode = typeof meta.business_type === 'string' ? meta.business_type : 'cafe';
  const { data: businessType, error: typeError } = await supabase
    .from('business_types').select('id').eq('code', typeCode).eq('status', 'published').maybeSingle();
  if (typeError) throw typeError;

  const isDemo = meta.mode === 'demo' || meta.is_demo === true;
  const mode = isDemo ? 'demo' : (meta.mode === 'production' ? 'production' : 'demo');

  const { data: business, error: businessError } = await supabase.from('businesses').insert({
    created_by: user.id,
    business_type_id: businessType?.id ?? null,
    name: businessName,
    currency: 'KZT',
    timezone: 'Asia/Almaty',
    mode,
    is_mock: mode === 'demo',
  }).select('id').single();
  if (businessError) throw businessError;

  const { error: ownerError } = await supabase.from('business_members').insert({
    business_id: business.id, user_id: user.id, role: 'owner', status: 'active', is_mock: mode === 'demo',
  });
  if (ownerError) throw ownerError;
  return business.id as string;
}
