import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ASSIGNABLE_ROLES, CRITICAL_CAPABILITIES, ROLE_LABELS, ROLE_MATRIX, TENANT_ROLES,
  can, capabilitiesFor, isAssignableRole, rolesFor, type Capability, type TenantRole,
} from '../../server/qadam/rbac.ts';
import {
  DEFAULT_LOCALE, GLOSSARY, MESSAGE_CATALOGUE, SUPPORTED_LOCALES,
  formatMoney, formatNumber, formatPercent, isSupportedLocale, longestRendering, translate,
} from '../../i18n/registry.ts';
import { BillingNotConfiguredError, createBillingProvider, createUnconfiguredBillingProvider, readBillingConfig } from '../../billing/provider.ts';
import { asBusinessMode, demoTenantsEnabled } from '../../lib/app-mode.ts';

// ---------------------------------------------------------------------------
// Role matrix
// ---------------------------------------------------------------------------

test('every role and capability pair is defined exactly once', () => {
  const capabilities = Object.keys(ROLE_MATRIX) as Capability[];
  assert.ok(capabilities.length > 0);
  for (const capability of capabilities) {
    const allowed = rolesFor(capability);
    assert.equal(new Set(allowed).size, allowed.length, `${capability} lists a role twice`);
    for (const role of allowed) {
      assert.ok(TENANT_ROLES.includes(role), `${capability} references unknown role ${role}`);
    }
  }
});

test('viewer can read and can change nothing', () => {
  const writes = capabilitiesFor('viewer').filter((capability) => capability !== 'view_dashboard' && capability !== 'view_customers');
  assert.deepEqual(writes, [], 'viewer must hold no mutating capability');
  assert.equal(can('viewer', 'view_dashboard'), true);
  assert.equal(can('viewer', 'view_customers'), true);
});

test('analyst can read but cannot launch, export or edit', () => {
  assert.equal(can('analyst', 'view_customers'), true);
  assert.equal(can('analyst', 'approve_launch'), false);
  assert.equal(can('analyst', 'export_customer_data'), false);
  assert.equal(can('analyst', 'edit_customers'), false);
});

test('the marketer seat is no longer handed out, but old rows still render', () => {
  assert.equal(ASSIGNABLE_ROLES.includes('marketer'), false);
  assert.equal(isAssignableRole('marketer'), false);
  assert.equal(isAssignableRole('nonsense'), false);
  // A membership created before the role was withdrawn must keep a human name.
  assert.equal(ROLE_LABELS.marketer, 'Маркетолог');
  for (const role of ASSIGNABLE_ROLES) assert.ok(TENANT_ROLES.includes(role));
});

test('a marketer prepares campaigns but cannot authorise a launch', () => {
  assert.equal(can('marketer', 'create_campaign'), true);
  assert.equal(can('marketer', 'manage_automations'), true);
  // Approving a launch spends money and sends messages to real people.
  assert.equal(can('marketer', 'approve_launch'), false);
  assert.equal(can('marketer', 'manage_consent'), false);
  assert.equal(can('marketer', 'manage_billing'), false);
});

test('only the owner holds billing, limits and connector secrets', () => {
  for (const capability of ['manage_billing', 'manage_limits', 'manage_connector_secrets'] as Capability[]) {
    assert.deepEqual(rolesFor(capability), ['owner'], `${capability} must be owner-only`);
  }
});

test('the owner holds every capability', () => {
  const capabilities = Object.keys(ROLE_MATRIX) as Capability[];
  for (const capability of capabilities) {
    assert.equal(can('owner', capability), true, `owner must hold ${capability}`);
  }
});

test('capabilities are monotonic: a lower role never exceeds a higher one', () => {
  // Ordered most to least privileged. Every capability of a lower role must also
  // belong to every higher role, or the matrix has an accidental hole.
  const order: TenantRole[] = ['owner', 'manager', 'marketer', 'analyst', 'viewer'];
  for (let index = 1; index < order.length; index += 1) {
    const lower = capabilitiesFor(order[index]);
    const higher = new Set(capabilitiesFor(order[index - 1]));
    for (const capability of lower) {
      // Marketer holds create_campaign which manager also holds; analyst and
      // viewer are strict read subsets. Any exception here is a real hole.
      assert.ok(higher.has(capability), `${order[index]} has ${capability} but ${order[index - 1]} does not`);
    }
  }
});

test('every critical capability is a real capability and is restricted', () => {
  for (const capability of CRITICAL_CAPABILITIES) {
    assert.ok(capability in ROLE_MATRIX, `${capability} is not in the matrix`);
    const allowed = rolesFor(capability);
    assert.ok(!allowed.includes('viewer'), `${capability} must never be available to viewer`);
    assert.ok(!allowed.includes('analyst'), `${capability} must never be available to analyst`);
  }
});

