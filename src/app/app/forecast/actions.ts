'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { canManage, requireBusinessContext } from '@/server/qadam/repository';
import { describeDbError } from '@/server/qadam/errors';
import { refreshDecisions } from '@/server/qadam/decisions';
import { loadSupplyPositions, persistSupplySnapshots } from '@/server/qadam/supply-core';

/**
 * Одобрение события календаря.
 *
 * Коэффициент праздника — предположение о будущем, а не измерение. Пока
 * владелец его не принял, событие видно в календаре, но прогноз не двигает и
 * заказ не меняет. Это граница между «продукт предлагает» и «я согласился», и
 * она должна быть явной: иначе однажды магазин закупит втрое больше роз, а
 * объяснить, кто так решил, будет некому.
 */

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();

function back(query = ''): never {
  redirect(`/app/forecast${query}`);
}

function fail(message: string): never {
  back('?error=' + encodeURIComponent(message));
}

/**
 * Принимает или отзывает лифт события.
 *
 * После изменения пересобираются прогноз, риски и решения: одобрение праздника
 * меняет количество в заказе, и владелец должен увидеть новую цифру сразу, а не
 * узнать о ней завтра.
 */
export async function toggleEventApproval(form: FormData) {
  const ctx = await requireBusinessContext();
  if (!canManage(ctx.role)) fail('Одобрить событие может владелец или управляющий.');

  const id = text(form, 'id');
  const approve = form.get('approve') === 'on' || text(form, 'approve') === 'true';
  if (!id) fail('Событие не выбрано.');

  const { error } = await ctx.supabase
    .from('demand_events')
    .update({
      approved: approve,
      approved_by: approve ? ctx.userId : null,
      approved_at: approve ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    // Общий календарь платформы правит администратор, а не магазин: свои
    // события у заведения собственные, чужие оно только применяет у себя.
    .eq('business_id', ctx.businessId);

  if (error) fail(describeDbError(error));

  // Сценарий изменился — значит изменились и числа, на которых стоит решение.
  const { positions } = await loadSupplyPositions();
  await persistSupplySnapshots(positions);
  await refreshDecisions();

  revalidatePath('/app/forecast');
  revalidatePath('/app/decisions');
  back(approve ? '?approved=1' : '?revoked=1');
}
