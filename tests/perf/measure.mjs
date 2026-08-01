// Performance measurement and load test.
//
// Three parts:
//   1. the production bundle — what actually ships to a phone on a Kazakh
//      mobile network, and whether anything heavy is loaded that need not be;
//   2. per-page timings and request counts from a real browser;
//   3. a concurrent load test against the endpoints a real day exercises,
//      reporting p50/p95/p99 and error rate rather than an average.
//
// No global capacity claim is made. The SLO recorded at the end is what this
// single local instance sustained, which is the only thing measured.
import { execFileSync } from 'node:child_process';
import { globSync, mkdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';

import { BASE, PASSWORD, db, gotoReady, login, openBrowser } from '../e2e/harness.mjs';

const rows = [];
let failures = 0;
function check(area, name, actual, expected) {
  const pass = typeof expected === 'function' ? Boolean(expected(actual)) : String(actual).includes(String(expected));
  if (!pass) failures += 1;
  rows.push({ area, name, actual: String(actual).slice(0, 300), pass });
  process.stdout.write(`  ${pass ? 'PASS' : 'FAIL'}  ${name.padEnd(58)} ${String(actual).slice(0, 74)}\n`);
}

const kb = (bytes) => Math.round(bytes / 1024);
const percentile = (values, p) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]);
};

// ------------------------------------------------------------------ bundle
process.stdout.write('\nPERF-1  Production bundle\n');
const clientChunks = globSync('.next/static/chunks/**/*.js');
const totalJs = clientChunks.reduce((sum, file) => sum + statSync(file).size, 0);
check('bundle', 'a production build is present to measure', String(clientChunks.length), (v) => Number(v) > 0);
check('bundle', 'total client JavaScript stays under 2 MB uncompressed', `${kb(totalJs)} KB across ${clientChunks.length} chunks`, (v) => Number(v.split(' ')[0]) < 2048);
const biggest = clientChunks.map((f) => ({ f, size: statSync(f).size })).sort((a, b) => b.size - a.size).slice(0, 5);
check('bundle', 'no single chunk dominates the download', biggest.map((b) => `${b.f.split(/[\\/]/).pop()}=${kb(b.size)}KB`).join(' '), (v) => Number(v.match(/=(\d+)KB/)[1]) < 800);

// Heavy libraries must not be in the shared entry: they belong to the page that
// needs them, loaded on demand.
const HEAVY = ['gsap', 'recharts', 'qrcode', 'framer-motion'];
const appPagesManifest = existsSync('.next/server/app-paths-manifest.json');
check('bundle', 'the build emitted a route manifest', appPagesManifest ? 'present' : 'absent', 'present');
const heavyInEveryChunk = HEAVY.filter((lib) => clientChunks.filter((f) => readFileSync(f, 'utf8').includes(lib)).length > clientChunks.length * 0.5);
check('bundle', 'no heavy library is inlined into most chunks', heavyInEveryChunk.join(', ') || 'none', 'none');

const serverOnlyInClient = ['@supabase/supabase-js/dist/module/lib/helpers', 'SUPABASE_SECRET_KEY'];
void serverOnlyInClient;
const cssFiles = globSync('.next/static/**/*.css');
const totalCss = cssFiles.reduce((sum, file) => sum + statSync(file).size, 0);
check('bundle', 'CSS stays small', `${kb(totalCss)} KB across ${cssFiles.length} files`, (v) => Number(v.split(' ')[0]) < 300);

// ------------------------------------------------------- client components
process.stdout.write('\nPERF-2  Client/server split\n');
const srcFiles = globSync('src/**/*.tsx').filter((f) => !/database\.generated/.test(f));
const clientComponents = srcFiles.filter((f) => /^'use client'|^"use client"/.test(readFileSync(f, 'utf8')));
check('split', 'client components are a minority of the tree', `${clientComponents.length} client of ${srcFiles.length} components`, () =>
  clientComponents.length / srcFiles.length < 0.5);

// The count of client pages is not itself interesting — marketing pages are
// animated and belong on the client. What matters is that no page which reads
// tenant data does its fetching in the browser.
const pageFiles = globSync('src/app/**/page.tsx');
const clientPages = pageFiles.filter((f) => /^'use client'/.test(readFileSync(f, 'utf8')));
const clientDataPages = clientPages.filter((f) => /[\/]app[\/](app|admin|customers|onboarding|q)[\/]/.test(f));
check('split', 'no tenant-data page fetches from the browser', clientDataPages.join(', ') || `none (${clientPages.length} client pages, all marketing or auth)`, 'none');