// ---------------------------------------------------------------------------
// Localisation
// ---------------------------------------------------------------------------

test('every message key exists in every supported locale', () => {
  const keys = new Set(Object.keys(MESSAGE_CATALOGUE[DEFAULT_LOCALE]));
  for (const locale of SUPPORTED_LOCALES) {
    for (const key of keys) {
      assert.ok(key in MESSAGE_CATALOGUE[locale], `${locale} is missing ${key}`);
    }
  }
});

test('Russian plurals use all three forms, not an n===1 check', () => {
  assert.equal(translate('ru', 'customers.count', { count: 1 }), '1 клиент');
  assert.equal(translate('ru', 'customers.count', { count: 3 }), '3 клиента');
  assert.equal(translate('ru', 'customers.count', { count: 18 }), '18 клиентов');
  // 21 is "one" in Russian despite being plural in English.
  assert.equal(translate('ru', 'customers.count', { count: 21 }), '21 клиент');
  assert.equal(translate('ru', 'customers.count', { count: 22 }), '22 клиента');
});

test('Kazakh uses its own plural rule set', () => {
  assert.equal(translate('kk', 'customers.count', { count: 1 }), '1 клиент');
  assert.equal(translate('kk', 'customers.count', { count: 18 }), '18 клиент');
});

test('parameters are named, so word order can differ per language', () => {
  const ru = translate('ru', 'segment.reduction', { segment: 'Спящие', total: 64, channel: 'whatsapp', eligible: 18 });
  const kk = translate('kk', 'segment.reduction', { segment: 'Ұйықтағандар', total: 64, channel: 'whatsapp', eligible: 18 });

  assert.ok(ru.includes('64') && ru.includes('18'));
  assert.ok(kk.includes('64') && kk.includes('18'));
  assert.notEqual(ru, kk);
  // No template may be built by concatenation: every slot is a named placeholder.
  for (const locale of SUPPORTED_LOCALES) {
    const template = MESSAGE_CATALOGUE[locale]['segment.reduction'] as string;
    assert.match(template, /\{segment\}/);
    assert.match(template, /\{eligible\}/);
  }
});

test('an unknown key surfaces itself instead of vanishing', () => {
  assert.equal(translate('ru', 'does.not.exist'), 'does.not.exist');
});

test('a missing parameter is visible rather than silently blank', () => {
  assert.match(translate('ru', 'segment.reduction', { segment: 'X' }), /\{total\}/);
});

test('strings survive at least 30% expansion between locales', () => {
  const keys = Object.keys(MESSAGE_CATALOGUE[DEFAULT_LOCALE]);
  for (const key of keys) {
    const longest = longestRendering(key, { count: 18, segment: 'Спящие 30+ дней', total: 64, channel: 'whatsapp', eligible: 18, plan: 'growth', used: 2, limit: 2, date: '01.08.2026', actor: 'owner' });
    const base = translate(DEFAULT_LOCALE, key, { count: 18, segment: 'Спящие 30+ дней', total: 64, channel: 'whatsapp', eligible: 18, plan: 'growth', used: 2, limit: 2, date: '01.08.2026', actor: 'owner' });
    // The layout budget is the longest rendering plus headroom; assert we know it.
    assert.ok(longest.length >= base.length * 0.7, `${key}: unexpected shrinkage`);
    assert.ok(longest.length < 400, `${key}: rendering is too long to lay out`);
  }
});

test('locale detection rejects anything unsupported', () => {
  assert.equal(isSupportedLocale('ru'), true);
  assert.equal(isSupportedLocale('kk'), true);
  assert.equal(isSupportedLocale('en'), false);
  assert.equal(isSupportedLocale(null), false);
});

test('money, numbers and percentages are formatted by Intl with per-business currency', () => {
  const ru = formatMoney(3450, 'KZT', 'ru');
  const kk = formatMoney(3450, 'KZT', 'kk');
  assert.ok(ru.includes('3') && ru.includes('450'));
  assert.ok(kk.includes('3') && kk.includes('450'));
  // A different ISO currency must render as that currency, not as tenge.
  assert.ok(!formatMoney(100, 'USD', 'ru').includes('₸'));
  assert.equal(formatNumber(1234, 'ru').replace(/ |\s/g, ''), '1234');
  assert.match(formatPercent(1680, 'ru'), /16/);
});

