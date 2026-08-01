/**
 * Connector contract.
 *
 * One interface for every channel. Adapters move bytes and report what actually
 * happened; they never decide whether a send is allowed. That decision belongs
 * to `send_gate` in the database, which is re-evaluated immediately before each
 * dispatch rather than when the audience was built.
 *
 * The state vocabulary is deliberately blunt, because the whole point is that a
 * screen must never imply a capability the system does not have:
 *
 *   not_configured — nothing set up. Production refuses to launch.
 *   simulated      — DEMO_MODE only. Nothing leaves the building.
 *   sandbox        — real adapter, provider test environment. Still not production.
 *   connected      — real adapter, real credentials, health check passed.
 *   error          — was connected, last interaction failed.
 *
 * `connected` is only reachable through a passing health check whose evidence is
 * stored; the database enforces that with a CHECK constraint.
 */

export type ConnectorState = 'not_configured' | 'simulated' | 'sandbox' | 'connected' | 'error';

export const CONNECTOR_STATE_LABELS: Record<ConnectorState, { label: string; hint: string }> = {
  not_configured: { label: 'Не настроен', hint: 'Провайдер не подключён — отправка невозможна.' },
  simulated: { label: 'Симуляция', hint: 'DEMO_MODE: сообщения не отправляются, результат помечен как симулированный.' },
  sandbox: { label: 'Песочница', hint: 'Реальный адаптер в тестовой среде провайдера. Это ещё не production.' },
  connected: { label: 'Подключён', hint: 'Проверка связи пройдена, отправка выполняется реально.' },
  error: { label: 'Ошибка', hint: 'Последнее обращение к провайдеру завершилось ошибкой.' },
};

export type ChannelKind = 'whatsapp' | 'telegram' | 'sms' | 'email' | 'instagram' | 'push' | 'in_app' | 'webhook';

export interface PreparedMessage {
  /** Opaque per-attempt key. The provider must treat a repeat as the same send. */
  idempotencyKey: string;
  channel: ChannelKind;
  /** Already-rendered body. Adapters never compose copy. */
  body: string;
  /** Masked recipient reference; adapters resolve the real address from their own store. */
  recipientRef: string;
  metadata: Readonly<Record<string, string>>;
}

export interface SendReceipt {
  status: 'sent' | 'queued' | 'failed' | 'skipped';
  providerMessageRef: string | null;
  /** Whether the caller should retry. A permanent rejection must not be retried. */
  retryable: boolean;
  error: string | null;
  /** True when nothing actually left the system. */
  simulated: boolean;
}

export interface DeliveryStatus {
  status: 'unknown' | 'queued' | 'sent' | 'delivered' | 'failed';
  providerMessageRef: string | null;
  raw: Readonly<Record<string, unknown>>;
}

export interface HealthCheckResult {
  ok: boolean;
  state: ConnectorState;
  checkedAt: string;
  /** Stored as connector evidence; a `connected` state is invalid without it. */
  evidence: Readonly<Record<string, unknown>>;
  error: string | null;
}

export interface ConnectorAdapter {
  readonly name: string;
  readonly channel: ChannelKind;
  /** True when this adapter can ever leave the building. */
  readonly canSendExternally: boolean;
  prepare(message: Omit<PreparedMessage, 'idempotencyKey'> & { idempotencyKey: string }): Promise<PreparedMessage>;
  send(message: PreparedMessage, signal: AbortSignal): Promise<SendReceipt>;
  status(providerMessageRef: string, signal: AbortSignal): Promise<DeliveryStatus>;
  /** Not every provider supports recall; adapters that cannot must say so. */
  cancel(providerMessageRef: string, signal: AbortSignal): Promise<{ cancelled: boolean; reason: string }>;
  healthCheck(signal: AbortSignal): Promise<HealthCheckResult>;
}

export class ConnectorError extends Error {
  readonly retryable: boolean;
  readonly code: string;
  constructor(code: string, message: string, retryable: boolean) {
    super(message);
    this.name = 'ConnectorError';
    this.code = code;
    this.retryable = retryable;
  }
}

/**
 * Webhook signature verification.
 *
 * Constant-time comparison, and the timestamp window rejects a replay of an old
 * but correctly signed body.
 */
export async function verifyWebhookSignature(options: {
  secret: string;
  payload: string;
  signature: string;
  timestamp: string;
  toleranceSeconds?: number;
  now?: number;
}): Promise<{ valid: boolean; reason: string }> {
  const { secret, payload, signature, timestamp } = options;
  const tolerance = options.toleranceSeconds ?? 300;
  const now = options.now ?? Date.now();

  if (!secret) return { valid: false, reason: 'no_secret_configured' };
  if (!signature || !timestamp) return { valid: false, reason: 'missing_signature_or_timestamp' };

  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt)) return { valid: false, reason: 'malformed_timestamp' };
  if (Math.abs(now / 1000 - sentAt) > tolerance) return { valid: false, reason: 'timestamp_outside_tolerance' };

  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`));
  const expected = [...new Uint8Array(mac)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

  if (expected.length !== signature.length) return { valid: false, reason: 'signature_mismatch' };
  let diff = 0;
  for (let index = 0; index < expected.length; index += 1) diff |= expected.charCodeAt(index) ^ signature.charCodeAt(index);
  return diff === 0 ? { valid: true, reason: 'ok' } : { valid: false, reason: 'signature_mismatch' };
}
