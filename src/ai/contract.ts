/**
 * Provider-neutral AI contract.
 *
 * This module is deliberately dependency-free and framework-free so the same
 * types and validators can run in the Next server runtime and in `node --test`.
 * It never imports a provider SDK: adapters live behind `AiProvider`.
 *
 * Hard rule: nothing in an AI response is financially authoritative. The model
 * proposes mechanics and copy; the deterministic Simulator and Margin Shield in
 * `src/domain` recompute every number and decide what may launch.
 */

export const CAMPAIGN_SCHEMA_VERSION = 'campaign-generator.v1';
export const CAMPAIGN_PROMPT_VERSION = 'campaign-generator-prompt.v1';

export type MechanicKind =
  | '2_plus_1'
  | 'happy_hours'
  | 'gift_with_threshold'
  | 'return_coupon'
  | 'bonus_points'
  | 'percentage_discount'
  | 'fixed_discount';

export const MECHANIC_KINDS: readonly MechanicKind[] = [
  '2_plus_1', 'happy_hours', 'gift_with_threshold', 'return_coupon', 'bonus_points', 'percentage_discount', 'fixed_discount',
];

export type OwnerGoal = 'new_customers' | 'reactivate' | 'increase_aov' | 'fill_quiet_hours' | 'repeat_visit';
export const OWNER_GOALS: readonly OwnerGoal[] = ['new_customers', 'reactivate', 'increase_aov', 'fill_quiet_hours', 'repeat_visit'];

export type Locale = 'ru' | 'kk';

/** Copy for one language. RU and KK are authored separately, never machine-translated word for word. */
export interface LocalisedCopy {
  title: string;
  body: string;
  cta: string;
}

export interface ProposedMechanic {
  /** Stable key so the UI can map a proposal onto a domain PromotionMechanic. */
  kind: MechanicKind;
  /** Owner-facing benefit size. Interpreted as bps for percentage kinds, minor units otherwise. */
  benefitValue: number;
  /** Minimum basket for threshold mechanics; 0 when the mechanic has no threshold. */
  thresholdMinor: number;
  durationDays: number;
  channel: string;
  hypothesis: string;
  audienceSummary: string;
  whyFit: string;
  risks: readonly string[];
  requiredAssumptions: readonly string[];
  copy: Readonly<Record<Locale, LocalisedCopy>>;
}

export interface CampaignProposal {
  schemaVersion: string;
  goal: OwnerGoal;
  mechanics: readonly ProposedMechanic[];
  /** Set when the deterministic template produced this proposal instead of a model. */
  notes: readonly string[];
}

/** Everything the generator is allowed to know. Constructed by the redactor; never contains PII. */
export interface CampaignGenerationInput {
  businessType: string;
  brandVoice: string;
  city: string;
  district: string;
  goal: OwnerGoal;
  /** Aggregate only: counts and labels, never customer identities. */
  segment: { code: string; label: string; size: number; consentEligible: number };
  capacity: { quietWindow: string; weekdayOnly: boolean };
  channel: string;
  catalog: readonly { name: string; priceMinor: number; costMinor: number }[];
  averageOrderValueMinor: number;
  marginFloorBps: number;
  budgetMinor: number;
  frequencyCap: number;
  previousCampaign: string;
  currency: string;
  locales: readonly Locale[];
}

export interface AiRequest {
  purpose: 'campaign_generation' | 'content_generation';
  schemaVersion: string;
  promptVersion: string;
  system: string;
  user: string;
  maxOutputTokens: number;
  temperature: number;
}

export interface AiResponse {
  /** Raw provider text. Must still be parsed and validated by the caller. */
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface AiProvider {
  readonly name: string;
  readonly model: string;
  /** Resolves with raw text, or rejects with an AiProviderError. */
  complete(request: AiRequest, signal: AbortSignal): Promise<AiResponse>;
}

export type AiFailureKind =
  | 'not_configured'
  | 'timeout'
  | 'rate_limited'
  | 'server_error'
  | 'client_error'
  | 'malformed_json'
  | 'schema_mismatch'
  | 'unsafe_content'
  | 'quota_exceeded'
  | 'cost_guard';

export class AiProviderError extends Error {
  readonly kind: AiFailureKind;
  readonly retryable: boolean;
  readonly status?: number;
  constructor(kind: AiFailureKind, message: string, options: { retryable?: boolean; status?: number } = {}) {
    super(message);
    this.name = 'AiProviderError';
    this.kind = kind;
    this.status = options.status;
    // Only transport-level problems are worth retrying; a schema mismatch will repeat.
    this.retryable = options.retryable ?? (kind === 'timeout' || kind === 'rate_limited' || kind === 'server_error');
  }
}

// ---------------------------------------------------------------------------
// Strict runtime validation
//
// The model is untrusted input. Every field is checked for type, range and
// length before it can reach the database or the screen.
// ---------------------------------------------------------------------------

const MAX_TEXT = 600;
const MAX_SHORT_TEXT = 160;

function fail(message: string): never {
  throw new AiProviderError('schema_mismatch', message, { retryable: false });
}

function asObject(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${path} must be an object`);
  return value as Record<string, unknown>;
}

function asText(value: unknown, path: string, max = MAX_TEXT): string {
  if (typeof value !== 'string') fail(`${path} must be a string`);
  const trimmed = value.trim();
  if (!trimmed) fail(`${path} must not be empty`);
  if (trimmed.length > max) fail(`${path} must be at most ${max} characters`);
  return trimmed;
}

function asInteger(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${path} must be a number`);
  const rounded = Math.trunc(value);
  if (rounded < min || rounded > max) fail(`${path} must be between ${min} and ${max}`);
  return rounded;
}

