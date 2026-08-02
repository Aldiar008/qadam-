// `npm run dev:all` — поднимает всё, что нужно для работы: базу, окружение и фронтенд.
//
// Что делает по шагам:
//   1. проверяет, что Docker запущен, и объясняет что делать, если нет;
//   2. поднимает локальный Supabase, если он ещё не поднят;
//   3. синхронизирует `.env.local` с ключами из этого Supabase, не трогая ваши
//      собственные значения;
//   4. сверяет, все ли миграции применены, и говорит точную команду, если нет;
//   5. запускает Next в режиме разработки;
//   6. раз в минуту прогоняет цикл выполнения — без него автоматизации и outbox
//      просто стоят, потому что планировщика у проекта нет.
//
// Ctrl+C останавливает фронтенд и цикл задач. Supabase остаётся поднятым, чтобы
// следующий запуск был быстрым; остановить его — `npm run dev:stop`.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename } from 'node:path';

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const RESET = has('--reset');
const NO_JOBS = has('--no-jobs');
const PORT = Number(process.env.PORT ?? 3000);

const c = {
  dim: (s) => `[2m${s}[0m`,
  bold: (s) => `[1m${s}[0m`,
  green: (s) => `[32m${s}[0m`,
  yellow: (s) => `[33m${s}[0m`,
  red: (s) => `[31m${s}[0m`,
  cyan: (s) => `[36m${s}[0m`,
};

const step = (n, text) => process.stdout.write(`\n${c.bold(`[${n}/5]`)} ${text}\n`);
const ok = (text) => process.stdout.write(`      ${c.green('✓')} ${text}\n`);
const warn = (text) => process.stdout.write(`      ${c.yellow('!')} ${text}\n`);
const fail = (text) => process.stdout.write(`      ${c.red('✕')} ${text}\n`);

/**
 * Тихо выполняет команду и возвращает результат, не роняя процесс.
 *
 * По умолчанию без шелла: аргументы с пробелами и кавычками - а SQL состоит из
 * них целиком - при `shell: true` на Windows склеиваются в одну строку и
 * приезжают искажёнными. Шелл включается только там, где он нужен: `npx` и
 * `npm` на Windows это .cmd-обёртки, которые напрямую не запускаются.
 */
function run(cmd, cmdArgs, options = {}) {
  const [command, spawnArgs, shell] = shellForm(cmd, cmdArgs);
  const result = spawnSync(command, spawnArgs, { encoding: 'utf8', shell, maxBuffer: 32 * 1024 * 1024, ...options });
  return { code: result.status, out: (result.stdout ?? '').trim(), err: (result.stderr ?? '').trim() };
}

/**
 * `npx` и `npm` на Windows это .cmd-обёртки, которые напрямую не запускаются, —
 * им нужен шелл. Но передавать шеллу отдельный массив аргументов Node не даёт
 * (DEP0190: они не экранируются, а склеиваются), поэтому для них команда
 * собирается в одну строку сразу. Всё остальное — .exe, и запускается без шелла,
 * что заодно сохраняет кавычки в SQL нетронутыми.
 */
function shellForm(cmd, cmdArgs = []) {
  const needsShell = cmd === 'npx' || cmd === 'npm' || cmd.endsWith('.cmd');
  return needsShell ? [[cmd, ...cmdArgs].join(' '), [], true] : [cmd, cmdArgs, false];
}

/**
 * Имя контейнера базы Supabase выводит из имени папки проекта.
 * `path.basename` вместо ручного разбора: он сам знает про разделители Windows.
 */
function dbContainer() {
  return `supabase_db_${basename(process.cwd()).replace(/[^a-zA-Z0-9]/g, '_')}`;
}

/** Одно значение из локальной базы. `null`, если контейнер не отвечает. */
function query(sql) {
  const result = run('docker', ['exec', '-i', dbContainer(), 'psql', '-U', 'postgres', '-d', 'postgres', '-A', '-t', '-c', sql]);
  return result.code === 0 ? result.out : null;
}

/** То же, что shellForm, но в виде готовых аргументов для spawnSync с наследуемым выводом. */
function shellFormSpawn(cmd, cmdArgs) {
  const [command, spawnArgs, shell] = shellForm(cmd, cmdArgs);
  return [command, spawnArgs, { stdio: 'inherit', shell }];
}

