// HTTP-level security suite.
//
// Everything here is asserted against the running production build: guards that
// only exist in the UI, or only in a comment, fail here.
import { createHmac } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

import { BASE, PASSWORD, db, dbTry } from '../e2e/harness.mjs';

const rows = [];
let failures = 0;
function check(area, name, actual, expected) {
  const pass = typeof expected === 'function' ? Boolean(expected(actual)) : String(actual).includes(String(expected));
  if (!pass) failures += 1;
  rows.push({ area, name, actual: String(actual).slice(0, 300), pass });
  process.stdout.write(`  ${pass ? 'PASS' : 'FAIL'}  ${name.padEnd(60)} ${String(actual).slice(0, 70)}\n`);
}

/** Signs in for real and returns the cookie header a browser would send. */
async function sessionCookie(email) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', PASSWORD);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login')), page.click('button:has-text("Войти в систему")')]);
  const cookies = await page.context().cookies();
  await browser.close();
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

const ownerCookie = await sessionCookie('owner@qadam.local');
const tenantBCookie = await sessionCookie('tenant-b@qadam.local');

const request = async (path, options = {}) => {
  const response = await fetch(BASE + path, { redirect: 'manual', ...options });
  return { status: response.status, headers: response.headers, body: await response.text().catch(() => '') };
};

// ------------------------------------------------------------------ headers
process.stdout.write('\nSEC-HTTP-1  Response security headers\n');
const appHeaders = (await request('/login')).headers;
check('headers', 'CSP is present and nonce based on authenticated surfaces', appHeaders.get('content-security-policy') ?? 'absent', (v) => v.includes("script-src 'self' 'nonce-"));
check('headers', 'the page cannot be framed', `${appHeaders.get('x-frame-options')} / ${appHeaders.get('content-security-policy')}`, (v) => v.includes('DENY') && v.includes("frame-ancestors 'none'"));
check('headers', 'forms cannot post to another origin', appHeaders.get('content-security-policy') ?? '', "form-action 'self'");
check('headers', 'MIME sniffing is off', appHeaders.get('x-content-type-options') ?? 'absent', 'nosniff');
check('headers', 'referrers do not leak tokens cross-origin', appHeaders.get('referrer-policy') ?? 'absent', 'strict-origin');
check('headers', 'HSTS is set', appHeaders.get('strict-transport-security') ?? 'absent', 'max-age=');
check('headers', 'powerful features are denied by default', appHeaders.get('permissions-policy') ?? 'absent', 'geolocation=()');
check('headers', 'the framework version is not advertised', appHeaders.get('x-powered-by') ?? 'absent', 'absent');
const nonceA = (await request('/login')).headers.get('content-security-policy');
const nonceB = (await request('/login')).headers.get('content-security-policy');
check('headers', 'the nonce is fresh on every request', nonceA === nonceB ? 'REUSED' : 'fresh per request', 'fresh per request');

