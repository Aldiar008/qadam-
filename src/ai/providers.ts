/**
 * Provider adapters.
 *
 * Adapters only move bytes: they never parse or trust the model's content.
 * Selection happens server-side from environment configuration; a provider key
 * is read here and nowhere else, so it cannot reach a client bundle.
 */

import { AiProviderError, type AiProvider, type AiRequest, type AiResponse } from './contract.ts';

export interface ProviderConfig {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  maxAttempts: number;
  /** Hard ceiling per generation, in micro-units of the account currency. */
  costCeilingMicros: number;
}

const DEFAULTS = {
  anthropicModel: 'claude-sonnet-5',
  anthropicBaseUrl: 'https://api.anthropic.com',
  openaiModel: 'gpt-4o-mini',
  openaiBaseUrl: 'https://api.openai.com',
  geminiModel: 'gemini-3.6-flash',
  geminiBaseUrl: 'https://generativelanguage.googleapis.com',
  timeoutMs: 20_000,
  maxAttempts: 3,
  costCeilingMicros: 250_000,
};

/**
 * Reads provider selection from the server environment.
 * Returns null when nothing is configured — the caller then uses the
 * deterministic generator, which is a supported state, not an error.
 */
export function readProviderConfig(env: Readonly<Record<string, string | undefined>> = process.env): ProviderConfig | null {
  const provider = (env.QADAM_AI_PROVIDER ?? '').trim().toLowerCase();
  if (!provider || provider === 'none' || provider === 'deterministic') return null;

  const timeoutMs = Number(env.QADAM_AI_TIMEOUT_MS ?? DEFAULTS.timeoutMs);
  const maxAttempts = Number(env.QADAM_AI_MAX_ATTEMPTS ?? DEFAULTS.maxAttempts);
  const costCeilingMicros = Number(env.QADAM_AI_COST_CEILING_MICROS ?? DEFAULTS.costCeilingMicros);

  const base = {
    provider,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.trunc(timeoutMs) : DEFAULTS.timeoutMs,
    maxAttempts: Number.isFinite(maxAttempts) && maxAttempts >= 1 ? Math.min(5, Math.trunc(maxAttempts)) : DEFAULTS.maxAttempts,
    costCeilingMicros: Number.isFinite(costCeilingMicros) && costCeilingMicros > 0 ? Math.trunc(costCeilingMicros) : DEFAULTS.costCeilingMicros,
  };

  if (provider === 'anthropic') {
    const apiKey = (env.ANTHROPIC_API_KEY ?? '').trim();
    if (!apiKey) return null;
    return { ...base, apiKey, model: (env.QADAM_AI_MODEL ?? DEFAULTS.anthropicModel).trim(), baseUrl: (env.QADAM_AI_BASE_URL ?? DEFAULTS.anthropicBaseUrl).trim() };
  }
  if (provider === 'openai') {
    const apiKey = (env.OPENAI_API_KEY ?? '').trim();
    if (!apiKey) return null;
    return { ...base, apiKey, model: (env.QADAM_AI_MODEL ?? DEFAULTS.openaiModel).trim(), baseUrl: (env.QADAM_AI_BASE_URL ?? DEFAULTS.openaiBaseUrl).trim() };
  }
  if (provider === 'gemini') {
    const apiKey = (env.GEMINI_API_KEY ?? '').trim();
    if (!apiKey) return null;
    return { ...base, apiKey, model: (env.QADAM_AI_MODEL ?? DEFAULTS.geminiModel).trim(), baseUrl: (env.QADAM_AI_BASE_URL ?? DEFAULTS.geminiBaseUrl).trim() };
  }
  return null;
}

function classify(status: number, body: string): AiProviderError {
  if (status === 429) return new AiProviderError('rate_limited', `provider rate limited (${status})`, { status, retryable: true });
  if (status >= 500) return new AiProviderError('server_error', `provider server error (${status})`, { status, retryable: true });
  return new AiProviderError('client_error', `provider rejected the request (${status}): ${body.slice(0, 200)}`, { status, retryable: false });
}

