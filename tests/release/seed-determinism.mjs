// Records the seed's exact figures immediately after a migration replay.
//
// It has to run before any acceptance suite, because those suites legitimately
// create customers, campaigns and audit rows. Counting the live tables later
// would measure the tests rather than the seed.
import { mkdirSync, writeFileSync } from 'node:fs';

import { db } from '../e2e/harness.mjs';

const BIZ = '10000000-0000-4000-8000-000000000001';
const facts = {
  migrations: Number(db('select count(*) from supabase_migrations.schema_migrations')),
  customers: Number(db(`select count(*) from public.customers where business_id='${BIZ}'`)),
  transactions: Number(db(`select count(*) from public.transactions where business_id='${BIZ}'`)),
  inactive: Number(db(`select count(*) from public.customers where business_id='${BIZ}' and lifecycle_stage='inactive'`)),
  eligible: Number(db(`select count(*) from public.effective_consent_customers('${BIZ}','marketing.whatsapp', (select array_agg(id) from public.customers where business_id='${BIZ}' and lifecycle_stage='inactive'))`)),
  signal: Number(db(`select change_bps from public.signals where business_id='${BIZ}' and metric_key='weekday_revenue_15_18' limit 1`)),
  tools: Number(db('select count(*) from public.tools')),
  businesses: Number(db('select count(*) from public.businesses')),
};

const EXPECTED = { customers: 180, transactions: 1129, inactive: 64, eligible: 18, signal: -2700 };
const mismatches = Object.entries(EXPECTED).filter(([key, value]) => facts[key] !== value);

mkdirSync('tests/release/results', { recursive: true });
writeFileSync('tests/release/results/seed-determinism.json', JSON.stringify({ ...facts, expected: EXPECTED, mismatches }, null, 2), 'utf8');

process.stdout.write('\nSEED  Deterministic figures straight after the replay\n');
for (const [key, value] of Object.entries(facts)) {
  const expected = EXPECTED[key];
  const mark = expected === undefined ? '    ' : value === expected ? 'PASS' : 'FAIL';
  process.stdout.write(`  ${mark}  ${key.padEnd(14)} ${value}${expected === undefined ? '' : ` (expected ${expected})`}\n`);
}
process.stdout.write(`\nseed-determinism: ${mismatches.length === 0 ? 'exact' : `${mismatches.length} mismatch(es)`}\n`);
process.exit(mismatches.length === 0 ? 0 : 1);
