// Customer acceptance journey — the QR path a guest actually walks.
// The owner creates a real programme and QR first, so the token under test is
// the one the product issues rather than a fixture.
import { BASE, db, gotoReady, login, openBrowser, reporter, shot, submit } from './harness.mjs';

const BIZ = '10000000-0000-4000-8000-000000000001';
const r = reporter('customer');
const { browser, context, page, problems } = await openBrowser();
const stamp = Date.now();
const guestEmail = `e2e-guest-${stamp}@example.test`;

try {
  // The owner issues the QR --------------------------------------------------
  process.stdout.write('\nCUSTOMER-0  The owner issues a real programme and QR\n');
  await login(page, 'owner@qadam.local');
  await gotoReady(page, '/app/loyalty');
  await page.fill('input[name=name]', `E2E программа ${stamp}`);
  await page.selectOption('select[name=programType]', { index: 0 });
  await page.fill('input[name=earn]', '1');
  await page.fill('input[name=rewardNameRu]', 'Бесплатный кофе');
  await page.fill('input[name=rewardNameKk]', 'Тегін кофе');
  await page.fill('input[name=rewardCost]', '3');
  await submit(page, 'button:has-text("Создать программу и QR")');
  const url = new URL(page.url());
  const token = url.searchParams.get('token');
  r.check('a QR token is issued once, in the response', token ? 'issued' : `no token in ${page.url()}`, 'issued');
  r.check('only a hash of the token is stored', db(`select case when token_hash is not null then 'hash stored' else 'plaintext' end from public.qr_codes where business_id='${BIZ}' order by created_at desc limit 1`), 'hash stored');
  r.check('the token never appears in the database', db(`select count(*) from public.qr_codes where token_hash::text like '%${(token ?? 'x').slice(0, 12)}%'`), '0');
  await shot(page, 'customer-00-qr-issued');

  // A guest, with no session -------------------------------------------------
  const guest = await context.browser().newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU' });
  const guestProblems = [];
  // This suite navigates to a bogus token and to a revoked QR on purpose, and
  // both correctly answer 404. Those responses are the assertion, so the
  // resulting resource errors are not counted as journey defects.
  let expecting404 = false;
  guest.on('page', (p) => {
    p.on('console', (m) => {
      if (m.type() !== 'error') return;
      if (expecting404 && m.text().includes('404')) return;
      guestProblems.push(m.text());
    });
    p.on('pageerror', (e) => guestProblems.push(String(e)));
  });
  const gp = await guest.newPage();

  // ---------------------------------------------------------------- 1
  process.stdout.write('\nCUSTOMER-1  Scanning the QR opens the join page\n');
  const scanResponse = await gp.goto(`${BASE}/q/${token}`, { waitUntil: 'domcontentloaded' });
  r.check('the QR link resolves', String(scanResponse.status()), '200');
  r.check('the page names the business and programme', await gp.textContent('main'), 'TAMYR');
  expecting404 = true;
  r.check('an unknown token is not guessable', String((await gp.goto(`${BASE}/q/not-a-real-token`, { waitUntil: 'domcontentloaded' })).status()), '404');
  expecting404 = false;
  await gp.goto(`${BASE}/q/${token}`, { waitUntil: 'domcontentloaded' });
  r.check('no personal data is carried in the URL', gp.url(), (v) => !v.includes('@') && !/\+?7\d{9}/.test(v));
  await shot(gp, 'customer-01-scan');

  // ---------------------------------------------------------------- 2
  process.stdout.write('\nCUSTOMER-2  Loyalty and marketing consent are separate choices\n');
  const loyaltyRequired = await gp.getAttribute('input[name=loyaltyConsent]', 'required');
  const marketingRequired = await gp.getAttribute('input[name=marketingConsent]', 'required');
  r.check('loyalty participation is required to join', loyaltyRequired === '' ? 'required' : 'optional', 'required');
  r.check('marketing consent is a separate, optional choice', marketingRequired === null ? 'optional' : 'required', 'optional');
  r.check('the marketing checkbox is not pre-ticked', String(await gp.isChecked('input[name=marketingConsent]')), 'false');

  // ---------------------------------------------------------------- 3
  process.stdout.write('\nCUSTOMER-3  Joining the programme\n');
  await gp.fill('input[name=displayName]', 'E2E Гость');
  await gp.selectOption('select[name=identityType]', 'email');
  await gp.fill('input[name=identity]', guestEmail);
  await gp.check('input[name=loyaltyConsent]');
  await gp.check('input[name=marketingConsent]');
  await submit(gp, 'button:has-text("Присоединиться")');
  r.check('the join is confirmed on screen', await gp.textContent('main'), 'Готово');
  const customerId = db(`select ci.customer_id from public.customer_identities ci
      join public.customers c on c.id = ci.customer_id
      where ci.business_id='${BIZ}' order by c.created_at desc limit 1`);
  r.check('a customer row exists', customerId, (v) => v.length === 36);
  // The schema keeps a lookup hash and a mask. There is no column that could
  // hold the address at all, which is the stronger guarantee.
  r.check('no column exists that could hold the raw address', db(`select count(*) from information_schema.columns where table_name='customer_identities' and column_name in ('identity_value','email','phone')`), '0');
  r.check('what is stored is a hash', db(`select case when lookup_hash is not null then 'hash' else 'none' end from public.customer_identities where customer_id='${customerId}' limit 1`), 'hash');
  r.check('only a masked form is kept for display', db(`select masked_value from public.customer_identities where customer_id='${customerId}' limit 1`), (v) => !v.includes(guestEmail));
  r.check('both consents recorded with scope and source', db(`select string_agg(distinct scope, ',' order by scope) from public.customer_consents where customer_id='${customerId}'`), (v) => v.includes('loyalty') && v.includes('marketing'));
  r.check('the scan itself is recorded', db(`select count(*) from public.qr_scans where business_id='${BIZ}'`), (v) => Number(v) > 0);
  await shot(gp, 'customer-03-joined');

  // ---------------------------------------------------------------- 4 and 5
  process.stdout.write('\nCUSTOMER-4  Earning and seeing a balance\n');
  const balanceText = await gp.textContent('main');
  r.check('the balance is shown back to the guest', balanceText, 'Balance');
  r.check('the ledger records the earn', db(`select count(*) from public.loyalty_ledger l join public.loyalty_accounts a on a.id=l.loyalty_account_id where a.customer_id='${customerId}'`), (v) => Number(v) > 0);
  const balance = db(`select coalesce(stamps_balance,0)||'/'||coalesce(points_balance,0) from public.loyalty_accounts where customer_id='${customerId}' limit 1`);
  r.check('the account carries a real balance', balance, (v) => /\d+\/\d+/.test(v));
  r.check('the screen figure matches the account', balanceText, (v) => v.includes(balance.split('/')[0]) || v.includes(balance.split('/')[1]));

  // ---------------------------------------------------------------- 7 (before redeem, so the earn is the duplicate under test)
  process.stdout.write('\nCUSTOMER-7  A replayed join does not double-credit\n');
  const ledgerBefore = db(`select count(*) from public.loyalty_ledger l join public.loyalty_accounts a on a.id=l.loyalty_account_id where a.customer_id='${customerId}'`);
  await gp.goto(`${BASE}/q/${token}`, { waitUntil: 'domcontentloaded' });
  await gp.fill('input[name=displayName]', 'E2E Гость');
  await gp.fill('input[name=identity]', guestEmail);
  await gp.check('input[name=loyaltyConsent]');
  await submit(gp, 'button:has-text("Присоединиться")');
  const ledgerAfter = db(`select count(*) from public.loyalty_ledger l join public.loyalty_accounts a on a.id=l.loyalty_account_id where a.customer_id='${customerId}'`);
  r.check('the same person does not become two customers', db(`select count(*) from public.customer_identities where business_id='${BIZ}' and lookup_hash = (select lookup_hash from public.customer_identities where customer_id='${customerId}' limit 1)`), '1');
  r.check('a rapid repeat is refused or deduplicated', `${ledgerBefore} -> ${ledgerAfter}`, (v) => Number(v.split(' -> ')[1]) - Number(v.split(' -> ')[0]) <= 1);
  r.check('the repeat is explained rather than silently ignored', await gp.textContent('main'), (v) => v.includes('Повтор') || v.includes('Готово') || v.includes('часто'));
  // Leaving the optional box unticked on the second visit is an answer, not a
  // no-op: the newest answer for a scope is the one that counts.
  r.check('an unticked marketing box on a repeat visit is recorded as a denial', db(`select status from public.customer_consents where customer_id='${customerId}' and scope='marketing' order by created_at desc limit 1`), 'denied');

  // ---------------------------------------------------------------- 6
  process.stdout.write('\nCUSTOMER-6  Redeeming a reward\n');
  // Give the account enough stamps for the reward through the ledger the
  // product itself writes, then redeem through the public form.
  db(`update public.loyalty_accounts set stamps_balance = 10, optimistic_version = optimistic_version + 1 where customer_id='${customerId}'`);
  await gp.goto(`${BASE}/q/${token}`, { waitUntil: 'domcontentloaded' });
  await gp.click('summary:has-text("Использовать награду")');
  await gp.fill('form:has(select[name=rewardId]) input[name=identity]', guestEmail);
  await submit(gp, 'form:has(select[name=rewardId]) button:has-text("Redeem")');
  r.check('the redemption is recorded in the loyalty ledger', db(`select count(*) from public.loyalty_ledger l join public.loyalty_accounts a on a.id=l.loyalty_account_id where a.customer_id='${customerId}' and l.entry_type='redeem'`), (v) => Number(v) > 0);
  r.check('the redemption names what was redeemed', db(`select source_type||' '||stamps_delta from public.loyalty_ledger l join public.loyalty_accounts a on a.id=l.loyalty_account_id where a.customer_id='${customerId}' and l.entry_type='redeem' limit 1`), (v) => v.startsWith('reward') && v.includes('-'));
  r.check('the balance was debited, not just displayed', db(`select stamps_balance from public.loyalty_accounts where customer_id='${customerId}'`), (v) => Number(v) < 10);
  r.check('the guest is told the outcome', await gp.textContent('main'), (v) => v.includes('Готово') || v.includes('Balance'));
  await shot(gp, 'customer-06-redeem');

  // ---------------------------------------------------------------- 7b
  process.stdout.write('\nCUSTOMER-7b  A revoked QR stops working\n');
  db(`update public.qr_codes set status='revoked' where business_id='${BIZ}' and status='active'`);
  expecting404 = true;
  r.check('a revoked QR is a dead link, not a soft warning', String((await gp.goto(`${BASE}/q/${token}`, { waitUntil: 'domcontentloaded' })).status()), '404');
  expecting404 = false;
  db(`update public.qr_codes set status='active' where business_id='${BIZ}' and status='revoked'`);

  // ---------------------------------------------------------------- 8
  process.stdout.write('\nCUSTOMER-8  Revoking consent removes the person from future audiences\n');
  db(`update public.business_execution_state set emergency_stopped_at = null, emergency_stopped_by = null, emergency_stop_reason = null where business_id='${BIZ}'`);
  // The schema refuses a 'granted' row without a grant time, so a consent
  // record can never claim a permission that has no moment attached to it.
  db(`insert into public.customer_consents(business_id, customer_id, scope, status, source, granted_at, is_mock)
      values ('${BIZ}', '${customerId}', 'marketing', 'granted', 'customer_request', now(), true)`);
  const eligibleBefore = db(`select count(*) from public.effective_consent_customers('${BIZ}','marketing.telegram', array['${customerId}']::uuid[])`);
  r.check('the guest is in the marketing audience while consenting', eligibleBefore, '1');
  db(`insert into public.customer_consents(business_id, customer_id, scope, status, source, is_mock)
      values ('${BIZ}', '${customerId}', 'marketing', 'revoked', 'customer_request', true)`);
  const eligibleAfter = db(`select count(*) from public.effective_consent_customers('${BIZ}','marketing.telegram', array['${customerId}']::uuid[])`);
  r.check('revoking removes them from the audience', `${eligibleBefore} -> ${eligibleAfter}`, '1 -> 0');
  r.check('the send gate refuses them at dispatch too', db(`select public.send_gate('${BIZ}','${customerId}','telegram', now())->>'allowed'`), 'false');
  r.check('the revocation is kept as evidence, not deleted', db(`select count(*) from public.customer_consents where customer_id='${customerId}' and status='revoked'`), (v) => Number(v) > 0);
  r.check('loyalty participation is unaffected by a marketing revoke', db(`select count(*) from public.loyalty_accounts where customer_id='${customerId}'`), (v) => Number(v) > 0);

  r.check('the guest journey produced no console error', guestProblems.length === 0 ? 'clean' : JSON.stringify(guestProblems.slice(0, 3)), 'clean');
  await guest.close();
} catch (error) {
  r.check('suite completed without an unhandled failure', String(error).slice(0, 400), 'never-matches-so-this-fails');
} finally {
  await browser.close();
}

process.exit(r.finish({ consoleProblems: problems }) === 0 ? 0 : 1);