function asTextList(value: unknown, path: string, min: number, max: number): readonly string[] {
  if (!Array.isArray(value)) fail(`${path} must be an array`);
  if (value.length < min || value.length > max) fail(`${path} must hold between ${min} and ${max} entries`);
  return Object.freeze(value.map((entry, index) => asText(entry, `${path}[${index}]`, MAX_SHORT_TEXT)));
}

function asCopy(value: unknown, path: string): LocalisedCopy {
  const copy = asObject(value, path);
  return {
    title: asText(copy.title, `${path}.title`, MAX_SHORT_TEXT),
    body: asText(copy.body, `${path}.body`),
    cta: asText(copy.cta, `${path}.cta`, MAX_SHORT_TEXT),
  };
}

function asMechanicKind(value: unknown, path: string): MechanicKind {
  const text = asText(value, path, 40);
  if (!MECHANIC_KINDS.includes(text as MechanicKind)) fail(`${path} must be one of ${MECHANIC_KINDS.join(', ')}`);
  return text as MechanicKind;
}

export function parseCampaignProposal(raw: unknown, expected: { goal: OwnerGoal; locales: readonly Locale[] }): CampaignProposal {
  const body = asObject(raw, 'proposal');
  const schemaVersion = asText(body.schemaVersion, 'proposal.schemaVersion', 60);
  if (schemaVersion !== CAMPAIGN_SCHEMA_VERSION) fail(`proposal.schemaVersion must be ${CAMPAIGN_SCHEMA_VERSION}`);

  const goal = asText(body.goal, 'proposal.goal', 40);
  // The model does not get to change what the owner asked for.
  if (goal !== expected.goal) fail('proposal.goal does not match the requested owner goal');

  if (!Array.isArray(body.mechanics)) fail('proposal.mechanics must be an array');
  if (body.mechanics.length < 2 || body.mechanics.length > 3) fail('proposal.mechanics must hold 2 or 3 entries');

  const seen = new Set<MechanicKind>();
  const mechanics = body.mechanics.map((entry, index) => {
    const path = `proposal.mechanics[${index}]`;
    const item = asObject(entry, path);
    const kind = asMechanicKind(item.kind, `${path}.kind`);
    if (seen.has(kind)) fail(`${path}.kind repeats ${kind}; mechanics must be distinct`);
    seen.add(kind);

    const copySource = asObject(item.copy, `${path}.copy`);
    const copy: Record<Locale, LocalisedCopy> = {} as Record<Locale, LocalisedCopy>;
    for (const locale of expected.locales) {
      copy[locale] = asCopy(copySource[locale], `${path}.copy.${locale}`);
    }
    // RU and KK must be genuinely different strings, not the same text duplicated.
    if (expected.locales.includes('ru') && expected.locales.includes('kk') && copy.ru.body === copy.kk.body) {
      fail(`${path}.copy must provide distinct RU and KK bodies`);
    }

    return Object.freeze({
      kind,
      benefitValue: asInteger(item.benefitValue, `${path}.benefitValue`, 0, 10_000_000),
      thresholdMinor: asInteger(item.thresholdMinor, `${path}.thresholdMinor`, 0, 10_000_000),
      durationDays: asInteger(item.durationDays, `${path}.durationDays`, 1, 90),
      channel: asText(item.channel, `${path}.channel`, 40),
      hypothesis: asText(item.hypothesis, `${path}.hypothesis`),
      audienceSummary: asText(item.audienceSummary, `${path}.audienceSummary`),
      whyFit: asText(item.whyFit, `${path}.whyFit`),
      risks: asTextList(item.risks, `${path}.risks`, 1, 5),
      requiredAssumptions: asTextList(item.requiredAssumptions, `${path}.requiredAssumptions`, 1, 5),
      copy: Object.freeze(copy),
    }) as ProposedMechanic;
  });

  return Object.freeze({
    schemaVersion,
    goal: goal as OwnerGoal,
    mechanics: Object.freeze(mechanics),
    notes: Array.isArray(body.notes) ? asTextList(body.notes, 'proposal.notes', 0, 5) : Object.freeze([]),
  });
}

/**
 * Providers wrap JSON in prose or fences often enough that a bare JSON.parse is
 * the wrong default. Extract the first balanced object, then parse strictly.
 */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const start = candidate.indexOf('{');
  if (start === -1) throw new AiProviderError('malformed_json', 'response contains no JSON object', { retryable: false });

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < candidate.length; index += 1) {
    const char = candidate[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(candidate.slice(start, index + 1));
        } catch (error) {
          throw new AiProviderError('malformed_json', `response is not valid JSON: ${(error as Error).message}`, { retryable: false });
        }
      }
    }
  }
  throw new AiProviderError('malformed_json', 'response contains an unterminated JSON object', { retryable: false });
}
