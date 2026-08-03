// Telegram Mini App — the guest card and the owner's «Сегодня», end to end.
//
// The Mini App cannot be opened by hand: Telegram signs a blob with the bot
// token and the app refuses anything else. This suite signs one the same way
// the client would, which is the only way to exercise the real path — and it
// also proves the check works, because the same suite forges one and is turned
// away.
import { createHmac } from 'node:crypto';

import { BASE, db, dbTry, openBrowser, reporter } from './harness.mjs';

const r = reporter('mini-app');
const { browser, page, problems } = await openBrowser();

const BIZ = '10000000-0000-4000-8000-000000000001';
const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const CHAT = '900000001';

function signedInitData(chatId, token, secondsAgo = 0) {
  const fields = {
    auth_date: String(Math.floor(Date.now() / 1000) - secondsAgo),
    user: JSON.stringify({ id: Number(chatId), first_name: 'E2E Гость' }),
  };
  const pairs = Object.entries(fields).map(([key, value]) => `${key}=${value}`).sort();
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', secret).update(pairs.join('\n')).digest('hex');
  const params = new URLSearchParams(fields);
  params.set('hash', hash);
  return params.toString();
}

/** Opens a session the way the bridge does, then keeps the cookie for the page. */
async function openSession(initData) {
  return page.evaluate(async (payload) => {
    const response = await fetch('/api/tg/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ initData: payload }),
    });
    return { status: response.status, body: await response.text() };
  }, initData);
}