export function createAnthropicProvider(config: ProviderConfig): AiProvider {
  return {
    name: 'anthropic',
    model: config.model,
    async complete(request: AiRequest, signal: AbortSignal): Promise<AiResponse> {
      const response = await fetch(`${config.baseUrl}/v1/messages`, {
        method: 'POST',
        signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: request.maxOutputTokens,
          temperature: request.temperature,
          system: request.system,
          messages: [{ role: 'user', content: request.user }],
        }),
      });
      const raw = await response.text();
      if (!response.ok) throw classify(response.status, raw);

      let parsed: { content?: { type?: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number }; model?: string };
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new AiProviderError('malformed_json', 'provider envelope was not JSON', { retryable: true });
      }
      const text = (parsed.content ?? []).filter((block) => block.type === 'text').map((block) => block.text ?? '').join('\n');
      if (!text.trim()) throw new AiProviderError('malformed_json', 'provider returned no text content', { retryable: true });
      return {
        text,
        model: parsed.model ?? config.model,
        inputTokens: parsed.usage?.input_tokens ?? 0,
        outputTokens: parsed.usage?.output_tokens ?? 0,
      };
    },
  };
}

export function createOpenAiProvider(config: ProviderConfig): AiProvider {
  return {
    name: 'openai',
    model: config.model,
    async complete(request: AiRequest, signal: AbortSignal): Promise<AiResponse> {
      const response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        signal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({
          model: config.model,
          max_tokens: request.maxOutputTokens,
          temperature: request.temperature,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: request.system },
            { role: 'user', content: request.user },
          ],
        }),
      });
      const raw = await response.text();
      if (!response.ok) throw classify(response.status, raw);

      let parsed: { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number }; model?: string };
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new AiProviderError('malformed_json', 'provider envelope was not JSON', { retryable: true });
      }
      const text = parsed.choices?.[0]?.message?.content ?? '';
      if (!text.trim()) throw new AiProviderError('malformed_json', 'provider returned no text content', { retryable: true });
      return {
        text,
        model: parsed.model ?? config.model,
        inputTokens: parsed.usage?.prompt_tokens ?? 0,
        outputTokens: parsed.usage?.completion_tokens ?? 0,
      };
    },
  };
}

/**
 * Gemini spends output tokens on thinking before it emits anything, and this
 * call fills a fixed schema — thinking only starves the answer. The two model
 * generations disagree on how to say "don't": 2.x takes a token budget and
 * rejects `thinkingLevel`, 3.x takes a level and rejects `thinkingBudget` with
 * a bare 400. Picking the wrong one fails the request outright, so the shape is
 * chosen from the model name, and an unrecognised name sends neither.
 */
export function thinkingConfigFor(model: string): Record<string, unknown> | undefined {
  const generation = /^gemini-(\d+)/.exec(model.trim().toLowerCase())?.[1];
  if (!generation) return undefined;
  if (Number(generation) >= 3) return { thinkingLevel: 'low' };
  return { thinkingBudget: 0 };
}

export function createGeminiProvider(config: ProviderConfig): AiProvider {
  return {
    name: 'gemini',
    model: config.model,
    async complete(request: AiRequest, signal: AbortSignal): Promise<AiResponse> {
      const response = await fetch(`${config.baseUrl}/v1beta/models/${config.model}:generateContent`, {
        method: 'POST',
        signal,
        headers: { 'content-type': 'application/json', 'x-goog-api-key': config.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: request.system }] },
          contents: [{ role: 'user', parts: [{ text: request.user }] }],
          generationConfig: {
            temperature: request.temperature,
            maxOutputTokens: request.maxOutputTokens,
            responseMimeType: 'application/json',
            ...(thinkingConfigFor(config.model) ? { thinkingConfig: thinkingConfigFor(config.model) } : {}),
          },
        }),
      });
      const raw = await response.text();
      if (!response.ok) throw classify(response.status, raw);

      let parsed: {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
        modelVersion?: string;
      };
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new AiProviderError('malformed_json', 'provider envelope was not JSON', { retryable: true });
      }
      const text = (parsed.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? '').join('\n');
      if (!text.trim()) throw new AiProviderError('malformed_json', 'provider returned no text content', { retryable: true });
      return {
        text,
        model: parsed.modelVersion ?? config.model,
        inputTokens: parsed.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: parsed.usageMetadata?.candidatesTokenCount ?? 0,
      };
    },
  };
}

export function createProvider(config: ProviderConfig): AiProvider | null {
  if (config.provider === 'anthropic') return createAnthropicProvider(config);
  if (config.provider === 'openai') return createOpenAiProvider(config);
  if (config.provider === 'gemini') return createGeminiProvider(config);
  return null;
}
