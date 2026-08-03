import 'server-only';

import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { GenerationTelemetry, GenerationSource } from '@/ai/generator.ts';
import type { Json } from '@/types/database.generated';

/**
 * One place where a generation becomes a record.
 *
 * Provenance used to be written by the campaign service alone, so anything else
 * that reached a model would have left no trace — and the «Журнал генераций» in
 * the cabinet would have kept saying nothing happened while the product spent
 * tokens. Every generator goes through here, provider or fallback.
 */

const DAILY_GENERATION_LIMIT = Number(process.env.QADAM_AI_DAILY_GENERATIONS ?? 40);
const DAILY_COST_CEILING_MICROS = Number(process.env.QADAM_AI_DAILY_COST_MICROS ?? 2_000_000);

export interface RecordRunCommand {
  businessId: string;
  purpose: 'campaign_generation' | 'content_generation' | 'customer_brief' | 'recommendation' | 'guest_reply' | 'automation_content';
  output: unknown;
  source: GenerationSource;
  telemetry: GenerationTelemetry;
  growthContractId?: string | null;
  idempotencyKey?: string;
}

export async function recordGenerationRun(db: SupabaseClient, command: RecordRunCommand): Promise<string | null> {
  const { data, error } = await db.rpc('record_ai_generation_run', {
    p_business_id: command.businessId,
    p_purpose: command.purpose,
    p_provider: command.telemetry.provider,
    p_model: command.telemetry.model,
    p_source: command.source,
    p_prompt_version: command.telemetry.promptVersion,
    p_schema_version: command.telemetry.schemaVersion,
    p_input_hash: command.telemetry.inputHash,
    p_output: command.output as Json,
    p_status: command.telemetry.status,
    p_latency_ms: command.telemetry.latencyMs,
    p_attempts: command.telemetry.attempts,
    p_cost_micros: command.telemetry.costMicros,
    p_failure_kind: command.telemetry.failureKind,
    p_fallback_reason: command.telemetry.fallbackReason,
    p_safety_evidence: command.telemetry.safety as unknown as Json,
    p_token_usage: { input: command.telemetry.inputTokens, output: command.telemetry.outputTokens } as unknown as Json,
    p_growth_contract_id: (command.growthContractId ?? null) as unknown as string,
    p_idempotency_key: command.idempotencyKey ?? `ai:${command.purpose}:${randomUUID()}`,
    p_max_generations_per_day: DAILY_GENERATION_LIMIT,
    p_max_cost_micros_per_day: DAILY_COST_CEILING_MICROS,
  });
  // A quota refusal must not destroy work the owner already has in hand; it is
  // surfaced through the absence of a run id, not by throwing away the result.
  if (error) return null;
  return (data as { run_id?: string } | null)?.run_id ?? null;
}

export { DAILY_GENERATION_LIMIT, DAILY_COST_CEILING_MICROS };
