// Runs the acceptance suites in order against a freshly seeded database.
//
// The reset is not optional: several assertions are exact seed figures
// (64 inactive, 18 eligible, the TAMYR ledger), and they only mean anything
// on the committed seed rather than on whatever a previous run left behind.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const suites = process.argv.slice(2).length ? process.argv.slice(2) : ['owner', 'customer', 'admin', 'mini-app'];

// Resetting the local stack while the suites drive a deployed environment
// would prove nothing and quietly desynchronise the run, so the target decides.
const remote = Boolean(process.env.QADAM_SUPABASE_PROJECT_REF) || !/localhost|127\.0\.0\.1/.test(process.env.QADAM_E2E_BASE ?? 'localhost');
const skipReset = process.env.QADAM_E2E_SKIP_RESET === '1';

const remoteRef = process.env.QADAM_SUPABASE_PROJECT_REF;

if (skipReset) {
  process.stdout.write('Skipping the reset by request; exact-seed assertions may not hold.\n');
} else if (remote) {
  // The suites assert exact seed figures and mutate what they drive, so a run
  // that starts from the previous run's leftovers reports differences that are
  // its own doing. A deployed target gets the same clean start as a local one,
  // by the only route available to it.
  if (!remoteRef || !process.env.SUPABASE_ACCESS_TOKEN) {
    process.stdout.write(
      'Target is deployed but QADAM_SUPABASE_PROJECT_REF / SUPABASE_ACCESS_TOKEN are not both set.\n' +
        'Running against whatever state it is in; exact-seed assertions may not hold.\n',
    );
  } else {
    process.stdout.write(`Restoring project ${remoteRef} to the committed seed...\n`);
    for (const file of ['supabase/seed/remote_demo_reset.sql', 'supabase/seed/remote_demo_seed.sql']) {
      execFileSync(process.execPath, ['scripts/apply-remote-sql.mjs', remoteRef, file], { stdio: 'inherit' });
    }
  }
} else {
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
