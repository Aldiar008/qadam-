// Локальные ключи для приёмки подхватываются из `.env.local`.
//
// The dev server reads that file; these suites did not, so a run that forgot one
// export reported a missing secret as a product failure — «TELEGRAM_BOT_TOKEN is
// available» came back `missing` while the stand had it all along. Anything
// already in the environment wins, so an explicit export still overrides the file.
import { existsSync, readFileSync } from 'node:fs';

/**
 * Порядок файлов зависит от цели прогона.
 *
 * `.env.local` describes localhost and `CREDENTIALS.local.md` describes the
 * deployed stands, and they hold different values under the same names —
 * `QADAM_JOB_SECRET` above all. Reading the local file first while driving a
 * stand would sign the cycle request with the wrong secret and get a 401 that
 * looks like a broken endpoint. So the target decides which file wins.
 *
 * `CREDENTIALS.local.md` is the same key store with prose around it; it is
 * gitignored (`*.local.md`), which is the only reason this repository contains
 * no secret at all.
 */
function orderFor(target) {
  return target === 'remote'
    ? ['CREDENTIALS.local.md', '.env.local', '.env']
    : ['.env.local', '.env', 'CREDENTIALS.local.md'];
}

export function loadLocalEnv(
  files = orderFor(
    process.env.QADAM_SUPABASE_PROJECT_REF || !/localhost|127\.0\.0\.1/.test(process.env.QADAM_E2E_BASE ?? 'localhost')
      ? 'remote'
      : 'local',
  ),
) {
  for (const file of files) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (!match) continue;
      // Shell-строки вида `export A=1 B=2` встречаются в CREDENTIALS.local.md,
      // и без этого второй ключ уезжал в значение первого.
      const raw = match[2].trim();
      const quoted = /^(["'])(.*?)\1/.exec(raw);
      const value = quoted ? quoted[2] : raw.split(/\s+/)[0];
      if (value && process.env[match[1]] === undefined) process.env[match[1]] = value;
    }
  }
}
