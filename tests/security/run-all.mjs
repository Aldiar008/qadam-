// Runs the three security suites and prints one verdict.
//
// The RLS matrix and the static scan need only the database and the repo; the
// HTTP suite needs the production server running on QADAM_E2E_BASE.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const suites = process.argv.slice(2).length ? process.argv.slice(2) : ['rls-matrix', 'static-scan', 'http-suite'];

let crashed = 0;
for (const suite of suites) {
  process.stdout.write(`\n${'='.repeat(72)}\n${suite.toUpperCase()}\n${'='.repeat(72)}\n`);
  const result = spawnSync(process.execPath, [`tests/security/${suite}.mjs`], { stdio: 'inherit' });
  if (result.status !== 0) crashed += 1;
}

process.stdout.write(`\n${'='.repeat(72)}\nSECURITY SUMMARY\n${'='.repeat(72)}\n`);
let checks = 0;
let bad = 0;
for (const suite of suites) {
  const file = `tests/security/results/${suite}.json`;
  if (!existsSync(file)) {
    process.stdout.write(`${suite.padEnd(14)} no result file — the suite crashed before reporting\n`);
    bad += 1;
    continue;
  }
  const data = JSON.parse(readFileSync(file, 'utf8'));
  checks += data.total;
  bad += data.failed;
  process.stdout.write(`${suite.padEnd(14)} ${data.total - data.failed}/${data.total} passed\n`);
}
process.stdout.write(`\nTOTAL ${checks - bad}/${checks} security checks passed\n`);
process.exit(crashed === 0 && bad === 0 ? 0 : 1);