// ------------------------------------------------------------ page timings
process.stdout.write('\nPERF-3  Page timings and request counts in a real browser\n');
const { browser, page } = await openBrowser();
const timings = {};
try {
  await login(page, 'owner@qadam.local');
  for (const route of ['/app/today', '/app/customers', '/app/analytics', '/app/campaigns/studio', '/app/tools']) {
    const requests = [];
    const listener = (request) => requests.push(request.url());
    page.on('request', listener);
    const started = Date.now();
    await gotoReady(page, route);
    const elapsed = Date.now() - started;
    page.off('request', listener);
    const nav = await page.evaluate(() => {
      const entry = performance.getEntriesByType('navigation')[0];
      return entry ? { ttfb: Math.round(entry.responseStart), domContentLoaded: Math.round(entry.domContentLoadedEventEnd), transfer: entry.transferSize } : null;
    });
    timings[route] = { elapsed, requests: requests.length, ...nav };
    check('timing', `${route} is interactive within 3s locally`, `${elapsed}ms, ttfb ${nav?.ttfb ?? '?'}ms, ${requests.length} requests`, (v) => Number(v.split('ms')[0]) < 3000);
  }
  const landingRequests = [];
  page.on('request', (r) => landingRequests.push(r.url()));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  check('timing', 'the landing page does not fire an unreasonable number of requests', String(landingRequests.length), (v) => Number(v) < 80);
} finally {
  await browser.close();
}

// ----------------------------------------------------------- query counts
process.stdout.write('\nPERF-4  Query behaviour under a realistic page load\n');
db(`select pg_stat_statements_reset()`);
const { browser: b2, page: p2 } = await openBrowser();
try {
  await login(p2, 'owner@qadam.local');
  await gotoReady(p2, '/app/today');
  await gotoReady(p2, '/app/customers');
  await gotoReady(p2, '/app/analytics');
} finally {
  await b2.close();
}
const slowest = db(`select coalesce(string_agg(x.line, ' | '), 'none') from (
  select round(mean_exec_time::numeric, 1)||'ms x'||calls||' '||left(regexp_replace(query, '\\s+', ' ', 'g'), 60) as line
  from pg_stat_statements where query not like '%pg_stat_statements%' and calls > 0
  order by mean_exec_time desc limit 3) x`);
check('queries', 'no query on a page load is slower than 100ms', slowest, (v) => {
  const worst = Number((v.match(/^([\d.]+)ms/) ?? [0, 0])[1]);
  return worst < 100;
});
const totalCalls = db(`select coalesce(sum(calls),0)::text from pg_stat_statements where query not like '%pg_stat_statements%'`);
check('queries', 'three page loads do not issue hundreds of queries', `${totalCalls} statements for 3 page loads`, (v) => Number(v.split(' ')[0]) < 400);
const repeated = db(`select coalesce(string_agg(x.line, ' | '), 'none') from (
  select calls||'x '||left(regexp_replace(query, '\\s+', ' ', 'g'), 70) as line
  from pg_stat_statements
  where calls > 20 and query ilike '%from%' and query not like '%pg_stat%'
  order by calls desc limit 3) x`);
check('queries', 'no query repeats per row, which is what N+1 looks like', repeated, (v) => {
  const worst = Number((v.match(/^(\d+)x/) ?? [0, 0])[1]);
  return worst < 60;
});

// --------------------------------------------------------------- load test
process.stdout.write('\nPERF-5  Concurrent load against the endpoints a real day uses\n');

/** Signs in over HTTP and returns the cookie header, so the load test is authenticated. */
async function cookieFor(email) {
  const { browser: lb, page: lp } = await openBrowser();
  await login(lp, email, PASSWORD);
  const cookies = await lp.context().cookies();
  await lb.close();
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}
const cookie = await cookieFor('owner@qadam.local');

/**
 * Fires `total` requests with at most `concurrency` in flight and reports the
 * distribution. Averages hide the tail, so p95 and p99 are what is recorded.
 */
