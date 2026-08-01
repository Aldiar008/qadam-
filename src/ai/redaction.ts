/**
 * Redaction and prompt-injection defence.
 *
 * Two separate jobs, deliberately kept apart:
 *
 *  - `redact` removes anything that looks like personal or secret data before a
 *    string can reach a provider or a log. It is applied to every free-text
 *    field the owner controls.
 *  - `neutraliseInjection` strips instruction-shaped text. Business
 *    descriptions are attacker-controlled in the threat model: an owner (or
 *    anyone who can edit a business profile) must not be able to talk the model
 *    out of its system rules, budget, consent scope or target audience.
 *
 * Neither function is a substitute for the real control, which is that the
 * model's output is re-validated and every number is recomputed server-side.
 */

export interface RedactionResult {
  text: string;
  /** Count per rule, for the safety evidence written to ai_generation_runs. */
  hits: Readonly<Record<string, number>>;
}

const PII_RULES: readonly { name: string; pattern: RegExp; replacement: string }[] = [
  { name: 'email', pattern: /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu, replacement: '[email]' },
  // Kazakhstan and generic international forms, plus long digit runs that could be an IIN or a card.
  { name: 'phone', pattern: /(?:\+?\d[\d\s().-]{8,}\d)/g, replacement: '[phone]' },
  { name: 'long_number', pattern: /\b\d{9,}\b/g, replacement: '[number]' },
  { name: 'url', pattern: /\bhttps?:\/\/\S+/gi, replacement: '[url]' },
  { name: 'secret', pattern: /\b(?:sk|pk|sb|api|bearer|token|secret)[-_][\p{L}\p{N}_-]{8,}/giu, replacement: '[secret]' },
  { name: 'jwt', pattern: /\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}\b/g, replacement: '[secret]' },
];

export function redact(input: string): RedactionResult {
  const hits: Record<string, number> = {};
  let text = input;
  for (const rule of PII_RULES) {
    let count = 0;
    text = text.replace(rule.pattern, () => {
      count += 1;
      return rule.replacement;
    });
    if (count) hits[rule.name] = count;
  }
  return { text, hits: Object.freeze(hits) };
}

/**
 * JavaScript's `\b` is defined against ASCII `\w`, so it never matches next to a
 * Cyrillic letter — `/\bлечит\b/u` silently matches nothing. Every rule below
 * that touches Russian or Kazakh text uses these explicit Unicode boundaries.
 */
const BOUNDARY_START = '(?<![\\p{L}\\p{N}_])';
const BOUNDARY_END = '(?![\\p{L}\\p{N}_])';

const INJECTION_PATTERNS: readonly { name: string; pattern: RegExp }[] = [
  { name: 'override_instructions', pattern: /\b(?:ignore|disregard|forget|override)\b[^.\n]{0,40}\b(?:previous|prior|above|earlier|all)?\s*(?:instruction|instructions|rules?|prompt|system)\b/gi },
  { name: 'role_switch', pattern: /\b(?:you are now|act as|pretend to be|roleplay as|from now on you)\b/gi },
  { name: 'system_marker', pattern: /(?:^|\n)\s*(?:system|assistant|developer)\s*:/gi },
  { name: 'fence_escape', pattern: /<\/?(?:system|instructions?|prompt)>/gi },
  { name: 'guardrail_target', pattern: /\b(?:margin\s*shield|budget|consent|guardrail|stop[- ]rule|frequency\s*cap)\b[^.\n]{0,30}\b(?:ignore|bypass|disable|skip|remove|raise|unlimited)\b/gi },
  { name: 'guardrail_target', pattern: /\b(?:ignore|bypass|disable|skip|remove)\b[^.\n]{0,30}\b(?:margin\s*shield|budget|consent|guardrail|stop[- ]rule|frequency\s*cap)\b/gi },
  // Cyrillic equivalents: the product's owners write in Russian.
  { name: 'override_instructions_ru', pattern: new RegExp(`${BOUNDARY_START}(?:игнорир\\p{L}*|забудь|не\\s+учитывай|отмени)${BOUNDARY_END}[^.\\n]{0,40}(?:инструкц\\p{L}*|правил\\p{L}*|систем\\p{L}*|промпт\\p{L}*)`, 'giu') },
  { name: 'role_switch_ru', pattern: new RegExp(`${BOUNDARY_START}(?:теперь\\s+ты|веди\\s+себя\\s+как|представь\\s+что\\s+ты)${BOUNDARY_END}`, 'giu') },
  { name: 'guardrail_target_ru', pattern: new RegExp(`${BOUNDARY_START}(?:обойд\\p{L}*|отключ\\p{L}*|игнорир\\p{L}*|сними)${BOUNDARY_END}[^.\\n]{0,30}(?:margin\\s*shield|бюджет\\p{L}*|согласи\\p{L}*|лимит\\p{L}*|ограничен\\p{L}*)`, 'giu') },
];

