// The 4:30 demo, walked end to end, plus the conditions a live demo actually
// meets: a fresh incognito profile, a mid-demo refresh, a URL typed straight
// into the bar, a phone at 390px and a projector at 1440px.
//
// A demo that only works on the presenter's warm browser is not a demo.
import { mkdirSync, writeFileSync } from 'node:fs';

import { BASE, PASSWORD, db, gotoReady, login, openBrowser, shot, submit } from '../e2e/harness.mjs';

const BIZ = '10000000-0000-4000-8000-000000000001';
const rows = [];
let failures = 0;
const timings = [];

function check(step, name, actual, expected) {
  const pass = typeof expected === 'function' ? Boolean(expected(actual)) : String(actual).includes(String(expected));
  if (!pass) failures += 1;
  rows.push({ step, name, actual: String(actual).slice(0, 260), pass });
  process.stdout.write(`  ${pass ? 'PASS' : 'FAIL'}  ${String(step).padEnd(3)} ${name.padEnd(56)} ${String(actual).slice(0, 56)}\n`);
}

/** Times a demo beat, so the script's total can be compared against 4:30. */
async function beat(label, fn) {
  const started = Date.now();
  await fn();
  const elapsed = Date.now() - started;
  timings.push({ label, ms: elapsed });
  return elapsed;
}

// A genuinely cold profile: no cookies, no storage, no cache from earlier runs.
const { browser, context, page } = await openBrowser({ context: { storageState: undefined } });

