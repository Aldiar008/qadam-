// Runs the acceptance suites in order against a freshly seeded database.
//
// The reset is not optional: several assertions are exact seed figures
// (64 inactive, 18 eligible, the TAMYR ledger), and they only mean anything
// on the committed seed rather than on whatever a previous run left behind.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const suites = process.argv.slice(2).length ? process.argv.slice(2) : ['owner', 'customer', 'admin'];
const skipReset = process.env.QADAM_E2E_SKIP_RESET === '1';

if (!skipReset) {
  process.stdout.write('Resetting the local database to the committed seed...\n');
  execFileSync('npx', ['supabase', 'db', 'reset', '--local'], { stdio: 'inherit', shell: true });
}

let failed = 0;
for (const suite of suites) {
  process.stdout.write(`\n${'='.repeat(72)}\n${suite.toUpperCase()} SUITE\n${'='.repeat(72)}\n`);
  const result = spawnSync(process.execPath, [`tests/e2e/${suite}.spec.mjs`], { stdio: 'inherit' });
  if (result.status !== 0) failed += 1;
}

process.stdout.write(`\n${'='.repeat(72)}\nSUMMARY\n${'='.repeat(72)}\n`);
let checks = 0;
let bad = 0;
for (const suite of suites) {
  const file = `tests/e2e/results/${suite}.json`;
  if (!existsSync(file)) {
    process.stdout.write(`${suite.padEnd(10)} no result file — the suite crashed before reporting\n`);
    bad += 1;
    continue;
  }
  const data = JSON.parse(readFileSync(file, 'utf8'));
  checks += data.total;
  bad += data.failed;
  process.stdout.write(`${suite.padEnd(10)} ${data.total - data.failed}/${data.total} passed\n`);
}
process.stdout.write(`\nTOTAL ${checks - bad}/${checks} checks passed across ${suites.length} suites\n`);
process.exit(failed === 0 && bad === 0 ? 0 : 1);
