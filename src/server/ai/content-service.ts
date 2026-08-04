import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  CONTENT_PROMPT_VERSION,
  CONTENT_SCHEMA_VERSION,
  SOCIAL_PROMPT_VERSION,
  SOCIAL_SCHEMA_VERSION,
  buildContentPack,
  parseGeneratedPack,
  parseSocialPack,
  type ContentAsset,
  type ContentPackInput,
  type SocialAsset,
  type SocialPackInput,
} from '@/ai/content-pack.ts';
import { composeDeterministicSocialPack } from '@/ai/deterministic.ts';
import { generateStructured } from '@/ai/generator.ts';
import { buildContentPackPrompt, buildSocialPackPrompt } from '@/ai/prompt.ts';
import { quietWindowFromMetricKey } from './campaign-ai-service.ts';
import { generatorOptionsFor } from '@/ai/providers.ts';
import { findBannedPhrases, loadBannedPhrases, loadBrandVoice } from './brand-voice.ts';
import { recordGenerationRun } from './run-recorder.ts';

/**
 * Кнопка «Сгенерировать» в контент-студии — теперь действительно генерация.
 *
 * It called `buildContentPack`, a string template, while the panel underneath it
 * displayed «Журнал генераций» reading `ai_generation_runs` — a table this path
 * never wrote to. So the owner could press it all day and the journal would
 * keep saying nothing had happened, which was true and looked like a bug.
 *
 * The model writes the words. It does not choose the offer, the duration or the
 * tracking code: those come from the approved contract and are handed to it as
 * data. Anything malformed, incomplete or lazily bilingual falls back to the
 * template, and which one produced each asset is recorded on the row.
 */

export interface ContentGenerationResult {
  assets: readonly ContentAsset[];
  source: 'provider' | 'deterministic_fallback';
  providerLabel: string;
  fallbackReason: string | null;
  runId: string | null;
  bannedHits: readonly string[];
}

export interface ContentGenerationCommand {
  businessId: string;
  businessType: string;
  campaignId: string;
  pack: ContentPackInput;
  idempotencyKey?: string;
}

export async function generateContentPack(db: SupabaseClient, command: ContentGenerationCommand): Promise<ContentGenerationResult> {
  const [brandVoice, banned, { data: catalog }] = await Promise.all([
    loadBrandVoice(db, command.businessId),
    loadBannedPhrases(db, command.businessId),
    db.from('catalog_items').select('name_ru').eq('business_id', command.businessId).eq('is_active', true).order('price_minor').limit(12),
  ]);

  const built = buildContentPackPrompt({
    businessName: command.pack.businessName,
    businessType: command.businessType,
    brandVoice,
    bannedPhrases: banned,
    offerRu: command.pack.offerRu,
    offerKk: command.pack.offerKk,
    briefRu: command.pack.briefRu,
    briefKk: command.pack.briefKk,
    channel: command.pack.channel,
    trackingCode: command.pack.trackingCode,
    quietWindow: command.pack.quietWindow,
    durationDays: command.pack.durationDays,
    catalog: (catalog ?? []).map((item) => item.name_ru),
  });
  const result = await generateStructured<ContentAsset[]>({
    request: built.request,
    redactedPayload: built.redactedPayload,
    injectionFlags: built.injectionFlags,
    redactionHits: built.redactionHits,
    promptVersion: CONTENT_PROMPT_VERSION,
    schemaVersion: CONTENT_SCHEMA_VERSION,
    parse: (raw) => parseGeneratedPack(raw, command.pack),
    safetyTextOf: (assets) => assets.map((asset) => `${asset.body}\n${asset.cta}`).join('\n'),
    fallback: () => buildContentPack(command.pack),
  }, generatorOptionsFor());

  // A phrase the owner banned is a rule about their own brand, and until now the
  // column holding it had no readers at all. Generated copy that breaks it goes
  // back to the template rather than to the owner.
  const combined = result.value.map((asset) => `${asset.body} ${asset.cta}`).join('\n');
  const bannedHits = findBannedPhrases(combined, banned);
  const assets = bannedHits.length ? buildContentPack(command.pack) : result.value;
  const source = bannedHits.length ? 'deterministic_fallback' : result.source;

  const runId = await recordGenerationRun(db, {
    businessId: command.businessId,
    purpose: 'content_generation',
    output: { assets: assets.length, kinds: assets.map((asset) => `${asset.locale}:${asset.kind}#${asset.ordinal}`) },
    source,
    telemetry: result.telemetry,
    idempotencyKey: command.idempotencyKey,
  });

  return {
    assets,
    source,
    providerLabel: source === 'provider' ? `${result.telemetry.provider} · ${result.telemetry.model}` : 'Встроенный шаблон QADAM',
    fallbackReason: bannedHits.length
      ? `Сгенерированный текст содержит запрещённые вами фразы: ${bannedHits.join(', ')}.`
      : result.telemetry.fallbackReason,
    runId,
    bannedHits,
  };
}

