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

/**
 * One cycle right after the seed, when there is a stand to call.
 *
 * The seed writes a signal so «Сегодня» is never empty. But the detector
 * re-measures the same sales on the next cycle and can honestly land a point or
 * two away from the seeded figure — and a number that changes in the middle of a
 * demonstration is the one thing worth avoiding. Running the cycle now makes the
 * figure on screen the measured one from the start, and fills the recommendation
 * list from it.
 */
const stand = process.env.QADAM_STAND_URL ?? 'https://qadam-growth-os.vercel.app';
const jobSecret = process.env.QADAM_JOB_SECRET;
if (jobSecret) {
  try {
    const response = await fetch(`${stand.replace(/\/$/, '')}/api/jobs/run-cycle`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-qadam-job-secret': jobSecret },
      body: JSON.stringify({ cycleKey: `restore-${Date.now()}` }),
    });
    console.log(response.ok
      ? 'Цикл прогнан: сигнал измерен по продажам, рекомендации собраны.'
      : `Цикл не прогнан (${response.status}). Стенд восстановлен, но «Сегодня» покажет seed-значение до следующего цикла.`);
  } catch (error) {
    console.log(`Цикл не прогнан (${error instanceof Error ? error.message : error}). Это не отменяет восстановления.`);
  }
} else {
  console.log('QADAM_JOB_SECRET не задан — цикл не прогонялся. Сигнал пересчитается сам в течение пяти минут.');
}

console.log(`\nPASS: стенд ${ref} восстановлен.`);