try {
  process.stdout.write('\nDEMO  The 4:30 script on a cold incognito profile\n');

  // ------------------------------------------------------------------- 1
  await beat('1. landing and demo login', async () => {
    const response = await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    check(1, 'the landing page opens on a cold profile', String(response.status()), '200');
    check(1, 'it states the promise in one line', await page.textContent('h1'), 'выгодное действие');
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    check(1, 'the demo login is offered', await page.textContent('main'), 'DEMO_MODE');
    await submit(page, 'button:has-text("DEMO_MODE")');
    check(1, 'one click reaches the cabinet', page.url(), (v) => v.includes('/app/') || v.includes('/onboarding'));
  });
  await shot(page, 'demo-01-login');

  // ------------------------------------------------------------------- 2
  await beat('2. onboarding', async () => {
    // Onboarding is a stored, resumable session rather than a splash screen:
    // the row records which step the tenant reached, so closing the tab does not
    // lose the answers. The owner journey walks a brand-new signup through it.
    check(2, 'onboarding state is a stored session, not a screen', db(`select count(*) from public.onboarding_sessions`), (v) => Number(v) > 0);
    check(2, 'the session remembers which step the tenant reached', db(`select count(*) from public.onboarding_sessions where current_step is not null`), (v) => Number(v) > 0);
    const owner = JSON.parse((await import('node:fs')).readFileSync('tests/e2e/results/owner.json', 'utf8'));
    const signup = owner.rows.find((r) => r.name.includes('sign-up lands on onboarding'));
    check(2, 'a fresh sign-up really lands in onboarding', signup ? `${signup.pass}` : 'not asserted', 'true');
    const response = await page.goto(`${BASE}/onboarding`, { waitUntil: 'domcontentloaded' });
    check(2, 'the route answers rather than erroring', String(response.status()), (v) => Number(v) < 400);
  });

  // ------------------------------------------------------------------- 3
  await beat('3. Today shows -27%', async () => {
    await gotoReady(page, '/app/today');
    const today = await page.textContent('main');
    check(3, 'Today names the signal', today, 'weekday_revenue_15_18');
    check(3, 'the drop is exactly -27% and comes from the database', db(`select round(change_bps/100.0)::text from public.signals where business_id='${BIZ}' and metric_key='weekday_revenue_15_18'`), '-27');
    check(3, 'the screen shows the same figure', today, '27');
  });
  await shot(page, 'demo-03-today');

  // ------------------------------------------------------------------- 4
  await beat('4. 64 inactive, 18 eligible', async () => {
    check(4, '64 customers have not returned in 30 days', db(`select count(*) from public.customers where business_id='${BIZ}' and lifecycle_stage='inactive'`), '64');
    check(4, '18 of them may lawfully be contacted', db(`select count(*) from public.effective_consent_customers('${BIZ}','marketing.whatsapp', (select array_agg(id) from public.customers where business_id='${BIZ}' and lifecycle_stage='inactive'))`), '18');
    // Both figures, and the reason they differ, are shown together on the
    // audience step of the wizard — which is where the owner meets them.
    await gotoReady(page, '/app/campaigns/studio?step=2');
    const audience = await page.textContent('main');
    check(4, 'the screen shows 64 and 18 side by side', audience, (v) => v.includes('64') && v.includes('18'));
    check(4, 'and explains the difference instead of hiding it', audience, 'отзыв согласия исключает');
  });

  // ------------------------------------------------------------------- 5 and 6
  await beat('5-6. the shield refuses one offer and accepts another', async () => {
    const owner = JSON.parse((await import('node:fs')).readFileSync('tests/e2e/results/owner.json', 'utf8'));
    const blocked = owner.rows.find((r) => r.name.includes('Margin Shield forbids'));
    const allowed = owner.rows.find((r) => r.name.includes('threshold gift is allowed'));
    check(5, 'a 20% blanket discount is refused in the interface', blocked ? `${blocked.pass}` : 'not asserted', 'true');
    check(6, 'a gift above a 3 500 ₸ threshold is accepted', allowed ? `${allowed.pass}` : 'not asserted', 'true');
    check(6, 'the decision is the server\'s, recorded on the contract', db(`select count(*) from public.growth_contracts where business_id='${BIZ}' and margin_decision is not null`), (v) => Number(v) > 0);
  });

  // ------------------------------------------------------------------- 7
  await beat('7. Growth Contract with RU and KK', async () => {
    check(7, 'a contract exists with an immutable snapshot and hash', db(`select count(*) from public.growth_contracts where business_id='${BIZ}' and accepted_snapshot is not null and content_hash is not null`), (v) => Number(v) > 0);
    await gotoReady(page, '/app/content');
    const content = await page.textContent('main');
    check(7, 'content exists in both languages', db(`select string_agg(distinct locale, ',' order by locale) from public.content_items where business_id='${BIZ}'`), (v) => v.includes('ru') && v.includes('kk'));
    check(7, 'the Kazakh copy is marked for native review on screen', content, 'Требуется проверка носителем языка');
  });
  await shot(page, 'demo-07-content');

  // ------------------------------------------------------------------- 8
  await beat('8. simulated launch and history', async () => {
    check(8, 'the launch is recorded in the activity history', db(`select count(*) from public.activity_logs where business_id='${BIZ}'`), (v) => Number(v) > 0);
    check(8, 'and every campaign is labelled simulated', db(`select coalesce(string_agg(distinct is_mock::text, ','),'none') from public.campaigns where business_id='${BIZ}' and status in ('active','completed','running')`), (v) => !v.includes('false'));
  });

  // ------------------------------------------------------------------- 9
  await beat('9. influenced is not incremental', async () => {
    await gotoReady(page, '/app/analytics');
    const ledger = await page.textContent('main');
    check(9, 'the ledger is on screen', ledger, 'Impact Ledger');
    check(9, 'influenced and incremental are separate rows', db(`select string_agg(distinct kind, ',' order by kind) from public.impact_measurements where business_id='${BIZ}'`), (v) => v.includes('influenced') && v.includes('incremental'));
    check(9, 'nothing is presented as a verified fact', db(`select count(*) from public.impact_measurements where business_id='${BIZ}' and kind='verified_fact'`), '0');
    check(9, 'the page says influence is not growth', ledger, (v) => v.includes('прирост') || v.includes('Влияние'));
  });
  await shot(page, 'demo-09-ledger');

  // ------------------------------------------------------------------ 10
  await beat('10. catalog filter and favourite', async () => {
    await gotoReady(page, '/app/tools?category=retention');
    check(10, 'the filter narrows the catalog', String(await page.$$eval('h2', (n) => n.length)), (v) => Number(v) > 0);
    await gotoReady(page, '/app/tools');
    const before = db(`select count(*) from public.favorite_tools where business_id='${BIZ}'`);
    await submit(page, 'button[aria-label="Добавить в избранное"] >> nth=0').catch(() => {});
    const after = db(`select count(*) from public.favorite_tools where business_id='${BIZ}'`);
    check(10, 'favouriting writes to the database', `${before} -> ${after}`, (v) => v.split(' -> ')[0] !== v.split(' -> ')[1]);
  });
  await shot(page, 'demo-10-catalog');

  // ------------------------------------------------------------------ 11
  await beat('11. admin clone, version, publish', async () => {
    const admin = JSON.parse((await import('node:fs')).readFileSync('tests/e2e/results/admin.json', 'utf8'));
    const templateChecks = admin.rows.filter((r) => /version|publish|rollback|clone/i.test(r.name));
    check(11, 'the admin template flow is proven end to end', `${templateChecks.filter((c) => c.pass).length}/${templateChecks.length}`, (v) => v.split('/')[0] === v.split('/')[1] && Number(v.split('/')[1]) >= 4);
    check(11, 'a published version is frozen in the database', db(`select count(*) from public.template_versions where status='published'`), (v) => Number(v) > 0);
    check(11, 'every admin action carries a reason', db(`select count(*) from public.admin_audit_log where reason is null or length(reason) < 3`), '0');
  });

  const total = timings.reduce((sum, t) => sum + t.ms, 0);
  process.stdout.write(`\n  demo beats: ${timings.map((t) => `${t.label.split('.')[0]}=${Math.round(t.ms / 1000)}s`).join(' ')}\n`);
  check('t', 'the scripted path completes well inside 4:30 of narration', `${Math.round(total / 1000)}s of machine time`, (v) => Number(v.split('s')[0]) < 270);

  // ------------------------------------------------- demo-day conditions
  process.stdout.write('\nDEMO-CONDITIONS  Refresh, direct URL, incognito and both screens\n');

  await gotoReady(page, '/app/today');
  const beforeRefresh = await page.textContent('main');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !document.body.innerText.includes('Загружаем данные бизнеса')).catch(() => {});
  check('c', 'a mid-demo refresh keeps the session and the screen', await page.textContent('main'), (v) => v.slice(0, 80) === beforeRefresh.slice(0, 80));

  for (const route of ['/app/analytics', '/app/campaigns/studio', '/app/team', '/admin']) {
    const response = await page.goto(BASE + route, { waitUntil: 'domcontentloaded' });
    const landed = page.url();
    const ok = route === '/admin' ? landed.includes('admin_access_required') : Number(response.status()) < 400 && landed.includes(route);
    check('c', `a URL typed straight into the bar behaves: ${route}`, `${response.status()} ${landed.replace(BASE, '')}`, () => ok);
  }

  const incognito = await context.browser().newContext();
  const incognitoPage = await incognito.newPage();
  const guarded = await incognitoPage.goto(`${BASE}/app/today`, { waitUntil: 'domcontentloaded' });
  check('c', 'a fresh incognito profile cannot reach the cabinet', `${guarded.status()} ${incognitoPage.url().replace(BASE, '')}`, '/login');
  const publicLanding = await incognitoPage.goto(BASE, { waitUntil: 'domcontentloaded' });
  check('c', 'but the public product is fully visible without an account', String(publicLanding.status()), '200');
  await incognito.close();

  for (const [label, width, height] of [['phone', 390, 844], ['projector', 1440, 900]]) {
    const sized = await context.browser().newContext({ viewport: { width, height }, locale: 'ru-RU' });
    const sizedPage = await sized.newPage();
    await login(sizedPage, 'owner@qadam.local', PASSWORD);
    let overflow = 0;
    for (const route of ['/app/today', '/app/analytics', '/app/tools']) {
      await gotoReady(sizedPage, route);
      overflow += await sizedPage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    }
    check('c', `the demo path fits a ${label} at ${width}px`, `${overflow}px total overflow`, '0px');
    await gotoReady(sizedPage, '/app/today');
    await shot(sizedPage, `demo-${label}-${width}`);
    await sized.close();
  }
} catch (error) {
  check('x', 'the demo script ran to the end', String(error).slice(0, 300), 'never-matches');
} finally {
  await browser.close();
}

mkdirSync('tests/release/results', { recursive: true });
writeFileSync('tests/release/results/demo-script.json', JSON.stringify({ total: rows.length, failed: failures, rows, timings }, null, 2), 'utf8');
process.stdout.write(`\ndemo-script: ${rows.length - failures}/${rows.length} passed\n`);
process.exit(failures === 0 ? 0 : 1);
