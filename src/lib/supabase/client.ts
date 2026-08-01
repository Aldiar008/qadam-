import { createBrowserClient } from '@supabase/ssr';
import { getPublicSupabaseEnv } from './env';
import type { Database } from '@/types/database.generated';

export function createClient() {
  const { url, publishableKey } = getPublicSupabaseEnv();
  return createBrowserClient<Database>(url, publishableKey);
}
