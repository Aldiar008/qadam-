#!/usr/bin/env node
/**
 * Returns a demonstration stand to the data the seed describes.
 *
 * This exists because the two-step version had a hole in it. Between
 * `remote_demo_reset.sql` and `remote_demo_seed.sql` the database has no
 * accounts at all, and anyone who opened the stand in that window met a demo
 * login that refused without saying why. It looked exactly like a broken
 * button. One command, one place to add a retry, and a loud failure if the
 * second half does not land.
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/restore-demo.mjs <project-ref>
 *   SUPABASE_ACCESS_TOKEN=sbp_... QADAM_SUPABASE_PROJECT_REF=... npm run demo:restore
 */

import { spawnSync } from 'node:child_process';

const ref = process.argv[2] ?? process.env.QADAM_SUPABASE_PROJECT_REF;
if (!ref) {
  console.error('Usage: node scripts/restore-demo.mjs <project-ref>');
  console.error('Or set QADAM_SUPABASE_PROJECT_REF. Refusing to guess which database to empty.');
  process.exit(2);
}
if (!process.env.SUPABASE_ACCESS_TOKEN) {
  console.error('SUPABASE_ACCESS_TOKEN is not set.');
  process.exit(2);
}

const steps = [
  ['supabase/seed/remote_demo_reset.sql', 'сброс'],
  ['supabase/seed/remote_demo_seed.sql', 'seed'],
];

console.log(`Восстанавливаю стенд ${ref}. Пока идёт seed, демо-вход недоступен — это несколько секунд.`);

for (const [file, label] of steps) {
  const run = spawnSync(process.execPath, ['scripts/apply-remote-sql.mjs', ref, file], { stdio: 'inherit' });
  if (run.status !== 0) {
    console.error(`\nFAIL: шаг «${label}» не выполнен (${file}).`);
    if (label === 'seed') {
      // The reset already ran, so stopping quietly here would leave the stand
      // empty and looking broken. Say so plainly and name the way out.
      console.error('База сейчас пуста: сброс прошёл, а seed — нет.');
      console.error(`Повторите: node scripts/restore-demo.mjs ${ref}`);
    }
    process.exit(1);
  }
}

console.log(`\nPASS: стенд ${ref} восстановлен.`);
