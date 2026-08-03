import { requireBusinessContext } from '@/server/qadam/repository';
import { AdminKeyCountdown } from './AdminKeyCountdown';

/**
 * Ключ, которым владелец входит в приложение с любого телефона.
 *
 * Derived from the current hour, so there is nothing stored to leak and nothing
 * to revoke. It is read here on the server and handed to a small client
 * component that only counts the minutes down.
 */
export async function AdminKeyCard() {
  const ctx = await requireBusinessContext();
  const { data, error } = await ctx.supabase.rpc('my_admin_key');
  if (error || !data) {
    return (
      <p className="mt-4 rounded-2xl bg-surface p-4 text-sm text-muted-foreground">
        Ключ доступен владельцу и управляющему.
      </p>
    );
  }
  const result = data as { key?: string; validUntil?: string };
  return <AdminKeyCountdown value={String(result.key ?? '')} validUntil={String(result.validUntil ?? '')} />;
}
