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

export const BRIEF_SCHEMA_VERSION = 'customer-brief.v1';
export const BRIEF_PROMPT_VERSION = 'customer-brief-prompt.v1';

export const REPLY_SCHEMA_VERSION = 'guest-reply.v1';
export const REPLY_PROMPT_VERSION = 'guest-reply-prompt.v1';

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

/**
 * What the owner should know about one guest, in words.
 *
 * The model reads aggregates that are already on the screen and says what they
 * add up to. It is not allowed to introduce a number of its own: every figure
 * the owner acts on comes from the tables, and the brief is checked for that
 * before it is stored.
 */
export interface CustomerBrief {
  schemaVersion: string;
  summary: string;
  observations: readonly string[];
  nextStep: string;
  cautions: readonly string[];
}

/** Aggregates about one guest. Contains no contact detail — there is no column for one. */
export interface CustomerBriefInput {
  businessType: string;
  brandVoice: string;
  displayName: string;
  lifecycleStage: string;
  visits: number;
  averageCheckMinor: number;
  totalSpentMinor: number;
  daysSinceLastVisit: number | null;
  daysKnown: number | null;
  frequencyPerMonth: number | null;
  loyalty: { stamps: number; points: number } | null;
  consents: readonly { scope: string; status: string }[];
  campaignsIncluded: number;
  favouriteItems: readonly string[];
  /**
   * Что видно по составу его чеков. `null`, когда позиции не записаны — тогда
   * модель и не пытается говорить о вкусах.
   *
   * Всё здесь посчитано в `src/domain/customer-insights.ts`. Модель складывает
   * из этого фразу и не имеет права добавить к ней ни одного своего числа.
   */
  behaviour: {
    favourites: readonly { name: string; orders: number; sharePercent: number }[];
    categories: readonly { category: string; sharePercent: number }[];
    pairs: readonly { a: string; b: string; together: number }[];
    dropped: readonly { name: string; ordersBefore: number; daysSince: number }[];
    cadenceDays: number | null;
    overdueDays: number | null;
    returnPercent: number | null;
    returnHorizonDays: number | null;
    suggestion: { itemName: string; reason: string } | null;
  } | null;
  currency: string;
}

/**
 * Ответ гостю в чате заведения.
 *
 * The bot answers as staff would, and staff do not invent prices. Everything it
 * may say is handed to it as facts; anything outside them is `needsHuman`,
 * which is a real answer — «спрошу и вернусь» beats a confident wrong price.
 */
export interface GuestReply {
  schemaVersion: string;
  reply: string;
  /** Which supplied facts the answer leans on, so it can be checked. */
  usedFacts: readonly string[];
  /** True when the question cannot be answered from the venue's own data. */
  needsHuman: boolean;
}

export interface AiRequest {
  purpose: 'campaign_generation' | 'content_generation' | 'customer_brief' | 'guest_reply' | 'automation_content';
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
 * Numbers the owner acts on come from the tables, never from a sentence a model
 * wrote. A brief that invents a figure is rejected rather than shown with a
 * disclaimer: a disclaimer next to a wrong number is still a wrong number.
 */
const ALLOWED_BRIEF_NUMBERS = (input: CustomerBriefInput): Set<string> => new Set([
  input.visits, input.averageCheckMinor, input.totalSpentMinor,
  input.daysSinceLastVisit, input.daysKnown, input.campaignsIncluded,
  input.loyalty?.stamps, input.loyalty?.points,
  // Разбор чеков — такие же собственные числа гостя, как и всё выше: они
  // посчитаны по его покупкам и переданы модели вместе с остальными.
  ...(input.behaviour?.favourites ?? []).flatMap((item) => [item.orders, item.sharePercent]),
  ...(input.behaviour?.categories ?? []).map((item) => item.sharePercent),
  ...(input.behaviour?.pairs ?? []).map((item) => item.together),
  ...(input.behaviour?.dropped ?? []).flatMap((item) => [item.ordersBefore, item.daysSince]),
  input.behaviour?.cadenceDays, input.behaviour?.overdueDays,
  input.behaviour?.returnPercent, input.behaviour?.returnHorizonDays,
].filter((value): value is number => typeof value === 'number').map((value) => String(Math.trunc(value))));

function assertNoInventedNumbers(text: string, allowed: Set<string>, path: string, name: string): void {
  // A guest's own name is not a claim about their spending, and plenty of names
  // carry digits — this product's demo base is literally «Demo Guest 001».
  // Scanning the name would reject almost every honest brief.
  text = name.trim().length > 1 ? text.split(name.trim()).join(' ') : text;
  for (const match of text.matchAll(/\d[\d\s ]*/g)) {
    const digits = match[0].replace(/[\s ]/g, '');
    if (!digits) continue;
    // Ordinals and small counts read naturally and cannot mislead about money.
    if (digits.length <= 1) continue;
    if (!allowed.has(digits)) fail(`${path} cites ${digits}, which is not one of this guest's own figures`);
  }
}

export function parseCustomerBrief(raw: unknown, input: CustomerBriefInput): CustomerBrief {
  const body = asObject(raw, 'brief');
  const schemaVersion = asText(body.schemaVersion, 'brief.schemaVersion', 60);
  if (schemaVersion !== BRIEF_SCHEMA_VERSION) fail(`brief.schemaVersion must be ${BRIEF_SCHEMA_VERSION}`);

  const summary = asText(body.summary, 'brief.summary');
  const observations = asTextList(body.observations, 'brief.observations', 2, 4);
  const nextStep = asText(body.nextStep, 'brief.nextStep');
  const cautions = Array.isArray(body.cautions) ? asTextList(body.cautions, 'brief.cautions', 0, 3) : Object.freeze([]);

  const allowed = ALLOWED_BRIEF_NUMBERS(input);
  const name = input.displayName ?? '';
  assertNoInventedNumbers(summary, allowed, 'brief.summary', name);
  observations.forEach((line, index) => assertNoInventedNumbers(line, allowed, `brief.observations[${index}]`, name));
  assertNoInventedNumbers(nextStep, allowed, 'brief.nextStep', name);

  return Object.freeze({ schemaVersion, summary, observations, nextStep, cautions });
}

/**
 * A guest reply may repeat the venue's own numbers and may not introduce new ones.
 *
 * A wrong price quoted by the venue's own bot is worse than no answer: the guest
 * arrives expecting it. `allowedNumbers` is every figure handed to the model —
 * prices, balances, reward costs, hours — and anything else fails the parse.
 */
export function parseGuestReply(raw: unknown, allowedNumbers: ReadonlySet<string>): GuestReply {
  const body = asObject(raw, 'reply');
  const schemaVersion = asText(body.schemaVersion, 'reply.schemaVersion', 60);
  if (schemaVersion !== REPLY_SCHEMA_VERSION) fail(`reply.schemaVersion must be ${REPLY_SCHEMA_VERSION}`);

  const text = asText(body.reply, 'reply.reply', 900);
  const usedFacts = Array.isArray(body.usedFacts) ? asTextList(body.usedFacts, 'reply.usedFacts', 0, 6) : Object.freeze([]);
  const needsHuman = body.needsHuman === true;

  for (const match of text.matchAll(/\d[\d\s ]*/g)) {
    const digits = match[0].replace(/[\s ]/g, '');
    if (digits.length <= 1) continue;
    if (!allowedNumbers.has(digits)) {
      fail(`reply.reply quotes ${digits}, which is not one of the venue's own figures`);
    }
  }

  return Object.freeze({ schemaVersion, reply: text, usedFacts, needsHuman });
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