function die(message, hint) {
  fail(message);
  if (hint) process.stdout.write(`\n${hint}\n`);
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────── 1. Docker
step(1, 'Проверяю Docker');
if (run('docker', ['info']).code !== 0) {
  die(
    'Docker не отвечает.',
    `      Локальный Supabase живёт в Docker, без него база не поднимется.\n` +
    `      Запустите Docker Desktop, дождитесь пока он перейдёт в состояние Running,\n` +
    `      и выполните ${c.cyan('npm run dev:all')} снова.`,
  );
}
ok('Docker запущен');

// ─────────────────────────────────────────────────────────── 2. Supabase
step(2, 'Поднимаю Supabase');
const alreadyUp = run('npx', ['supabase', 'status']).code === 0;

if (alreadyUp && !RESET) {
  ok('Supabase уже поднят, использую его');
} else {
  if (RESET && alreadyUp) warn('Флаг --reset: база будет пересоздана с нуля');
  process.stdout.write(c.dim('      это может занять минуту при первом запуске...\n'));
  const started = spawnSync(...shellFormSpawn('npx', ['supabase', 'start']));
  if (started.status !== 0) {
    die('Не удалось поднять Supabase.', `      Посмотрите вывод выше. Часто помогает ${c.cyan('npx supabase stop --no-backup')} и повтор.`);
  }
  ok('Supabase поднят');
}

// ──────────────────────────────────────────────────────── 3. Окружение
step(3, 'Синхронизирую .env.local');
const statusEnv = run('npx', ['supabase', 'status', '-o', 'env']);
if (statusEnv.code !== 0) die('Не удалось прочитать параметры Supabase.');

const supabase = Object.fromEntries(
  statusEnv.out
    .split('\n')
    .map((line) => line.match(/^([A-Z0-9_]+)="(.*)"$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);

/**
 * Значения, которые владеет Supabase: они перезаписываются при каждом запуске,
 * потому что после `supabase stop --no-backup` ключи меняются, и залипший
 * старый ключ даёт невнятную ошибку авторизации вместо понятной.
 */
const managed = {
  NEXT_PUBLIC_SUPABASE_URL: supabase.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: supabase.PUBLISHABLE_KEY,
  SUPABASE_SECRET_KEY: supabase.SECRET_KEY,
};

/**
 * Значения, которые проставляются только если их ещё нет: если вы их поменяли,
 * это ваше решение, и скрипт его не отменяет.
 *
 * Секреты для job-эндпоинта и вебхуков нужны, иначе `/api/jobs/run-cycle`
 * отвечает 503, а `/api/webhooks/delivery` — 401, и «бэкенд» выглядит сломанным,
 * хотя он просто защищён. Значения выводятся из пути проекта, поэтому одинаковы
 * между запусками и при этом не общие для всех машин.
 */
const localSecret = (name) => `dev-${createHash('sha256').update(`${name}:${process.cwd()}`).digest('hex').slice(0, 32)}`;
const defaults = {
  // Whether this installation exposes seeded demo tenants at all. What a given
  // tenant may do is decided by public.businesses.mode, not by this.
  QADAM_DEMO_TENANTS_ENABLED: 'true',
  NEXT_PUBLIC_SITE_URL: `http://localhost:${PORT}`,
  QADAM_AI_PROVIDER: 'none',
  QADAM_JOB_SECRET: localSecret('job'),
  QADAM_WEBHOOK_SECRET: localSecret('webhook'),
};

const envPath = '.env.local';
const existing = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
const lines = existing.split(/\r?\n/);
const seen = new Set();
const changed = [];

const next = lines.map((line) => {
  const match = line.match(/^([A-Z0-9_]+)=/);
  if (!match) return line;
  const key = match[1];
  seen.add(key);
  if (managed[key] !== undefined && line !== `${key}=${managed[key]}`) {
    changed.push(key);
    return `${key}=${managed[key]}`;
  }
  return line;
});

const added = [];
for (const [key, value] of Object.entries({ ...managed, ...defaults })) {
  if (!seen.has(key)) {
    next.push(`${key}=${value}`);
    added.push(key);
  }
}

const body = next.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
if (body !== existing) writeFileSync(envPath, body, 'utf8');

if (!existing) ok(`${envPath} создан`);
else if (changed.length) ok(`обновлены ключи Supabase: ${changed.join(', ')}`);
else ok('ключи Supabase совпадают');
if (added.length) ok(`добавлены: ${added.join(', ')}`);

// Значения нужны и текущему процессу: Next читает .env.local сам, а цикл задач — нет.
const env = { ...process.env };
for (const line of body.split('\n')) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match) env[match[1]] = match[2];
}

// ───────────────────────────────────────────────────────── 4. Миграции
step(4, 'Проверяю схему и данные');
const localMigrations = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).length;
const appliedRaw = query('select count(*) from supabase_migrations.schema_migrations');
const applied = appliedRaw === null ? null : Number(appliedRaw.replace(/\D/g, ''));

if (RESET) {
  process.stdout.write(c.dim('      пересоздаю базу и накатываю seed...\n'));
  if (spawnSync(...shellFormSpawn('npx', ['supabase', 'db', 'reset', '--local'])).status !== 0) {
    die('Сброс базы не удался.');
  }
  ok('база пересоздана, seed применён');
} else if (applied === null) {
  warn('не смог прочитать список применённых миграций — продолжаю');
} else if (applied < localMigrations) {
  warn(`применено ${applied} миграций из ${localMigrations}`);
  process.stdout.write(
    `      ${c.yellow('В репозитории есть миграции, которых нет в базе.')}\n` +
    `      Накатить их вместе с seed: ${c.cyan('npm run dev:all -- --reset')}\n` +
    `      ${c.dim('(это пересоздаст локальную базу — данные, введённые вручную, пропадут)')}\n`,
  );
} else {
  ok(`${applied} миграций применено из ${localMigrations}, схема актуальна`);
}

