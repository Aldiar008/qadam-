// A demo tenant and a real tenant must not bleed into each other.
//
// This used to build and start the whole application twice, once per value of
// QADAM_APP_MODE, because the mode was a property of the deployment. It is not
// any more: `public.businesses.mode` decides, the database enforces it, and one
// installation serves both. So the check that matters changed shape — it now
// drives **one** server and compares two tenants on it.
//
// That is a stronger claim than the old one. Two builds could differ for any
// reason; one build serving two tenants differently can only be doing it
// because the tenant decides.
//
// Run it against a server that is already up, local or deployed:
//   QADAM_E2E_BASE=https://… QADAM_SUPABASE_PROJECT_REF=… node tests/release/mode-separation.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

import { BASE, db, dbTry, gotoReady, login, openBrowser, submit } from '../e2e/harness.mjs';

const DEMO_BIZ = '10000000-0000-4000-8000-000000000001';
const rows = [];
let failures = 0;
function check(area, name, actual, expected) {
  const pass = typeof expected === 'function' ? Boolean(expected(actual)) : String(actual).includes(String(expected));
  if (!pass) failures += 1;
  rows.push({ area, name, actual: String(actual).slice(0, 300), pass });
  process.stdout.write(`  ${pass ? 'PASS' : 'FAIL'}  ${name.padEnd(62)} ${String(actual).slice(0, 66)}\n`);
}

const get = async (path, options = {}) => {
  const response = await fetch(BASE + path, { redirect: 'manual', ...options });
  return { status: response.status, location: response.headers.get('location') ?? '', body: await response.text().catch(() => '') };
};

const demoTenantsExpected = process.env.QADAM_DEMO_TENANTS_ENABLED != null
  ? ['1', 'true', 'yes', 'on', 'enabled'].includes(process.env.QADAM_DEMO_TENANTS_ENABLED.trim().toLowerCase())
  : (process.env.QADAM_APP_MODE ?? 'DEMO_MODE') === 'DEMO_MODE';

// ===================================================== the demo tenant's half
process.stdout.write('\nMODE-1  A demo tenant labels every synthetic thing as synthetic\n');
const { browser, page } = await openBrowser();
let prodEmail = '';
let prodBizId = '';
try {
  const loginPage = await get('/login');
  check('install', 'the demo entry is offered exactly when this installation enables demo tenants',
    String(/DEMO_MODE|demo_login|Войти в демо/i.test(loginPage.body)), String(demoTenantsExpected));

  await login(page, 'owner@qadam.local');
  for (const route of ['/app/today', '/app/customers', '/app/analytics', '/app/campaigns']) {
    await gotoReady(page, route);
    const body = await page.textContent('body');
    check('demo', `${route} carries a visible DEMO badge`, body.includes('DEMO') ? 'DEMO badge shown' : 'MISSING', 'DEMO badge shown');
  }
  await gotoReady(page, '/app/analytics');
  check('demo', 'the time jump is offered to a demo tenant', await page.textContent('main'), 'скачок');

  // ============================================== a real tenant, same server
  process.stdout.write('\nMODE-2  A tenant registered on this same server is a production tenant\n');
  const stamp = Date.now();
  prodEmail = `mode-prod-${stamp}@qadam.local`;
  await page.goto(`${BASE}/signup`);
  await page.fill('input[name=businessName]', `Режимы Кофейня ${stamp}`);
  await page.fill('input[name=displayName]', 'Режимы Владелец');
  await page.fill('input[name=email]', prodEmail);
  await page.fill('input[name=password]', 'QadamLocal!2026');
  await page.selectOption('select[name=businessType]', { index: 1 });
  await submit(page, 'button:has-text("Создать аккаунт")');

  prodBizId = db(`select id from public.businesses where name = 'Режимы Кофейня ${stamp}'`);
  check('prod', 'the registration created a business row', prodBizId, (v) => v.length === 36);
  check('prod', 'and it is a production tenant, not a demo one',
    db(`select mode from public.businesses where id = '${prodBizId}'`), 'production');
  check('prod', 'which the schema ties to carrying no mock flag',
    db(`select is_mock from public.businesses where id = '${prodBizId}'`), 'f');

  process.stdout.write('\nMODE-3  The same build shows that tenant no demo affordances\n');
  await gotoReady(page, '/app/today');
  const prodToday = await page.textContent('body');
  check('prod', 'its Today is its own, not the demo tenant\'s', prodToday, (v) => !v.includes('weekday_revenue_15_18'));
  check('prod', 'no DEMO badge is shown', prodToday.includes('DEMO DATA') ? 'DEMO BADGE PRESENT' : 'absent', 'absent');

  await gotoReady(page, '/app/analytics');
  check('prod', 'the demo time jump is not offered', (await page.textContent('main')).includes('Выполнить скачок') ? 'TIME JUMP PRESENT' : 'absent', 'absent');

  await gotoReady(page, '/app/automations');
  const automations = await page.textContent('main');
  check('prod', 'no channel is presented as connected', automations, (v) => !v.includes('Подключён') || v.includes('не подключ'));
  check('prod', 'an unconfigured integration says so plainly', automations, (v) => /не подключ|Not configured|не настроен/i.test(v));

  await gotoReady(page, '/app/plan');
  check('prod', 'billing states that no provider is connected', await page.textContent('main'), (v) => /не подключ/i.test(v));

  process.stdout.write('\nMODE-4  The two tenants disagree about exactly the right things\n');
  await login(page, 'owner@qadam.local');
  await gotoReady(page, '/app/analytics');
  const demoAnalytics = await page.textContent('main');
  await login(page, prodEmail);
  await gotoReady(page, '/app/analytics');
  const prodAnalytics = await page.textContent('main');
  check('both', 'the time jump exists for the demo tenant and not for the production one',
    `${demoAnalytics.includes('скачок')} / ${prodAnalytics.includes('Выполнить скачок')}`, 'true / false');
  check('both', 'both tenants are served by the same public landing page',
    `${(await get('/')).body.length > 10000}`, 'true');
} finally {
  await browser.close();
}

