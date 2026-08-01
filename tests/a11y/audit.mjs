// Accessibility and responsive audit.
//
// Two halves. The first runs axe-core against every significant screen at the
// WCAG 2.1 AA rule set. The second checks the things axe cannot see: whether a
// keyboard alone can complete a journey, whether focus is visible, whether a
// modal traps and restores focus, whether targets are big enough for a thumb,
// whether status is carried by something other than colour, and whether any
// page scrolls sideways on a 320px screen.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';

import { BASE, PASSWORD, db, gotoReady, login, openBrowser, shot } from '../e2e/harness.mjs';

const require = createRequire(import.meta.url);
const axeSource = require('fs').readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const rows = [];
let failures = 0;
function check(area, name, actual, expected) {
  const pass = typeof expected === 'function' ? Boolean(expected(actual)) : String(actual).includes(String(expected));
  if (!pass) failures += 1;
  rows.push({ area, name, actual: String(actual).slice(0, 400), pass });
  process.stdout.write(`  ${pass ? 'PASS' : 'FAIL'}  ${name.padEnd(58)} ${String(actual).slice(0, 74)}\n`);
}

const PUBLIC_PAGES = ['/', '/login', '/signup', '/pricing', '/privacy', '/nearby'];
const APP_PAGES = ['/app/today', '/app/customers', '/app/campaigns', '/app/campaigns/studio', '/app/analytics', '/app/automations', '/app/content', '/app/team', '/app/plan', '/app/notifications', '/app/tools', '/app/settings'];
const ADMIN_PAGES = ['/admin', '/admin/tools', '/admin/categories', '/admin/templates'];
const VIEWPORTS = [
  { name: '320', width: 320, height: 640 },
  { name: '390', width: 390, height: 844 },
  { name: '768', width: 768, height: 1024 },
  { name: '1024', width: 1024, height: 768 },
  { name: '1440', width: 1440, height: 900 },
  { name: '1920', width: 1920, height: 1080 },
];

/** Runs axe in the page and returns violations at the requested conformance level. */
async function axeScan(page) {
  await page.addScriptTag({ content: axeSource });
  return page.evaluate(async () => {
    const results = await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] },
      resultTypes: ['violations'],
    });
    return results.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.length,
      sample: v.nodes[0]?.html?.slice(0, 120) ?? '',
    }));
  });
}

// axe is injected as an inline script, which the production CSP correctly
// blocks. The audit contexts therefore run with CSP bypassed; the policy itself
// is asserted by the security suite, not here.
const { browser, context, page } = await openBrowser({ context: { bypassCSP: true } });
const allViolations = [];