const seedCount = query("select count(*) from public.customers where business_id='10000000-0000-4000-8000-000000000001'");
if (seedCount !== null) {
  const count = Number(seedCount.replace(/\D/g, ''));
  if (count > 0) ok(`демо-данные на месте: ${count} клиентов в TAMYR Coffee`);
  else warn(`демо-данных нет — ${c.cyan('npm run dev:all -- --reset')} их вернёт`);
}

// ─────────────────────────────────────────────────────── 5. Приложение
step(5, 'Запускаю приложение');

const children = [];
let shuttingDown = false;

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  process.stdout.write(`\n${c.dim('Останавливаю фронтенд и цикл задач...')}\n`);
  for (const child of children) {
    try { child.kill(); } catch { /* уже завершён */ }
  }
  // Дочерний next живёт за шеллом, поэтому его надо снять по порту.
  if (process.platform === 'win32') {
    run('powershell.exe', ['-NoProfile', '-Command',
      `"Get-NetTCPConnection -LocalPort ${PORT} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"`]);
  }
  process.stdout.write(
    `${c.dim('Supabase остался поднятым, чтобы следующий запуск был быстрым.')}\n` +
    `${c.dim(`Остановить его целиком: ${'npm run dev:stop'}`)}\n`,
  );
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const [webCmd, webArgs, webShell] = shellForm('npx', ['next', 'dev', '-p', String(PORT)]);
const web = spawn(webCmd, webArgs, { stdio: 'inherit', shell: webShell, env });
children.push(web);
web.on('exit', (code) => {
  if (!shuttingDown) {
    process.stdout.write(`\n${c.red('Фронтенд остановился')} (код ${code}).\n`);
    shutdown();
  }
});

// Ждём, пока сервер начнёт отвечать, и только потом печатаем сводку.
const base = `http://localhost:${PORT}`;
let ready = false;
for (let i = 0; i < 60 && !ready; i += 1) {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  ready = await fetch(base).then((r) => r.ok || r.status < 500).catch(() => false);
}

if (!ready) {
  warn(`приложение не ответило на ${base} за минуту — смотрите вывод выше`);
} else {
  process.stdout.write(`
${c.green('━'.repeat(64))}
  ${c.bold('QADAM Growth OS запущен')}

  ${c.bold('Приложение')}        ${c.cyan(base)}
  ${c.bold('Supabase Studio')}   ${c.cyan(supabase.STUDIO_URL)}
  ${c.bold('Почта (Mailpit)')}   ${c.cyan(supabase.MAILPIT_URL)}
  ${c.bold('API базы')}          ${c.dim(supabase.API_URL)}
  ${c.bold('Подключение к БД')}  ${c.dim(supabase.DB_URL)}

  ${c.bold('Вход в демо')}       кнопка «Войти в DEMO_MODE» на ${c.cyan(`${base}/login`)}
  ${c.bold('Логины')}            owner@qadam.local · admin@qadam.local · viewer@qadam.local
  ${c.bold('Пароль')}            QadamLocal!2026

  ${c.dim('Ctrl+C — остановить приложение. Supabase останется поднятым.')}
${c.green('━'.repeat(64))}

`);
}

// ───────────────────────────────────────────────── цикл выполнения
// Планировщика у проекта нет: цикл запускает внешний вызов. В разработке этим
// внешним вызовом работает вот этот таймер — иначе автоматизации и outbox
// просто стоят, и это выглядит как поломка, хотя это отсутствие планировщика.
if (!NO_JOBS && ready) {
  const secret = env.QADAM_JOB_SECRET;
  const tick = async () => {
    if (shuttingDown) return;
    const cycleKey = `dev-${Date.now()}`;
    try {
      const response = await fetch(`${base}/api/jobs/run-cycle`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-qadam-job-secret': secret },
        body: JSON.stringify({ cycleKey }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok) {
        const summary = [payload.outbox && `outbox: ${JSON.stringify(payload.outbox)}`, payload.automations && `automations: ${JSON.stringify(payload.automations)}`]
          .filter(Boolean).join(', ');
        if (summary && !/\b0\b.*\b0\b/.test(summary)) process.stdout.write(c.dim(`  [цикл] ${summary}\n`));
      } else if (response.status !== 429) {
        process.stdout.write(c.dim(`  [цикл] ${response.status} ${JSON.stringify(payload)}\n`));
      }
    } catch {
      // Сервер перезапускается после правки файла — это нормально, ждём следующего тика.
    }
  };
  setInterval(tick, 60_000);
  void tick();
  process.stdout.write(c.dim(`  Цикл выполнения работает раз в минуту. Отключить: npm run dev:all -- --no-jobs\n\n`));
}