/**
 * Материалы, которые владелец не станет писать сам.
 *
 * «Автоматизация» in this product planned campaigns and produced nothing a
 * person could put on Instagram on Monday. This makes the Reels script, the
 * TikTok beats, the photo brief, the story series and the notification text —
 * from the venue's own menu, offer and loyalty reward.
 */
export interface SocialPackResult {
  assets: readonly SocialAsset[];
  source: 'provider' | 'deterministic_fallback';
  providerLabel: string;
  runId: string | null;
}

export async function generateSocialPack(
  db: SupabaseClient,
  command: { businessId: string; businessType: string; idempotencyKey?: string },
): Promise<SocialPackResult> {
  const [brandVoice, banned, { data: business }, { data: location }, { data: menu }, { data: reward }, { data: signal }, { data: contract }] = await Promise.all([
    loadBrandVoice(db, command.businessId),
    loadBannedPhrases(db, command.businessId),
    db.from('businesses').select('name').eq('id', command.businessId).maybeSingle(),
    db.from('business_locations').select('city').eq('business_id', command.businessId).eq('is_active', true).order('created_at').limit(1).maybeSingle(),
    db.from('catalog_items').select('name_ru,price_minor').eq('business_id', command.businessId).eq('is_active', true).order('price_minor').limit(12),
    db.from('rewards').select('name_ru,cost_stamps').eq('business_id', command.businessId).eq('status', 'active').order('cost_stamps').limit(1).maybeSingle(),
    db.from('signals').select('metric_key').eq('business_id', command.businessId).eq('status', 'open').order('growth_opportunity_score', { ascending: false }).limit(1).maybeSingle(),
    db.from('growth_contracts').select('accepted_snapshot').eq('business_id', command.businessId).eq('status', 'approved').order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);

  // The offer is the one the venue is actually running. Without an approved
  // contract it falls back to the loyalty programme, which is always true.
  const snapshot = (contract?.accepted_snapshot ?? {}) as { offer?: string };
  const rewardLine = reward ? `${reward.name_ru} за ${reward.cost_stamps ?? 0} штампов` : null;
  const offer = snapshot.offer && snapshot.offer !== 'alternative_2' && snapshot.offer !== 'alternative_3'
    ? String(snapshot.offer).replace(/_/g, ' ')
    : rewardLine ?? 'программа лояльности: штампы за каждый визит';

  const input: SocialPackInput = {
    businessName: business?.name ?? 'Заведение',
    businessType: command.businessType,
    city: location?.city ?? '',
    brandVoice,
    offer,
    menu: (menu ?? []).map((item) => ({ name: item.name_ru, priceMinor: Number(item.price_minor) })),
    reward: rewardLine,
    quietWindow: quietWindowFromMetricKey(signal?.metric_key),
    locales: ['ru', 'kk'],
  };

  const built = buildSocialPackPrompt(input);
  const result = await generateStructured<SocialAsset[]>({
    request: built.request,
    redactedPayload: built.redactedPayload,
    injectionFlags: built.injectionFlags,
    redactionHits: built.redactionHits,
    promptVersion: SOCIAL_PROMPT_VERSION,
    schemaVersion: SOCIAL_SCHEMA_VERSION,
    parse: (raw) => parseSocialPack(raw, input),
    safetyTextOf: (assets) => assets.map((asset) => `${asset.title}\n${asset.body}\n${asset.cta}`).join('\n'),
    fallback: () => composeDeterministicSocialPack(input),
  }, generatorOptionsFor());

  const combined = result.value.map((asset) => `${asset.title} ${asset.body} ${asset.cta}`).join('\n');
  const bannedHits = findBannedPhrases(combined, banned);
  const assets = bannedHits.length ? composeDeterministicSocialPack(input) : result.value;
  const source = bannedHits.length ? 'deterministic_fallback' : result.source;

  const runId = await recordGenerationRun(db, {
    businessId: command.businessId,
    purpose: 'automation_content',
    output: { assets: assets.length, kinds: assets.map((asset) => `${asset.locale}:${asset.kind}`) },
    source,
    telemetry: result.telemetry,
    idempotencyKey: command.idempotencyKey,
  });

  return {
    assets,
    source,
    providerLabel: source === 'provider' ? `${result.telemetry.provider} · ${result.telemetry.model}` : 'Встроенный шаблон QADAM',
    runId,
  };
}