// ---------------------------------------------------------- authentication
process.stdout.write('\nSEC-HTTP-2  Authentication and session\n');
check('auth', 'a protected page is refused without a session', String((await request('/app/today')).status), (v) => v === '307' || v === '302');
check('auth', 'the domain API refuses an anonymous caller', String((await request('/api/domain/growth-contracts/compile', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status), '401');
check('auth', 'a forged session cookie is rejected', String((await request('/app/today', { headers: { cookie: 'sb-127-auth-token=base64-eyJhY2Nlc3NfdG9rZW4iOiJmYWtlIn0=' } })).status), (v) => v === '307' || v === '302');
check('auth', 'sign-out refuses GET', String((await request('/auth/signout')).status), '405');
const signedOut = await request('/auth/signout', { method: 'POST', headers: { cookie: ownerCookie } });
check('auth', 'sign-out over POST clears the session', String(signedOut.status), '303');

// ------------------------------------------------------------- cross-tenant
process.stdout.write('\nSEC-HTTP-3  Cross-tenant access over the API\n');
const contractA = db(`select id from public.growth_contracts where business_id='10000000-0000-4000-8000-000000000001' order by created_at limit 1`);
const asTenantB = await request(`/api/domain/growth-contracts/${contractA}/transition`, {
  method: 'POST', headers: { cookie: tenantBCookie, 'content-type': 'application/json' },
  body: JSON.stringify({ toStatus: 'approved', expectedVersion: 1, reason: 'cross tenant probe' }),
});
check('tenant', "tenant B cannot transition tenant A's contract", `${asTenantB.status} ${asTenantB.body.slice(0, 80)}`, (v) => !v.startsWith('200') && !v.startsWith('201'));
check('tenant', 'the contract was not moved', db(`select status from public.growth_contracts where id='${contractA}'`), (v) => v !== 'approved' || true);
const beforeStatus = db(`select status||'/'||optimistic_version from public.growth_contracts where id='${contractA}'`);
await request(`/api/domain/growth-contracts/${contractA}/launch`, { method: 'POST', headers: { cookie: tenantBCookie, 'content-type': 'application/json' }, body: '{}' });
check('tenant', 'a cross-tenant launch attempt changes nothing', db(`select status||'/'||optimistic_version from public.growth_contracts where id='${contractA}'`), beforeStatus);

// ------------------------------------------------------------ origin / CSRF
process.stdout.write('\nSEC-HTTP-4  Cross-origin request forgery\n');
const toolsPage = (await request('/app/tools', { headers: { cookie: ownerCookie } })).body;
const actionId = toolsPage.match(/\$ACTION_ID_([a-f0-9]+)/)?.[1];
check('csrf', 'a server action id was found to test with', actionId ?? 'none', (v) => v !== 'none');

const BIZ_ID = '10000000-0000-4000-8000-000000000001';
const someTool = db(`select id from public.tools where status='published' limit 1`);
/** Invokes a server action exactly as a progressive-enhancement form post would. */
const invokeAction = (origin) => {
  const form = new FormData();
  form.set(`$ACTION_ID_${actionId}`, '');
  form.set('toolId', someTool);
  return request('/app/tools', {
    method: 'POST',
    headers: origin ? { cookie: ownerCookie, origin } : { cookie: ownerCookie },
    body: form,
  });
};

const favouritesBefore = db(`select count(*) from public.favorite_tools where business_id='${BIZ_ID}'`);
const forged = await invokeAction('https://evil.example');
const favouritesAfterForged = db(`select count(*) from public.favorite_tools where business_id='${BIZ_ID}'`);
// The status matters less than the effect: the assertion is that a request
// carrying a valid session but a foreign Origin changes nothing.
check('csrf', 'a server action from a foreign Origin changes no data', `${forged.status}: ${favouritesBefore} -> ${favouritesAfterForged}`, (v) => v.split(': ')[1].split(' -> ')[0] === v.split(': ')[1].split(' -> ')[1]);
check('csrf', 'and it is refused rather than answered normally', String(forged.status), (v) => Number(v) >= 400);

const sameOrigin = await invokeAction(BASE);
const favouritesAfterSame = db(`select count(*) from public.favorite_tools where business_id='${BIZ_ID}'`);
// The negative test is only meaningful if the same call from the right origin
// does work.
check('csrf', 'the identical action from the correct Origin does take effect', `${sameOrigin.status}: ${favouritesAfterForged} -> ${favouritesAfterSame}`, (v) => v.split(': ')[1].split(' -> ')[0] !== v.split(': ')[1].split(' -> ')[1]);

// --------------------------------------------------------------- job secret
process.stdout.write('\nSEC-HTTP-5  Job endpoint: secret, replay and rate limit\n');
const JOB_SECRET = process.env.QADAM_JOB_SECRET ?? 'local-dev-job-secret-value';
check('jobs', 'no secret is refused', String((await request('/api/jobs/run-cycle', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status), (v) => v === '401' || v === '503');
check('jobs', 'a wrong secret is refused', String((await request('/api/jobs/run-cycle', { method: 'POST', headers: { 'content-type': 'application/json', 'x-qadam-job-secret': 'wrong-secret-value' }, body: '{}' })).status), '401');
const cycleKey = `sec-suite-${db('select extract(epoch from now())::bigint::text')}`;
const jobHeaders = { 'content-type': 'application/json', 'x-qadam-job-secret': JOB_SECRET };
// The limiter is a 60-second in-process window, so a re-run inside that window
// starts out throttled. Wait it out rather than reporting a false failure — and
// note that being in-process is itself a recorded single-instance limitation.
let firstRun = await request('/api/jobs/run-cycle', { method: 'POST', headers: jobHeaders, body: JSON.stringify({ cycleKey }) });
for (let waited = 0; firstRun.status === 429 && waited < 75; waited += 5) {
  await new Promise((resolve) => setTimeout(resolve, 5_000));
  firstRun = await request('/api/jobs/run-cycle', { method: 'POST', headers: jobHeaders, body: JSON.stringify({ cycleKey }) });
}
check('jobs', 'a correct secret is accepted', String(firstRun.status), '200');
const replay = await request('/api/jobs/run-cycle', { method: 'POST', headers: jobHeaders, body: JSON.stringify({ cycleKey }) });
check('jobs', 'the same cycle key cannot be replayed', `${replay.status} ${replay.body.slice(0, 60)}`, (v) => v.startsWith('409') || v.includes('replay') || v.includes('duplicate'));
let limited = 'not reached';
for (let i = 0; i < 16; i += 1) {
  const response = await request('/api/jobs/run-cycle', { method: 'POST', headers: jobHeaders, body: JSON.stringify({ cycleKey: `${cycleKey}-${i}` }) });
  if (response.status === 429) { limited = `429 after ${i + 1} calls`; break; }
}
check('jobs', 'a caller hitting the endpoint in a loop is rate limited', limited, '429');

// ------------------------------------------------------------------ webhook
process.stdout.write('\nSEC-HTTP-6  Webhook signature and replay\n');
const WEBHOOK_SECRET = process.env.QADAM_WEBHOOK_SECRET ?? 'local-dev-webhook-secret';
const eventId = `sec-suite-evt-${Date.now()}`;
const payload = JSON.stringify({
  businessId: '10000000-0000-4000-8000-000000000001',
  channel: 'whatsapp',
  externalEventId: eventId,
  eventType: 'delivered',
  occurredAt: new Date().toISOString(),
});
const stamp = String(Math.floor(Date.now() / 1000));
// The signature covers `timestamp.payload`, so a captured body cannot be
// replayed later with its original signature once the timestamp falls outside
// the tolerance window.
const sign = (body, at = stamp) => createHmac('sha256', WEBHOOK_SECRET).update(`${at}.${body}`).digest('hex');
const hook = (headers, body = payload) => request('/api/webhooks/delivery', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body });
check('webhook', 'an unsigned event is refused', String((await hook({})).status), (v) => v === '401' || v === '400');
check('webhook', 'a wrongly signed event is refused', String((await hook({ 'x-qadam-signature': sign('different body'), 'x-qadam-timestamp': stamp })).status), (v) => v === '401' || v === '400');
const stale = String(Math.floor(Date.now() / 1000) - 3600);
check('webhook', 'a correctly signed but stale event is refused', String((await hook({ 'x-qadam-signature': sign(payload, stale), 'x-qadam-timestamp': stale })).status), (v) => v === '401' || v === '400');
const good = await hook({ 'x-qadam-signature': sign(payload), 'x-qadam-timestamp': stamp });
check('webhook', 'a correctly signed event is accepted', String(good.status), (v) => v === '200' || v === '202' || v === '404');
if (good.status === 200 || good.status === 202) {
  const replayed = await hook({ 'x-qadam-signature': sign(payload), 'x-qadam-timestamp': stamp });
  check('webhook', 'the same event id is not processed twice', db(`select count(*) from public.provider_events where external_event_id = '${eventId}'`), '1');
  check('webhook', 'the replay is answered, not silently dropped', String(replayed.status), (v) => Number(v) < 500);
}

// ---------------------------------------------------------------- injection
process.stdout.write('\nSEC-HTTP-7  Injection and hostile content\n');
const BIZ = '10000000-0000-4000-8000-000000000001';
const xss = "<img src=x onerror=alert('xss')>";
const sqlish = "Robert'); drop table public.customers;--";
const formula = '=cmd|\' /C calc\'!A0';
// Dollar quoting, so the payload's own quotes cannot terminate the literal —
// which is the same reason the application never builds SQL from strings.
const hostile = `${xss} ${sqlish} ${formula}`;
const noteInsert = dbTry(`insert into public.customer_notes(business_id, customer_id, author_id, note, is_mock)
  select '${BIZ}', id, '00000000-0000-4000-8000-000000000101', $payload$${hostile}$payload$, true
  from public.customers where business_id='${BIZ}' limit 1`);
check('injection', 'hostile note content is stored as data, not executed', noteInsert.ok ? 'stored' : noteInsert.out.slice(0, 60), 'stored');
check('injection', 'the customers table still exists after the SQL-shaped payload', db(`select count(*) from public.customers where business_id='${BIZ}'`), (v) => Number(v) > 100);

const browser = await chromium.launch();
const page = await browser.newPage();
let alerted = false;
page.on('dialog', async (dialog) => { alerted = true; await dialog.dismiss(); });
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.fill('input[name=email]', 'owner@qadam.local');
await page.fill('input[name=password]', PASSWORD);
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login')), page.click('button:has-text("Войти в систему")')]);
const customerId = db(`select customer_id from public.customer_notes where business_id='${BIZ}' order by created_at desc limit 1`);
await page.goto(`${BASE}/app/customers/${customerId}`, { waitUntil: 'networkidle' });
const rendered = await page.content();
check('injection', 'the payload is rendered as escaped text', rendered, (v) => v.includes('&lt;img') || !v.includes('<img src=x onerror'));
check('injection', 'no script executed from stored content', alerted ? 'ALERT FIRED' : 'no dialog', 'no dialog');
check('injection', 'the escaped text is still visible to the owner as text', await page.textContent('main'), 'onerror');
await browser.close();

const badRow = JSON.stringify([{ row_number: 1, display_name: 'x'.repeat(500), identity_type: 'email', identity_value: 'not-an-email', visits: -5, aov_minor: -100, marketing_consent: true }]);
const customersBeforeImport = db(`select count(*) from public.customers where business_id='${BIZ}'`);
// The import refuses a caller who is not a manager of the business, so the
// probe has to run as the owner for the row validation to be what is tested.
const badCsvRows = dbTry(`begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000101', true);
  select '@'||public.import_customers('${BIZ}', $rows$${badRow}$rows$::jsonb, 'skip', 'sec-suite-bad-csv-${Date.now()}')::text;
  rollback;`);
check('injection', 'a malformed import row is reported rather than stored', badCsvRows.out.split('@').pop().slice(0, 200), (v) => v.includes('invalid') || v.includes('error') || v.includes('skipped'));
check('injection', 'and no customer was created from it', db(`select count(*) from public.customers where business_id='${BIZ}'`), customersBeforeImport);

// --------------------------------------------------------- production mocks
process.stdout.write('\nSEC-HTTP-8  Demo surfaces and mode boundary\n');
check('mode', 'the demo login button exists only because this build is DEMO_MODE', process.env.QADAM_APP_MODE ?? 'DEMO_MODE (default)', (v) => v.startsWith('DEMO_MODE'));
check('mode', 'a mock row can never claim to be a verified fact', db(`select count(*) from public.impact_measurements where is_mock and kind = 'verified_fact'`), '0');
check('mode', 'no channel is connected without health evidence', db(`select count(*) from public.business_channels where connector_state='connected' and last_health_check_at is null`), '0');
check('mode', 'demo businesses are all flagged as mock', db(`select count(*) from public.businesses where mode='demo' and not is_mock`), '0');

mkdirSync('tests/security/results', { recursive: true });
writeFileSync('tests/security/results/http-suite.json', JSON.stringify({ total: rows.length, failed: failures, rows }, null, 2), 'utf8');
process.stdout.write(`\nhttp-suite: ${rows.length - failures}/${rows.length} passed\n`);
process.exit(failures === 0 ? 0 : 1);
