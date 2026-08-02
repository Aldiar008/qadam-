import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  CONTENT_PROMPT_VERSION,
  CONTENT_SCHEMA_VERSION,
  buildContentPack,
  parseGeneratedPack,
  type ContentAsset,
  type ContentPackInput,
} from '@/ai/content-pack.ts';
import { generateStructured } from '@/ai/generator.ts';
import { buildContentPackPrompt } from '@/ai/prompt.ts';
import { createProvider, readProviderConfig } from '@/ai/providers.ts';
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

  const config = readProviderConfig();
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
  }, {
    provider: config ? createProvider(config) : null,
    timeoutMs: config?.timeoutMs ?? 20_000,
    maxAttempts: config?.maxAttempts ?? 3,
    costCeilingMicros: config?.costCeilingMicros ?? 250_000,
  });

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
