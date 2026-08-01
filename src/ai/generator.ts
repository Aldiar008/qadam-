/**
 * Generation orchestrator.
 *
 * Sequence, and the reason for each step:
 *   1. build a redacted prompt                  — no PII or secret leaves the server
 *   2. cost guard                               — refuse before spending, not after
 *   3. call the provider with a timeout         — a hung provider must not hang the owner
 *   4. retry only transport failures, backed off — a schema mismatch will repeat
 *   5. parse and strictly validate              — the model is untrusted input
 *   6. content safety                           — generated copy is still copy we publish
 *   7. deterministic fallback on any failure    — the owner always gets a usable result
 *
 * The result always carries provenance so the UI can label a templated answer
 * honestly instead of implying a model wrote it.
 */

import {
  AiProviderError,
  CAMPAIGN_PROMPT_VERSION,
  CAMPAIGN_SCHEMA_VERSION,
  extractJson,
  parseCampaignProposal,
  type AiFailureKind,
  type AiProvider,
  type CampaignGenerationInput,
  type CampaignProposal,
} from './contract.ts';
import { generateDeterministicProposal } from './deterministic.ts';
import { buildCampaignPrompt } from './prompt.ts';
import { checkContentSafety } from './redaction.ts';

export type GenerationSource = 'provider' | 'deterministic_fallback';

export interface GenerationTelemetry {
  provider: string;
  model: string;
  promptVersion: string;
  schemaVersion: string;
  /** SHA-256 of the redacted payload. Never a hash of raw owner text. */
  inputHash: string;
  latencyMs: number;
  attempts: number;
  inputTokens: number;
  outputTokens: number;
  costMicros: number;
  status: 'completed' | 'failed' | 'blocked';
  fallbackReason: string | null;
  failureKind: AiFailureKind | null;
  safety: {
    injectionFlags: readonly string[];
    redactionHits: Readonly<Record<string, number>>;
    contentViolations: readonly string[];
  };
}

export interface GenerationResult {
  proposal: CampaignProposal;
  source: GenerationSource;
  telemetry: GenerationTelemetry;
}

export interface GeneratorOptions {
  provider: AiProvider | null;
  timeoutMs: number;
  maxAttempts: number;
  costCeilingMicros: number;
  /** Micro-units per 1000 tokens, used for the pre-flight estimate and the recorded cost. */
  inputCostPerKTokenMicros?: number;
  outputCostPerKTokenMicros?: number;
  /** Injected so tests can drive time and hashing without touching globals. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  hash?: (value: string) => Promise<string>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function defaultHash(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function estimateTokens(text: string): number {
  // Deliberately coarse and pessimistic: the guard should trip early rather than late.
  return Math.ceil(text.length / 3);
}

export async function generateCampaignProposal(
  input: CampaignGenerationInput,
  options: GeneratorOptions,
): Promise<GenerationResult> {
  const now = options.now ?? (() => Date.now());
  const sleep = options.sleep ?? defaultSleep;
  const hash = options.hash ?? defaultHash;
  const inputRate = options.inputCostPerKTokenMicros ?? 3_000;
  const outputRate = options.outputCostPerKTokenMicros ?? 15_000;

  const built = buildCampaignPrompt(input);
  const inputHash = await hash(built.redactedPayload);
  const startedAt = now();

  const baseTelemetry = {
    promptVersion: CAMPAIGN_PROMPT_VERSION,
    schemaVersion: CAMPAIGN_SCHEMA_VERSION,
    inputHash,
    safety: {
      injectionFlags: built.injectionFlags,
      redactionHits: built.redactionHits,
      contentViolations: Object.freeze([]) as readonly string[],
    },
  };

  const fallback = (reason: string, failureKind: AiFailureKind | null, attempts: number, extra: Partial<GenerationTelemetry> = {}): GenerationResult => ({
    proposal: generateDeterministicProposal(input),
    source: 'deterministic_fallback',
    telemetry: {
      ...baseTelemetry,
      provider: 'deterministic',
      model: 'qadam-template-v1',
      latencyMs: now() - startedAt,
      attempts,
      inputTokens: 0,
      outputTokens: 0,
      costMicros: 0,
      status: failureKind === 'unsafe_content' ? 'blocked' : 'completed',
      fallbackReason: reason,
      failureKind,
      ...extra,
    },
  });

  if (!options.provider) {
    return fallback('AI provider is not configured; using the built-in deterministic template.', 'not_configured', 0);
  }

  // Cost guard runs before the first byte is sent.
  const estimatedInputTokens = estimateTokens(built.request.system) + estimateTokens(built.request.user);
  const estimatedMicros = Math.ceil((estimatedInputTokens / 1000) * inputRate) + Math.ceil((built.request.maxOutputTokens / 1000) * outputRate);
  if (estimatedMicros > options.costCeilingMicros) {
    return fallback(
      `Estimated cost ${estimatedMicros} exceeds the per-generation ceiling ${options.costCeilingMicros}.`,
      'cost_guard',
      0,
    );
  }

  let lastError: AiProviderError | null = null;
  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const response = await options.provider.complete(built.request, controller.signal);
      clearTimeout(timer);

      const proposal = parseCampaignProposal(extractJson(response.text), { goal: input.goal, locales: input.locales });

      // Generated copy is still copy this product publishes on the owner's behalf.
      const combined = proposal.mechanics
        .flatMap((mechanic) => Object.values(mechanic.copy).flatMap((copy) => [copy.title, copy.body, copy.cta]))
        .join('\n');
      const safety = checkContentSafety(combined);
      if (!safety.safe) {
        return fallback(
          `Generated copy failed content safety: ${safety.violations.join(', ')}.`,
          'unsafe_content',
          attempt,
          { safety: { ...baseTelemetry.safety, contentViolations: safety.violations } },
        );
      }

      const costMicros = Math.ceil((response.inputTokens / 1000) * inputRate) + Math.ceil((response.outputTokens / 1000) * outputRate);
      return {
        proposal,
        source: 'provider',
        telemetry: {
          ...baseTelemetry,
          provider: options.provider.name,
          model: response.model,
          latencyMs: now() - startedAt,
          attempts: attempt,
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
          costMicros,
          status: 'completed',
          fallbackReason: null,
          failureKind: null,
        },
      };
    } catch (error) {
      clearTimeout(timer);
      const aiError = error instanceof AiProviderError
        ? error
        : (error as Error)?.name === 'AbortError'
          ? new AiProviderError('timeout', `provider did not respond within ${options.timeoutMs}ms`, { retryable: true })
          : new AiProviderError('server_error', (error as Error)?.message ?? 'unknown provider failure', { retryable: true });
      lastError = aiError;

      if (!aiError.retryable || attempt === options.maxAttempts) break;
      // Exponential backoff; deterministic so tests can assert the schedule.
      await sleep(Math.min(4_000, 250 * 2 ** (attempt - 1)));
    }
  }

  return fallback(
    `Provider failed after ${options.maxAttempts} attempt(s): ${lastError?.kind ?? 'unknown'} — ${lastError?.message ?? 'no detail'}`,
    lastError?.kind ?? 'server_error',
    options.maxAttempts,
  );
}
