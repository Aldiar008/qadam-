'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { ALWAYS_NEEDS_A_PERSON, isInquiryCategory } from '@/domain/inquiry-triage';
import { createAdminClient } from '@/lib/supabase/admin';
import { describeDbError } from '@/server/qadam/errors';
import { canManage, requireBusinessContext } from '@/server/qadam/repository';

/**
 * Что владелец делает с обращением.
 *
 * Ответ отправляется через `answer_inquiry`: одна запись создаёт исходящее
 * сообщение и закрывает обращение. Раздельно они расходятся — гость получает
 * ответ, а обращение остаётся «ждёт владельца».
 */

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
// Объявление, а не стрелка в `const`: сужение типов после «этот путь никогда не
// возвращается» TypeScript делает только для объявленных функций.
function back(query = ''): never {
  redirect(`/app/inbox${query}`);
}

export async function answerInquiryAsOwner(form: FormData) {
  const ctx = await requireBusinessContext();
  if (!canManage(ctx.role)) back('?error=' + encodeURIComponent('Отвечать гостям может владелец или менеджер.'));

  const inquiryId = text(form, 'inquiryId');
  const body = text(form, 'body').slice(0, 1500);
  if (body.length < 2) back('?error=' + encodeURIComponent('Пустой ответ отправлять некуда.'));

  // Обращение обязано принадлежать этому заведению: идентификатор пришёл из
  // формы, а форму можно подделать.
  const { data: inquiry } = await ctx.supabase.from('customer_interactions')
    .select('id').eq('id', inquiryId).eq('business_id', ctx.businessId).eq('direction', 'inbound').maybeSingle();
  if (!inquiry) back('?error=' + encodeURIComponent('Обращение не найдено в вашем заведении.'));

  // `answer_inquiry` — security definer и выдана только service_role: она
  // пишет от имени заведения в переписку гостя, минуя его собственные права.
  const db = createAdminClient();
  const { error } = await db.rpc('answer_inquiry', {
    p_inquiry_id: inquiryId,
    p_body: body,
    p_answered_by: 'owner',
  });
  if (error) back(`?error=${encodeURIComponent(describeDbError(error))}`);

  revalidatePath('/app/inbox');
  revalidatePath('/tg/chat');
  back('?answered=1');
}

export async function setInquiryPolicy(form: FormData) {
  const ctx = await requireBusinessContext();
  if (!canManage(ctx.role)) back('?error=' + encodeURIComponent('Менять правила ответов может владелец или менеджер.'));

  // Проверки по одной, а не одним условием: так тип сужается, и «тема» ниже —
  // действительно тема, а не любая строка из формы.
  const category = text(form, 'category');
  if (!isInquiryCategory(category)) back('?error=' + encodeURIComponent('Неизвестная тема обращения.'));
  const mode = text(form, 'mode');
  if (mode !== 'auto' && mode !== 'approve') back('?error=' + encodeURIComponent('Неизвестный режим ответа.'));
  // Та же проверка стоит ограничением таблицы. Здесь она — чтобы объяснить
  // человеку, а не показать ему ошибку базы.
  if (mode === 'auto' && ALWAYS_NEEDS_A_PERSON.includes(category)) {
    back('?error=' + encodeURIComponent('Жалобы и денежные вопросы отвечает человек. Эту тему нельзя перевести на автомат.'));
  }

  const { error } = await ctx.supabase.from('inquiry_policies')
    .upsert({
      business_id: ctx.businessId,
      category,
      mode,
      is_mock: ctx.business.mode === 'demo',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'business_id,category' });
  if (error) back(`?error=${encodeURIComponent(describeDbError(error))}`);

  revalidatePath('/app/inbox');
  back('?policy=1#inquiry-policies');
}
