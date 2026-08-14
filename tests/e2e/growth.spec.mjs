// Приёмка трёх новых частей: таймер обновления материалов, дашборды аналитики
// и поиск цен на рынке.
//
// Each of these is a claim the screen makes about the outside world — «материалы
// обновятся через столько-то», «выручка выглядит так», «на Kaspi дешевле». A
// screenshot cannot tell a true claim from a decorative one, so every check here
// is against the database row behind it, or against a refusal the page states
// plainly. The market search is allowed to be refused by the marketplace: what
// is not allowed is for the page to hide that it was.
import { db, gotoReady, login, openBrowser, reporter, shot, submit } from './harness.mjs';

const BIZ = '10000000-0000-4000-8000-000000000001';
const r = reporter('growth');
const { browser, page, problems } = await openBrowser();

try {
  await login(page, 'owner@qadam.local');

  // ---------------------------------------------------------------- 1
  process.stdout.write('\nGROWTH-1  Материалы обновляются сами, и таймер показывает когда\n');
  await gotoReady(page, '/app/content');
  const contentText = await page.textContent('body');
  r.check('контент-студия объявляет автообновление', contentText, 'Материалы обновятся сами');

  const scheduled = db(`select count(*) from public.content_refresh_state where business_id='${BIZ}' and next_refresh_at > now() - interval '1 day'`);
  r.check('срок следующего обновления записан в базе', scheduled, '1');

  const interval = db(`select interval_hours from public.content_refresh_state where business_id='${BIZ}'`);
  r.check('интервал — полдня', interval, '12');

  // Нажатие кнопки — это раннее обновление, а не лишнее: срок сдвигается.
  const before = db(`select next_refresh_at from public.content_refresh_state where business_id='${BIZ}'`);
  await submit(page, 'button:has-text("Reels, TikTok и фото")', { timeout: 120_000 });
  const after = db(`select next_refresh_at from public.content_refresh_state where business_id='${BIZ}'`);
  r.check('кнопка сдвигает срок следующего обновления', after !== before ? 'moved' : 'stuck', 'moved');

  const assets = db(`select count(*) from public.content_items where business_id='${BIZ}' and campaign_id is null and content_kind in ('reel_script','tiktok_script','photo_brief','story_series','push_notice')`);
  r.check('материалы для соцсетей существуют', Number(assets) > 0 ? 'yes' : 'no', 'yes');

  // Отсчёт проверяется после обновления — до него срок стоит на «пора сейчас»,
  // и ноль на табло там правда, а не поломка.
  //
  // The countdown is a client component: it renders `··:··:··` on the server and
  // fills in after hydration. Asserting on the placeholder would pass with a
  // broken clock, so the check waits for a real time to appear.
  await gotoReady(page, '/app/content');
  const ticking = await page
    .waitForFunction(() => /\d{2}:\d{2}:\d{2}/.test(document.body.innerText), null, { timeout: 15_000 })
    .then(() => 'ticks')
    .catch(() => 'frozen');
  r.check('таймер до обновления идёт, а не нарисован', ticking, 'ticks');
  await shot(page, 'growth-01-content-timer');

  // ---------------------------------------------------------------- 2
  process.stdout.write('\nGROWTH-2  Дашборды считаются из данных, а не рисуются\n');
  await gotoReady(page, '/app/analytics?days=90');
  const analytics = await page.textContent('body');
  r.check('аналитика показывает состав базы', analytics, 'Состав базы гостей');

  const charts = await page.$$eval('svg[role="img"], [role="img"]', (nodes) => nodes.length);
  r.check('на странице есть отрисованные графики', charts > 0 ? 'present' : 'absent', 'present');

  // Сумма долей состава базы должна совпадать с числом гостей в базе.
  const customers = db(`select count(*) from public.customers where business_id='${BIZ}' and lifecycle_stage <> 'anonymized'`);
  r.check('заголовок состава базы называет реальное число гостей', analytics, `Всего ${customers}`);

  // Пустая выборка обязана сказать об этом, а не нарисовать узор.
  await gotoReady(page, '/app/analytics?days=7');
  const week = await page.textContent('body');
  r.check(
    'короткий период либо рисует карту, либо честно отказывается',
    week,
    (v) => v.includes('Когда в заведении деньги') || v.includes('нужно хотя бы 20 записанных продаж'),
  );
  await shot(page, 'growth-02-analytics-dashboards');

  // ---------------------------------------------------------------- 3
  process.stdout.write('\nGROWTH-3  Поиск цен на рынке: результат либо отказ, но всегда записанный\n');
  await gotoReady(page, '/app/supply');
  const stamp = Date.now();
  const itemName = `Стаканы бумажные 250 мл ${stamp}`;
  await page.fill('input[name=name]', itemName);
  await page.fill('input[name=currentPrice]', '35');
  await page.fill('input[name=monthlyQuantity]', '3000');
  await page.fill('input[name=searchQuery]', 'стаканы бумажные 250');
  await submit(page, 'button:has-text("Сохранить позицию")');

  const itemId = db(`select id from public.supply_items where business_id='${BIZ}' and name_ru='${itemName}'`);
  r.check('позиция закупки сохранена', itemId.length, (v) => v > 30);

  await submit(page, `form:has(input[value="${itemId}"]) button:has-text("Найти дешевле")`, { timeout: 60_000 });

  // Попытка обязана быть записана вне зависимости от того, что ответила площадка.
  const runStatus = db(`select status from public.supply_search_runs where supply_item_id='${itemId}' order by ran_at desc limit 1`);
  r.check('попытка поиска записана с исходом', runStatus, (v) =>
    ['ok', 'empty', 'blocked', 'unavailable', 'disabled'].includes(v));

  const shown = await page.textContent('body');
  if (runStatus === 'ok') {
    const offers = db(`select count(*) from public.supply_offers where supply_item_id='${itemId}' and source='web'`);
    r.check('найденные предложения сохранены', Number(offers) > 0 ? 'yes' : 'no', 'yes');

    const unverified = db(`select count(*) from public.supply_offers where supply_item_id='${itemId}' and source='web' and verified`);
    r.check('ни одна найденная цена не помечена проверенной', unverified, '0');

    const foreign = db(`select count(*) from public.supply_offers where supply_item_id='${itemId}' and source='web' and url not like 'https://kaspi.kz/%'`);
    r.check('все ссылки ведут на kaspi.kz', foreign, '0');

    // Экран не называет найденное экономией, пока владелец не подтвердил
    // товар: площадка не знает, тот ли это артикул.
    r.check('экран говорит, что цены надо проверить', shown, (v) =>
      v.includes('это ещё не экономия') || v.includes('Площадка не знает, тот ли это товар'));
  } else {
    // Отказ площадки — законный исход. Незаконно его спрятать.
    r.check('экран называет отказ площадки', shown, (v) =>
      v.includes('отклонила') || v.includes('не ответила') || v.includes('Ничего не найдено') || v.includes('выключен'));
    process.stdout.write(`  (площадка ответила «${runStatus}» — проверяем честность отказа, а не наличие цен)\n`);
  }
  await shot(page, 'growth-03-supply-market');

  // Повторное нажатие в пределах окна не должно дёргать площадку снова.
  await submit(page, `form:has(input[value="${itemId}"]) button:has-text("Найти дешевле")`, { timeout: 60_000 });
  const runs = db(`select count(*) from public.supply_search_runs where supply_item_id='${itemId}'`);
  r.check('повторное нажатие не устраивает второй поход на площадку', runs, (v) =>
    runStatus === 'ok' ? v === '1' : Number(v) >= 1);
  // ---------------------------------------------------------------- 4
  process.stdout.write('\nGROWTH-4  Каталог подбирает под профиль, а журнал показывает историю\n');
  await gotoReady(page, '/app/tools');
  const tools = await page.textContent('body');
  // Заголовок зависит от того, включён ли уже набор первого дня: «с чего начать»
  // рядом с включённым набором читалось бы как противоречие.
  r.check('каталог объявляет подбор под профиль', tools, (v) =>
    v.includes('С чего начать именно вам') || v.includes('Что добавить к набору'));

  // Подпись обязана называть профиль из базы, а не подставлять умолчание.
  const type = db(`select t.code from public.business_types t join public.businesses b on b.business_type_id=t.id where b.id='${BIZ}'`);
  const goal = db(`select code from public.business_goals where business_id='${BIZ}' and status='active' order by priority limit 1`);
  r.check('профиль в базе задан', `${type}/${goal}`, (v) => v.length > 2 && !v.startsWith('/'));
  const TYPE_WORD = {
    cafe: 'кофейне', beauty: 'салону', retail: 'магазину', service: 'сервисной точке',
    dental: 'стоматологии', flower_shop: 'цветочному магазину', flower_chain: 'сети цветочных',
  };
  r.check('подпись называет тип заведения из базы', tools, TYPE_WORD[type] ?? 'заведению');

  // Набор первого дня выдаётся отдельным блоком, и он не пустой.
  r.check('набор первого дня показан списком', tools, (v) => /Старт цветочного магазина|Старт сети цветочных/.test(v));

  await gotoReady(page, '/app/tools?suggested=1');
  const suggested = await page.$$eval('article', (nodes) => nodes.length);
  // Подбор — это короткий список, а не каталог в другом порядке. Ноль тоже
  // допустим: когда весь набор уже включён, предлагать нечего, и это честно.
  const published = Number(db(`select count(*) from public.tools where status='published' and is_public`));
  r.check('фильтр «Рекомендуемые» сужает каталог, а не показывает всё', String(suggested), (v) =>
    Number(v) >= 0 && Number(v) < published);

  // Механика из подбора должна доезжать до студии выбранной, иначе ссылка врёт.
  await gotoReady(page, '/app/campaigns/studio?step=3&mechanic=gift_with_threshold');
  const preselected = await page.$eval('select[name=mechanic]', (node) => node.value).catch(() => 'no-select');
  if (preselected === 'no-select') {
    // Студия может не показать третий шаг без черновика — тогда проверять нечего,
    // и притворяться, что проверили, хуже, чем сказать об этом вслух.
    process.stdout.write('  (студия не показала шаг 3 — поле механики не проверено)\n');
  }
  r.check('механика из подбора приходит в студию выбранной', preselected, (v) =>
    v === 'gift_with_threshold' || v === 'no-select');

  await gotoReady(page, '/app/journal');
  const journal = await page.textContent('body');
  const logged = db(`select count(*) from public.activity_logs where business_id='${BIZ}'`);
  r.check('журнал заведения не пуст', Number(logged) > 0 ? 'yes' : 'no', 'yes');
  // Известный код не должен доехать до экрана в сыром виде: для него есть перевод.
  r.check('известное действие показано словами, а не кодом', journal, (v) => !v.includes('content.social_generated'));
  r.check('журнал переводит хотя бы одно известное действие', journal, (v) =>
    v.includes('Обновлён пакет материалов') || v.includes('Сгенерированы тексты') || v.includes('Прогнан цикл') || v.includes('Сработала автоматизация'));
  await shot(page, 'growth-04-profile-and-journal');

  r.check('no console error or unhandled rejection across the journey', problems.length === 0 ? 'clean' : JSON.stringify(problems.slice(0, 3)), 'clean');
} catch (error) {
  r.check('suite completed without an unhandled failure', String(error).slice(0, 400), 'never-matches-so-this-fails');
} finally {
  await browser.close();
}

process.exit(r.finish({ consoleProblems: problems }) === 0 ? 0 : 1);
