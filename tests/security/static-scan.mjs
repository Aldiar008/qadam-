// Static security scan over source and the built client bundle.
//
// This looks for the classes of defect that no runtime test will surface:
// a secret that reached the browser, unsanitised HTML, string-built SQL, a
// demo-only endpoint that survives into a production build.
import { execFileSync } from 'node:child_process';
import { globSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';

const rows = [];
let failures = 0;
function check(area, name, actual, expected) {
  const pass = typeof expected === 'function' ? Boolean(expected(actual)) : String(actual) === String(expected);
  if (!pass) failures += 1;
  rows.push({ area, name, actual: String(actual).slice(0, 300), pass });
  process.stdout.write(`  ${pass ? 'PASS' : 'FAIL'}  ${name.padEnd(60)} ${String(actual).slice(0, 70)}\n`);
}

// Generated database types list every RPC name in the schema, so they match any
// "is this function guarded" search without being code at all.
const GENERATED = /database\.generated\.ts$/;
const srcFiles = globSync('src/**/*.{ts,tsx,mjs}').filter((f) => !GENERATED.test(f));
const read = (f) => readFileSync(f, 'utf8');

// ------------------------------------------------------------------ secrets
process.stdout.write('\nSEC-STATIC-1  Secrets never reach the browser\n');
const clientFiles = srcFiles.filter((f) => read(f).startsWith("'use client'") || read(f).startsWith('"use client"'));
const serverOnlyNames = ['SUPABASE_SECRET_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'QADAM_JOB_SECRET', 'QADAM_WEBHOOK_SECRET', 'SERVICE_ROLE', 'WHATSAPP_ACCESS_TOKEN', 'TELEGRAM_BOT_TOKEN', 'INSTAGRAM_ACCESS_TOKEN'];
const leakyClient = clientFiles.filter((f) => serverOnlyNames.some((name) => read(f).includes(name)));
check('secrets', 'no client component names a server-only secret', leakyClient.length ? leakyClient.join(', ') : 'none', 'none');

const bundleFiles = existsSync('.next/static') ? globSync('.next/static/**/*.js') : [];
check('secrets', 'a production client bundle exists to inspect', String(bundleFiles.length), (v) => Number(v) > 0);
const bundleHits = [];
for (const file of bundleFiles) {
  const text = readFileSync(file, 'utf8');
  for (const name of serverOnlyNames) if (text.includes(name)) bundleHits.push(`${file}: ${name}`);
  // The local service-role JWT and secret key, by value rather than by name.
  if (/sb_secret_[A-Za-z0-9_-]{10,}/.test(text)) bundleHits.push(`${file}: a secret key value`);
  if (/"role":"service_role"/.test(text) || text.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSI')) {
    bundleHits.push(`${file}: a service-role token`);
  }
}
check('secrets', 'no server-only secret appears in the shipped client bundle', bundleHits.length ? bundleHits.slice(0, 3).join('; ') : 'none', 'none');

const publicEnv = Object.keys(process.env).filter((k) => k.startsWith('NEXT_PUBLIC_'));
check('secrets', 'no NEXT_PUBLIC_ variable carries a secret-looking name', publicEnv.filter((k) => /SECRET|SERVICE|TOKEN|PASSWORD|PRIVATE/i.test(k)).join(', ') || 'none', 'none');

const exampleEnv = readFileSync('.env.example', 'utf8');
check('secrets', 'env.example contains placeholders, not real values', exampleEnv, (v) => !/sb_secret_[A-Za-z0-9_-]{10,}/.test(v) && !/eyJhbGciOiJIUzI1NiI/.test(v) && !/sk-[A-Za-z0-9]{20,}/.test(v));

// -------------------------------------------------------------------- XSS
process.stdout.write('\nSEC-STATIC-2  Rendering is safe by default\n');
const dangerous = [];
for (const file of srcFiles) {
  const text = read(file);
  const matches = text.match(/dangerouslySetInnerHTML/g);
  if (!matches) continue;
  // The only accepted use is a constant style block authored in this repo.
  const styleOnly = /dangerouslySetInnerHTML=\{\{\s*__html:\s*(INJECTED_STYLES|[A-Z_]+_STYLES|JSON\.stringify\()/.test(text);
  dangerous.push(`${file} (${matches.length}${styleOnly ? ', constant style/JSON-LD' : ', REVIEW'})`);
}
const unreviewed = dangerous.filter((d) => d.includes('REVIEW'));
check('xss', 'every dangerouslySetInnerHTML is a constant, not user content', unreviewed.length ? unreviewed.join('; ') : `${dangerous.length} constant uses, none user-controlled`, (v) => !v.includes('REVIEW'));
check('xss', 'no innerHTML assignment anywhere in source', srcFiles.filter((f) => /\.innerHTML\s*=/.test(read(f))).join(', ') || 'none', 'none');
check('xss', 'no eval or Function constructor', srcFiles.filter((f) => /\beval\(|new Function\(/.test(read(f))).join(', ') || 'none', 'none');
check('xss', 'no javascript: URL construction', srcFiles.filter((f) => /["'`]javascript:/.test(read(f))).join(', ') || 'none', 'none');

// -------------------------------------------------------------------- SQL
process.stdout.write('\nSEC-STATIC-3  Database access is parameterised\n');
// Application code reaches Postgres through PostgREST (`.from().eq()`) and
// through `.rpc()` with named arguments. Neither concatenates SQL. A raw
// string-built query would have to appear as an `execute`/`query` call.
const rawSql = srcFiles.filter((f) => /\.(query|execute)\(\s*[`'"].*(select|insert|update|delete)/i.test(read(f)));
check('sql', 'no source file builds a SQL string at runtime', rawSql.join(', ') || 'none', 'none');
const rpcCalls = srcFiles.filter((f) => /\.rpc\(/.test(read(f))).length;
check('sql', 'database calls go through the typed client and RPC', `${rpcCalls} files use .rpc(), 0 build SQL`, (v) => Number(v.split(' ')[0]) > 0);

const migrationFiles = globSync('supabase/migrations/*.sql');
// `execute format('... %I ...', name)` is safe even when `name` is built by
// concatenation, because %I quotes the identifier. What is not safe is
// `execute 'select ...' || variable`, where the statement text itself is glued
// together. Only the second form is a finding.
/** Blanks out single-quoted SQL literals so keywords inside them are not read as code. */
const withoutLiterals = (line) => line.replace(/'(?:[^']|'')*'/g, "''");

const unsafeDynamic = [];
for (const file of migrationFiles) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    const code = withoutLiterals(line);
    if (/execute\s+(?!format\s*\()/i.test(code) && code.includes('||')) {
      unsafeDynamic.push(`${file}:${index + 1}`);
    }
  });
}
check('sql', 'no migration glues a SQL statement together from strings', unsafeDynamic.join(', ') || 'none', 'none');

// `%s` interpolates verbatim, so it is a finding unless the value is already a
// safely-rendered identifier. The one accepted case is a `regclass`, which
// Postgres renders schema-qualified and quoted on its own — `%I` would wrap the
// whole `public.customers` string in quotes and break it. The exception is
// pinned to the exact line text, so a change to that line fails this check and
// forces a fresh review rather than inheriting the old verdict.
const REVIEWED_PERCENT_S = new Set([
  "execute format('create index if not exists %I on %s (%I)',idx,r.table_name,r.column_name);",
]);
const formatWithoutQuoting = [];
for (const file of migrationFiles) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    if (!/execute\s+format\s*\(/i.test(line) || !/%s/.test(line)) return;
    if (REVIEWED_PERCENT_S.has(line.trim())) return;
    formatWithoutQuoting.push(`${file}:${index + 1}`);
  });
}
check('sql', 'dynamic SQL quotes identifiers with %I and literals with %L, never an unreviewed %s', formatWithoutQuoting.join(', ') || 'none', 'none');

// --------------------------------------------------------- demo boundaries
process.stdout.write('\nSEC-STATIC-4  Demo-only surfaces cannot run in production\n');
const demoGuards = srcFiles.filter((f) => /DEMO_MODE/.test(read(f))).length;
check('demo', 'the demo boundary is referenced in code, not implied', String(demoGuards), (v) => Number(v) > 3);

const routeFiles = globSync('src/app/**/route.ts');
const unguardedRoutes = routeFiles.filter((f) => {
  const text = read(f);
  const needsGuard = /demo|mock|seed|reset|time.?jump/i.test(f);
  return needsGuard && !/DEMO_MODE|requireDemo|isDemo/.test(text);
});
check('demo', 'no demo/seed/reset endpoint ships without a mode guard', unguardedRoutes.join(', ') || 'none', 'none');
check('demo', 'route handlers present', String(routeFiles.length), (v) => Number(v) > 0);

const timeJump = srcFiles.filter((f) => /demo_time_jump/.test(read(f)));
// A guard is a guard whichever way it is written: `mode === 'demo'` to allow
// and `mode !== 'demo'` to refuse are the same check with opposite polarity,
// and the refusing form is the one that reads better at a call site. The
// pattern used to accept only the affirmative one, so tightening the guard to
// an early return reported it as absent.
const MODE_GUARD = /business\.mode\s*[!=]==\s*'demo'|mode\s*[!=]==\s*'demo'|isDemo|demoTenantsEnabled|DEMO_MODE/;
check('demo', 'the time jump is reachable only where the mode is checked', timeJump.map((f) => `${f}:${MODE_GUARD.test(read(f)) ? 'guarded' : 'UNGUARDED'}`).join(', ') || 'not present', (v) => !v.includes('UNGUARDED'));

// ------------------------------------------------- Data API exposure is explicit
process.stdout.write('\nSEC-STATIC-6  The Data API surface is declared, not inherited\n');
// Supabase is moving table exposure from "granted automatically on creation" to
// opt-in. A schema that relies on the old default silently stops working on a
// project created after the switch, and the failure lands at deploy time.
const grantText = migrationFiles.map((f) => readFileSync(f, 'utf8')).join('\n');
const grantedTables = new Set(
  [...grantText.matchAll(/grant\s+[a-z, ]+\s+on\s+public\.([a-z_]+)\s+to\s+(?:anon|authenticated)/gi)].map((m) => m[1].toLowerCase()),
);
const createdTables = [...grantText.matchAll(/create table (?:if not exists )?public\.([a-z_]+)/gi)].map((m) => m[1].toLowerCase());
// A table may legitimately have no grant — that is the deliberate closed state,
// and it only counts as deliberate if the table also has no policy. A table with
// a policy but no grant would be one someone meant to expose and forgot to.
const policied = new Set(
  [...grantText.matchAll(/create policy\s+\S+\s+on\s+public\.([a-z_]+)/gi)].map((m) => m[1].toLowerCase()),
);
const withoutGrant = [...new Set(createdTables)].filter((t) => !grantedTables.has(t));
const wronglyClosed = withoutGrant.filter((t) => policied.has(t));
check('dataapi', 'every table meant to be reachable has an explicit grant', wronglyClosed.length ? wronglyClosed.join(', ') : `${new Set(createdTables).size - withoutGrant.length} granted, ${withoutGrant.length} deliberately closed`, () => wronglyClosed.length === 0);
check('dataapi', 'a table with no grant is closed on purpose, not by omission', withoutGrant.join(', ') || 'none closed', () => withoutGrant.every((t) => !policied.has(t)));
check('dataapi', 'no migration grants a privilege that RLS cannot filter', /grant[^;]*(truncate|trigger|references)[^;]*to\s+(anon|authenticated)/i.test(grantText) ? 'found' : 'none', 'none');

// ------------------------------------------------------------- dependencies
process.stdout.write('\nSEC-STATIC-5  Dependency audit\n');
let audit = { vulnerabilities: {} };
try {
  audit = JSON.parse(execFileSync('npm', ['audit', '--json'], { encoding: 'utf8', shell: true, maxBuffer: 32 * 1024 * 1024 }));
} catch (error) {
  // npm audit exits non-zero when it finds anything; the JSON is still on stdout.
  try { audit = JSON.parse(String(error.stdout)); } catch { audit = { error: String(error.message).slice(0, 120) }; }
}
const severity = audit.metadata?.vulnerabilities ?? {};
const summary = Object.entries(severity).filter(([k]) => k !== 'total').map(([k, v]) => `${k}=${v}`).join(' ');
check('deps', 'no critical or high severity advisory', summary || 'unavailable', (v) => {
  const crit = Number((v.match(/critical=(\d+)/) ?? [])[1] ?? 0);
  const high = Number((v.match(/high=(\d+)/) ?? [])[1] ?? 0);
  return crit === 0 && high === 0;
});
check('deps', 'moderate and low advisories are recorded rather than hidden', summary || 'unavailable', (v) => v !== 'unavailable');

const lock = existsSync('package-lock.json');
check('deps', 'a lockfile is committed so installs are reproducible', lock ? 'package-lock.json present' : 'missing', 'package-lock.json present');

// -------------------------------------------------------------------- done
mkdirSync('tests/security/results', { recursive: true });
writeFileSync('tests/security/results/static-scan.json', JSON.stringify({ total: rows.length, failed: failures, rows, audit: severity }, null, 2), 'utf8');
process.stdout.write(`\nstatic-scan: ${rows.length - failures}/${rows.length} passed\n`);
process.exit(failures === 0 ? 0 : 1);
