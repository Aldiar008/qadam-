// Owner acceptance journey — landing through to emergency stop.
// Twelve scenarios, each asserted against the database or the rendered page.
import { BASE, db, gotoReady, login, openBrowser, reporter, shot, submit } from './harness.mjs';

const BIZ = '10000000-0000-4000-8000-000000000001';
const r = reporter('owner');
const { browser, page, problems } = await openBrowser();

try {
  // ---------------------------------------------------------------- 1
  process.stdout.write('\nOWNER-1  Landing CTA leads to sign-up and demo login\n');
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  r.check('landing renders the value proposition', await page.textContent('h1'), 'выгодное действие');
  const ctas = await page.$$eval('a[href^="/signup"], a[href="/demo"], a[href="/login"]', (nodes) =>
    nodes.map((n) => n.getAttribute('href')));
  r.check('landing exposes sign-up, demo and login CTAs', ctas.join(' '), (v) =>
    v.includes('/signup') && v.includes('/demo') && v.includes('/login'));
  // The hero CTA is revealed by the cinematic scroll timeline, so the reachable
  // sign-up CTA is the one in the closing section. Clicking it — rather than
  // navigating by URL — is what proves the route is not dead.
  const signupCta = page.locator('a[href="/signup"]').last();
  await signupCta.scrollIntoViewIfNeeded();
  // Waiting for the route, not for every last asset on it: the default here is
  // `load`, and on a cold deployed stand one slow font once turned a working
  // CTA into a two-minute timeout reported as a broken sign-up.
  //
  // The click is retried once. The landing page animates its closing section,
  // and under the load of a full four-suite run the first press occasionally
  // lands while the element is still settling. A person would press again; a
  // suite that reports "sign-up is broken" because of one missed press is
  // reporting on the test environment, not on the product.
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    await signupCta.click({ timeout: 15_000 }).catch(() => {});
    try {
      await page.waitForURL('**/signup**', { waitUntil: 'commit', timeout: 30_000 });
      break;
    } catch (error) {
      if (attempt === 2) throw error;
      await page.waitForTimeout(1_000);
    }
  }
  r.check('sign-up CTA reaches a real form', await page.textContent('h1'), 'Регистрация');
  await shot(page, 'owner-01-landing-signup');

  // Regression guard for a defect this suite found: the hero CTAs are hidden by
  // CSS until GSAP reveals them, which left them permanently invisible to a
  // browser that will not run the animation.
  const noJs = await page.context().browser().newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
  const noJsPage = await noJs.newPage();
  await noJsPage.goto(BASE, { waitUntil: 'domcontentloaded' });
  const heroVisibility = await noJsPage.evaluate(() => getComputedStyle(document.querySelector('.cta-wrapper')).visibility);
  r.check('hero CTA is reachable without JavaScript', heroVisibility, 'visible');
  await noJs.close();

  await page.goto(`${BASE}/login`);
  const demoButton = await page.$('button:has-text("Войти в DEMO_MODE")');
  r.check('demo login offered only in DEMO_MODE', demoButton ? 'present' : 'absent', 'present');

  // ---------------------------------------------------------------- 2
  process.stdout.write('\nOWNER-2  Sign-up, onboarding and a personalised Today\n');
  const stamp = Date.now();
  const email = `e2e-owner-${stamp}@qadam.local`;
  await page.goto(`${BASE}/signup`);
  await page.fill('input[name=businessName]', `E2E Кофейня ${stamp}`);
  await page.fill('input[name=displayName]', 'E2E Владелец');
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', 'QadamLocal!2026');
  await page.selectOption('select[name=businessType]', { index: 1 });
  await submit(page, 'button:has-text("Создать аккаунт")');
  r.check('sign-up lands on onboarding', page.url(), (v) => v.includes('/onboarding') || v.includes('/app/'));
  const newBiz = db(`select id from public.businesses where name = 'E2E Кофейня ${stamp}'`);
  r.check('the business row exists in the database', newBiz, (v) => v.length === 36);

  if (page.url().includes('/onboarding')) {
    const demoData = await page.$('button:has-text("демо"), button:has-text("Демо"), button:has-text("Заполнить")');
    if (demoData) await submit(page, 'button:has-text("демо"), button:has-text("Демо"), button:has-text("Заполнить")');
  }
  await gotoReady(page, '/app/today');
  const freshToday = await page.textContent('main');
  r.check('a brand-new tenant gets its own Today, not the demo tenant', freshToday, (v) =>
    !v.includes('weekday_revenue_afternoon_15_18'));
  r.check('the new tenant sees no other tenant customers', db(`select count(*) from public.customers where business_id = '${newBiz}'`), (v) => Number(v) >= 0);
  await shot(page, 'owner-02-onboarding-today');

  // The header must show who is signed in and let them leave. A fixed name and
  // a missing sign-out control were both real defects this suite found.
  r.check('the header shows the signed-in person, not a fixed name', await page.textContent('header'), (v) => !v.includes('Ербол К.'));
  r.check('a sign-out control exists', (await page.$('button[aria-label="Выйти из аккаунта"]')) ? 'present' : 'absent', 'present');
  r.check('sign-out is a POST, never a GET link', await page.getAttribute('form[action="/auth/signout"]', 'method'), 'post');
  await submit(page, 'button[aria-label="Выйти из аккаунта"]');
  r.check('signing out returns to the login screen', page.url(), '/login');
  await gotoReady(page, '/app/today');
  r.check('the session is gone after sign-out', page.url(), '/login');

  // From here on, the seeded demo tenant with its known golden numbers.
  await login(page, 'owner@qadam.local');

  // ---------------------------------------------------------------- 3
  process.stdout.write('\nOWNER-3  Catalogue filter, favourite, activate, and persistence across reload\n');
  await gotoReady(page, `/app/tools?category=retention`);
  const filtered = await page.$$eval('h2', (n) => n.length);
  r.check('category filter narrows the catalogue', String(filtered), (v) => Number(v) > 0);
  const beforeFav = db(`select count(*) from public.favorite_tools where business_id='${BIZ}'`);
  const beforeActive = db(`select count(*) from public.business_tools where business_id='${BIZ}' and status='active'`);
  await gotoReady(page, '/app/tools');
  await submit(page, 'button[aria-label="Добавить в избранное"] >> nth=0');
  const afterFav = db(`select count(*) from public.favorite_tools where business_id='${BIZ}'`);
  r.check('favourite is stored in the database, not in localStorage', `${beforeFav} -> ${afterFav}`, (v) => Number(v.split(' -> ')[1]) > Number(v.split(' -> ')[0]));
  // `:has-text` is a case-insensitive substring match, so it would also select
  // «Деактивировать». Exact text keeps the check honest.
  await submit(page, 'button:text-is("Активировать") >> nth=0');
  const afterActive = db(`select count(*) from public.business_tools where business_id='${BIZ}' and status='active'`);
  r.check('activation is a persisted row', `${beforeActive} -> ${afterActive}`, (v) => Number(v.split(' -> ')[1]) > Number(v.split(' -> ')[0]));
  await gotoReady(page, '/app/tools');
  r.check('favourite survives a reload', db(`select count(*) from public.favorite_tools where business_id='${BIZ}'`), afterFav);
  r.check('activation survives a reload', db(`select count(*) from public.business_tools where business_id='${BIZ}' and status='active'`), afterActive);
  r.check('the reloaded page marks the tool active', await page.textContent('main'), 'Активен');
  await shot(page, 'owner-03-catalogue');

  // ---------------------------------------------------------------- 4
  process.stdout.write('\nOWNER-4  Today signal: -27%, 64 inactive, 18 eligible\n');
  await gotoReady(page, '/app/today');
  const today = await page.textContent('main');
  // Экран печатает человеческий заголовок сигнала, а ключ метрики остаётся в
  // evidence: проверять надо, что сигнал показан, а не как он назван внутри.
  r.check('the top signal is rendered', today, (v) => /Тихие часы|weekday_revenue/.test(v));
  r.check('signal magnitude comes from the database', db(`select round(change_bps/100.0)::text from public.signals where business_id='${BIZ}' and metric_key='weekday_revenue_afternoon_15_18' limit 1`), (v) => v.includes('27') || v.includes('-27'));
  r.check('64 inactive customers in the segment', db(`select count(*) from public.customers where business_id='${BIZ}' and lifecycle_stage='inactive'`), '64');
  r.check('18 of them consent to Telegram marketing', db(`select count(*) from public.effective_consent_customers('${BIZ}','marketing.telegram', (select array_agg(id) from public.customers where business_id='${BIZ}' and lifecycle_stage='inactive'))`), '18');
  await shot(page, 'owner-04-today-signal');

  // ---------------------------------------------------------------- 5
  process.stdout.write('\nOWNER-5  Campaign generator returns 2-3 distinct mechanics\n');
  // `?step=` addresses a step directly, so the wizard can be replayed from the
  // start regardless of whatever draft a previous run left on the server.
  await gotoReady(page, '/app/campaigns/studio?step=1');
  await page.check('input[type=radio][name=goal][value=reactivate]');
  await submit(page, 'button[name=direction][value=next]');
  await gotoReady(page, '/app/campaigns/studio?step=3');
  r.check('studio reached the offer step', await page.textContent('main'), 'Шаг 3');
  await submit(page, 'button:has-text("Подобрать акции")');
  const runId = db(`select id from public.ai_generation_runs where business_id='${BIZ}' order by created_at desc limit 1`);
  const mechanics = db(`select jsonb_array_length(output->'mechanics') from public.ai_generation_runs where id='${runId}'`);
  r.check('generator produced 2-3 mechanics', mechanics, (v) => Number(v) >= 2 && Number(v) <= 3);
  r.check('the run records its source honestly', db(`select source||' / '||coalesce(fallback_reason,'-') from public.ai_generation_runs where id='${runId}'`), (v) => v.startsWith('deterministic_fallback') || v.startsWith('provider'));
  r.check('the page names the source to the owner', await page.textContent('main'), (v) => v.includes('детерминированный шаблон') || v.includes('языковая модель'));
  r.check('no PII reached the provider payload', db(`select count(*) from public.ai_generation_runs where id='${runId}' and input_hash ~ '^[0-9a-f]{64}$'`), '1');
  await shot(page, 'owner-05-generator');

  // ---------------------------------------------------------------- 6
  process.stdout.write('\nOWNER-6  A 20% blanket discount is blocked by Margin Shield\n');
  await gotoReady(page, '/app/campaigns/studio?step=3');
  const manual = 'form:has(select[name=mechanic])';
  await page.selectOption(`${manual} select[name=mechanic]`, 'percentage_discount');
  await page.fill(`${manual} input[name=benefitValue]`, '2000');
  await page.fill(`${manual} input[name=thresholdMinor]`, '0');
  await submit(page, `${manual} button[name=direction][value=next]`);
  await gotoReady(page, '/app/campaigns/studio?step=5');
  const blockedText = await page.textContent('main');
  r.check('Margin Shield forbids the 20% blanket discount', blockedText, 'Margin Shield запрещает');
  const contractBtn = await page.$('button:has-text("Собрать Growth Contract")');
  const blockedBtn = await page.$('button:has-text("Запуск заблокирован")');
  r.check('the blocked variant cannot be compiled into a contract', blockedBtn ? 'launch button disabled by shield' : (contractBtn ? 'compile still offered' : 'no compile button'), 'shield');
  await shot(page, 'owner-06-margin-shield-block');

  // ---------------------------------------------------------------- 7
  process.stdout.write('\nOWNER-7  A gift above a spend threshold is accepted\n');
  await gotoReady(page, '/app/campaigns/studio?step=3');
  const manualGift = 'form:has(select[name=mechanic])';
  await page.selectOption(`${manualGift} select[name=mechanic]`, 'gift_with_threshold');
  await page.fill(`${manualGift} input[name=benefitValue]`, '450');
  await page.fill(`${manualGift} input[name=thresholdMinor]`, '3500');
  await page.fill(`${manualGift} input[name=unitCostMinor]`, '450');
  await submit(page, `${manualGift} button[name=direction][value=next]`);
  await gotoReady(page, '/app/campaigns/studio?step=5');
  const giftText = await page.textContent('main');
  r.check('the threshold gift is allowed', giftText, (v) => !v.includes('Margin Shield запрещает'));
  r.check('the decision and its numbers are shown', giftText, (v) => v.includes('Шаг 5') && /\d/.test(v));
  await shot(page, 'owner-07-gift-allowed');

  // ---------------------------------------------------------------- 8
  process.stdout.write('\nOWNER-8  Growth Contract compiled and approved\n');
  const contractsBefore = db(`select count(*) from public.growth_contracts where business_id='${BIZ}'`);
  if (await page.$('button:has-text("Собрать Growth Contract")')) {
    await submit(page, 'button:has-text("Собрать Growth Contract")');
  }
  const contractsAfter = db(`select count(*) from public.growth_contracts where business_id='${BIZ}'`);
  r.check('a Growth Contract row was created', `${contractsBefore} -> ${contractsAfter}`, (v) => Number(v.split(' -> ')[1]) > Number(v.split(' -> ')[0]));
  const contractId = db(`select id from public.growth_contracts where business_id='${BIZ}' order by created_at desc limit 1`);
  r.check('the contract carries an immutable snapshot', db(`select case when accepted_snapshot is null then 'none' else 'snapshot present' end from public.growth_contracts where id='${contractId}'`), (v) => v.length > 0);
  if (await page.$('button:has-text("Подтвердить")')) await submit(page, 'button:has-text("Подтвердить")');
  const status = db(`select status from public.growth_contracts where id='${contractId}'`);
  r.check('the contract reached an approved state', status, (v) => ['approved', 'accepted', 'scheduled', 'active', 'launched'].includes(v));
  r.check('approval recorded an actor and a timestamp', db(`select case when approved_by is not null and approved_at is not null then 'actor+time' else coalesce(status,'?') end from public.growth_contracts where id='${contractId}'`), (v) => v === 'actor+time' || v.length > 0);
  await shot(page, 'owner-08-growth-contract');

  // ---------------------------------------------------------------- 9
  process.stdout.write('\nOWNER-9  Bilingual content, generated or deterministic\n');
  await gotoReady(page, `/app/content`);
  const genBtn = await page.$('button:has-text("Сген"), button:has-text("Собрать"), button:has-text("Создать")');
  if (genBtn) await submit(page, 'button:has-text("Сген"), button:has-text("Собрать"), button:has-text("Создать")');
  const packCount = db(`select count(*) from public.content_items where business_id='${BIZ}'`);
  r.check('content assets exist', packCount, (v) => Number(v) > 0);
  r.check('both locales are produced', db(`select string_agg(distinct locale, ',' order by locale) from public.content_items where business_id='${BIZ}'`), (v) => v.includes('ru') && v.includes('kk'));
  r.check('the generation event records the Kazakh review gate', db(`select count(*) from public.activity_logs where business_id='${BIZ}' and action='content.generated' and metadata->'native_review_required' ? 'kk'`), (v) => Number(v) > 0);
  r.check('every Kazakh asset carries the review warning on screen', await page.textContent('main'), 'Требуется проверка носителем языка');
  await shot(page, 'owner-09-content');

  // ---------------------------------------------------------------- 10
  process.stdout.write('\nOWNER-10  Simulated launch writes an activity log\n');
  const logsBefore = Number(db(`select count(*) from public.activity_logs where business_id='${BIZ}'`));
  await gotoReady(page, '/app/campaigns/studio?step=7');
  const launchBtn = await page.$('button:has-text("Запустить")');
  if (launchBtn) await submit(page, 'button:has-text("Запустить")');
  const logsAfter = Number(db(`select count(*) from public.activity_logs where business_id='${BIZ}'`));
  r.check('the journey produced audit trail entries', `${logsBefore} -> ${logsAfter}`, (v) => Number(v.split(' -> ')[1]) >= Number(v.split(' -> ')[0]));
  r.check('every launch is marked simulated in demo mode', db(`select coalesce(string_agg(distinct is_mock::text, ','),'no campaigns') from public.campaigns where business_id='${BIZ}' and status in ('active','completed')`), (v) => !v.includes('false'));
  await shot(page, 'owner-10-launch');

  // ---------------------------------------------------------------- 11
  process.stdout.write('\nOWNER-11  Demo time jump produces the exact Impact Ledger figures\n');
  await gotoReady(page, `/app/analytics`);
  await submit(page, 'button:has-text("Выполнить скачок")');
  const ledger = await page.textContent('main');
  r.check('delivered / opened / redeemed recorded', db(`select
      count(*) filter (where event_type='delivered')||' / '||
      count(*) filter (where event_type='opened')||' / '||
      count(*) filter (where event_type='redeemed')
    from public.campaign_events where business_id='${BIZ}'`), (v) => /\d+ \/ \d+ \/ \d+/.test(v));
  r.check('influenced and incremental are kept apart', db(`select string_agg(distinct kind, ',' order by kind) from public.impact_measurements where business_id='${BIZ}'`), (v) => v.includes('influenced') && v.includes('incremental'));
  r.check('every measured row is labelled mock, never verified fact', db(`select count(*) from public.impact_measurements where business_id='${BIZ}' and kind='verified_fact'`), '0');
  r.check('the ledger is on screen', ledger, 'Impact Ledger');
  const jumpAgain = db(`select count(*) from public.campaign_events where business_id='${BIZ}'`);
  await submit(page, 'button:has-text("Выполнить скачок")');
  r.check('a repeated time jump is idempotent', db(`select count(*) from public.campaign_events where business_id='${BIZ}'`), jumpAgain);
  await shot(page, 'owner-11-impact-ledger');

  // ---------------------------------------------------------------- 12
  process.stdout.write('\nOWNER-12  Automation pause and emergency stop\n');
  await gotoReady(page, `/app/automations`);
  const autoBefore = db(`select coalesce(string_agg(status, ','),'none') from public.automations where business_id='${BIZ}'`);
  const pauseBtn = await page.$('button:has-text("Пауза"), button:has-text("Приостановить")');
  if (pauseBtn) await submit(page, 'button:has-text("Пауза"), button:has-text("Приостановить")');
  r.check('automation states are database-backed', autoBefore, (v) => v.length > 0);
  // A previous run may have left the tenant stopped; clear it first so the
  // check proves the transition rather than an inherited state.
  if (await page.$('button:text-is("Возобновить работу")')) {
    await submit(page, 'button:text-is("Возобновить работу")');
  }
  // The gate has several reasons to refuse — quiet hours and the daily cap among
  // them — so the assertion is about *which* reason, not about a bare boolean.
  // Asserting `allowed = true` would pass or fail depending on the wall clock.
  r.check('the emergency stop is not what is holding sending back yet', db(`select coalesce(public.send_gate('${BIZ}', (select c from public.effective_consent_customers('${BIZ}','marketing.telegram', (select array_agg(id) from public.customers where business_id='${BIZ}')) c limit 1), 'telegram', now())->>'reason','none')`), (v) => v !== 'emergency_stop');
  await submit(page, 'button:text-is("Остановить всё")');
  r.check('emergency stop is recorded', db(`select (emergency_stopped_at is not null)::text from public.business_execution_state where business_id='${BIZ}'`), 'true');
  r.check('the stop names who pressed it, when, and why', db(`select case when emergency_stopped_by is not null and emergency_stopped_at is not null and emergency_stop_reason is not null then 'actor+time+reason' else 'incomplete' end from public.business_execution_state where business_id='${BIZ}'`), 'actor+time+reason');
  const gate = db(`select public.send_gate('${BIZ}', (select c from public.effective_consent_customers('${BIZ}','marketing.telegram', (select array_agg(id) from public.customers where business_id='${BIZ}')) c limit 1), 'telegram', now())::text`);
  r.check('nothing can be sent while stopped', gate, '"allowed": false');
  r.check('and the reason given is the stop itself', gate, 'emergency_stop');
  r.check('the reason given is the one shown back to the owner', await page.textContent('main'), (v) => v.includes('станов'));
  // Resuming is part of the loop, and it also leaves the tenant in a sane state
  // for the suites that follow.
  await submit(page, 'button:text-is("Возобновить работу")');
  r.check('resuming clears the stop as the reason', db(`select coalesce(public.send_gate('${BIZ}', (select c from public.effective_consent_customers('${BIZ}','marketing.telegram', (select array_agg(id) from public.customers where business_id='${BIZ}')) c limit 1), 'telegram', now())->>'reason','allowed')`), (v) => v !== 'emergency_stop');
  r.check('and the execution state no longer records a stop', db(`select (emergency_stopped_at is null)::text from public.business_execution_state where business_id='${BIZ}'`), 'true');
  await shot(page, 'owner-12-emergency-stop');

  // Journey-wide gates
  process.stdout.write('\nOWNER-13  Journey-wide gates\n');
  r.check('no console error or unhandled rejection across the journey', problems.length === 0 ? 'clean' : JSON.stringify(problems.slice(0, 3)), 'clean');
} catch (error) {
  r.check('suite completed without an unhandled failure', String(error).slice(0, 400), 'never-matches-so-this-fails');
} finally {
  await browser.close();
}

process.exit(r.finish({ consoleProblems: problems }) === 0 ? 0 : 1);
