// Fails if the committed database types no longer match the local schema.
//
// The types are committed so the app typechecks without a database. That only
// helps if they are current: a stale file makes `tsc` agree with a schema that
// no longer exists.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const COMMITTED = 'src/types/database.generated.ts';
const generated = execFileSync('npx', ['supabase', 'gen', 'types', '--local', '--schema', 'public'], {
  encoding: 'utf8',
  shell: true,
  maxBuffer: 32 * 1024 * 1024,
});
const committed = readFileSync(COMMITTED, 'utf8');

const normalise = (text) => text.replace(/\r\n/g, '\n').trim();
if (normalise(generated) === normalise(committed)) {
  process.stdout.write(`${COMMITTED} is in sync with the local schema.\n`);
  process.exit(0);
}

// Not `npm run db:types > file`: npm prints its own banner to stdout, and
// redirecting it writes those lines into the generated file. Following that
// instruction produced a file that fails this very check, two lines offset.
process.stderr.write(`${COMMITTED} is stale.\nRegenerate it with:\n  npm run db:types:write\n`);
const a = normalise(generated).split('\n');
const b = normalise(committed).split('\n');
let shown = 0;
for (let i = 0; i < Math.max(a.length, b.length) && shown < 20; i += 1) {
  if (a[i] !== b[i]) {
    process.stderr.write(`  line ${i + 1}\n    schema:    ${a[i] ?? '(absent)'}\n    committed: ${b[i] ?? '(absent)'}\n`);
    shown += 1;
  }
}
process.exit(1);
