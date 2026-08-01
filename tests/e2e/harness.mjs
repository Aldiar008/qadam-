// Shared browser harness for the QADAM acceptance suites.
//
// Every suite drives the real production build against the real local Supabase
// stack. Nothing here stubs a network call or fakes a database row: an
// assertion that passes here passed against the same code path a user hits.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

export const BASE = process.env.QADAM_E2E_BASE ?? 'http://localhost:3000';
export const PASSWORD = 'QadamLocal!2026';
export const DB_CONTAINER = process.env.QADAM_DB_CONTAINER ?? 'supabase_db_qadam_serpin';
export const SHOTS = 'tests/e2e/screenshots';

/** Single-value SQL read straight from Postgres, used to prove UI claims. */
export function db(sql) {
  return execFileSync(
    'docker',
    ['exec', '-i', DB_CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-A', '-t', '-c', sql],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  )
    .replace(/\r/g, '')
    .trim();
}

/** Same, but tolerates the error so a negative test can assert on the message. */
export function dbTry(sql) {
  try {
    return { ok: true, out: db(sql) };
  } catch (error) {
    return { ok: false, out: String(error.stderr ?? error.message) };
  }
}

/**
 * A browser with console/pageerror capture attached.
 *
 * Console errors are collected rather than thrown so a suite can assert
 * "this whole journey produced no console error" as its own check, which is
 * one of the release gates.
 */
export async function openBrowser(options = {}) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: options.viewport ?? { width: 1440, height: 900 },
    locale: 'ru-RU',
    timezoneId: 'Asia/Almaty',
    ...options.context,
  });
  const problems = [];
  context.on('page', (page) => {
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push({ kind: 'console', url: page.url(), text: message.text() });
    });
    page.on('pageerror', (error) => problems.push({ kind: 'pageerror', url: page.url(), text: String(error) }));
  });
  const page = await context.newPage();
  return { browser, context, page, problems };
}

/**
 * Signs in through the real login form — no cookie forgery.
 *
 * The submit button is selected by role rather than by its label: the page is
 * localised, so a Kazakh session renders different words on the same control.
 */
export async function login(page, email, password = PASSWORD) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 }),
    page.click('form:has(input[name=password]) button[type=submit], form:has(input[name=password]) button:not([type])'),
  ]);
  return page.url();
}

/**
 * Navigates and waits for the streamed shell to be replaced by real content.
 * Several screens render a Suspense skeleton first, so `domcontentloaded`
 * alone would assert against the placeholder.
 */
export async function gotoReady(page, path, options = {}) {
  await page.goto(path.startsWith('http') ? path : BASE + path, { waitUntil: 'domcontentloaded' });
  await page
    .waitForFunction(() => !document.body.innerText.includes('Загружаем данные бизнеса'), null, { timeout: options.timeout ?? 20_000 })
    .catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: options.timeout ?? 20_000 }).catch(() => {});
  return page.url();
}

export async function shot(page, name) {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
  return `${SHOTS}/${name}.png`;
}

/** Clicks a submit button and waits for the server action round trip to land. */
export async function submit(page, selector, options = {}) {
  const before = page.url();
  await page.click(selector, { timeout: options.timeout ?? 15_000 });
  await page
    .waitForFunction((url) => window.location.href !== url, before, { timeout: options.timeout ?? 20_000 })
    .catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: options.timeout ?? 30_000 }).catch(() => {});
  return page.url();
}

/** Records one check with its evidence so the release report is generated, not written by hand. */
export function reporter(suite) {
  const rows = [];
  return {
    rows,
    check(name, actual, expectation) {
      const pass = typeof expectation === 'function' ? Boolean(expectation(actual)) : String(actual).includes(String(expectation));
      rows.push({ suite, name, actual: String(actual).slice(0, 300), pass });
      const mark = pass ? 'PASS' : 'FAIL';
      process.stdout.write(`  ${mark}  ${name}\n        ${String(actual).slice(0, 220)}\n`);
      return pass;
    },
    finish(extra = {}) {
      const failed = rows.filter((r) => !r.pass);
      mkdirSync('tests/e2e/results', { recursive: true });
      writeFileSync(
        `tests/e2e/results/${suite}.json`,
        JSON.stringify({ suite, total: rows.length, failed: failed.length, rows, ...extra }, null, 2),
        'utf8',
      );
      process.stdout.write(`\n${suite}: ${rows.length - failed.length}/${rows.length} passed\n`);
      return failed.length;
    },
  };
}