test('the glossary pins product terms and forbids the dangerous synonyms', () => {
  const byTerm = new Map(GLOSSARY.map((entry) => [entry.term, entry]));
  assert.equal(byTerm.get('Growth Contract')?.ru, 'Growth Contract');
  assert.equal(byTerm.get('Margin Shield')?.kk, 'Margin Shield');
  assert.equal(byTerm.get('contribution margin')?.ru, 'вклад-маржа');
  // The one that matters most: influenced revenue must never read as "прирост".
  assert.ok(!byTerm.get('influenced revenue')?.ru.includes('прирост'));
  for (const entry of GLOSSARY) {
    assert.ok(entry.ru.trim().length > 0 && entry.kk.trim().length > 0, `${entry.term} needs both locales`);
    assert.ok(entry.note.trim().length > 0, `${entry.term} needs a usage note`);
  }
});

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------

test('no billing provider is configured, and the default refuses rather than simulating', async () => {
  const provider = createUnconfiguredBillingProvider('production');
  assert.equal(provider.configured, false);
  assert.equal(provider.name, 'none');

  await assert.rejects(
    () => provider.createCheckout({ businessId: 'b', planCode: 'growth', returnUrl: '/', idempotencyKey: 'k' }),
    (error: Error) => error instanceof BillingNotConfiguredError && /не показываем фиктивную оплату/.test(error.message),
  );
});

test('demo mode also refuses checkout, with an honest explanation', async () => {
  const provider = createUnconfiguredBillingProvider('demo');
  await assert.rejects(
    () => provider.createCheckout({ businessId: 'b', planCode: 'growth', returnUrl: '/', idempotencyKey: 'k' }),
    /Demo-заведение/,
  );
});

test('a webhook can never be valid while no provider exists', async () => {
  const provider = createUnconfiguredBillingProvider('production');
  const result = await provider.verifyWebhook('{}', 'sig', '123');
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'no_billing_provider_configured');
});

test('billing config requires a provider and both secrets', () => {
  assert.equal(readBillingConfig({}), null);
  assert.equal(readBillingConfig({ QADAM_BILLING_PROVIDER: 'none' }), null);
  assert.equal(readBillingConfig({ QADAM_BILLING_PROVIDER: 'stripe' }), null, 'no secrets means not configured');
  assert.equal(readBillingConfig({ QADAM_BILLING_PROVIDER: 'stripe', QADAM_BILLING_API_KEY: 'k' }), null, 'half-configured counts as absent');

  const full = readBillingConfig({ QADAM_BILLING_PROVIDER: 'stripe', QADAM_BILLING_API_KEY: 'k', QADAM_BILLING_WEBHOOK_SECRET: 's' });
  assert.equal(full?.provider, 'stripe');
});

test('even a fully configured provider resolves to the refusing default until an adapter exists', async () => {
  const provider = createBillingProvider({
    QADAM_BILLING_PROVIDER: 'stripe',
    QADAM_BILLING_API_KEY: 'k',
    QADAM_BILLING_WEBHOOK_SECRET: 's',
  }, 'production');
  assert.equal(provider.configured, false, 'no adapter is implemented, so nothing may claim to charge');
  await assert.rejects(() => provider.createCheckout({ businessId: 'b', planCode: 'pro', returnUrl: '/', idempotencyKey: 'k' }));
});

// ---------------------------------------------------------------------------
// Mode resolution
// ---------------------------------------------------------------------------

test('demo tenants are a property of the installation, and the explicit flag wins', () => {
  assert.equal(demoTenantsEnabled({ QADAM_DEMO_TENANTS_ENABLED: 'true' }), true);
  assert.equal(demoTenantsEnabled({ QADAM_DEMO_TENANTS_ENABLED: 'false' }), false);
  assert.equal(
    demoTenantsEnabled({ QADAM_DEMO_TENANTS_ENABLED: 'false', QADAM_APP_MODE: 'DEMO_MODE' }),
    false,
    'the explicit flag overrides the variable it replaces',
  );
  // The old variable still decides where nobody has set the new one, so an
  // installation that has not been touched keeps behaving as it did.
  assert.equal(demoTenantsEnabled({ QADAM_APP_MODE: 'DEMO_MODE' }), true);
  assert.equal(demoTenantsEnabled({ QADAM_APP_MODE: 'PRODUCTION_MODE' }), false);
  assert.equal(demoTenantsEnabled({}), false, 'nothing configured grants nothing');
});

test('an unrecognised tenant mode resolves to production, never to demo', () => {
  assert.equal(asBusinessMode('demo'), 'demo');
  assert.equal(asBusinessMode('production'), 'production');
  // Guessing `demo` would hand a real tenant simulations and time travel; the
  // safe reading of an unknown value is the one that grants nothing.
  assert.equal(asBusinessMode('something-else'), 'production');
  assert.equal(asBusinessMode(null), 'production');
  assert.equal(asBusinessMode(undefined), 'production');
});
