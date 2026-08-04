'use server';

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { describeDbError } from '@/server/qadam/errors';
import { requireBusinessContext } from '@/server/qadam/repository';
import { can, isAssignableRole, type TenantRole } from '@/server/qadam/rbac';
import type { Json } from '@/types/database.generated';

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
function back(extra = ''): never {
  redirect(`/app/team${extra}`);
}

const INVITE_TTL_DAYS = 7;

export async function inviteTeamMember(form: FormData) {
  const ctx = await requireBusinessContext();
  if (!can(ctx.role as TenantRole, 'manage_team')) back('?error=' + encodeURIComponent('Управление командой доступно владельцу и менеджеру.'));

  const email = text(form, 'email');
  const role = text(form, 'role') as TenantRole;
  if (!email.includes('@')) back('?error=' + encodeURIComponent('Укажите корректный email.'));
  // A removed role must be refused by the server too: hiding it from the select
  // is a convenience, not a rule.
  if (!isAssignableRole(role)) back('?error=' + encodeURIComponent('Такая роль больше не выдаётся. Выберите менеджера, аналитика или наблюдателя.'));

  // The token is shown once and only its hash is stored, exactly like the QR path.
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000).toISOString();

  const { error } = await ctx.supabase.rpc('invite_team_member', {
    p_business_id: ctx.businessId,
    p_email: email,
    p_role: role,
    p_token: token,
    p_expires_at: expiresAt,
  });
  if (error) back(`?error=${encodeURIComponent(describeDbError(error))}`);

  revalidatePath('/app/team');
  back(`?invited=1&token=${encodeURIComponent(token)}`);
}

export async function revokeInvitation(form: FormData) {
  const ctx = await requireBusinessContext();
  if (!can(ctx.role as TenantRole, 'manage_team')) back('?error=forbidden');

  const { error } = await ctx.supabase.from('team_invitations')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('id', text(form, 'id')).eq('business_id', ctx.businessId).eq('status', 'pending');
  if (error) back(`?error=${encodeURIComponent(describeDbError(error))}`);

  await ctx.supabase.from('activity_logs').insert({
    business_id: ctx.businessId, actor_id: ctx.userId, action: 'team.invitation_revoked',
    resource_type: 'team_invitation', resource_id: text(form, 'id'),
    metadata: {} as unknown as Json, is_mock: ctx.business.mode === 'demo',
  });

  revalidatePath('/app/team');
  back('?revoked=1');
}

export async function changeMemberRole(form: FormData) {
  const ctx = await requireBusinessContext();
  if (!can(ctx.role as TenantRole, 'manage_team')) back('?error=forbidden');

  const memberId = text(form, 'memberId');
  const role = text(form, 'role') as TenantRole;
  if (!isAssignableRole(role)) back('?error=' + encodeURIComponent('Такая роль больше не выдаётся. Выберите менеджера, аналитика или наблюдателя.'));
  // Only an owner can create another owner.
  if (role === 'owner' && ctx.role !== 'owner') {
    back('?error=' + encodeURIComponent('Назначить владельца может только текущий владелец.'));
  }

  const { error } = await ctx.supabase.from('business_members')
    .update({ role }).eq('id', memberId).eq('business_id', ctx.businessId);
  if (error) {
    // The database guards the last owner; surface that in plain language.
    back(`?error=${encodeURIComponent(
      error.message.includes('last owner')
        ? 'Нельзя понизить последнего владельца. Сначала передайте владение другому участнику.'
        : describeDbError(error))}`);
  }

  await ctx.supabase.from('activity_logs').insert({
    business_id: ctx.businessId, actor_id: ctx.userId, action: 'team.role_changed',
    resource_type: 'business_member', resource_id: memberId,
    metadata: { role } as unknown as Json, is_mock: ctx.business.mode === 'demo',
  });

  revalidatePath('/app/team');
  back('?updated=1');
}

export async function removeMember(form: FormData) {
  const ctx = await requireBusinessContext();
  if (!can(ctx.role as TenantRole, 'manage_team')) back('?error=forbidden');

  const { error } = await ctx.supabase.from('business_members')
    .update({ status: 'revoked' }).eq('id', text(form, 'memberId')).eq('business_id', ctx.businessId);
  if (error) {
    back(`?error=${encodeURIComponent(
      error.message.includes('last owner')
        ? 'Нельзя удалить последнего владельца. Сначала передайте владение.'
        : describeDbError(error))}`);
  }

  revalidatePath('/app/team');
  back('?removed=1');
}

export async function transferOwnership(form: FormData) {
  const ctx = await requireBusinessContext();
  if (ctx.role !== 'owner') back('?error=' + encodeURIComponent('Передать владение может только владелец.'));

  const { error } = await ctx.supabase.rpc('transfer_ownership', {
    p_business_id: ctx.businessId,
    p_to_user: text(form, 'toUserId'),
  });
  if (error) back(`?error=${encodeURIComponent(describeDbError(error))}`);

  revalidatePath('/app/team');
  back('?transferred=1');
}

/** Accepting is deliberately open to any signed-in user holding a valid token. */
export async function acceptInvitation(form: FormData) {
  const supabaseCtx = await requireBusinessContext().catch(() => null);
  const token = text(form, 'token');
  if (!token) back('?error=' + encodeURIComponent('Ссылка приглашения неполная.'));

  // A user with no membership yet cannot use requireBusinessContext, so fall
  // back to a plain authenticated client for that case.
  const { createClient } = await import('@/lib/supabase/server');
  const db = supabaseCtx?.supabase ?? (await createClient());

  const { data, error } = await db.rpc('accept_team_invitation', { p_token: token });
  if (error) {
    redirect(`/app/team?error=${encodeURIComponent(
      error.message.includes('expired') ? 'Срок действия приглашения истёк — попросите отправить новое.'
        : error.message.includes('revoked') ? 'Это приглашение было отозвано.'
          : describeDbError(error))}`);
  }

  const result = (data ?? {}) as { business_id?: string };
  revalidatePath('/app/team');
  redirect(result.business_id ? '/app/today?joined=1' : '/app/team?joined=1');
}
