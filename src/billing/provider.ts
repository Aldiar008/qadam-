/**
 * Provider-neutral billing interface.
 *
 * **No payment provider is connected.** This module defines the contract and a
 * refusing default so the rest of the product can be written against a stable
 * shape, and so the absence is visible rather than implicit.
 *
 * The rule that matters: for a production business, an unconfigured provider
 * must refuse checkout outright. Simulating a successful payment would be indistinguishable
 * from taking money and delivering nothing.
 */

import type { BusinessMode } from '@/lib/app-mode';

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete';

export interface CheckoutRequest {
  businessId: string;
  planCode: string;
  returnUrl: string;
  /** Deduplicates a double click into one checkout session. */
  idempotencyKey: string;
}

export interface CheckoutSession {
  url: string;
  externalRef: string;
  simulated: boolean;
}

export interface BillingWebhookEvent {
  externalEventId: string;
  eventType: string;
  businessRef: string;
  status: SubscriptionStatus;
  periodStart: string | null;
  periodEnd: string | null;
  raw: Record<string, unknown>;
}

export interface BillingProvider {
  readonly name: string;
  readonly configured: boolean;
  createCheckout(request: CheckoutRequest): Promise<CheckoutSession>;
  cancelSubscription(externalRef: string): Promise<{ cancelled: boolean; effectiveAt: string | null }>;
  /** Must verify the signature before the caller is allowed to trust the body. */
  verifyWebhook(payload: string, signature: string, timestamp: string): Promise<{ valid: boolean; reason: string }>;
  parseWebhook(payload: string): BillingWebhookEvent;
}

export class BillingNotConfiguredError extends Error {
  readonly code = 'billing_not_configured';
  constructor(message: string) {
    super(message);
    this.name = 'BillingNotConfiguredError';
  }
}

/**
 * The default provider. It refuses everything, loudly.
 *
 * In demo businesses the owner still sees plans and limits — those are real
 * and enforced — but cannot start a checkout, because there is nothing to pay.
 */
export function createUnconfiguredBillingProvider(businessMode: BusinessMode): BillingProvider {
  return {
    name: 'none',
    configured: false,
    async createCheckout(): Promise<CheckoutSession> {
      throw new BillingNotConfiguredError(
        businessMode === 'production'
          ? 'Платёжный провайдер не подключён: оплата недоступна. Мы не показываем фиктивную оплату.'
          : 'Demo-заведение: оплата не производится. Тарифы и лимиты работают реально, но платёж не подключён.',
      );
    },
    async cancelSubscription(): Promise<{ cancelled: boolean; effectiveAt: string | null }> {
      throw new BillingNotConfiguredError('Платёжный провайдер не подключён: отменять нечего.');
    },
    async verifyWebhook(): Promise<{ valid: boolean; reason: string }> {
      // A webhook cannot be valid when no provider was ever configured to send one.
      return { valid: false, reason: 'no_billing_provider_configured' };
    },
    parseWebhook(): BillingWebhookEvent {
      throw new BillingNotConfiguredError('Платёжный провайдер не подключён.');
    },
  };
}

export interface BillingConfig {
  provider: string;
  apiKey: string;
  webhookSecret: string;
}

/** Server-side selection. Returns null unless a provider *and* its secrets exist. */
export function readBillingConfig(env: Readonly<Record<string, string | undefined>> = process.env): BillingConfig | null {
  const provider = (env.QADAM_BILLING_PROVIDER ?? '').trim().toLowerCase();
  if (!provider || provider === 'none') return null;
  const apiKey = (env.QADAM_BILLING_API_KEY ?? '').trim();
  const webhookSecret = (env.QADAM_BILLING_WEBHOOK_SECRET ?? '').trim();
  // A provider without both secrets is not a provider; treat it as absent rather
  // than half-configured, which is the state that produces silent failures.
  if (!apiKey || !webhookSecret) return null;
  return { provider, apiKey, webhookSecret };
}

// The mode is required rather than defaulted from the environment: whether
// checkout may be attempted is a fact about one tenant, and a default read from
// the deployment would quietly reintroduce the coupling this removed.
export function createBillingProvider(env: Readonly<Record<string, string | undefined>> = process.env, businessMode: BusinessMode): BillingProvider {
  const config = readBillingConfig(env);
  // No adapter is implemented yet: a configured provider still resolves to the
  // refusing default, so nothing can accidentally claim to have charged anyone.
  if (!config) return createUnconfiguredBillingProvider(businessMode);
  return createUnconfiguredBillingProvider(businessMode);
}
