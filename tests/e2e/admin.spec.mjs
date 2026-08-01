// Admin acceptance journey — the platform console, its audit trail, and the
// boundary between the console and a tenant.
import { BASE, db, gotoReady, login, openBrowser, reporter, shot, submit } from './harness.mjs';

const BIZ = '10000000-0000-4000-8000-000000000001';
const r = reporter('admin');
const { browser, context, page, problems } = await openBrowser();
const stamp = Date.now();
const catCode = `e2e_cat_${stamp}`;
const typeCode = `e2e_type_${stamp}`;
const toolCode = `e2e_tool_${stamp}`;

/** Fills every visible field of a form and submits it. */
async function fillAndSubmit(page, formSelector, values, buttonText) {
  for (const [name, value] of Object.entries(values)) {
    const field = page.locator(`${formSelector} [name="${name}"]`);
    if (!(await field.count())) continue;
    const tag = await field.first().evaluate((el) => el.tagName + ':' + (el.type ?? ''));
    if (tag.startsWith('SELECT')) await field.first().selectOption(String(value));
    else if (tag.endsWith(':checkbox')) { if (value) await field.first().check(); }
    else await field.first().fill(String(value));
  }
  return submit(page, `${formSelector} button:has-text("${buttonText}")`);
}

try {
  // ---------------------------------------------------------------- 8 (first: prove the gate before using it)
  process.stdout.write('\nADMIN-8  A direct URL is refused server-side, not merely hidden\n');
  const anon = await context.browser().newContext();
  const anonPage = await anon.newPage();
  await anonPage.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
  r.check('anonymous is sent to login, carrying the intended route', anonPage.url(), '/login?next=%2Fadmin');
  await anon.close();

  const tenant = await context.browser().newContext();
  const tenantPage = await tenant.newPage();
  await login(tenantPage, 'owner@qadam.local');
  for (const route of ['/admin', '/admin/tools', '/admin/categories', '/admin/templates', '/admin/analytics']) {
    await tenantPage.goto(BASE + route, { waitUntil: 'domcontentloaded' });
    r.check(`tenant owner is refused ${route}`, tenantPage.url(), 'error=admin_access_required');
  }
  r.check('the console link is absent from the tenant navigation', await tenantPage.content(), (v) => !v.includes('href="/admin"'));
  await tenant.close();

  r.check('the platform role lives in a private table', db(`select count(*) from information_schema.tables where table_schema='private' and table_name='platform_admin_assignments'`), '1');
  r.check('that table is not readable by an application role', db(`select count(*) from information_schema.role_table_grants where table_schema='private' and grantee in ('authenticated','anon')`), '0');
  r.check('the role check never consults user_metadata', db(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='is_platform_admin' and p.prosrc like '%user_metadata%'`), '0');

  // ---------------------------------------------------------------- 1
  process.stdout.write('\nADMIN-1  Platform admin signs in and reaches the console\n');
  await login(page, 'admin@qadam.local');
  const adminResponse = await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
  r.check('the console renders for a platform admin', String(adminResponse.status()), '200');
  r.check('the header names the resolved role', await page.textContent('header'), 'platform_admin');
  await shot(page, 'admin-01-console');

  // ---------------------------------------------------------------- 7 (dashboard is read before the writes that move it)
  process.stdout.write('\nADMIN-7  Dashboard figures come from aggregates\n');
  const dashboard = await page.textContent('main');
  r.check('active businesses matches a direct count', dashboard, db(`select count(*)::text from public.businesses where status='active'`));
  r.check('AI fallback rate is reported', dashboard, 'откат');
  r.check('automation failures are reported', dashboard, 'сбо');
  r.check('a cohort too small to be anonymous is withheld', await (async () => { await page.goto(`${BASE}/admin?city=NoSuchCity`, { waitUntil: 'domcontentloaded' }); return page.textContent('main'); })(), 'Срез скрыт');
  await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
  r.check('no customer PII appears anywhere on the console', await page.content(), (v) => !/@example\.test/.test(v) && !/masked_value/.test(v));

  // ---------------------------------------------------------------- 3
  process.stdout.write('\nADMIN-3  Create a category and control its order\n');
  await gotoReady(page, '/admin/categories');
  await fillAndSubmit(page, 'form:has([name="sortOrder"])', {
    code: catCode, nameRu: 'E2E категория', nameKk: 'E2E санат', sortOrder: '97', reason: 'E2E создание категории',
  }, 'Добавить категорию');
  r.check('the category exists with its order', db(`select code||' / '||status||' / '||sort_order from public.tool_categories where code='${catCode}'`), `${catCode} / `);
  const catId = db(`select id from public.tool_categories where code='${catCode}'`);
  await gotoReady(page, '/admin/categories');
  await fillAndSubmit(page, `form:has(input[value="${catId}"]):has([name="sortOrder"])`, {
    nameRu: 'E2E категория переименована', sortOrder: '12',
  }, 'Сохранить');
  r.check('reordering is an edit, not a duplicate', db(`select count(*)||' rows, order '||max(sort_order)::text from public.tool_categories where code='${catCode}'`), '1 rows, order 12');
  r.check('the rename took effect', db(`select name_ru from public.tool_categories where code='${catCode}'`), 'переименована');
  r.check('the edit was audited with before and after', db(`select count(*) from public.admin_audit_log where resource_code='${catCode}' and action='category.updated' and before_state is not null and after_state is not null`), (v) => Number(v) > 0);

  // ---------------------------------------------------------------- 4
  process.stdout.write('\nADMIN-4  Add a business type\n');
  await fillAndSubmit(page, 'form:has(button:has-text("Добавить тип"))', {
    code: typeCode, nameRu: 'E2E тип', nameKk: 'E2E түрі', reason: 'E2E создание типа бизнеса',
  }, 'Добавить тип');
  r.check('the business type exists', db(`select code||' / '||status from public.business_types where code='${typeCode}'`), `${typeCode} / `);
  await shot(page, 'admin-04-categories');

  // ---------------------------------------------------------------- 2
  process.stdout.write('\nADMIN-2  Create, publish and archive a tool\n');
  await gotoReady(page, '/admin/tools');
  const categoryId = db(`select id from public.tool_categories where code='${catCode}'`);
  await fillAndSubmit(page, 'form:has([name="code"])', {
    code: toolCode, categoryId, nameRu: 'E2E инструмент', nameKk: 'E2E құралы',
    descriptionRu: 'Описание для E2E', descriptionKk: 'E2E сипаттамасы', route: '/app/tools',
    isPublic: true, reason: 'E2E создание инструмента',
  }, 'Создать черновик');
  r.check('the tool is created as a draft, not published by accident', db(`select status from public.tools where code='${toolCode}'`), 'draft');

  // ---------------------------------------------------------------- 6 (draft must be invisible before publication)
  process.stdout.write('\nADMIN-6  The owner catalogue follows publication state\n');
  const ownerCtx = await context.browser().newContext();
  const ownerPage = await ownerCtx.newPage();
  await login(ownerPage, 'owner@qadam.local');
  await gotoReady(ownerPage, '/app/tools');
  r.check('a draft tool is invisible to the owner', await ownerPage.textContent('main'), (v) => !v.includes('E2E инструмент'));

  await gotoReady(page, '/admin/tools');
  await submit(page, `form:has(input[value="${db(`select id from public.tools where code='${toolCode}'`)}"]) button:has-text("Опубликовать")`);
  r.check('the tool is published and its version moved', db(`select status||' v'||version from public.tools where code='${toolCode}'`), 'published v');
  await gotoReady(ownerPage, '/app/tools');
  r.check('the published tool reaches the owner catalogue', await ownerPage.textContent('main'), 'E2E инструмент');
  await ownerCtx.close();
  await shot(page, 'admin-02-tools');

  process.stdout.write('\nADMIN-2b  Archiving requires a fresh credential check\n');
  const toolId = db(`select id from public.tools where code='${toolCode}'`);
  db(`delete from private.admin_reauth`);
  await gotoReady(page, '/admin/tools');
  await submit(page, `form:has(input[value="${toolId}"]) button:has-text("Архивировать")`);
  r.check('archiving is refused without a fresh check', db(`select status from public.tools where code='${toolCode}'`), 'published');
  r.check('the refusal is explained on screen', page.url() + ' ' + (await page.textContent('main')), (v) => v.includes('reauth') || v.includes('подтверд') || v.includes('Подтверд'));
  await submit(page, 'button:has-text("Подтвердить личность")');
  await submit(page, `form:has(input[value="${toolId}"]) button:has-text("Архивировать")`);
  r.check('archiving succeeds after the check', db(`select status from public.tools where code='${toolCode}'`), 'archived');
  r.check('the audit row records the credential check', db(`select case when reauth_verified_at is not null then 'recorded' else 'missing' end from public.admin_audit_log where resource_code='${toolCode}' and action like '%archive%' order by occurred_at desc limit 1`), 'recorded');

  process.stdout.write('\nADMIN-2c  Every change left an audit row with actor, before, after and reason\n');
  r.check('audit rows exist for all three objects', db(`select count(*) from public.admin_audit_log where resource_code in ('${catCode}','${typeCode}','${toolCode}')`), (v) => Number(v) >= 5);
  r.check('an audit row names actor, role, reason and time', db(`select case when actor_id is not null and actor_role is not null and length(reason) >= 3 and occurred_at is not null then 'complete' else 'incomplete' end from public.admin_audit_log where resource_code='${toolCode}' order by occurred_at limit 1`), 'complete');
  r.check('before and after states are both captured on an edit', db(`select case when before_state is not null and after_state is not null then 'both' else coalesce(nullif(before_state::text,''),'null')||'/'||coalesce(nullif(after_state::text,''),'null') end from public.admin_audit_log where resource_code='${toolCode}' and before_state is not null limit 1`), 'both');
  r.check('the audit log cannot be edited', db(`do $$ begin update public.admin_audit_log set reason='tampered' where true; exception when others then raise notice 'refused'; end $$; select count(*) from public.admin_audit_log where reason='tampered'`), '0');

  process.stdout.write('\nADMIN-5b  Hard delete is refused where history depends on the row\n');
  const del = db(`do $$ begin delete from public.tool_categories where code='${catCode}'; exception when others then null; end $$; select count(*) from public.tool_categories where code='${catCode}'`);
  r.check('a category with tools cannot be deleted', del, '1');

  // ---------------------------------------------------------------- 5
  process.stdout.write('\nADMIN-5  Clone, version, publish and roll back a template\n');
  await gotoReady(page, '/admin/templates');
  const templateId = db(`select id from public.templates order by code limit 1`);
  const beforeVersion = db(`select current_version::text from public.templates where id='${templateId}'`);
  const content = JSON.stringify({ mechanics: [{ kind: 'gift_with_threshold', thresholdMinor: 4000 }], locales: ['ru', 'kk'] });
  // Scoped by a field unique to the create-version form: the rollback form on
  // the same card also carries a hidden templateId.
  await fillAndSubmit(page, `form:has(input[value="${templateId}"]):has([name="cloneFromVersionId"])`, {
    content, migrationNotes: 'E2E: порог поднят с 3500 до 4000, действующие контракты не затрагиваются',
    compatibleBusinessTypes: 'cafe', reason: 'E2E новая версия шаблона',
  }, 'Создать новую версию');
  const draftVersion = db(`select id from public.template_versions where template_id='${templateId}' and status='draft' order by created_at desc limit 1`);
  r.check('a draft version was cloned', draftVersion, (v) => v.length === 36);
  r.check('the migration note is stored with the version', db(`select coalesce(migration_notes,'') from public.template_versions where id='${draftVersion}'`), 'порог поднят');

  const contractHashesBefore = db(`select coalesce(string_agg(content_hash, ',' order by content_hash),'') from public.growth_contracts where business_id='${BIZ}'`);
  await gotoReady(page, '/admin/templates');
  await submit(page, `form:has(input[value="${draftVersion}"]) button:has-text("Опубликовать")`);
  r.check('the new version is published and active', db(`select v.status||' v'||v.version from public.template_versions v join public.templates t on t.current_version = v.version and t.id = v.template_id where t.id='${templateId}'`), 'published v');
  r.check('a published version cannot be edited', db(`do $$ begin update public.template_versions set content='{}'::jsonb where id='${draftVersion}'; exception when others then null; end $$; select (content::text <> '{}')::text from public.template_versions where id='${draftVersion}'`), 'true');
  r.check('historical Growth Contract snapshots are untouched', db(`select coalesce(string_agg(content_hash, ',' order by content_hash),'') from public.growth_contracts where business_id='${BIZ}'`), contractHashesBefore);

  await submit(page, 'button:has-text("Подтвердить личность")');
  await gotoReady(page, '/admin/templates');
  const rollbackForm = `form:has(input[value="${templateId}"]):has([name="targetVersion"])`;
  r.check('a rollback control is offered once an earlier published version exists', String(await page.locator(rollbackForm).count()), (v) => Number(v) > 0);
  await page.selectOption(`${rollbackForm} select[name=targetVersion]`, String(beforeVersion));
  await submit(page, `${rollbackForm} button:has-text("Откатить")`);
  const afterRollback = db(`select current_version::text from public.templates where id='${templateId}'`);
  r.check('rollback repointed the template', `${beforeVersion} -> ${afterRollback}`, (v) => v.split(' -> ')[0] === v.split(' -> ')[1]);
  r.check('the newer version stays published so history reads correctly', db(`select status from public.template_versions where id='${draftVersion}'`), 'published');
  r.check('the rollback is audited with a reason', db(`select count(*) from public.admin_audit_log where action like 'template.rolled_back' and length(reason) >= 3`), (v) => Number(v) > 0);
  await shot(page, 'admin-05-templates');

  process.stdout.write('\nADMIN-9  Journey-wide gates\n');
  r.check('no console error or unhandled rejection across the console', problems.length === 0 ? 'clean' : JSON.stringify(problems.slice(0, 3)), 'clean');
} catch (error) {
  r.check('suite completed without an unhandled failure', String(error).slice(0, 400), 'never-matches-so-this-fails');
} finally {
  await browser.close();
}

process.exit(r.finish({ consoleProblems: problems }) === 0 ? 0 : 1);
