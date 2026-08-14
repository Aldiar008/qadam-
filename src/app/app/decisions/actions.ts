'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { canManage, canMarket, requireBusinessContext } from '@/server/qadam/repository';
import { describeDbError } from '@/server/qadam/errors';
import { refreshDecisions } from '@/server/qadam/decisions';
import { loadSupplyPositions, persistSupplySnapshots } from '@/server/qadam/supply-core';

/**
 * Действия над решением: подтвердить, изменить, отложить, отклонить.
 *
 * Подтверждение всегда несёт версию, которую видел человек. Пока он читал
 * карточку, остаток мог измениться и решение пересчитаться — тогда база
 * отклоняет подтверждение, а не создаёт заказ на количество, которого владелец
 * не видел.
 */

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();

function back(query = ''): never {
  redirect(`/app/decisions${query}`);
}

function fail(message: string): never {
  back('?error=' + encodeURIComponent(message));
}

/** Пересчитывает риски и пересобирает решения — то, что иначе сделал бы цикл. */
export async function recomputeDecisions() {
  const ctx = await requireBusinessContext();
  if (!canMarket(ctx.role)) throw new Error('FORBIDDEN');

  const { positions } = await loadSupplyPositions();
  await persistSupplySnapshots(positions);
  const { created, updated } = await refreshDecisions();

  revalidatePath('/app/decisions');
  revalidatePath('/app/orders');
  back(`?recomputed=${created + updated}`);
}

/**
 * Подтверждает решение и создаёт черновики заказов.
 *
 * Заказы именно черновики: подтверждение решения не отправляет ничего
 * поставщику. Отправка — отдельное действие, потому что это уже деньги и
 * обязательство, и владелец должен нажать её осознанно.
 */
export async function approveDecision(form: FormData) {
  const ctx = await requireBusinessContext();
  if (!canManage(ctx.role)) fail('Подтвердить закупку может владелец или управляющий.');

  const id = text(form, 'id');
  const version = Number(text(form, 'version'));
  if (!id || !Number.isFinite(version)) fail('Решение не выбрано.');

  const reason = text(form, 'overrideReason');
  const isOverride = form.get('mode') === 'override';
  if (isOverride && reason.length < 3) fail('Изменение решения требует причины.');

  const { error } = await ctx.supabase.rpc('approve_decision', {
    p_decision_id: id,
    p_expected_version: version,
    p_override_reason: isOverride ? reason : (null as unknown as string),
  });

  if (error) {
    const message = error.message.includes('changed while you were reading')
      ? 'Данные изменились, пока вы читали карточку. Решение пересчитано — посмотрите новое количество.'
      : error.message.includes('already')
        ? 'Это решение уже обработано.'
        : describeDbError(error);
    fail(message);
  }

  revalidatePath('/app/decisions');
  revalidatePath('/app/orders');
  back('?approved=1');
}

/** Откладывает решение: риск никуда не делся, но сегодня заниматься им не будут. */
export async function snoozeDecision(form: FormData) {
  const ctx = await requireBusinessContext();
  if (!canMarket(ctx.role)) throw new Error('FORBIDDEN');

  const id = text(form, 'id');
  if (!id) fail('Решение не выбрано.');

  const hours = Number(text(form, 'hours')) || 24;
  const until = new Date(Date.now() + hours * 3_600_000).toISOString();

  const { error } = await ctx.supabase
    .from('decision_contracts')
    .update({ status: 'snoozed', snoozed_until: until, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('business_id', ctx.businessId)
    .eq('status', 'open');

  if (error) fail(describeDbError(error));
  revalidatePath('/app/decisions');
  back('?snoozed=1');
}

/** Отклоняет решение. Причина обязательна: иначе непонятно, чему учиться. */
export async function rejectDecision(form: FormData) {
  const ctx = await requireBusinessContext();
  if (!canManage(ctx.role)) fail('Отклонить решение может владелец или управляющий.');

  const id = text(form, 'id');
  const reason = text(form, 'reason');
  if (!id) fail('Решение не выбрано.');
  if (reason.length < 3) fail('Укажите, почему решение не подходит.');

  const { error } = await ctx.supabase
    .from('decision_contracts')
    .update({
      status: 'rejected',
      override_reason: reason,
      decided_by: ctx.userId,
      decided_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('business_id', ctx.businessId)
    .eq('status', 'open');

  if (error) fail(describeDbError(error));
  revalidatePath('/app/decisions');
  back('?rejected=1');
}
