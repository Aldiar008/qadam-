'use server';

import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { requireBusinessContext } from '@/server/qadam/repository';
import type { Json } from '@/types/database.generated';

/**
 * Сохранение шага регистрации.
 *
 * Каждый шаг пишется на сервер сразу: анкету бросают на середине, и потерянные
 * ответы — это не «мелкое неудобство», а причина не вернуться. Оптимистичная
 * версия защищает от двух вкладок, открытых на разных шагах.
 */

const value = (form: FormData, key: string) => String(form.get(key) ?? '').trim();

const list = (form: FormData, key: string) =>
  form.getAll(key).map((item) => String(item).trim()).filter(Boolean);

export async function saveOnboardingStep(form: FormData) {
  const ctx = await requireBusinessContext();
  if (ctx.role !== 'owner') throw new Error('FORBIDDEN');

  const sessionId = value(form, 'sessionId');
  const step = Math.max(1, Math.min(6, Number(value(form, 'step'))));

  const { data: session, error } = await ctx.supabase
    .from('onboarding_sessions')
    .select('id,draft,optimistic_version,status')
    .eq('id', sessionId)
    .eq('business_id', ctx.businessId)
    .eq('user_id', ctx.userId)
    .single();
  if (error || !session || session.status === 'completed') throw error ?? new Error('ONBOARDING_ALREADY_COMPLETED');

  const draft = { ...(session.draft as Record<string, unknown>) };
  const flower = { ...((draft.flower as Record<string, unknown> | undefined) ?? {}) };

  if (step === 1) {
    draft.businessType = value(form, 'businessType') || 'flower_shop';
    draft.businessName = value(form, 'businessName') || ctx.business.name;
  }

  if (step === 2) {
    draft.location = {
      ...((draft.location as object | undefined) ?? {}),
      name: value(form, 'locationName') || 'Основная точка',
      city: value(form, 'city'),
      district: value(form, 'district'),
      address: value(form, 'address'),
    };
    flower.locationCount = Math.max(1, Number(value(form, 'locationCount')) || 1);
  }

  if (step === 3) {
    const categories = list(form, 'categories');
    // Магазин, который не сказал, чем торгует, получит пустую очередь решений и
    // решит, что продукт не работает. Ошибка здесь дешевле молчания потом.
    if (categories.length === 0) {
      redirect('/onboarding?step=3&error=' + encodeURIComponent('Отметьте хотя бы одну категорию — иначе продукту не за чем следить.'));
    }
    flower.categories = categories;
  }

  if (step === 4) flower.holidays = list(form, 'holidays');

  if (step === 5) {
    const free = value(form, 'suppliersFree')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);
    // Отмеченные галочками и вписанные руками — один список без повторов:
    // «Green Line» из подсказки и «Green Line», набранный вручную, это один
    // поставщик, и рейтинг у него должен быть один.
    flower.suppliers = [...new Set([...list(form, 'suppliers'), ...free])];
  }

  if (step === 6) {
    flower.spoilageToleranceBps = Number(value(form, 'spoilageToleranceBps')) || 800;
    draft.importMode = value(form, 'importMode') || 'manual';
    // Экономика больше не спрашивается у цветочного магазина, но нижележащая
    // функция завершения требует эти поля от любого заведения. Ноль здесь —
    // честное «не задано», а не выдуманный порог маржи.
    draft.economics = { ...((draft.economics as object | undefined) ?? {}), marginFloorBps: 0 };
    draft.goals = ['freshness'];
    draft.channels = [];
  }

  draft.flower = flower;

  const nextStep = step === 6 ? 6 : step + 1;
  const { data: saved, error: saveError } = await ctx.supabase
    .from('onboarding_sessions')
    .update({
      draft: draft as Json,
      current_step: nextStep,
      import_mode: step === 6 ? (value(form, 'importMode') || 'manual') : undefined,
      optimistic_version: session.optimistic_version + 1,
    })
    .eq('id', sessionId)
    .eq('optimistic_version', session.optimistic_version)
    .select('id,optimistic_version')
    .single();
  if (saveError || !saved) throw saveError ?? new Error('OPTIMISTIC_CONFLICT');

  if (step === 6) {
    const { error: completeError } = await ctx.supabase.rpc('complete_flower_onboarding', {
      p_session_id: sessionId,
      p_expected_version: saved.optimistic_version,
      p_idempotency_key: `onboarding:${sessionId}:${randomUUID()}`,
    });
    if (completeError) throw completeError;
    // Первый экран после настройки — не «Сегодня», а набор инструментов:
    // владелец только что рассказал о себе и вправе увидеть, что из этого
    // следует, до того как продукт начнёт что-то советовать.
    redirect('/app/tools?onboarding=complete');
  }

  redirect(`/onboarding?step=${nextStep}&saved=1`);
}
