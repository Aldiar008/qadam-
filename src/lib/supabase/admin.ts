import 'server-only';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.generated';

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) throw new Error('Server-only Supabase credentials are not configured.');
  return createSupabaseClient<Database>(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
}
