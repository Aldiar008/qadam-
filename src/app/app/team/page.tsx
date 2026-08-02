import { AlertTriangle, Copy, ShieldCheck } from 'lucide-react';

import { requireBusinessContext } from '@/server/qadam/repository';
import {
  CAPABILITY_LABELS, CRITICAL_CAPABILITIES, ROLE_LABELS, ROLE_MATRIX, TENANT_ROLES,
  can, type Capability, type TenantRole,
} from '@/server/qadam/rbac';
import { changeMemberRole, inviteTeamMember, removeMember, revokeInvitation, transferOwnership } from './actions';

export const dynamic = 'force-dynamic';

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const ctx = await requireBusinessContext();
  const role = ctx.role as TenantRole;
  const canManage = can(role, 'manage_team');

  const [{ data: members }, { data: invitations }] = await Promise.all([
    ctx.supabase.from('business_members')
      .select('id,user_id,role,status,created_at').eq('business_id', ctx.businessId).order('created_at'),
    ctx.supabase.from('team_invitations')
      .select('id,masked_email,role,status,expires_at,created_at').eq('business_id', ctx.businessId)
      .order('created_at', { ascending: false }).limit(20),
  ]);

  const activeOwners = (members ?? []).filter((member) => member.role === 'owner' && member.status === 'active');
  const capabilities = Object.keys(ROLE_MATRIX) as Capability[];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight">Команда и роли</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Ваша роль: <strong>{ROLE_LABELS[role]}</strong>. Права проверяются на сервере и в базе данных —
          скрытая кнопка не является защитой.
        </p>
      </header>

      {params.error && (
        <div role="alert" className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4 text-sm font-semibold text-rose-800">
          <AlertTriangle className="mr-2 inline size-4" aria-hidden="true" />{decodeURIComponent(params.error)}
        </div>
      )}
      {params.invited && params.token && (
        <div role="status" className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
          <p className="font-bold text-emerald-900">
            <Copy className="mr-2 inline size-4" aria-hidden="true" />Приглашение создано
          </p>
          <p className="mt-1">Передайте эту ссылку приглашённому — она показывается один раз, в базе хранится только хэш:</p>
          <code className="mt-2 block break-all rounded-xl bg-surface p-3 font-mono text-xs">
            /app/team/accept?token={params.token}
          </code>
          <p className="mt-2 text-xs text-muted-foreground">Срок действия — 7 дней.</p>
        </div>
      )}
      {(params.updated || params.removed || params.revoked || params.transferred) && (
        <div role="status" className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm font-semibold text-emerald-800">
          {params.updated && 'Роль обновлена.'}
          {params.removed && 'Участник отключён.'}
          {params.revoked && 'Приглашение отозвано.'}
          {params.transferred && 'Владение передано. Вы теперь менеджер.'}
        </div>
      )}

      {/* The table needs 680px and the narrowest supported screen is 320px, so it
          scrolls inside its own box. `overflow-x-auto` alone is not enough: a
          flex or grid child defaults to min-width:auto and grows to fit its
          content instead of shrinking, which pushes the whole page sideways. */}
      <section className="min-w-0 rounded-3xl border border-border bg-surface p-6">
        <h2 className="text-xl font-bold">Участники ({(members ?? []).length})</h2>
        <div className="mt-4 min-w-0 overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <caption className="sr-only">Участники команды и их роли</caption>
            <thead className="bg-surface-muted text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="p-3 font-semibold">Участник</th>
                <th scope="col" className="p-3 font-semibold">Роль</th>
                <th scope="col" className="p-3 font-semibold">Статус</th>
                <th scope="col" className="p-3 font-semibold">Действия</th>
              </tr>
            </thead>
            <tbody>
              {(members ?? []).map((member) => {
                const isSelf = member.user_id === ctx.userId;
                const isLastOwner = member.role === 'owner' && activeOwners.length === 1;
                return (
                  <tr key={member.id} className="border-t border-border">
                    <td className="p-3 font-mono text-xs">
                      {isSelf ? 'вы' : member.user_id.slice(0, 8)}
                      {isLastOwner && <span className="ml-2 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-bold text-amber-900">последний владелец</span>}
                    </td>
                    <td className="p-3 font-semibold">{ROLE_LABELS[member.role as TenantRole] ?? member.role}</td>
                    <td className="p-3 text-xs">{member.status}</td>
                    <td className="p-3">
                      {canManage && member.status === 'active' && (
                        <div className="flex flex-wrap gap-2">
                          <form action={changeMemberRole} className="flex items-center gap-1">
                            <input type="hidden" name="memberId" value={member.id} />
                            <label className="sr-only" htmlFor={`role-${member.id}`}>Роль участника</label>
                            <select id={`role-${member.id}`} name="role" defaultValue={member.role} className="min-h-11 rounded-xl border border-border bg-surface-muted px-2 text-xs">
                              {TENANT_ROLES.filter((option) => option !== 'owner' || role === 'owner')
                                .map((option) => <option key={option} value={option}>{ROLE_LABELS[option]}</option>)}
                            </select>
                            <button className="min-h-11 rounded-xl border border-border px-3 text-xs font-bold">Сменить</button>
                          </form>
                          {!isLastOwner && (
                            <form action={removeMember}>
                              <input type="hidden" name="memberId" value={member.id} />
                              <button className="min-h-11 rounded-xl border border-rose-500/30 px-3 text-xs font-bold text-rose-700">Отключить</button>
                            </form>
                          )}
                          {role === 'owner' && !isSelf && (
                            <form action={transferOwnership}>
                              <input type="hidden" name="toUserId" value={member.user_id} />
                              <button className="min-h-11 rounded-xl border border-border px-3 text-xs font-bold">Передать владение</button>
                            </form>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {activeOwners.length === 1 && (
          <p className="mt-3 flex gap-2 rounded-2xl bg-surface-muted p-3 text-xs">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            В бизнесе один владелец. Понизить или отключить его нельзя, пока владение не передано —
            иначе бизнесом станет некому управлять. Это правило проверяет база данных, а не только интерфейс.
          </p>
        )}
      </section>

      {canManage && (
        <section className="rounded-3xl border border-border bg-surface p-6">
          <h2 className="text-xl font-bold">Пригласить участника</h2>
          <form action={inviteTeamMember} className="mt-4 grid gap-3 sm:grid-cols-[1fr_200px_auto]">
            <label className="grid gap-1 text-sm font-semibold">
              Email
              <input name="email" type="email" required className="min-h-11 rounded-xl border border-border bg-surface-muted px-3 font-normal" />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Роль
              <select name="role" defaultValue="marketer" className="min-h-11 rounded-xl border border-border bg-surface-muted px-3 font-normal">
                {TENANT_ROLES.filter((option) => option !== 'owner' || role === 'owner')
                  .map((option) => <option key={option} value={option}>{ROLE_LABELS[option]}</option>)}
              </select>
            </label>
            <div className="flex items-end">
              <button className="min-h-11 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground">Пригласить</button>
            </div>
          </form>

          {(invitations ?? []).length > 0 && (
            <ul className="mt-5 grid gap-2">
              {(invitations ?? []).map((invitation) => {
                const expired = new Date(invitation.expires_at) <= new Date();
                return (
                  <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3 text-xs">
                    <span className="font-mono">{invitation.masked_email}</span>
                    <span className="font-semibold">{ROLE_LABELS[invitation.role as TenantRole]}</span>
                    <span className="text-muted-foreground">
                      {invitation.status === 'pending' && expired ? 'истекло' : invitation.status}
                      {' · до '}{new Date(invitation.expires_at).toLocaleDateString('ru-RU')}
                    </span>
                    {invitation.status === 'pending' && !expired && (
                      <form action={revokeInvitation}>
                        <input type="hidden" name="id" value={invitation.id} />
                        <button className="min-h-11 rounded-xl border border-border px-3 text-xs font-bold">Отозвать</button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <section className="min-w-0 rounded-3xl border border-border bg-surface p-6">
        <h2 className="text-xl font-bold">Матрица прав</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Критические действия отмечены звёздочкой: каждое из них записывается в журнал.
        </p>
        <div className="mt-4 min-w-0 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <caption className="sr-only">Какие роли какие действия могут выполнять</caption>
            <thead className="bg-surface-muted text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="p-3 font-semibold">Действие</th>
                {TENANT_ROLES.map((option) => (
                  <th key={option} scope="col" className="p-3 text-center font-semibold">{ROLE_LABELS[option]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {capabilities.map((capability) => (
                <tr key={capability} className="border-t border-border">
                  <th scope="row" className="p-3 text-left font-normal">
                    {CAPABILITY_LABELS[capability]}
                    {CRITICAL_CAPABILITIES.includes(capability) && <span className="ml-1 font-bold text-amber-800" title="Критическое действие">*</span>}
                  </th>
                  {TENANT_ROLES.map((option) => (
                    <td key={option} className="p-3 text-center">
                      {can(option, capability)
                        ? <span className="font-bold text-emerald-700" aria-label="разрешено">✓</span>
                        : <span className="text-muted-foreground" aria-label="запрещено">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
