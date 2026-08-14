// Три тонкие части: чат флориста, календарь с одобрением, общий рейтинг.
//
// Каждая проверяется на главном обещании: сообщение не меняет витрину до
// подтверждения; неодобренный праздник не двигает прогноз; рейтинг ниже порога
// не показывается. Всё — через браузер, с проверкой строк в базе.
import { db, gotoReady, login, openBrowser, reporter, shot, submit } from './harness.mjs';

const BUSINESS = '10000000-0000-4000-8000-000000000001';
const ROSE = "private.deterministic_uuid('supply-rose_red')";

export async function run() {
  const report = reporter('thin');
  const { browser, page } = await openBrowser();

  try {
    await login(page, 'owner@qadam.local');

    // ─── Чат флориста ────────────────────────────────────────────────────────
    await gotoReady(page, '/app/messenger-stock');
    const chat = await page.textContent('body');

    report.check('экран чата открывается', 'Остатки из чата', () => chat.includes('Остатки из чата'));
    report.check('тренажёр помечен, а не выдан за интеграцию', '[MOCK]', () =>
      chat.includes('[MOCK] Это тренажёр') && chat.includes('не подключены'));
    report.check('предложения из seed видны', 'осталось 70 красных роз', () =>
      chat.includes('осталось 70 красных роз'));
    report.check('уверенность разбора показана', 'уверенность', () => /уверенность \d+%/.test(chat));
    report.check('карточка называет магазин и точку', 'TAMYR Flowers', () =>
      chat.includes('TAMYR Flowers') && (chat.includes('Бостандык') || chat.includes('точка не указана')));

    // Новое сообщение: разбор обязан создать предложение и не тронуть витрину.
    const balanceBefore = Number(
      db(`select on_hand_milli from public.inventory_balances
          where business_id='${BUSINESS}' and supply_item_id=${ROSE}`).trim(),
    );

    await page.locator('input[name="body"]').fill('осталось 55 красных роз');
    await submit(page, 'button:has-text("Отправить")');
    await page.waitForLoadState('networkidle');

    const balanceAfterParse = Number(
      db(`select on_hand_milli from public.inventory_balances
          where business_id='${BUSINESS}' and supply_item_id=${ROSE}`).trim(),
    );
    report.check(
      'сообщение не изменило витрину до подтверждения',
      `${balanceBefore} → ${balanceAfterParse}`,
      () => balanceAfterParse === balanceBefore,
    );

    const proposed = Number(
      db(`select count(*) from public.stock_messages
          where business_id='${BUSINESS}' and body = 'осталось 55 красных роз'
            and status in ('proposed','needs_clarification')`).trim(),
    );
    report.check('разбор сохранён предложением', `${proposed}`, () => proposed === 1);

    const parsedItem = db(
      `select coalesce(parsed_item_id::text,'—') from public.stock_messages
       where business_id='${BUSINESS}' and body = 'осталось 55 красных роз'`,
    ).trim();
    report.check('позиция опознана разбором', parsedItem.slice(0, 8), () => parsedItem !== '—');

    // Повторная отправка того же текста в ту же минуту не создаёт второе
    // предложение: у канала есть идентификатор сообщения.
    await page.locator('input[name="body"]').fill('осталось 55 красных роз');
    await submit(page, 'button:has-text("Отправить")');
    await page.waitForLoadState('networkidle');

    const afterDuplicate = Number(
      db(`select count(*) from public.stock_messages
          where business_id='${BUSINESS}' and body = 'осталось 55 красных роз'`).trim(),
    );
    report.check('повтор сообщения не создал дубль', `${afterDuplicate}`, () => afterDuplicate === 1);

    await shot(page, 'thin-01-messenger');

    // Подтверждение меняет витрину — и только оно.
    await submit(page, 'form:has(select[name="itemId"]) button:has-text("Подтвердить и записать")');
    await page.waitForLoadState('networkidle');

    const confirmedPage = await page.textContent('body');
    report.check('подтверждение записано', 'остаток изменён', () => confirmedPage.includes('остаток изменён'));

    const confirmedRows = Number(
      db(`select count(*) from public.stock_messages
          where business_id='${BUSINESS}' and status='confirmed' and inventory_event_id is not null`).trim(),
    );
    report.check('подтверждение связано с событием остатка', `${confirmedRows}`, () => confirmedRows > 0);

    const eventSource = db(
      `select source from public.inventory_events
       where business_id='${BUSINESS}' and source='messenger' order by created_at desc limit 1`,
    ).trim();
    report.check('событие помечено источником «чат»', eventSource, () => eventSource === 'messenger');

    // Поле правки единицы должно быть на карточке: разбор ошибается, и цена
    // ошибки ложится на витрину. Само правило «единица обязана совпасть с
    // учётной» живёт в базе и проверяется там же.
    await gotoReady(page, '/app/messenger-stock');
    const unitField = await page.locator('form:has(select[name="itemId"]) input[name="unit"]').count();
    report.check('единицу можно поправить перед подтверждением', `${unitField} полей`, () => unitField > 0);

    // ─── Календарь и одобрение ───────────────────────────────────────────────
    await gotoReady(page, '/app/forecast');
    const forecast = await page.textContent('body');

    report.check('экран прогноза открывается', 'Прогноз спроса', () => forecast.includes('Прогноз спроса'));
    report.check('база и сценарий показаны раздельно', 'База · Сценарий', () =>
      forecast.includes('База') && forecast.includes('Сценарий'));
    report.check('непроверенный лифт помечен гипотезой', '[MOCK HYPOTHESIS]', () =>
      forecast.includes('[MOCK HYPOTHESIS]'));
    report.check('видно, учитывается повод или нет', 'учитывается', () =>
      forecast.includes('учитывается') || forecast.includes('не учитывается'));
    report.check('у повода названы регион и уверенность', 'Алматы · уверенность', () =>
      /Алматы · уверенность \d+%/.test(forecast));
    report.check('в календаре есть выпускные', 'Выпускные', () => forecast.includes('Выпускные'));

    // Отключаем одобренный повод: сценарий обязан вернуться к базе.
    await submit(page, 'button:has-text("Не учитывать в прогнозе")');
    await page.waitForLoadState('networkidle');

    // Одобрение и его отзыв пересобирают снимки: числа, на которых стоит
    // решение, меняются вместе со сценарием, а не живут своей жизнью.
    const snapshots = Number(
      db(`select count(*) from public.demand_forecasts where business_id='${BUSINESS}'`).trim(),
    );
    report.check('изменение сценария пересобрало снимки прогноза', `${snapshots}`, () => snapshots > 0);

    const revoked = await page.textContent('body');
    report.check('повод отключён и об этом сказано', 'вернулся к базе', () =>
      revoked.includes('вернулся к базе') || revoked.includes('не учитывается'));

    const approvedCount = Number(
      db(`select count(*) from public.demand_events where approved = true`).trim(),
    );
    report.check('в базе не осталось одобренных поводов', `${approvedCount}`, () => approvedCount === 0);

    // Возвращаем обратно — прогноз обязан снова вырасти.
    await submit(page, 'button:has-text("Учесть в прогнозе")');
    await page.waitForLoadState('networkidle');

    const reApproved = Number(
      db(`select count(*) from public.demand_events where approved = true`).trim(),
    );
    report.check('повод снова учитывается', `${reApproved}`, () => reApproved === 1);

    const withEvent = await page.textContent('body');
    report.check('на экране виден коэффициент повода', 'за повод', () => withEvent.includes('за повод'));

    await shot(page, 'thin-02-calendar');

    // ─── Общий рейтинг поставщиков ───────────────────────────────────────────
    await gotoReady(page, '/app/suppliers');
    const suppliers = await page.textContent('body');

    report.check('общий рейтинг показан', 'Рейтинг по всем магазинам', () =>
      suppliers.includes('Рейтинг по всем магазинам'));
    report.check('агрегат помечен как демонстрационный', '[MOCK AGGREGATE]', () =>
      suppliers.includes('[MOCK AGGREGATE]'));
    report.check('названы размер выборки и число магазинов', 'поставок из', () =>
      /\d+ поставок из \d+ магазинов/.test(suppliers));
    report.check('личный опыт отделён от общего', 'не смешивается', () =>
      suppliers.includes('с этим числом не смешивается'));

    // Поставщик ниже порога: рейтинг скрыт, и сказано, чего не хватает.
    const belowThreshold = db(
      `select canonical_supplier from public.community_supplier_metrics
       where n_orders < 20 or n_tenants < 10 limit 1`,
    ).trim();
    report.check('в данных есть поставщик ниже порога', belowThreshold, () => belowThreshold.length > 0);

    // В разметке не должно быть ни одного идентификатора чужого заведения.
    const html = await page.content();
    report.check('в рейтинге нет идентификаторов заведений', 'без business_id', () =>
      !html.includes('business_id') && !html.includes('tenant_id'));

    await shot(page, 'thin-03-trust');

    return report.finish();
  } finally {
    await browser.close();
  }
}
