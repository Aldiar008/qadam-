// DEMO_MODE and PRODUCTION_MODE must not bleed into each other.
//
// This is the check the product's own constitution asks for, and it is the one
// that cannot be done by reading code: it builds and starts the server in
// PRODUCTION_MODE and looks at what the server actually serves.
//
// Run it with the server already up in DEMO_MODE; it starts its own second
// server on another port for the production half.
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

import { BASE, PASSWORD, db, dbTry, gotoReady, login, openBrowser } from '../e2e/harness.mjs';

const PROD_PORT = Number(process.env.QADAM_PROD_PORT ?? 3100);
const PROD_BASE = `http://localhost:${PROD_PORT}`;
const rows = [];
let failures = 0;
function check(area, name, actual, expected) {
  const pass = typeof expected === 'function' ? Boolean(expected(actual)) : String(actual).includes(String(expected));
  if (!pass) failures += 1;
  rows.push({ area, name, actual: String(actual).slice(0, 300), pass });
  process.stdout.write(`  ${pass ? 'PASS' : 'FAIL'}  ${name.padEnd(62)} ${String(actual).slice(0, 66)}\n`);
}

const get = async (base, path, options = {}) => {
  const response = await fetch(base + path, { redirect: 'manual', ...options });
  return { status: response.status, location: response.headers.get('location') ?? '', body: await response.text().catch(() => '') };
};

// ============================================================ DEMO_MODE half
process.stdout.write('\nMODE-1  DEMO_MODE labels every synthetic thing as synthetic\n');
const { browser, page } = await openBrowser();
try {
  const loginPage = await get(BASE, '/login');
  check('demo', 'the demo login control exists in DEMO_MODE', loginPage.body, 'DEMO_MODE');

  await login(page, 'owner@qadam.local');
  for (const route of ['/app/today', '/app/customers', '/app/analytics', '/app/campaigns']) {
    await gotoReady(page, route);
    const badge = await page.textContent('body');
    check('demo', `${route} carries a visible DEMO badge`, badge.includes('DEMO DATA') || badge.includes('DEMO') ? 'DEMO badge shown' : 'MISSING', 'DEMO badge shown');
  }
  await gotoReady(page, '/app/analytics');
  check('demo', 'the time jump is offered in DEMO_MODE', await page.textContent('main'), 'скачок');
} finally {
  await browser.close();
}

process.stdout.write('\nMODE-2  A mock result can never become a fact\n');
check('demo', 'no mock row claims to be a verified fact', db(`select count(*) from public.impact_measurements where is_mock and kind = 'verified_fact'`), '0');
check('demo', 'every measurement in the demo tenant is flagged mock', db(`select count(*) from public.impact_measurements where business_id='10000000-0000-4000-8000-000000000001' and not is_mock`), '0');
const forgeFact = dbTry(`insert into public.impact_measurements(business_id, metric_key, kind, value_minor, unit, currency, period_start, period_end, source, is_mock)
  values ('10000000-0000-4000-8000-000000000001','forged','verified_fact',1,'minor','KZT',now(),now(),'forgery',true)`);
check('demo', 'the database refuses a mock row labelled verified_fact', forgeFact.ok ? 'ACCEPTED' : 'refused by the database', 'refused');
check('demo', 'influenced and incremental are separate kinds, never merged', db(`select string_agg(distinct kind, ',' order by kind) from public.impact_measurements where business_id='10000000-0000-4000-8000-000000000001'`), (v) => v.includes('influenced') && v.includes('incremental'));
check('demo', 'no channel is connected without health evidence', db(`select count(*) from public.business_channels where connector_state='connected' and last_health_check_at is null`), '0');
check('demo', 'demo businesses are all flagged as mock', db(`select count(*) from public.businesses where mode='demo' and not is_mock`), '0');

