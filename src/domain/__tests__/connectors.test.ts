import assert from 'node:assert/strict';
import test from 'node:test';

import { CONNECTOR_STATE_LABELS, verifyWebhookSignature } from '../../connectors/contract.ts';
import { createAdapter, createMockAdapter, createUnimplementedVendorAdapter, createWebhookAdapter, resolveConnectorState } from '../../connectors/adapters.ts';
import { AUTOMATION_TEMPLATES, allowedModes, findTemplate } from '../../automations/catalog.ts';

const SECRET = 'test-webhook-secret';

async function signedHeaders(payload: string, atSeconds: number) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const timestamp = String(atSeconds);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`));
  const signature = [...new Uint8Array(mac)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return { timestamp, signature };
}

// ---------------------------------------------------------------------------
// Webhook signature
// ---------------------------------------------------------------------------

test('a correctly signed, recent webhook is accepted', async () => {
  const payload = JSON.stringify({ eventType: 'delivered' });
  const now = 1_800_000_000_000;
  const { timestamp, signature } = await signedHeaders(payload, Math.floor(now / 1000));

  const result = await verifyWebhookSignature({ secret: SECRET, payload, signature, timestamp, now });
  assert.equal(result.valid, true);
});

test('a tampered body fails verification', async () => {
  const payload = JSON.stringify({ eventType: 'delivered' });
  const now = 1_800_000_000_000;
  const { timestamp, signature } = await signedHeaders(payload, Math.floor(now / 1000));

  const result = await verifyWebhookSignature({ secret: SECRET, payload: payload.replace('delivered', 'redeemed'), signature, timestamp, now });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'signature_mismatch');
});

test('a correctly signed but stale body is refused as a replay', async () => {
  const payload = JSON.stringify({ eventType: 'delivered' });
  const signedAt = 1_800_000_000_000;
  const { timestamp, signature } = await signedHeaders(payload, Math.floor(signedAt / 1000));

  // Same signature, replayed an hour later.
  const result = await verifyWebhookSignature({ secret: SECRET, payload, signature, timestamp, now: signedAt + 3_600_000 });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'timestamp_outside_tolerance');
});

test('a missing secret or signature is refused rather than waved through', async () => {
  const payload = '{}';
  assert.equal((await verifyWebhookSignature({ secret: '', payload, signature: 'x', timestamp: '1' })).reason, 'no_secret_configured');
  assert.equal((await verifyWebhookSignature({ secret: SECRET, payload, signature: '', timestamp: '1' })).reason, 'missing_signature_or_timestamp');
  assert.equal((await verifyWebhookSignature({ secret: SECRET, payload, signature: 'x', timestamp: 'abc' })).reason, 'malformed_timestamp');
});

// ---------------------------------------------------------------------------
// Adapter behaviour
// ---------------------------------------------------------------------------

test('the mock adapter never claims to have sent anything externally', async () => {
  const adapter = createMockAdapter('whatsapp');
  assert.equal(adapter.canSendExternally, false);

  const prepared = await adapter.prepare({ idempotencyKey: 'key-1', channel: 'whatsapp', body: 'text', recipientRef: 'customer:1', metadata: {} });
  const receipt = await adapter.send(prepared, new AbortController().signal);
  assert.equal(receipt.status, 'sent');
  assert.equal(receipt.simulated, true, 'a mock send must be flagged simulated');

  const health = await adapter.healthCheck(new AbortController().signal);
  assert.equal(health.state, 'simulated', 'a healthy mock is still only simulated, never connected');
});

test('the mock adapter is deterministic for the same idempotency key', async () => {
  const adapter = createMockAdapter('whatsapp');
  const signal = new AbortController().signal;
  const one = await adapter.send({ idempotencyKey: 'same', channel: 'whatsapp', body: 'a', recipientRef: 'r', metadata: {} }, signal);
  const two = await adapter.send({ idempotencyKey: 'same', channel: 'whatsapp', body: 'a', recipientRef: 'r', metadata: {} }, signal);
  assert.equal(one.providerMessageRef, two.providerMessageRef);
});

test('the webhook adapter refuses to send without an endpoint and secret', async () => {
  const adapter = createWebhookAdapter({ channel: 'webhook' });
  const receipt = await adapter.send(
    { idempotencyKey: 'key-1', channel: 'webhook', body: 'text', recipientRef: 'customer:1', metadata: {} },
    new AbortController().signal,
  );
  assert.equal(receipt.status, 'failed');
  assert.match(receipt.error ?? '', /not_configured/);

  const health = await adapter.healthCheck(new AbortController().signal);
  assert.equal(health.state, 'not_configured');
});

test('a vendor boundary refuses explicitly and names its missing credentials', async () => {
  const adapter = createUnimplementedVendorAdapter('whatsapp');
  assert.equal(adapter.canSendExternally, false);

  const receipt = await adapter.send(
    { idempotencyKey: 'k', channel: 'whatsapp', body: 'b', recipientRef: 'r', metadata: {} },
    new AbortController().signal,
  );
  assert.equal(receipt.status, 'failed');
  assert.match(receipt.error ?? '', /not_implemented/);

  const health = await adapter.healthCheck(new AbortController().signal);
  assert.equal(health.state, 'not_configured');
  assert.deepEqual(health.evidence.required_credentials, ['WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_APP_SECRET']);
});

test('createAdapter falls back to a refusing boundary for an unknown adapter name', async () => {
  const adapter = createAdapter('mystery', { channel: 'telegram' });
  assert.equal(adapter.canSendExternally, false);
  assert.equal((await adapter.healthCheck(new AbortController().signal)).state, 'not_configured');
});

// ---------------------------------------------------------------------------
// Connector state honesty
// ---------------------------------------------------------------------------

test('a channel cannot be labelled connected without a real adapter, credentials, health and production mode', () => {
  const base = { adapter: 'webhook', hasCredentials: true, healthOk: true, healthDeclaredState: 'connected' as const };

  assert.equal(resolveConnectorState({ ...base, businessMode: 'production' }), 'connected');
  assert.equal(resolveConnectorState({ ...base, businessMode: 'demo' }), 'sandbox', 'a demo business can never be connected');
  assert.equal(resolveConnectorState({ ...base, businessMode: 'production', hasCredentials: false }), 'not_configured');
  assert.equal(resolveConnectorState({ ...base, businessMode: 'production', healthOk: false }), 'error');
  assert.equal(resolveConnectorState({ ...base, businessMode: 'production', healthDeclaredState: 'sandbox' }), 'sandbox',
    'a provider that declares a sandbox environment stays sandbox');
  assert.equal(resolveConnectorState({ businessMode: 'demo', adapter: 'mock', hasCredentials: true, healthOk: true, healthDeclaredState: 'simulated' }), 'simulated');
  assert.equal(resolveConnectorState({ businessMode: 'production', adapter: 'mock', hasCredentials: true, healthOk: true, healthDeclaredState: 'simulated' }), 'not_configured',
    'a mock adapter in a production business counts as nothing configured');
});

test('every connector state has an owner-facing label and hint', () => {
  for (const state of ['not_configured', 'simulated', 'sandbox', 'connected', 'error'] as const) {
    assert.ok(CONNECTOR_STATE_LABELS[state].label.length > 0);
    assert.ok(CONNECTOR_STATE_LABELS[state].hint.length > 0);
  }
});

// ---------------------------------------------------------------------------
// Automation catalogue
// ---------------------------------------------------------------------------

test('all ten required automation rules exist and are versioned', () => {
  const required = ['welcome', 'reactivation', 'quiet_hours', 'repeat_service', 'birthday', 'vip_care', 'content_queue', 'stop_loss', 'weekly_review', 'data_quality'];
  for (const code of required) {
    const template = findTemplate(code);
    assert.ok(template, `${code} must exist`);
    assert.match(template!.version, /\.v\d+$/, `${code} must be versioned`);
    assert.ok(template!.nameRu.length > 0);
    assert.ok(Object.keys(template!.trigger).length > 0, `${code} must define a trigger`);
    assert.ok(Object.keys(template!.action).length > 0, `${code} must define an action`);
    assert.ok(Object.keys(template!.guardrails).length > 0, `${code} must define guardrails`);
  }
  assert.equal(AUTOMATION_TEMPLATES.length, required.length);
});

test('autopilot is off everywhere except the protective stop-loss rule', () => {
  for (const template of AUTOMATION_TEMPLATES) {
    const modes = allowedModes(template);
    if (template.code === 'stop_loss') {
      assert.ok(modes.includes('autopilot'), 'stop-loss may act alone because it can only pause');
      assert.equal(template.action.restartRequiresOwner, true, 'stop-loss must never restart by itself');
    } else {
      assert.ok(!modes.includes('autopilot'), `${template.code} must not offer autopilot yet`);
      assert.equal(template.defaultMode, 'assistant');
      assert.ok(template.autopilotGates.length > 0, `${template.code} must state what unlocks autopilot`);
    }
  }
});

test('every customer-facing rule requires consent and respects quiet hours', () => {
  const customerFacing = ['welcome', 'reactivation', 'quiet_hours', 'repeat_service', 'birthday', 'vip_care'];
  for (const code of customerFacing) {
    const template = findTemplate(code)!;
    assert.equal(template.guardrails.requiresConsent, true, `${code} must require consent`);
    assert.equal(template.guardrails.respectsQuietHours, true, `${code} must respect quiet hours`);
    assert.equal(template.guardrails.respectsSuppressionList, true, `${code} must respect the suppression list`);
    assert.ok(Number(template.guardrails.maxRecipientsPerRun) > 0, `${code} must cap recipients per run`);
  }
});

test('the birthday rule is honest that it cannot run yet', () => {
  const template = findTemplate('birthday')!;
  assert.ok(template.blockedReason, 'birthday must declare why it produces no candidates');
  assert.equal(template.filters.requiresBirthDate, true);
  assert.equal(template.filters.lawfulBasis, 'explicit_consent');
});