export interface SanitisationResult {
  text: string;
  /** Rule names that fired, for safety evidence. */
  flags: readonly string[];
}

export function neutraliseInjection(input: string): SanitisationResult {
  const flags = new Set<string>();
  let text = input;
  for (const rule of INJECTION_PATTERNS) {
    text = text.replace(rule.pattern, () => {
      flags.add(rule.name);
      // Keep the length roughly stable so surrounding copy still reads sensibly,
      // but destroy the imperative.
      return `[removed:${rule.name}]`;
    });
  }
  return { text, flags: Object.freeze([...flags]) };
}

/** Applied to every owner-controlled string before it enters a prompt or a log. */
export function sanitiseForPrompt(input: string, maxLength = 400): { text: string; hits: Readonly<Record<string, number>>; flags: readonly string[] } {
  const redacted = redact(input ?? '');
  const neutralised = neutraliseInjection(redacted.text);
  return {
    text: neutralised.text.slice(0, maxLength),
    hits: redacted.hits,
    flags: neutralised.flags,
  };
}

/**
 * Content safety for generated copy. The model may not promise medical,
 * financial or legal outcomes, target protected attributes, or invent a
 * discount the Growth Contract does not carry.
 */
const UNSAFE_OUTPUT_PATTERNS: readonly { name: string; pattern: RegExp }[] = [
  { name: 'health_claim', pattern: new RegExp(`${BOUNDARY_START}(?:cure|heal|лечит|лечен\\p{L}*|излечива\\p{L}*|вылечи\\p{L}*|от\\s+всех\\s+болезн\\p{L}*)${BOUNDARY_END}`, 'giu') },
  { name: 'financial_promise', pattern: new RegExp(`${BOUNDARY_START}(?:guaranteed\\s+(?:profit|income)|гарантированн\\p{L}*\\s+(?:доход\\p{L}*|прибыл\\p{L}*|заработ\\p{L}*))${BOUNDARY_END}`, 'giu') },
  { name: 'sensitive_targeting', pattern: new RegExp(`${BOUNDARY_START}(?:национальност\\p{L}*|вероисповедан\\p{L}*|религи\\p{L}*|инвалидност\\p{L}*|ориентаци\\p{L}*)${BOUNDARY_END}`, 'giu') },
  { name: 'contact_leak', pattern: /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu },
];

export function checkContentSafety(text: string): { safe: boolean; violations: readonly string[] } {
  const violations = new Set<string>();
  for (const rule of UNSAFE_OUTPUT_PATTERNS) {
    // `test` on a /g/ regex advances lastIndex, so reset before and after.
    rule.pattern.lastIndex = 0;
    if (rule.pattern.test(text)) violations.add(rule.name);
    rule.pattern.lastIndex = 0;
  }
  return { safe: violations.size === 0, violations: Object.freeze([...violations]) };
}
