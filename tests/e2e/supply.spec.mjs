// Приёмочный прогон цветочного ядра: витрина → прогноз → дефицит и списание.
//
// Каждая проверка идёт тем же путём, что и владелец магазина: браузер,
// настоящая сессия, настоящая база. Там, где интерфейс утверждает число, оно
// сверяется строкой из базы — иначе экран мог бы показывать что угодно.
import { db, gotoReady, login, openBrowser, reporter, shot, submit } from './harness.mjs';

const BUSINESS = '10000000-0000-4000-8000-000000000001';
const ROSE = "private.deterministic_uuid('supply-rose_red')";
const ROSE_NAME = 'Роза красная 60 см';

const roseCard = `li:has-text("${ROSE_NAME}")`;

export async function run() {
  const report = reporter('supply');
  const { browser, page } = await openBrowser();

  try {
    await login(page, 'owner@qadam.local');

    // ─── Витрина ─────────────────────────────────────────────────────────────
    await gotoReady(page, '/app/inventory');
    const body = await page.textContent('body');

    report.check('экран витрины открывается', body.slice(0, 140), () => body.includes('Витрина и политика закупки'));
    report.check('магазин цветочный, а не кофейня', 'TAMYR Flowers', () => body.includes('TAMYR Flowers'));
    report.check('ассортимент цветочный', ROSE_NAME, () => body.includes(ROSE_NAME) && body.includes('Тюльпан микс'));
    report.check('единицы измерения цветочные', 'стебель', () => body.includes('стебель'));

    const dbBalance = db(
      `select on_hand_milli from public.inventory_balances
       where business_id='${BUSINESS}' and supply_item_id=${ROSE}`,
    ).trim();
    const shownNumber = /Роза красная 60 см[\s\S]{0,1400}?Остаток[\s\S]{0,80}?([\d,]+)\s*стебель/.exec(body);
    report.check(
      'остаток роз на экране совпадает с базой',
      `экран: ${shownNumber ? shownNumber[1] : 'не найдено'} · база: ${dbBalance} тысячных`,
      () => shownNumber !== null && Math.round(Number(shownNumber[1].replace(',', '.')) * 1000) === Number(dbBalance),
    );

    report.check('рядом с остатком стоит время до нуля', 'До нуля', () => /До нуля/.test(body));
    report.check('видна точка перезаказа', 'Заказывать при', () => /Заказывать при/.test(body));
    report.check('показан риск списания', 'Не успеет продаться', () => body.includes('Не успеет продаться'));
    report.check('партии видны со сроками', 'Партии на витрине', () => body.includes('Партии на витрине'));
    report.check('свежесть подписана словами', 'свежая/дозревает/срок вышел', () =>
      body.includes('свежая') || body.includes('дозревает') || body.includes('последний день') || body.includes('срок вышел'));
    report.check('раскрытие числа предлагается', 'откуда', () => body.includes('откуда'));

    await shot(page, 'supply-01-inventory');

    // ─── Продажа меняет остаток ──────────────────────────────────────────────
    const before = Number(
      db(`select on_hand_milli from public.inventory_balances
          where business_id='${BUSINESS}' and supply_item_id=${ROSE}`).trim(),
    );

    const card = page.locator('li', { hasText: ROSE_NAME }).first();
    await card.locator('select[name="type"]').selectOption('consume');
    await card.locator('input[name="quantity"]').fill('5');
    await submit(page, `${roseCard} button:has-text("Записать движение")`);
    await page.waitForLoadState('networkidle');

    const after = Number(
      db(`select on_hand_milli from public.inventory_balances
          where business_id='${BUSINESS}' and supply_item_id=${ROSE}`).trim(),
    );
    report.check('продажа 5 стеблей уменьшила остаток', `${before} → ${after}`, () => after === before - 5000);

    // Партии обязаны сойтись с остатком: продажа списывается с той, что вянет раньше.
    const lotSum = Number(
      db(`select coalesce(sum(remaining_milli),0) from public.inventory_lots
          where business_id='${BUSINESS}' and supply_item_id=${ROSE}`).trim(),
    );
    report.check('сумма партий сходится с остатком', `партии ${lotSum} · остаток ${after}`, () => lotSum === after);

    await gotoReady(page, '/app/inventory');
    const reloaded = await page.textContent('body');
    report.check(
      'после перезагрузки остаток тот же',
      `${(after / 1000).toString().replace('.', ',')} стебель`,
      () => reloaded.includes(`${(after / 1000).toString().replace('.', ',')} стебель`),
    );

    // ─── Списание ────────────────────────────────────────────────────────────
    const wasteBefore = Number(
      db(`select count(*) from public.inventory_events
          where business_id='${BUSINESS}' and supply_item_id=${ROSE} and event_type='waste'`).trim(),
    );

    const wasteCard = page.locator('li', { hasText: ROSE_NAME }).first();
    await wasteCard.locator('select[name="type"]').selectOption('waste');
    await wasteCard.locator('select[name="wasteReason"]').selectOption('withered');
    await wasteCard.locator('input[name="quantity"]').fill('3');
    await submit(page, `${roseCard} button:has-text("Записать движение")`);
    await page.waitForLoadState('networkidle');

    const wasteAfter = Number(
      db(`select count(*) from public.inventory_events
          where business_id='${BUSINESS}' and supply_item_id=${ROSE} and event_type='waste'`).trim(),
    );
    report.check('списание записано отдельным видом события', `${wasteBefore} → ${wasteAfter}`, () => wasteAfter === wasteBefore + 1);

    const reason = db(
      `select waste_reason from public.inventory_events
       where business_id='${BUSINESS}' and supply_item_id=${ROSE} and event_type='waste'
       order by created_at desc limit 1`,
    ).trim();
    report.check('у списания сохранена причина', reason, () => reason === 'withered');

    const balanceAfterWaste = Number(
      db(`select on_hand_milli from public.inventory_balances
          where business_id='${BUSINESS}' and supply_item_id=${ROSE}`).trim(),
    );
    report.check('списание уменьшило остаток', `${after} → ${balanceAfterWaste}`, () => balanceAfterWaste === after - 3000);

    // Списание не должно попасть в спрос: иначе прогноз выучит его как продажу.
    const demandTotal = Number(
      db(`select coalesce(sum(quantity_milli),0) from private.daily_demand(
            '${BUSINESS}', ${ROSE}, null, 28)`).trim(),
    );
    const consumeTotal = Number(
      db(`select coalesce(sum(-quantity_delta_milli),0) from public.inventory_events
          where business_id='${BUSINESS}' and supply_item_id=${ROSE} and event_type='consume'
            and (occurred_at at time zone 'Asia/Almaty')::date
                > (now() at time zone 'Asia/Almaty')::date - 28`).trim(),
    );
    report.check('списание не попало в спрос', `спрос ${demandTotal} · продажи ${consumeTotal}`, () => demandTotal === consumeTotal);

    // ─── Больше, чем на витрине ──────────────────────────────────────────────
    const guardCard = page.locator('li', { hasText: ROSE_NAME }).first();
    await guardCard.locator('select[name="type"]').selectOption('consume');
    await guardCard.locator('input[name="quantity"]').fill('99999');
    await submit(page, `${roseCard} button:has-text("Записать движение")`);
    await page.waitForLoadState('networkidle');

    const guarded = await page.textContent('body');
    report.check('продажа больше витрины отклонена с объяснением', 'Больше, чем стоит на витрине', () =>
      guarded.includes('Больше, чем стоит на витрине'));

    const untouched = Number(
      db(`select on_hand_milli from public.inventory_balances
          where business_id='${BUSINESS}' and supply_item_id=${ROSE}`).trim(),
    );
    report.check('и остаток при этом не изменился', `${untouched}`, () => untouched === balanceAfterWaste);

    // ─── Очередь решений ─────────────────────────────────────────────────────
    await gotoReady(page, '/app/decisions');
    const queue = await page.textContent('body');

    report.check('очередь открывается', 'Что решаем сегодня', () => queue.includes('Что решаем сегодня'));

    const cards = await page.locator('ol > li').count();
    report.check('в очереди не больше пяти карточек', `${cards}`, () => cards <= 5);
    report.check('очередь не пустая: seed заложил обе беды', `${cards}`, () => cards > 0);
    // Очередь сводит обе беды в один список: одни позиции кончаются раньше
    // поставки, другие не успевают продаться до потери свежести.
    report.check('в очереди есть риск дефицита', 'закончится через', () => /закончится через/i.test(queue));
    report.check('в очереди есть риск списания', 'не успеет продаться', () =>
      /не успеет продаться|под списание/i.test(queue));
    report.check('очередь называет спрос в день', 'Спрос в день', () => queue.includes('Спрос в день'));
    report.check('праздничный повод учтён и подписан', 'Учтён повод', () => queue.includes('Учтён повод'));

    await shot(page, 'supply-02-queue');

    // ─── Пересчёт пишет снимки ───────────────────────────────────────────────
    await gotoReady(page, '/app/inventory');
    await submit(page, 'button:has-text("Пересчитать риски")');
    await page.waitForLoadState('networkidle');

    const forecasts = Number(
      db(`select count(*) from public.demand_forecasts where business_id='${BUSINESS}'`).trim(),
    );
    report.check('снимки прогноза сохранены', `${forecasts}`, () => forecasts >= 8);

    const stockoutRisks = Number(
      db(`select count(*) from public.supply_risks
          where business_id='${BUSINESS}' and status='open' and risk_type='stockout'`).trim(),
    );
    report.check('риски дефицита записаны', `${stockoutRisks}`, () => stockoutRisks > 0);

    const expiryRisks = Number(
      db(`select count(*) from public.supply_risks
          where business_id='${BUSINESS}' and status='open' and risk_type='expiry'`).trim(),
    );
    report.check('риски списания записаны отдельным типом', `${expiryRisks}`, () => expiryRisks > 0);

    const withEvidence = db(
      `select count(*) from public.demand_forecasts
       where business_id='${BUSINESS}' and model_version <> '' and sample_days > 0`,
    ).trim();
    report.check('у каждого снимка есть версия формулы и размер выборки', withEvidence, () => Number(withEvidence) >= 8);

    const eventApplied = db(
      `select count(*) from public.demand_forecasts
       where business_id='${BUSINESS}' and assumptions::text like '%свадьб%'`,
    ).trim();
    report.check('праздничный коэффициент попал в допущения снимка', eventApplied, () => Number(eventApplied) > 0);

    return report.finish();
  } finally {
    await browser.close();
  }
}