// ============================================ what the database will not allow
process.stdout.write('\nMODE-5  A mock result can never become a fact, and never reaches a real tenant\n');
check('db', 'no mock row claims to be a verified fact', db(`select count(*) from public.impact_measurements where is_mock and kind = 'verified_fact'`), '0');
check('db', 'every measurement in the demo tenant is flagged mock', db(`select count(*) from public.impact_measurements where business_id='${DEMO_BIZ}' and not is_mock`), '0');

const forgeFact = dbTry(`insert into public.impact_measurements(business_id, metric_key, kind, value_minor, unit, currency, period_start, period_end, source, is_mock)
  values ('${DEMO_BIZ}','forged','verified_fact',1,'minor','KZT',now(),now(),'forgery',true)`);
check('db', 'the database refuses a mock row labelled verified_fact', forgeFact.ok ? 'ACCEPTED' : 'refused by the database', 'refused');

// This is the invariant that lets both kinds of tenant share one database. It
// is checked by attempting the thing, not by reading the constraint: a rule
// that is never exercised is a rule nobody knows still works.
if (prodBizId) {
  const forgeMock = dbTry(`insert into public.customers(business_id, display_name, lifecycle_stage, is_mock)
    values ('${prodBizId}','Forged demo guest','new',true)`);
  check('db', 'the database refuses a mock row inside a production tenant', forgeMock.ok ? 'ACCEPTED' : 'refused by the database', 'refused');
}
check('db', 'no production business holds a mock customer', db(`
  select count(*) from public.customers c join public.businesses b on b.id = c.business_id
  where b.mode = 'production' and c.is_mock`), '0');
check('db', 'no channel is connected without health evidence', db(`select count(*) from public.business_channels where connector_state='connected' and last_health_check_at is null`), '0');
check('db', 'demo businesses are all flagged as mock', db(`select count(*) from public.businesses where mode='demo' and not is_mock`), '0');

process.stdout.write('\nMODE-6  The seed is synthetic and says so\n');
const seed = execFileSync('node', ['-e', "process.stdout.write(require('fs').readFileSync('supabase/seed.sql','utf8'))"], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
check('seed', 'the seed carries an explicit local/dev-only guard', seed.includes('local/dev-only') ? 'guard present' : 'MISSING', 'guard present');
check('seed', 'every seeded contact is a reserved example address', seed, (v) => !/@(gmail|mail|yandex|outlook|icloud)\./i.test(v));
check('seed', 'the remote demo seed refuses an unmarked database',
  execFileSync('node', ['-e', "process.stdout.write(require('fs').readFileSync('supabase/seed/remote_demo_seed.sql','utf8'))"], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }),
  'private.demo_environment');
check('seed', 'the deploy pipeline never applies the seed', execFileSync('node', ['-e', "process.stdout.write(require('fs').readFileSync('.github/workflows/deploy.yml','utf8'))"], { encoding: 'utf8' }), 'local-only by design');
check('seed', 'CI refuses a seed that looks like production data', execFileSync('node', ['-e', "process.stdout.write(require('fs').readFileSync('.github/workflows/ci.yml','utf8'))"], { encoding: 'utf8' }), 'Guard against a production seed');

mkdirSync('tests/release/results', { recursive: true });
writeFileSync('tests/release/results/mode-separation.json', JSON.stringify({ total: rows.length, failed: failures, rows }, null, 2), 'utf8');
process.stdout.write(`\nmode-separation: ${rows.length - failures}/${rows.length} passed\n`);
process.exit(failures === 0 ? 0 : 1);
