/**
 * Adapter implementations.
 *
 * Two adapters can actually run today:
 *   - `mock`    — demo businesses. Records a deterministic receipt, sends nothing.
 *   - `webhook` — a real HTTP POST to a URL the owner controls, signed. This is
 *                 the only adapter in this build that can leave the machine, and
 *                 it only reaches `connected` after a passing health check.
 *
 * WhatsApp, Telegram and Instagram are present as declared boundaries: their
 * shape, required credentials and health check are defined, but `send` refuses
 * rather than pretending. Nothing here has been exercised against a real vendor
 * sandbox in this environment, so none of them may be labelled `connected`.
 */

import {
  ConnectorError,
  type ChannelKind,
  type ConnectorAdapter,
  type ConnectorState,
  type DeliveryStatus,
  type HealthCheckResult,
  type PreparedMessage,
  type SendReceipt,
} from './contract.ts';

export interface AdapterConfig {
  channel: ChannelKind;
  /** Owner-controlled endpoint for the webhook adapter. */
  endpoint?: string;
  /** Server-only. Never read outside this module. */
  secret?: string;
  /** Vendor bot token, server-only. Kept apart from `secret`, which signs webhooks. */
  token?: string;
  timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Mock adapter
// ---------------------------------------------------------------------------

export function createMockAdapter(channel: ChannelKind): ConnectorAdapter {
  return {
    name: 'mock',
    channel,
    canSendExternally: false,
    async prepare(message) {
      return { ...message, channel };
    },
    async send(message: PreparedMessage): Promise<SendReceipt> {
      // Deterministic reference so a replay of the same key produces the same row.
      return {
        status: 'sent',
        providerMessageRef: `mock:${message.idempotencyKey}`,
        retryable: false,
        error: null,
        simulated: true,
      };
    },
    async status(providerMessageRef: string): Promise<DeliveryStatus> {
      return { status: 'delivered', providerMessageRef, raw: { simulated: true } };
    },
    async cancel(): Promise<{ cancelled: boolean; reason: string }> {
      return { cancelled: true, reason: 'simulated_cancel' };
    },
    async healthCheck(): Promise<HealthCheckResult> {
      return {
        ok: true,
        // A mock is healthy but must never be presented as connected.
        state: 'simulated',
        checkedAt: new Date().toISOString(),
        evidence: { health_check: 'mock_adapter', note: 'Ничего не отправляется наружу' },
        error: null,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Webhook adapter — the only externally-capable adapter in this build
// ---------------------------------------------------------------------------

async function sign(secret: string, timestamp: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`));
  return [...new Uint8Array(mac)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createWebhookAdapter(config: AdapterConfig): ConnectorAdapter {
  const timeoutMs = config.timeoutMs ?? 10_000;

  const call = async (path: string, body: unknown, signal: AbortSignal) => {
    if (!config.endpoint || !config.secret) {
      throw new ConnectorError('not_configured', 'webhook endpoint or secret is missing', false);
    }
    const payload = JSON.stringify(body);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = await sign(config.secret, timestamp, payload);
    const response = await fetch(`${config.endpoint.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        'x-qadam-timestamp': timestamp,
        'x-qadam-signature': signature,
      },
      body: payload,
    });
    const text = await response.text();
    if (response.status === 429 || response.status >= 500) {
      throw new ConnectorError('provider_unavailable', `webhook responded ${response.status}`, true);
    }
    if (!response.ok) {
      throw new ConnectorError('provider_rejected', `webhook responded ${response.status}: ${text.slice(0, 200)}`, false);
    }
    try {
      return JSON.parse(text || '{}') as Record<string, unknown>;
    } catch {
      return {};
    }
  };

  return {
    name: 'webhook',
    channel: config.channel,
    canSendExternally: true,
    async prepare(message) {
      return { ...message, channel: config.channel };
    },
    async send(message: PreparedMessage, signal: AbortSignal): Promise<SendReceipt> {
      try {
        const result = await call('/messages', {
          idempotencyKey: message.idempotencyKey,
          channel: message.channel,
          recipientRef: message.recipientRef,
          body: message.body,
          metadata: message.metadata,
        }, signal);
        return {
          status: 'sent',
          providerMessageRef: String(result.id ?? `webhook:${message.idempotencyKey}`),
          retryable: false,
          error: null,
          simulated: false,
        };
      } catch (error) {
        const connectorError = error instanceof ConnectorError
          ? error
          : new ConnectorError((error as Error)?.name === 'AbortError' ? 'timeout' : 'unknown', (error as Error).message, true);
        return { status: 'failed', providerMessageRef: null, retryable: connectorError.retryable, error: `${connectorError.code}: ${connectorError.message}`, simulated: false };
      }
    },
    async status(providerMessageRef: string, signal: AbortSignal): Promise<DeliveryStatus> {
      try {
        const result = await call('/status', { providerMessageRef }, signal);
        const status = String(result.status ?? 'unknown');
        return {
          status: (['queued', 'sent', 'delivered', 'failed'].includes(status) ? status : 'unknown') as DeliveryStatus['status'],
          providerMessageRef,
          raw: result,
        };
      } catch {
        return { status: 'unknown', providerMessageRef, raw: {} };
      }
    },
    async cancel(providerMessageRef: string, signal: AbortSignal): Promise<{ cancelled: boolean; reason: string }> {
      try {
        const result = await call('/cancel', { providerMessageRef }, signal);
        return { cancelled: Boolean(result.cancelled), reason: String(result.reason ?? 'provider_response') };
      } catch (error) {
        return { cancelled: false, reason: (error as Error).message };
      }
    },
    async healthCheck(signal: AbortSignal): Promise<HealthCheckResult> {
      const checkedAt = new Date().toISOString();
      if (!config.endpoint || !config.secret) {
        return { ok: false, state: 'not_configured', checkedAt, evidence: {}, error: 'endpoint or secret missing' };
      }
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        signal.addEventListener('abort', () => controller.abort());
        const result = await call('/health', { ping: checkedAt }, controller.signal);
        clearTimeout(timer);
        // Only a provider that explicitly declares production status may be
        // labelled connected; anything else stays in sandbox.
        const declared = String(result.environment ?? 'sandbox');
        return {
          ok: true,
          state: declared === 'production' ? 'connected' : 'sandbox',
          checkedAt,
          evidence: { health_check: 'webhook', environment: declared, response: result },
          error: null,
        };
      } catch (error) {
        return { ok: false, state: 'error', checkedAt, evidence: { health_check: 'webhook' }, error: (error as Error).message };
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Declared but unimplemented vendor boundaries
// ---------------------------------------------------------------------------

const VENDOR_REQUIREMENTS: Record<string, { credentials: string[]; note: string }> = {
  whatsapp: {
    credentials: ['WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_APP_SECRET'],
    note: 'Cloud API: шаблоны сообщений требуют предварительного одобрения Meta.',
  },
  telegram: {
    credentials: ['TELEGRAM_BOT_TOKEN'],
    note: 'Bot API: пользователь должен первым начать диалог с ботом.',
  },
  instagram: {
    credentials: ['INSTAGRAM_PAGE_ID', 'INSTAGRAM_ACCESS_TOKEN', 'INSTAGRAM_APP_SECRET'],
    note: 'Messaging API: 24-часовое окно ответа и ограничения на инициацию.',
  },
};

/**
 * A boundary, not a stub that lies. Every method refuses explicitly so a caller
 * cannot mistake silence for success.
 */
export function createUnimplementedVendorAdapter(channel: ChannelKind): ConnectorAdapter {
  const requirement = VENDOR_REQUIREMENTS[channel] ?? { credentials: [], note: 'Адаптер не реализован.' };
  const refuse = (): never => {
    throw new ConnectorError('not_implemented', `${channel}: adapter is not implemented; required credentials: ${requirement.credentials.join(', ') || 'n/a'}`, false);
  };
  return {
    name: `${channel}_boundary`,
    channel,
    canSendExternally: false,
    async prepare(message) { return { ...message, channel }; },
    async send(): Promise<SendReceipt> {
      return { status: 'failed', providerMessageRef: null, retryable: false, error: `not_implemented: ${channel}`, simulated: false };
    },
    async status(): Promise<DeliveryStatus> { return refuse(); },
    async cancel(): Promise<{ cancelled: boolean; reason: string }> { return { cancelled: false, reason: 'not_implemented' }; },
    async healthCheck(): Promise<HealthCheckResult> {
      return {
        ok: false,
        state: 'not_configured',
        checkedAt: new Date().toISOString(),
        evidence: { required_credentials: requirement.credentials, note: requirement.note },
        error: 'adapter not implemented',
      };
    },
  };
}

/** Adapter selection is server-side and driven by the stored channel row. */
/**
 * Telegram, over the Bot API.
 *
 * The bot can only message someone who has messaged it first — that is the
 * platform's rule, not a limitation of this code, and it is the reason the
 * customer journey starts from a QR deep link rather than from a list of
 * contacts. The chat id that conversation produces is stored in
 * `private.channel_addresses`, which is what `recipientRef` resolves against.
 *
 * `recipientRef` arrives as `customer:<uuid>`; the caller has already resolved
 * it to a chat id and put it in `metadata.chatId`. The adapter never reads the
 * database: adapters move bytes, and giving one a database handle would make it
 * a place where sending decisions could quietly be made.
 */
export function createTelegramAdapter(config: AdapterConfig): ConnectorAdapter {
  // The timeout arrives as an AbortSignal from the worker, which owns the
  // deadline for the whole dispatch; a second one here would only disagree.
  const api = (method: string) => `https://api.telegram.org/bot${config.token ?? ''}/${method}`;

  const call = async (method: string, body: unknown, signal: AbortSignal): Promise<Record<string, unknown>> => {
    if (!config.token) throw new ConnectorError('not_configured', 'TELEGRAM_BOT_TOKEN is missing', false);
    const response = await fetch(api(method), {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    // 429 carries a retry_after; 5xx is the platform, not the message.
    if (response.status === 429 || response.status >= 500) {
      throw new ConnectorError('provider_unavailable', `telegram responded ${response.status}`, true);
    }
    let parsed: { ok?: boolean; description?: string; result?: unknown };
    try {
      parsed = JSON.parse(text || '{}');
    } catch {
      throw new ConnectorError('provider_rejected', 'telegram returned a body that is not JSON', false);
    }
    if (!response.ok || parsed.ok === false) {
      throw new ConnectorError('provider_rejected', `telegram refused: ${parsed.description ?? text.slice(0, 200)}`, false);
    }
    return (parsed.result ?? {}) as Record<string, unknown>;
  };

  return {
    name: 'telegram',
    channel: config.channel,
    canSendExternally: true,
    async prepare(message) {
      return { ...message, channel: config.channel };
    },
    async send(message: PreparedMessage, signal: AbortSignal): Promise<SendReceipt> {
      const chatId = message.metadata.chatId;
      // No chat means this person never opened the bot. That is an ordinary
      // state, and calling it a failure to send would be inaccurate: there was
      // nowhere to send.
      if (!chatId) {
        return {
          status: 'skipped', providerMessageRef: null, retryable: false, simulated: false,
          error: 'no_telegram_chat: получатель не начинал диалог с ботом',
        };
      }
      try {
        const result = await call('sendMessage', {
          chat_id: chatId,
          text: message.body,
          disable_web_page_preview: true,
        }, signal);
        const messageId = result.message_id;
        return {
          status: 'sent',
          providerMessageRef: messageId ? `tg:${chatId}:${messageId}` : `tg:${chatId}:${message.idempotencyKey}`,
          retryable: false,
          simulated: false,
          error: null,
        };
      } catch (error) {
        const failure = error instanceof ConnectorError ? error : new ConnectorError('provider_unavailable', String(error), true);
        return { status: 'failed', providerMessageRef: null, retryable: failure.retryable, simulated: false, error: failure.message };
      }
    },
    async status(providerMessageRef: string): Promise<DeliveryStatus> {
      // The Bot API has no delivery-status endpoint. Saying "unknown" is the
      // truthful answer; inventing "delivered" would be the tempting one.
      return {
        status: 'unknown',
        providerMessageRef,
        raw: { reason: 'telegram exposes no per-message delivery status' },
      };
    },
    async cancel() {
      return { cancelled: false, reason: 'telegram cannot recall a delivered message' };
    },
    async healthCheck(signal: AbortSignal): Promise<HealthCheckResult> {
      const checkedAt = new Date().toISOString();
      if (!config.token) {
        return { ok: false, state: 'not_configured', checkedAt, evidence: { required_credentials: ['TELEGRAM_BOT_TOKEN'] }, error: 'token missing' };
      }
      try {
        const me = await call('getMe', {}, signal);
        return {
          ok: true,
          // A working bot token is a real connection, and the tenant's mode
          // decides whether that may be called `connected`.
          state: 'connected',
          checkedAt,
          evidence: { health_check: 'getMe', bot: String(me.username ?? ''), can_read_all_group_messages: Boolean(me.can_read_all_group_messages) },
          error: null,
        };
      } catch (error) {
        return { ok: false, state: 'error', checkedAt, evidence: { health_check: 'getMe' }, error: String(error instanceof Error ? error.message : error) };
      }
    },
  };
}

export function createAdapter(adapterName: string, config: AdapterConfig): ConnectorAdapter {
  if (adapterName === 'webhook') return createWebhookAdapter(config);
  if (adapterName === 'telegram') return createTelegramAdapter(config);
  if (adapterName === 'mock') return createMockAdapter(config.channel);
  return createUnimplementedVendorAdapter(config.channel);
}

/**
 * The state a channel is permitted to claim, given the business mode and adapter.
 * A caller cannot talk its way past this: `connected` requires a real adapter,
 * a production business and health-check evidence.
 */
export function resolveConnectorState(input: {
  businessMode: 'demo' | 'production';
  adapter: string;
  hasCredentials: boolean;
  healthOk: boolean;
  healthDeclaredState: ConnectorState | null;
}): ConnectorState {
  if (input.adapter === 'mock') return input.businessMode === 'demo' ? 'simulated' : 'not_configured';
  if (!input.hasCredentials) return 'not_configured';
  if (!input.healthOk) return 'error';
  if (input.healthDeclaredState === 'connected' && input.businessMode === 'production') return 'connected';
  return 'sandbox';
}
