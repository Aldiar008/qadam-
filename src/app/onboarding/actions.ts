'use server';

import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { requireBusinessContext } from '@/server/qadam/repository';
import type { Json } from '@/types/database.generated';

const value = (form: FormData, key: string) => String(form.get(key) ?? '').trim();

export async function saveOnboardingStep(form: FormData) {
  const ctx = await requireBusinessContext();
  if (ctx.role !== 'owner') throw new Error('FORBIDDEN');
  const sessionId = value(form, 'sessionId');
  const step = Math.max(1, Math.min(6, Number(value(form, 'step'))));
  const { data: session, error } = await ctx.supabase.from('onboarding_sessions').select('id,draft,optimistic_version,status')
    .eq('id', sessionId).eq('business_id', ctx.businessId).eq('user_id', ctx.userId).single();
  if (error || !session || session.status === 'completed') throw error ?? new Error('ONBOARDING_ALREADY_COMPLETED');
  const draft = { ...(session.draft as Record<string, unknown>) };
  if (step === 1) { draft.businessType = value(form, 'businessType'); draft.businessName = value(form, 'businessName') || ctx.business.name; }
  if (step === 2) { draft.businessSize = value(form, 'businessSize'); draft.location = { ...((draft.location as object | undefined) ?? {}), capacity: Number(value(form, 'capacity')) }; }
  if (step === 3) draft.location = { ...((draft.location as object | undefined) ?? {}), name: value(form, 'locationName') || 'Основная точка', city: value(form, 'city'), district: value(form, 'district'), address: value(form, 'address') };
  if (step === 4) draft.goals = [value(form, 'goal')];
  if (step === 5) draft.economics = { averageCheckMinor: Number(value(form, 'averageCheckMinor')), marginFloorBps: Math.round(Number(value(form, 'marginFloorPercent')) * 100), budgetMinor: Number(value(form, 'budgetMinor')) };
  if (step === 6) { draft.channels = form.getAll('channels').map(String); draft.brandVoice = value(form, 'brandVoice'); draft.dataSources = form.getAll('dataSources').map(String); draft.importMode = value(form, 'importMode'); }
  const nextStep = step === 6 ? 6 : step + 1;
  const { data: saved, error: saveError } = await ctx.supabase.from('onboarding_sessions').update({ draft: draft as Json, current_step: nextStep, import_mode: step === 6 ? value(form, 'importMode') : undefined, optimistic_version: session.optimistic_version + 1 })
    .eq('id', sessionId).eq('optimistic_version', session.optimistic_version).select('id,optimistic_version').single();
  if (saveError || !saved) throw saveError ?? new Error('OPTIMISTIC_CONFLICT');
  if (step === 6) {
    const { error: completeError } = await ctx.supabase.rpc('complete_onboarding', { p_session_id: sessionId, p_expected_version: saved.optimistic_version, p_idempotency_key: `onboarding:${sessionId}:${randomUUID()}` });
    if (completeError) throw completeError;
    redirect('/app/today?onboarding=complete');
  }
  redirect(`/onboarding?step=${nextStep}&saved=1`);
}