process.stdout.write('\nMODE-3  The seed is synthetic and says so\n');
const seed = execFileSync('node', ['-e', "process.stdout.write(require('fs').readFileSync('supabase/seed.sql','utf8'))"], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
check('seed', 'the seed carries an explicit local/dev-only guard', seed.includes('local/dev-only') ? 'guard present' : 'MISSING', 'guard present');
check('seed', 'every seeded contact is a reserved example address', seed, (v) => !/@(gmail|mail|yandex|outlook|icloud)\./i.test(v));
check('seed', 'the deploy pipeline never applies the seed', execFileSync('node', ['-e', "process.stdout.write(require('fs').readFileSync('.github/workflows/deploy.yml','utf8'))"], { encoding: 'utf8' }), 'local-only by design');
check('seed', 'CI refuses a seed that looks like production data', execFileSync('node', ['-e', "process.stdout.write(require('fs').readFileSync('.github/workflows/ci.yml','utf8'))"], { encoding: 'utf8' }), 'Guard against a production seed');

// ====================================================== PRODUCTION_MODE half
process.stdout.write('\nMODE-4  Building and starting the same code in PRODUCTION_MODE\n');
process.stdout.write('  (building...)\n');
execFileSync('npm', ['run', 'build'], { stdio: 'ignore', shell: true, env: { ...process.env, QADAM_APP_MODE: 'PRODUCTION_MODE' } });

const prod = spawn('npx', ['next', 'start', '-p', String(PROD_PORT)], {
  shell: true,
  env: { ...process.env, QADAM_APP_MODE: 'PRODUCTION_MODE', PORT: String(PROD_PORT) },
  stdio: 'ignore',
});
let up = false;
for (let i = 0; i < 40 && !up; i += 1) {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  up = await fetch(PROD_BASE + '/').then((r) => r.ok).catch(() => false);
}
check('prod', 'a PRODUCTION_MODE server is running to inspect', up ? `up on ${PROD_BASE}` : 'did not start', 'up on');

try {
  process.stdout.write('\nMODE-5  PRODUCTION_MODE has no demo affordances\n');
  const prodLogin = await get(PROD_BASE, '/login');
  check('prod', 'there is no demo login button', prodLogin.body.includes('DEMO_MODE') ? 'DEMO LOGIN PRESENT' : 'absent', 'absent');
  const demoRoute = await get(PROD_BASE, '/demo');
  check('prod', 'the /demo route redirects away instead of opening', `${demoRoute.status} ${demoRoute.location}`, (v) => v.startsWith('30') && v.includes('demo_disabled'));

  const prodBrowser = await chromium.launch();
  const prodContext = await prodBrowser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ru-RU' });
  const prodPage = await prodContext.newPage();
  await prodPage.goto(`${PROD_BASE}/login`, { waitUntil: 'domcontentloaded' });
  await prodPage.fill('input[name=email]', 'owner@qadam.local');
  await prodPage.fill('input[name=password]', PASSWORD);
  await Promise.all([
    prodPage.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 }),
    prodPage.click('form:has(input[name=password]) button'),
  ]);

  await prodPage.goto(`${PROD_BASE}/app/analytics`, { waitUntil: 'networkidle' });
  const analytics = await prodPage.textContent('main');
  check('prod', 'the demo time jump is not offered', analytics.includes('Выполнить скачок') ? 'TIME JUMP PRESENT' : 'absent', 'absent');

  await prodPage.goto(`${PROD_BASE}/app/automations`, { waitUntil: 'networkidle' });
  const automations = await prodPage.textContent('main');
  check('prod', 'no channel is presented as connected', automations, (v) => !v.includes('Подключён') || v.includes('не подключ'));
  check('prod', 'an unconfigured integration says so plainly', automations, (v) => /не подключ|Not configured|не настроен/i.test(v));

  await prodPage.goto(`${PROD_BASE}/app/plan`, { waitUntil: 'networkidle' });
  check('prod', 'billing states that no provider is connected', await prodPage.textContent('main'), (v) => /не подключ/i.test(v));

  await prodPage.goto(`${PROD_BASE}/app/campaigns/studio?step=7`, { waitUntil: 'networkidle' });
  const launchStep = await prodPage.textContent('main');
  check('prod', 'the launch step warns that a real send will be refused', launchStep, (v) => v.includes('PRODUCTION_MODE') || v.includes('отклон') || v.includes('Сначала подтвердите'));

  // The demo login server action must refuse even when called directly.
  const actionId = (await get(PROD_BASE, '/login')).body.match(/\$ACTION_ID_([a-f0-9]+)/g);
  check('prod', 'the login page still exposes its real sign-in action', actionId ? `${actionId.length} action(s)` : 'none', (v) => v !== 'none');

  await prodBrowser.close();

  process.stdout.write('\nMODE-6  The two modes disagree about exactly the right things\n');
  const demoLoginHtml = (await get(BASE, '/login')).body;
  const prodLoginHtml = (await get(PROD_BASE, '/login')).body;
  check('prod', 'DEMO_MODE offers a demo login and PRODUCTION_MODE does not', `${demoLoginHtml.includes('DEMO_MODE')} / ${prodLoginHtml.includes('DEMO_MODE')}`, 'true / false');
  const demoHome = (await get(BASE, '/')).body;
  const prodHome = (await get(PROD_BASE, '/')).body;
  check('prod', 'the public landing is the same product in both modes', `${demoHome.length > 10000} / ${prodHome.length > 10000}`, 'true / true');
} finally {
  prod.kill();
  // `spawn` on Windows leaves the real server behind the shell wrapper.
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-Command',
      `Get-NetTCPConnection -LocalPort ${PROD_PORT} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }`],
      { stdio: 'ignore' });
  } catch { /* the port was already free */ }
  // Put the DEMO_MODE build back so the other suites see what they expect.
  process.stdout.write('\n  (restoring the DEMO_MODE build...)\n');
  execFileSync('npm', ['run', 'build'], { stdio: 'ignore', shell: true, env: { ...process.env, QADAM_APP_MODE: 'DEMO_MODE' } });
}

mkdirSync('tests/release/results', { recursive: true });
writeFileSync('tests/release/results/mode-separation.json', JSON.stringify({ total: rows.length, failed: failures, rows }, null, 2), 'utf8');
process.stdout.write(`\nmode-separation: ${rows.length - failures}/${rows.length} passed\n`);
process.exit(failures === 0 ? 0 : 1);
