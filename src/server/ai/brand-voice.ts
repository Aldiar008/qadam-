import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The owner's brand voice, as it was actually written down.
 *
 * Onboarding stores `voice_rules` as `{"voice": "…"}`
 * (`20260730075801_prompt3_owner_customer_paths.sql`), while the reader looked
 * for `summary` or `tone` and fell through to a hardcoded default. Every tenant
 * therefore got the same sentence in the prompt, and the field the owner filled
 * in reached nothing. All three shapes are accepted here so old rows keep
 * working, and the default is used only when there is genuinely nothing.
 */
export const DEFAULT_BRAND_VOICE = 'Дружелюбный тон, обращение на «вы», без канцелярита.';

interface VoiceRules {
  voice?: unknown;
  summary?: unknown;
  tone?: unknown;
  positioning?: unknown;
}

export function readVoiceRules(rules: unknown): string {
  const voice = (rules ?? {}) as VoiceRules;
  for (const candidate of [voice.summary, voice.voice, voice.tone]) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return DEFAULT_BRAND_VOICE;
}

export async function loadBrandVoice(db: SupabaseClient, businessId: string, locale = 'ru'): Promise<string> {
  const { data } = await db.from('brand_memory').select('voice_rules').eq('business_id', businessId).eq('locale', locale).maybeSingle();
  return readVoiceRules(data?.voice_rules);
}

/**
 * Phrases this tenant has forbidden.
 *
 * `brand_memory.banned_phrases` has existed since the first migration and had
 * zero readers, so an owner who wrote «никогда не пишите „акция века“» was
 * ignored by every generator. Returned lowercased for a case-insensitive match.
 */
export async function loadBannedPhrases(db: SupabaseClient, businessId: string): Promise<string[]> {
  const { data } = await db.from('brand_memory').select('banned_phrases').eq('business_id', businessId);
  const phrases = new Set<string>();
  for (const row of data ?? []) {
    const raw = row.banned_phrases;
    const list = Array.isArray(raw) ? raw : (raw && typeof raw === 'object' && Array.isArray((raw as { phrases?: unknown }).phrases) ? (raw as { phrases: unknown[] }).phrases : []);
    for (const entry of list) {
      if (typeof entry === 'string' && entry.trim().length > 1) phrases.add(entry.trim().toLowerCase());
    }
  }
  return [...phrases];
}

/** Which banned phrases appear in generated copy. Empty means the copy is clean. */
export function findBannedPhrases(text: string, banned: readonly string[]): string[] {
  const haystack = text.toLowerCase();
  return banned.filter((phrase) => haystack.includes(phrase));
}
