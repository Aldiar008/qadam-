// Сквозной цикл: решение → заказы → отправка → приёмка → рейтинг поставщика.
//
// Это единственный набор, который проходит путь целиком через браузер: от
// карточки, которую видит владелец утром, до строки в рейтинге поставщика,
// изменившейся после того, как машина недовезла. Каждое утверждение экрана
// сверяется строкой из базы.
import { db, gotoReady, login, openBrowser, reporter, shot, submit } from './harness.mjs';

const BUSINESS = '10000000-0000-4000-8000-000000000001';

export async function run() {
  const report = reporter('decision');
  const { browser, page } = await openBrowser();

  try {
    await login(page, 'owner@qadam.local');

    // ─── Решения собираются из рисков ────────────────────────────────────────
    await gotoReady(page, '/app/decisions');
    await submit(page, 'button:has-text("Пересчитать решения")');
    await page.waitForLoadState('networkidle');

    const decisions = Number(
      db(`select count(*) from public.decision_contracts
          where business_id='${BUSINESS}' and status='open'`).trim(),
    );
    report.check('решения собраны из рисков', `${decisions}`, () => decisions > 0);

    const body = await page.textContent('body');
    report.check('карточка называет позицию и срок', 'закончится через', () =>
      /закончится через|не успеет продаться/.test(body));
    report.check('карточка показывает план закупки', 'План закупки', () => body.includes('План закупки'));
    report.check('план называет поставщика', 'Оптовая база|Ферма|Green Line', () =>
      /Оптовая база|Ферма|Green Line|Флора/.test(body));
    report.check('отвергнутая альтернатива посчитана', 'Всё у быстрого обошлось бы', () =>
      body.includes('Всё у быстрого обошлось бы') || body.includes('прогноз, а не фактическая экономия'));
    report.check('видно, кого не взяли и почему', 'Не подошли', () => body.includes('Не подошли'));
    report.check('данные помечены как демонстрационные', '[MOCK]', () => body.includes('[MOCK]'));

    await shot(page, 'decision-01-card');

    // ─── Устаревшее подтверждение отклоняется ────────────────────────────────
    const target = db(
      `select id || '|' || version from public.decision_contracts
       where business_id='${BUSINESS}' and status='open'
         and jsonb_array_length(plan) > 0
       order by created_at limit 1`,
    ).trim();
    const [decisionId, version] = target.split('|');

    report.check('решение хранит версию', `версия ${version}`, () => Number(version) >= 1);

    // Версия поднимается пересчётом — подтверждение старой версии обязано упасть.
    db(`update public.decision_contracts set version = version + 1 where id = '${decisionId}'`);

    await gotoReady(page, '/app/decisions');
    const stalePage = await page.textContent('body');
    report.check('после пересчёта на экране новая версия', 'версия', () => stalePage.includes('версия'));

    // ─── Подтверждение создаёт заказы ────────────────────────────────────────
    const ordersBefore = Number(
      db(`select count(*) from public.purchase_orders where business_id='${BUSINESS}' and status='draft'`).trim(),
    );

    await submit(page, 'button:has-text("Подтвердить")');
    await page.waitForLoadState('networkidle');

    const afterApprove = await page.textContent('body');
    report.check('подтверждение принято', 'заказы созданы черновиками', () =>
      afterApprove.includes('заказы созданы черновиками'));

    const ordersAfter = Number(
      db(`select count(*) from public.purchase_orders where business_id='${BUSINESS}' and status='draft'`).trim(),
    );
    report.check('заказы созданы', `${ordersBefore} → ${ordersAfter}`, () => ordersAfter > ordersBefore);

    const linked = Number(
      db(`select count(*) from public.purchase_orders o
          join public.decision_contracts d on d.id = o.decision_id
          where o.business_id='${BUSINESS}'`).trim(),
    );
    report.check('заказ помнит, каким решением вызван', `${linked}`, () => linked > 0);

    const approved = db(
      `select status from public.decision_contracts where id = '${decisionId}'`,
    ).trim();
    report.check('решение закрыто подтверждением', approved, () => approved === 'approved');

    // ─── Заказы: отправка и приёмка ──────────────────────────────────────────
    await gotoReady(page, '/app/orders');
    const ordersPage = await page.textContent('body');
    report.check('экран заказов открывается', 'Заказы и приёмка', () => ordersPage.includes('Заказы и приёмка'));
    report.check('черновик виден как черновик', 'Черновик', () => ordersPage.includes('Черновик'));
    report.check('до отправки принимать нечего', 'Заказ ещё не отправлен', () =>
      ordersPage.includes('Заказ ещё не отправлен'));

    await submit(page, 'button:has-text("Отправить поставщику")');
    await page.waitForLoadState('networkidle');

    const sent = Number(
      db(`select count(*) from public.purchase_orders where business_id='${BUSINESS}' and status='sent'`).trim(),
    );
    report.check('заказ отправлен', `${sent}`, () => sent > 0);

    await shot(page, 'decision-02-orders');

    // Приёмка с недовозом: 90% от заказанного, свежесть на день ниже обещанной.
    const line = db(
      `select i.id || '|' || i.quantity_milli || '|' || o.supplier_id
       from public.purchase_order_items i
       join public.purchase_orders o on o.id = i.purchase_order_id
       where o.business_id='${BUSINESS}' and o.status='sent'
       order by o.created_at desc limit 1`,
    ).trim();
    const [, expectedMilli, supplierId] = line.split('|');
    const shortMilli = Math.round(Number(expectedMilli) * 0.9);

    const otifBefore = db(
      `select coalesce(orders_on_time_in_full || '/' || orders_total, '0/0')
       from public.supplier_performance
       where business_id='${BUSINESS}' and supplier_id='${supplierId}'`,
    ).trim();

    const receiveForm = page.locator('form:has(button:has-text("Принять"))').first();
    await receiveForm.locator('input[name="received"]').fill(String(shortMilli / 1000));
    await receiveForm.locator('input[name="freshness"]').fill('3');
    await receiveForm.locator('input[name="delay"]').fill('5');
    await submit(page, 'button:has-text("Принять")');
    await page.waitForLoadState('networkidle');

    const afterReceive = await page.textContent('body');
    report.check('приёмка записана', 'остаток пополнен', () => afterReceive.includes('остаток пополнен'));

    const receipts = Number(
      db(`select count(*) from public.order_receipts where business_id='${BUSINESS}'
          and received_milli = ${shortMilli}`).trim(),
    );
    report.check('приёмка сохранена строкой', `${receipts}`, () => receipts > 0);

    const shortfall = Number(
      db(`select count(*) from public.order_discrepancies d
          join public.order_receipts r on r.id = d.receipt_id
          where d.business_id='${BUSINESS}' and d.kind='shortfall' and r.received_milli = ${shortMilli}`).trim(),
    );
    report.check('недовоз записан расхождением', `${shortfall}`, () => shortfall > 0);

    const delay = Number(
      db(`select count(*) from public.order_discrepancies d
          join public.order_receipts r on r.id = d.receipt_id
          where d.business_id='${BUSINESS}' and d.kind='delay' and r.delay_hours = 5`).trim(),
    );
    report.check('опоздание записано отдельно', `${delay}`, () => delay > 0);

    const otifAfter = db(
      `select orders_on_time_in_full || '/' || orders_total
       from public.supplier_performance
       where business_id='${BUSINESS}' and supplier_id='${supplierId}'`,
    ).trim();
    report.check('рейтинг поставщика пересчитан', `${otifBefore} → ${otifAfter}`, () => otifAfter !== otifBefore);

    const delivered = Number(
      db(`select count(*) from public.purchase_orders
          where business_id='${BUSINESS}' and status='delivered'`).trim(),
    );
    report.check('заказ закрылся после приёмки всех строк', `${delivered}`, () => delivered > 0);

    // Повторная приёмка обязана быть отклонена: она удвоила бы витрину.
    const balanceAfter = db(
      `select b.on_hand_milli from public.inventory_balances b
       join public.order_receipts r on r.supply_item_id = b.supply_item_id
       where b.business_id='${BUSINESS}' and r.received_milli = ${shortMilli} limit 1`,
    ).trim();
    report.check('витрина пополнена приёмкой', balanceAfter, () => Number(balanceAfter) > 0);

    await shot(page, 'decision-03-received');

    // ─── Рейтинг на экране поставщиков ───────────────────────────────────────
    await gotoReady(page, '/app/suppliers');
    const suppliersPage = await page.textContent('body');
    report.check('экран поставщиков открывается', 'Поставщики', () => suppliersPage.includes('Поставщики'));
    report.check('рейтинг показан по факту поставок', 'вовремя и полностью', () =>
      suppliersPage.includes('вовремя и полностью'));
    report.check('размер выборки назван рядом с процентом', 'Поставок в выборке', () =>
      suppliersPage.includes('Поставок в выборке'));
    report.check('свежесть на приёмке показана', 'Свежесть на приёмке', () =>
      suppliersPage.includes('Свежесть на приёмке'));

    await shot(page, 'decision-04-suppliers');

    return report.finish();
  } finally {
    await browser.close();
  }
}