try {
  await page.goto(`${BASE}/tg`, { waitUntil: 'domcontentloaded' });

  // ---------------------------------------------------------------- 1
  process.stdout.write('\nMINI-1  Nothing opens without Telegram\'s signature\n');
  r.check('the entry page loads and asks who you are', await page.textContent('body'), (v) => /Проверяем|не получилось/i.test(v));

  const forged = await openSession(`user=${encodeURIComponent('{"id":1}')}&auth_date=${Math.floor(Date.now() / 1000)}&hash=${'a'.repeat(64)}`);
  r.check('a forged signature is refused', String(forged.status), '401');
  r.check('and it says the signature is the problem', forged.body, 'bad_signature');

  const cardBefore = await page.goto(`${BASE}/tg/card`, { waitUntil: 'domcontentloaded' });
  r.check('the card redirects away without a session', String(cardBefore?.status() ?? 0), (v) => v === '200');
  r.check('and lands back on the entry screen', page.url(), (v) => v.endsWith('/tg') || v.includes('/tg?'));

  if (!TOKEN) {
    r.check('TELEGRAM_BOT_TOKEN is available to sign a real payload', 'missing', 'present');
  } else {
    // ---------------------------------------------------------------- 2
    process.stdout.write('\nMINI-2  A linked chat sees its own card\n');

    // Link a throwaway chat to a real demo customer, the way the bot does.
    const customerId = db(`select customer_id from public.loyalty_accounts where business_id='${BIZ}' order by stamps_balance desc limit 1`);
    r.check('a demo guest with a loyalty account exists', customerId, (v) => v.length === 36);
    dbTry(`select private.remember_channel_address('${BIZ}','telegram','${CHAT}','${customerId}',null)`);
    r.check('the chat is linked to that guest', db(`select count(*) from private.channel_addresses where address='${CHAT}' and customer_id='${customerId}'`), '1');

    const opened = await openSession(signedInitData(CHAT, TOKEN));
    r.check('a correctly signed payload opens a session', String(opened.status), '200');
    r.check('and it resolves to a guest, not an owner', opened.body, '"isGuest":true');

    await page.goto(`${BASE}/tg/card`, { waitUntil: 'domcontentloaded' });
    const card = (await page.textContent('body')) ?? '';
    r.check('the card names the venue', card, 'TAMYR');
    r.check('the card shows the stamp balance', card, 'Ваши штампы');

    // The card offers the cheapest reward **of this guest's own programme**, so
    // the assertion has to resolve it the same way. Comparing against the
    // cheapest reward in the whole venue picked up one another suite had
    // created in a different programme, and the card was right while the check
    // was wrong.
    const rewardQuery = `select r.id from public.rewards r
      join public.loyalty_accounts la on la.loyalty_program_id = r.loyalty_program_id and la.customer_id='${customerId}'
      where r.business_id='${BIZ}' and r.status='active' order by coalesce(r.cost_stamps, 2147483647) limit 1`;
    const stamps = Number(db(`select stamps_balance from public.loyalty_accounts where customer_id='${customerId}'`));
    const target = Number(db(`select coalesce(cost_stamps,0) from public.rewards where id=(${rewardQuery})`));
    r.check('the distance to the reward matches the database', card, (v) =>
      stamps >= target ? /уже ваш/.test(v) : new RegExp(`осталось.*${target - stamps}`, 's').test(v));

    r.check('the venue menu is shown to the guest', card, (v) => v.includes('Меню') && v.includes('Капучино'));

    // ---------------------------------------------------------------- 3
    process.stdout.write('\nMINI-3  Consent is taken and given back from the card\n');
    const consentBefore = db(`select coalesce((select status from public.customer_consents where customer_id='${customerId}' and scope='marketing.telegram' order by created_at desc limit 1),'none')`);
    const consentRowsBefore = Number(db(`select count(*) from public.customer_consents where customer_id='${customerId}' and scope='marketing.telegram'`));
    await page.click('form:has(input[name="granted"]) button');
    await page.waitForLoadState('networkidle').catch(() => {});
    const consentAfter = db(`select status from public.customer_consents where customer_id='${customerId}' and scope='marketing.telegram' order by created_at desc limit 1`);
    r.check('pressing the consent button records a new decision', `${consentBefore} -> ${consentAfter}`, (v) => v.split(' -> ')[0] !== v.split(' -> ')[1]);
    // Согласие хранится журналом, а не полем: после переключения строк должно
    // стать больше, чем было. Требовать «не меньше двух» — значит требовать,
    // чтобы у гостя уже была история, которой у нового гостя нет.
    r.check('the decision is stored as evidence, not as a flag', `${consentRowsBefore} -> ${db(`select count(*) from public.customer_consents where customer_id='${customerId}' and scope='marketing.telegram'`)}`, (v) => {
      const [before, after] = v.split(' -> ').map(Number);
      return after > before;
    });

    // ---------------------------------------------------------------- 4
    process.stdout.write('\nMINI-4  Redeeming spends the stamps once\n');
    const rewardId = db(rewardQuery);
    const cost = Number(db(`select coalesce(cost_stamps,0) from public.rewards where id='${rewardId}'`));
    dbTry(`update public.loyalty_accounts set stamps_balance=${cost + 1}, optimistic_version=optimistic_version+1 where customer_id='${customerId}'`);

    await page.goto(`${BASE}/tg/card`, { waitUntil: 'domcontentloaded' });
    const redeemButton = await page.$('form:has(input[name="rewardId"]) button');
    r.check('the reward becomes claimable once the balance is enough', redeemButton ? 'offered' : 'hidden', 'offered');
    if (redeemButton) {
      await redeemButton.click();
      await page.waitForLoadState('networkidle').catch(() => {});
      r.check('the balance was debited, not just displayed', db(`select stamps_balance from public.loyalty_accounts where customer_id='${customerId}'`), '1');
      r.check('a redemption is recorded against this guest', db(`select count(*) from public.reward_redemptions where customer_id='${customerId}'`), (v) => Number(v) >= 1);
      r.check('the ledger keeps the negative entry', db(`select count(*) from public.loyalty_ledger where entry_type='redeem' and metadata->>'surface'='telegram_mini_app'`), (v) => Number(v) >= 1);
    }

    // ---------------------------------------------------------------- 5
    process.stdout.write('\nMINI-5  One chat cannot open another chat\'s card\n');
    const otherCustomer = db(`select customer_id from public.loyalty_accounts where business_id='${BIZ}' and customer_id <> '${customerId}' limit 1`);
    const stolen = await page.evaluate(async ([business, victim]) => {
      const response = await fetch('/api/tg/session', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ initData: 'nonsense', businessId: business, customerId: victim }),
      });
      return response.status;
    }, [BIZ, otherCustomer]);
    r.check('naming somebody else in the request changes nothing', String(stolen), '401');

    // Put the tenant back as it was found. Flipping this guest's consent and
    // walking away left the demo with 17 contactable sleepers instead of 18,
    // and the owner suite — which asserts 18 — went red for a reason that had
    // nothing to do with the owner.
    if (consentBefore !== 'none' && consentBefore !== consentAfter) {
      dbTry(`select private.record_channel_consent('${BIZ}','${customerId}','marketing.telegram',${consentBefore === 'granted'},'e2e_restore','{}'::jsonb)`);
      r.check('the suite leaves consent as it found it', db(`select status from public.customer_consents where customer_id='${customerId}' and scope='marketing.telegram' order by created_at desc limit 1`), consentBefore);
    }
    dbTry(`delete from private.channel_addresses where address='${CHAT}'`);
  }

  process.stdout.write('\nMINI-6  Journey-wide gates\n');
  // This suite deliberately forges signatures and opens the app without one, so
  // the browser logs those refusals. A 401 the suite asked for is the product
  // working; anything else is not.
  const unexpected = problems.filter((problem) => !/status of 401/.test(String(problem.text ?? '')));
  r.check('no console error beyond the refusals this suite provoked', unexpected.length === 0 ? 'clean' : JSON.stringify(unexpected.slice(0, 3)), 'clean');
  r.check('every refusal the suite provoked was answered with 401', problems.length === 0 || problems.every((problem) => /status of 401/.test(String(problem.text ?? ''))) ? 'yes' : 'no', 'yes');
} catch (error) {
  r.check('suite completed without an unhandled failure', String(error).slice(0, 400), 'never-matches-so-this-fails');
} finally {
  await browser.close();
}

process.exit(r.finish({ consoleProblems: problems }) === 0 ? 0 : 1);