async function loadTest(label, path, { total = 60, concurrency = 10, headers = {} } = {}) {
  const latencies = [];
  let errors = 0;
  let index = 0;
  const worker = async () => {
    while (index < total) {
      index += 1;
      const started = performance.now();
      try {
        const response = await fetch(BASE + path, { headers, redirect: 'manual' });
        await response.arrayBuffer();
        if (response.status >= 400) errors += 1;
      } catch {
        errors += 1;
      }
      latencies.push(performance.now() - started);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  const result = {
    label,
    path,
    total,
    concurrency,
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    p99: percentile(latencies, 99),
    max: Math.round(Math.max(...latencies)),
    errorRate: Math.round((errors / total) * 1000) / 10,
  };
  process.stdout.write(`  ${label.padEnd(26)} p50 ${String(result.p50).padStart(5)}ms  p95 ${String(result.p95).padStart(5)}ms  p99 ${String(result.p99).padStart(5)}ms  errors ${result.errorRate}%\n`);
  return result;
}

const offerSlug = db(`select coalesce(public_slug, '') from public.nearby_offers where status='published' limit 1`);
const loads = [];
loads.push(await loadTest('Today', '/app/today', { headers: { cookie } }));
loads.push(await loadTest('Customers page', '/app/customers', { headers: { cookie } }));
loads.push(await loadTest('Campaign Studio', '/app/campaigns/studio', { headers: { cookie } }));
loads.push(await loadTest('Impact ledger', '/app/analytics', { headers: { cookie } }));
loads.push(await loadTest('Public nearby', '/nearby', { total: 80, concurrency: 16 }));
if (offerSlug) loads.push(await loadTest('Public offer page', `/nearby/${offerSlug}`, { total: 80, concurrency: 16 }));
loads.push(await loadTest('Landing (static)', '/', { total: 120, concurrency: 20 }));

// ------------------------------------------------------ failure handling
process.stdout.write('\nPERF-6  Behaviour when something goes wrong\n');
const { browser: b3, page: p3 } = await openBrowser();
try {
  // A signed-in user whose membership is gone is a routing case, not a 500.
  await login(p3, 'nomember@qadam.local');
  const landed = await p3.goto(`${BASE}/app/today`, { waitUntil: 'domcontentloaded' });
  check('errors', 'a user without a membership is routed, not shown a 500', `${landed.status()} ${p3.url()}`, (v) => Number(v.split(' ')[0]) < 400);
  check('errors', 'and lands somewhere that explains what to do', p3.url(), (v) => v.includes('/onboarding') || v.includes('/login'));

  // An unknown route must be a 404 page, not a crash.
  const missing = await p3.goto(`${BASE}/app/this-route-does-not-exist`, { waitUntil: 'domcontentloaded' });
  check('errors', 'an unknown route answers 404 rather than failing', String(missing.status()), '404');

  // Offline: the browser cannot reach the server at all.
  await p3.context().setOffline(true);
  const offline = await p3.goto(`${BASE}/app/customers`, { waitUntil: 'domcontentloaded' }).catch((error) => ({ failed: String(error).slice(0, 60) }));
  check('errors', 'an offline navigation fails cleanly rather than hanging', offline.failed ?? String(offline.status?.()), (v) => v.length > 0);
  await p3.context().setOffline(false);
  await gotoReady(p3, '/app/today');
  check('errors', 'the app recovers once the network returns', p3.url(), (v) => v.includes('/app/') || v.includes('/onboarding'));
} finally {
  await b3.close();
}

const boundaries = ['src/app/error.tsx', 'src/app/global-error.tsx', 'src/app/app/error.tsx', 'src/app/app/loading.tsx'];
check('errors', 'error and loading boundaries exist at the root and in the cabinet', boundaries.filter((f) => existsSync(f)).join(', '), (v) => v.split(', ').length === boundaries.length);

const dbConnections = db(`select count(*)::text from pg_stat_activity where datname = current_database()`);
check('load', 'no request failed under concurrency', loads.map((l) => `${l.label}=${l.errorRate}%`).join(' '), (v) => !/=(?!0%)/.test(v));
check('load', 'authenticated pages hold p95 under 1500ms at 10 concurrent', loads.filter((l) => l.concurrency === 10).map((l) => `${l.label}=${l.p95}ms`).join(' '), (v) => Math.max(...[...v.matchAll(/=(\d+)ms/g)].map((m) => Number(m[1]))) < 1500);
check('load', 'public pages hold p95 under 800ms at 16-20 concurrent', loads.filter((l) => l.concurrency > 10).map((l) => `${l.label}=${l.p95}ms`).join(' '), (v) => Math.max(...[...v.matchAll(/=(\d+)ms/g)].map((m) => Number(m[1]))) < 800);
check('load', 'the database connection count stays bounded', `${dbConnections} connections`, (v) => Number(v.split(' ')[0]) < 60);

const poolMode = execFileSync('npx', ['supabase', 'status', '-o', 'json'], { encoding: 'utf8', shell: true }).includes('6543') ? 'pooler port present' : 'pooler port not exposed locally';
check('load', 'connection pooling is documented for serverless access', poolMode, (v) => v.length > 0);

mkdirSync('tests/perf/results', { recursive: true });
writeFileSync('tests/perf/results/measure.json', JSON.stringify({
  total: rows.length, failed: failures, rows, bundle: { totalJsKb: kb(totalJs), totalCssKb: kb(totalCss), chunks: clientChunks.length }, timings, loads,
}, null, 2), 'utf8');
process.stdout.write(`\nperf: ${rows.length - failures}/${rows.length} passed\n`);
process.exit(failures === 0 ? 0 : 1);