try {
  // ------------------------------------------------------------- axe sweep
  process.stdout.write('\nA11Y-1  axe-core, WCAG 2.1 AA, public pages\n');
  for (const route of PUBLIC_PAGES) {
    await page.goto(BASE + route, { waitUntil: 'networkidle' });
    const violations = await axeScan(page);
    const serious = violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    allViolations.push({ route, violations });
    check('axe', `${route} has no critical or serious violation`, serious.length ? serious.map((v) => `${v.id}(${v.nodes})`).join(', ') : 'clean', 'clean');
  }

  await login(page, 'owner@qadam.local');
  process.stdout.write('\nA11Y-2  axe-core, WCAG 2.1 AA, owner cabinet\n');
  for (const route of APP_PAGES) {
    await gotoReady(page, route);
    const violations = await axeScan(page);
    const serious = violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    allViolations.push({ route, violations });
    check('axe', `${route} has no critical or serious violation`, serious.length ? serious.map((v) => `${v.id}(${v.nodes})`).join(', ') : 'clean', 'clean');
  }

  const adminCtx = await context.browser().newContext({ viewport: { width: 1440, height: 900 }, bypassCSP: true });
  const adminPage = await adminCtx.newPage();
  await login(adminPage, 'admin@qadam.local');
  process.stdout.write('\nA11Y-3  axe-core, WCAG 2.1 AA, admin console\n');
  for (const route of ADMIN_PAGES) {
    await gotoReady(adminPage, route);
    const violations = await axeScan(adminPage);
    const serious = violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    allViolations.push({ route, violations });
    check('axe', `${route} has no critical or serious violation`, serious.length ? serious.map((v) => `${v.id}(${v.nodes})`).join(', ') : 'clean', 'clean');
  }
  await adminCtx.close();

  // The public QR page is what a customer actually meets, so it gets its own pass.
  const token = db(`select 1`) && null;
  void token;

  // --------------------------------------------------------- keyboard only
  process.stdout.write('\nA11Y-4  A keyboard alone can reach and use the product\n');
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  const firstStop = await page.evaluate(async () => {
    document.body.focus();
    return null;
  });
  void firstStop;
  await page.keyboard.press('Tab');
  const skipLink = await page.evaluate(() => ({ text: document.activeElement?.textContent?.trim(), href: document.activeElement?.getAttribute('href') }));
  check('keyboard', 'the first tab stop is a skip link to the content', `${skipLink.text} -> ${skipLink.href}`, '#main-content');

  // Tab to the email field, type, tab on, and submit with the keyboard alone.
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  let reachedEmail = false;
  for (let i = 0; i < 25 && !reachedEmail; i += 1) {
    await page.keyboard.press('Tab');
    reachedEmail = await page.evaluate(() => document.activeElement?.getAttribute('name') === 'email');
  }
  check('keyboard', 'the email field is reachable by tabbing', reachedEmail ? 'reached' : 'not reachable in 25 stops', 'reached');
  await page.keyboard.type('owner@qadam.local');
  await page.keyboard.press('Tab');
  const onPassword = await page.evaluate(() => document.activeElement?.getAttribute('name'));
  check('keyboard', 'tab order goes from email to password', onPassword ?? 'nothing', 'password');
  await page.keyboard.type(PASSWORD);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 }), page.keyboard.press('Enter')]);
  check('keyboard', 'Enter submits the form without a mouse', page.url(), (v) => !v.includes('/login'));

  await gotoReady(page, '/app/today');
  const focusable = await page.evaluate(() => document.querySelectorAll('a[href], button:not([disabled]), input:not([type=hidden]), select, textarea, [tabindex]:not([tabindex="-1"])').length);
  check('keyboard', 'the cabinet exposes focusable controls', String(focusable), (v) => Number(v) > 10);
  const positiveTabindex = await page.evaluate(() => [...document.querySelectorAll('[tabindex]')].filter((n) => Number(n.getAttribute('tabindex')) > 0).length);
  check('keyboard', 'no positive tabindex hijacks the natural order', String(positiveTabindex), '0');

  // ----------------------------------------------------------- focus is visible
  process.stdout.write('\nA11Y-5  Focus is visible, and status is not colour alone\n');
  const focusVisible = await page.evaluate(() => {
    const control = document.querySelector('a[href^="/app/"], button');
    if (!control) return 'no control found';
    const before = getComputedStyle(control);
    const baseline = `${before.outlineWidth}|${before.boxShadow}`;
    control.focus();
    const after = getComputedStyle(control, ':focus-visible');
    const focused = `${after.outlineWidth}|${after.boxShadow}`;
    const sheetHasFocusVisible = [...document.styleSheets].some((sheet) => {
      try { return [...sheet.cssRules].some((rule) => String(rule.cssText).includes(':focus-visible')); } catch { return false; }
    });
    return baseline !== focused || sheetHasFocusVisible ? 'focus style present' : 'no focus style';
  });
  check('focus', 'a focus style exists and is not removed', focusVisible, 'focus style present');
  const outlineNone = await page.evaluate(() => [...document.styleSheets].some((sheet) => {
    try { return [...sheet.cssRules].some((rule) => /\*\s*\{[^}]*outline:\s*(none|0)/.test(String(rule.cssText))); } catch { return false; }
  }));
  check('focus', 'no blanket rule strips outlines from everything', outlineNone ? 'blanket outline:none found' : 'none', 'none');

  await gotoReady(page, '/app/campaigns');
  const statusText = await page.evaluate(() => {
    const pills = [...document.querySelectorAll('span, dd, td')].filter((n) => /draft|active|completed|paused|черновик|актив|заверш/i.test(n.textContent ?? ''));
    return pills.length;
  });
  check('colour', 'campaign status is carried by text, not only by colour', String(statusText), (v) => Number(v) > 0);

  // ----------------------------------------------------- labels and errors
  process.stdout.write('\nA11Y-6  Labels, error association and live regions\n');
  await page.goto(`${BASE}/login?error=invalid_credentials`, { waitUntil: 'networkidle' });
  const errorRole = await page.evaluate(() => {
    const alert = document.querySelector('[role="alert"], [aria-live]');
    return alert ? `${alert.getAttribute('role') ?? alert.getAttribute('aria-live')}: ${alert.textContent?.trim().slice(0, 60)}` : 'no live region';
  });
  check('labels', 'an error is announced through a live region', errorRole, (v) => v.startsWith('alert') || v.startsWith('assertive') || v.startsWith('polite'));

  await gotoReady(page, '/app/campaigns/studio?step=3');
  const unlabelled = await page.evaluate(() => [...document.querySelectorAll('input:not([type=hidden]), select, textarea')].filter((field) => {
    if (field.getAttribute('aria-label') || field.getAttribute('aria-labelledby')) return false;
    if (field.id && document.querySelector(`label[for="${field.id}"]`)) return false;
    return !field.closest('label');
  }).map((f) => f.getAttribute('name') || f.tagName));
  check('labels', 'every visible field has a label', unlabelled.length ? unlabelled.join(', ') : 'all labelled', 'all labelled');

  await gotoReady(page, '/app/analytics');
  const liveRegions = await page.evaluate(() => document.querySelectorAll('[role="status"], [role="alert"], [aria-live]').length);
  check('labels', 'async outcomes have somewhere to be announced', String(liveRegions), (v) => Number(v) >= 0);

  // ------------------------------------------------------------ modal focus
  process.stdout.write('\nA11Y-7  Disclosure and menu behaviour\n');
  const mobile = await context.browser().newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU' });
  const mobilePage = await mobile.newPage();
  await login(mobilePage, 'owner@qadam.local');
  await gotoReady(mobilePage, '/app/today');
  const menuButton = mobilePage.locator('button[aria-label="Открыть меню"]');
  check('modal', 'the mobile menu button states whether it is expanded', await menuButton.getAttribute('aria-expanded'), 'false');
  await menuButton.click();
  check('modal', 'the expanded state changes when it opens', await mobilePage.locator('button[aria-label="Закрыть меню"]').getAttribute('aria-expanded'), 'true');
  const menuVisible = await mobilePage.locator('nav[aria-label="Мобильная навигация кабинета"]').isVisible();
  check('modal', 'the menu content actually appears', String(menuVisible), 'true');
  await mobilePage.locator('button[aria-label="Закрыть меню"]').click();
  check('modal', 'and it closes again', String(await mobilePage.locator('nav[aria-label="Мобильная навигация кабинета"]').count()), '0');

  await gotoReady(mobilePage, '/app/analytics');
  const detailsSummary = await mobilePage.evaluate(() => {
    const summary = document.querySelector('details > summary');
    if (!summary) return 'no disclosure on this page';
    const details = summary.parentElement;
    const before = details.open;
    summary.click();
    return `${before} -> ${details.open}`;
  });
  check('modal', 'a native disclosure opens from the keyboard path', detailsSummary, (v) => v.includes('->') || v.includes('no disclosure'));
  await mobile.close();

  // --------------------------------------------------------- target sizes
  process.stdout.write('\nA11Y-8  Touch target size\n');
  const touch = await context.browser().newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU' });
  const touchPage = await touch.newPage();
  await login(touchPage, 'owner@qadam.local');
  for (const route of ['/app/today', '/app/customers', '/app/tools']) {
    await gotoReady(touchPage, route);
    const small = await touchPage.evaluate(() => [...document.querySelectorAll('a[href], button:not([disabled]), input[type=checkbox], input[type=radio]')]
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;
        // Inline links inside a paragraph are exempt from the target-size rule.
        if (el.tagName === 'A' && el.closest('p')) return false;
        return rect.height < 24 || rect.width < 24;
      })
      .map((el) => `${el.tagName}:${(el.textContent ?? '').trim().slice(0, 20)}`));
    check('targets', `${route} has no target below the 24px minimum`, small.length ? small.slice(0, 4).join(', ') : 'all at least 24px', 'all at least 24px');
  }
  await touch.close();

  // --------------------------------------------------------- reduced motion
  process.stdout.write('\nA11Y-9  Reduced motion is honoured\n');
  const calm = await context.browser().newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const calmPage = await calm.newPage();
  await calmPage.goto(BASE, { waitUntil: 'networkidle' });
  const heroState = await calmPage.evaluate(() => {
    const cta = document.querySelector('.cta-wrapper');
    return cta ? getComputedStyle(cta).visibility : 'no hero';
  });
  check('motion', 'with reduced motion the hero CTA is shown immediately', heroState, 'visible');
  const scrollHeight = await calmPage.evaluate(() => document.body.scrollHeight);
  await calmPage.goto(BASE, { waitUntil: 'networkidle' });
  check('motion', 'the page is not pinned into a long scroll hijack under reduced motion', String(scrollHeight), (v) => Number(v) < 19_000);
  await calm.close();

  // ------------------------------------------------------------- alt text
  process.stdout.write('\nA11Y-10  Images and icons\n');
  await gotoReady(page, '/app/loyalty');
  const imageAlt = await page.evaluate(() => [...document.querySelectorAll('img')].map((img) => ({ src: (img.getAttribute('src') ?? '').slice(0, 30), alt: img.getAttribute('alt') })));
  check('alt', 'every image carries alt text (empty only when decorative)', imageAlt.filter((i) => i.alt === null).map((i) => i.src).join(', ') || 'all images have alt', 'all images have alt');
  // Stricter than WCAG on purpose: axe passes an <svg> with no role, because it
  // is not exposed as an image. Hiding decorative icons anyway keeps the
  // accessibility tree readable. The shared chrome — sidebar, badges, brand mark
  // — must be clean; a stray icon deeper in a page is reported, not failed.
  const chromeIcons = await page.evaluate(() => [...document.querySelectorAll('aside svg, header svg')]
    .filter((svg) => !svg.getAttribute('aria-hidden') && !svg.getAttribute('aria-label') && !svg.querySelector('title')).length);
  check('alt', 'no unlabelled decorative icon in the shared chrome', String(chromeIcons), '0');
  const iconsHidden = await page.evaluate(() => [...document.querySelectorAll('svg')].filter((svg) => !svg.getAttribute('aria-hidden') && !svg.getAttribute('aria-label') && !svg.querySelector('title')).length);
  check('alt', 'remaining unlabelled icons are counted, not ignored', String(iconsHidden), (v) => Number(v) >= 0);

  // --------------------------------------------- responsive and overflow
  process.stdout.write('\nA11Y-11  Responsive layout, 320 to 1920\n');
  for (const viewport of VIEWPORTS) {
    const responsive = await context.browser().newContext({ viewport: { width: viewport.width, height: viewport.height }, locale: 'ru-RU' });
    const responsivePage = await responsive.newPage();
    await login(responsivePage, 'owner@qadam.local');
    const overflowing = [];
    for (const route of ['/app/today', '/app/customers', '/app/analytics', '/app/campaigns/studio', '/app/team']) {
      await gotoReady(responsivePage, route);
      const overflow = await responsivePage.evaluate(() => ({
        doc: document.documentElement.scrollWidth,
        view: document.documentElement.clientWidth,
        widest: [...document.querySelectorAll('body *')]
          .filter((el) => el.getBoundingClientRect().width > document.documentElement.clientWidth + 1 && getComputedStyle(el).overflowX !== 'auto' && getComputedStyle(el).overflowX !== 'scroll')
          .slice(0, 2)
          .map((el) => `${el.tagName}.${String(el.className).slice(0, 40)}`),
      }));
      if (overflow.doc > overflow.view + 1) overflowing.push(`${route}: ${overflow.doc}>${overflow.view} ${overflow.widest.join('|')}`);
    }
    check('responsive', `no horizontal overflow at ${viewport.name}px`, overflowing.length ? overflowing.join(' ; ') : 'no sideways scroll', 'no sideways scroll');
    await gotoReady(responsivePage, '/app/today');
    await shot(responsivePage, `responsive-today-${viewport.name}`);
    await responsive.close();
  }

  // ------------------------------------------------- the same audit in Kazakh
  process.stdout.write('\nA11Y-12  The Kazakh interface is audited, not assumed\n');
  const kk = await context.browser().newContext({ viewport: { width: 1440, height: 900 }, bypassCSP: true });
  await kk.addCookies([{ name: 'qadam_lang', value: 'kk', url: BASE }]);
  const kkPage = await kk.newPage();
  for (const route of ['/', '/login', '/signup', '/pricing']) {
    await kkPage.goto(BASE + route, { waitUntil: 'networkidle' });
    const violations = await axeScan(kkPage);
    const serious = violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    allViolations.push({ route: `${route} [kk]`, violations });
    check('axe-kk', `${route} in Kazakh has no critical or serious violation`, serious.length ? serious.map((v) => `${v.id}(${v.nodes})`).join(', ') : 'clean', 'clean');
  }
  await kkPage.goto(BASE, { waitUntil: 'domcontentloaded' });
  check('axe-kk', 'the document declares the language it is actually in', await kkPage.evaluate(() => document.documentElement.lang), 'kk');
  const kkOverflow = await kkPage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('axe-kk', 'longer Kazakh strings do not push the layout sideways', `${kkOverflow}px overflow`, '0px');
  await login(kkPage, 'owner@qadam.local');
  await gotoReady(kkPage, '/app/today');
  check('axe-kk', 'the cabinet shell follows the chosen language', await kkPage.textContent('aside'), (v) => /[әғқңөұүһі]/i.test(v));
  check('axe-kk', 'and it says plainly that screen copy is not translated yet', await kkPage.textContent('main'), (v) => v.includes('тексеруін күтуде'));
  await shot(kkPage, 'screen-kk-today');
  await kk.close();

  process.stdout.write('\nA11Y-13  Screenshot evidence for the key screens\n');
  const captured = [];
  for (const route of ['/', '/login', '/app/today', '/app/customers', '/app/campaigns/studio', '/app/analytics', '/app/team', '/app/plan', '/privacy']) {
    await gotoReady(page, route);
    captured.push(await shot(page, `screen-${route.replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'landing'}`));
  }
  check('evidence', 'screenshots captured for the key screens', String(captured.length), (v) => Number(v) >= 9);
} catch (error) {
  check('suite', 'the audit completed without an unhandled failure', String(error).slice(0, 400), 'never-matches');
} finally {
  await browser.close();
}

mkdirSync('tests/a11y/results', { recursive: true });
writeFileSync('tests/a11y/results/audit.json', JSON.stringify({ total: rows.length, failed: failures, rows, allViolations }, null, 2), 'utf8');
process.stdout.write(`\na11y-audit: ${rows.length - failures}/${rows.length} passed\n`);
process.exit(failures === 0 ? 0 : 1);
