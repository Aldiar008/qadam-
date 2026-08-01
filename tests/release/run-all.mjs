// The full release audit, in the only order that makes its results mean anything.
//
//   1. replay every migration onto an empty database and apply the seed;
//   2. record the seed's exact figures, before any suite can add a row;
//   3. run the acceptance, security and accessibility suites, which write
//      artefacts and legitimately mutate data;
//   4. run the mode-separation suite, which builds and starts a second server
//      in PRODUCTION_MODE and restores the DEMO_MODE build afterwards;
//   5. read every artefact and decide the release gates.
//
// Steps 2 and 5 both look at the database, but at different moments and for
// different reasons, which is why the order is not negotiable.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const skipReset = process.env.QADAM_RELEASE_SKIP_RESET === '1';
const only = process.argv.slice(2);

const STEPS = [
  { id: 'seed', label: 'Seed determinism', run: () => node('tests/release/seed-determinism.mjs') },
  { id: 'e2e', label: 'Owner, customer and admin journeys', run: () => node('tests/e2e/run-all.mjs', { QADAM_E2E_SKIP_RESET: '1' }) },
  { id: 'security', label: 'Security suites', run: () => node('tests/security/run-all.mjs') },
  { id: 'a11y', label: 'Accessibility and responsive audit', run: () => node('tests/a11y/audit.mjs') },
  { id: 'perf', label: 'Performance and failure handling', run: () => node('tests/perf/measure.mjs') },
  { id: 'modes', label: 'DEMO_MODE / PRODUCTION_MODE separation', run: () => node('tests/release/mode-separation.mjs') },
  { id: 'demo', label: 'The 4:30 demo script', run: () => node('tests/release/demo-script.mjs') },
  { id: 'gates', label: 'Release gates G1-G12', run: () => node('tests/release/gates.mjs') },
];

function node(script, env = {}) {
  return spawnSync(process.execPath, [script], { stdio: 'inherit', env: { ...process.env, ...env } }).status ?? 1;
}

if (!skipReset && (!only.length || only.includes('seed'))) {
  process.stdout.write(`\n${'='.repeat(72)}\nMIGRATION REPLAY AND DETERMINISTIC SEED\n${'='.repeat(72)}\n`);
  execFileSync('npx', ['supabase', 'db', 'reset', '--local'], { stdio: 'inherit', shell: true });
}

const outcomes = [];
for (const step of STEPS) {
  if (only.length && !only.includes(step.id)) continue;
  process.stdout.write(`\n${'='.repeat(72)}\n${step.label.toUpperCase()}\n${'='.repeat(72)}\n`);
  outcomes.push({ ...step, status: step.run() });
}

process.stdout.write(`\n${'='.repeat(72)}\nRELEASE AUDIT SUMMARY\n${'='.repeat(72)}\n`);
const artefacts = {
  'e2e/owner': 'tests/e2e/results/owner.json',
  'e2e/customer': 'tests/e2e/results/customer.json',
  'e2e/admin': 'tests/e2e/results/admin.json',
  'security/rls': 'tests/security/results/rls-matrix.json',
  'security/static': 'tests/security/results/static-scan.json',
  'security/http': 'tests/security/results/http-suite.json',
  'a11y': 'tests/a11y/results/audit.json',
  'perf': 'tests/perf/results/measure.json',
  'modes': 'tests/release/results/mode-separation.json',
  'demo script': 'tests/release/results/demo-script.json',
};
let total = 0;
let bad = 0;
for (const [label, file] of Object.entries(artefacts)) {
  if (!existsSync(file)) { process.stdout.write(`${label.padEnd(18)} (not run)\n`); continue; }
  const data = JSON.parse(readFileSync(file, 'utf8'));
  total += data.total;
  bad += data.failed;
  process.stdout.write(`${label.padEnd(18)} ${data.total - data.failed}/${data.total}\n`);
}
process.stdout.write(`${'-'.repeat(34)}\n${'TOTAL'.padEnd(18)} ${total - bad}/${total} checks\n`);

if (existsSync('tests/release/results/gates.json')) {
  const { gates } = JSON.parse(readFileSync('tests/release/results/gates.json', 'utf8'));
  process.stdout.write('\nGates:\n');
  for (const g of gates) process.stdout.write(`  ${g.id.padEnd(4)} ${g.status.padEnd(20)} ${g.total - g.failed}/${g.total}  ${g.title}\n`);
}

const failedSteps = outcomes.filter((o) => o.status !== 0).map((o) => o.id);
process.stdout.write(`\n${failedSteps.length ? `FAILED STEPS: ${failedSteps.join(', ')}` : 'Every step passed.'}\n`);
process.exit(failedSteps.length ? 1 : 0);
