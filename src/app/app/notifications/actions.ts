'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { describeDbError } from '@/server/qadam/errors';
import { requireBusinessContext } from '@/server/qadam/repository';

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
const back = (extra = ''): never => redirect(`/app/notifications${extra}`);

export async function markNotification(form: FormData) {
  const ctx = await requireBusinessContext();
  const id = text(form, 'id');
  const action = text(form, 'op');

  const patch = action === 'unread'
    ? { read_at: null }
    : action === 'dismiss'
      ? { dismissed_at: new Date().toISOString() }
      : { read_at: new Date().toISOString() };

  const { error } = await ctx.supabase.from('notifications')
    .update(patch).eq('id', id).eq('business_id', ctx.businessId);
  if (error) back(`?error=${encodeURIComponent(describeDbError(error))}`);

  revalidatePath('/app/notifications');
  revalidatePath('/app/today');
  back('');
}

export async function markAllRead() {
  const ctx = await requireBusinessContext();
  const { error } = await ctx.supabase.from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('business_id', ctx.businessId).is('read_at', null).is('dismissed_at', null);
  if (error) back(`?error=${encodeURIComponent(describeDbError(error))}`);
  revalidatePath('/app/notifications');
  revalidatePath('/app/today');
  back('?allread=1');
}

/**
 * Mute a category. The database refuses to mute `risk` and `connector_error`:
 * a safety signal the owner cannot see is worse than no signal at all.
 */
export async function setNotificationMute(form: FormData) {
  const ctx = await requireBusinessContext();
  const category = text(form, 'category');
  const muted = text(form, 'muted') === '1';

  const { error } = await ctx.supabase.from('notification_preferences').upsert({
    business_id: ctx.businessId,
    user_id: ctx.userId,
    category,
    muted,
  }, { onConflict: 'business_id,user_id,category' });
  if (error) {
    back(`?error=${encodeURIComponent(
      error.code === '23514'
        ? 'Категории «риск» и «ошибка канала» нельзя отключить — это сигналы безопасности.'
        : describeDbError(error),
    )}`);
  }

  revalidatePath('/app/notifications');
  back('?muted=1');
}
