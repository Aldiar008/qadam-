# QADAM Runbook

## Prerequisites

- Node.js and npm. Audited environment: Node `v24.15.0`, npm `11.12.1`.
- Docker Desktop для локального Supabase.
- Use the committed `package-lock.json`; do not regenerate it unless dependencies intentionally change.

## Clean local setup

```powershell
npm ci
npm run typecheck
npm run lint
npm run build
npm start -- -p 4177
```

## Supabase local data layer

Prerequisite: Docker Desktop daemon. CLI закреплён в devDependencies, поэтому используется через npm/npx.

```powershell
npm run db:start
npm run db:reset:local
npm run db:test
npx supabase gen types --local --schema public > src/types/database.generated.ts
npm run check:data-layer
npm run check:secrets
```

`db:types` печатает generated TypeScript на stdout. Для обновления файла после успешного replay:

```powershell
npx supabase gen types --local --schema public > src/types/database.generated.ts
```

Перед reset проверьте `npx supabase status`: API должен быть `127.0.0.1:54321`, DB — `127.0.0.1:54322`, а `supabase/.temp/project-ref` не должен указывать remote. Never run `supabase db reset --linked`, `supabase db push` или `supabase db push --include-seed` для этой проверки. Local seed содержит JWT-secret guard и предназначен только для стандартного local CLI stack.

Open `http://localhost:4177`. Development mode, when needed:

```powershell
npm run dev
```

## Current environment contract

Шаблон находится в `.env.example`. Для local Auth скопируйте его в ignored `.env.local`, возьмите URL/publishable key из `npx supabase status` и оставьте `QADAM_APP_MODE=DEMO_MODE`. Browser получает только `NEXT_PUBLIC_SUPABASE_URL` и `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. `SUPABASE_SECRET_KEY` server-only и импортируется только через `src/lib/supabase/admin.ts`. Never commit real secrets.

## Demo seed

Current demo data lives in:

- `src/mock-data/signals.ts`
- `src/mock-data/customers.ts`
- `src/mock-data/campaigns.ts`

Canonical manifest восстановлен из Product Constitution как `supabase/seed/qadam_demo_seed.json`; SQL generator создаёт:

180 customers, 1,129 transactions/120 days, 5 segments, 3 campaigns, 3 content items, 3 recommendations, 3 automations, 12 tools, 3 templates, 120 daily rows и 20 activity rows. IDs deterministic, inserts idempotent, every application seed row marked `is_mock=true`.

Dev credentials (local stack only): `owner@qadam.local`, `marketer@qadam.local`, `viewer@qadam.local`, `admin@qadam.local`; password `QadamLocal!2026`. Never create these accounts in production.

## Verification

```powershell
npm run typecheck
npm run lint
npm run build
```

Domain unit tests запускаются `npm test`: 4 files / 28 assertions. Database tests запускаются `npm run db:test`: 5 pgTAP files / 59 assertions. Для DB quality gates дополнительно используйте:

```powershell
npx supabase db lint --local --schema public --level error --fail-on error
npx supabase db advisors --local --type all --level warn --fail-on error
```

Unit/DB PASS и успешный build не заменяют browser E2E, accessibility или responsive QA.

## Troubleshooting

- Build cache issue: stop the running local process, then use a recoverable workspace-local cache cleanup only after confirming the exact `.next` target. Do not delete repository or user directories.
- Port in use: choose another explicit local port, e.g. `npm start -- -p 4180`.
- Route renders but action does nothing: check whether the component is intentionally presentation-only; many current buttons have no persistence/handler.
- Metrics disagree: treat the constitution’s TAMYR fixture as canonical and block demo release until reconciliation passes.
- Browser QA unavailable: record it as blocked; do not mark console/responsive/a11y checks passed from source inspection alone.

## Recovery and rollback (future backend)

- Application: deploy immutable build artifact and roll back to the previously verified artifact.
- Database: forward-only migrations with tested down/repair procedure and backups; never improvise production destructive SQL.
- Templates/tools: rollback creates/activates a prior version; it does not mutate historical Growth Contracts.
- Connector incident: disable feature flag, pause affected campaigns, preserve audit/events, reconcile idempotency keys before resume.
- Data incident: rotate exposed key, disable connector, preserve evidence, determine tenants/PII scope, follow notification policy.

## Release checklist

All quality gates in `TEST_PLAN.md`, honest mode labels, no client secrets, canonical seed reconciliation, migration/RLS review, incognito production smoke, rollback readiness and explicit deployment authorization.

## Execution loop (Prompt 5, 2026-08-01)

### Scheduler mode: external caller, no platform cron

No production cron or queue is configured for this project. The loop is driven by an
external caller hitting a protected endpoint, which makes that endpoint the security
boundary rather than an afterthought.

```
POST /api/jobs/run-cycle
  x-qadam-job-secret: <QADAM_JOB_SECRET>
  { "businessId": "<uuid|omit for all active>", "cycleKey": "<>=8 chars, unique per cycle>" }
```

Protections, all enforced server-side:

| Guard | Behaviour |
|---|---|
| Missing `QADAM_JOB_SECRET` on the server | `503 jobs_not_configured` — the endpoint refuses to run unguarded |
| Missing or wrong header secret | `401` after a constant-time comparison |
| More than 12 calls per minute | `429 rate_limited` |
| `cycleKey` shorter than 8 characters | `400 invalid_cycle_key` |
| `cycleKey` seen in the last 15 minutes | `409 replayed_cycle` |

Each cycle runs due automations, then drains that business's outbox.

### Local runner

```bash
# one cycle for the demo tenant
curl -X POST http://localhost:3000/api/jobs/run-cycle \
  -H 'content-type: application/json' \
  -H "x-qadam-job-secret: $QADAM_JOB_SECRET" \
  -d '{"businessId":"10000000-0000-4000-8000-000000000001","cycleKey":"'"$(date +%s)-local"'"}'

# repeat every minute
while true; do
  curl -sf -X POST http://localhost:3000/api/jobs/run-cycle \
    -H 'content-type: application/json' \
    -H "x-qadam-job-secret: $QADAM_JOB_SECRET" \
    -d '{"cycleKey":"'"$(date +%s)-runner"'"}' >/dev/null
  sleep 60
done
```

In DEMO_MODE the owner can also press **«Прогнать demo-цикл»** on `/app/automations`,
which runs the same code path once for that business.

### Outbox worker

Lease → network call → settle. The provider call happens strictly between two short
transactions, so no HTTP request is ever held inside a database transaction.

- `claim_outbox_batch` leases with `for update skip locked` and increments `attempts`.
- The worker re-checks `send_gate` before dispatch; consent revoked, a suppression entry,
  quiet hours, the daily cap or the frequency cap all turn the row into `suppressed`.
- `settle_outbox_event(id, false, error)` backs off 30s → 60s → 120s → 240s, then
  dead-letters and raises a `connector_error` notification.
- An emergency stop makes `claim_outbox_batch` return nothing at all.

### Emergency stop

`/app/automations` → «Остановить всё». One action:

1. sets `business_execution_state.emergency_stopped_at`;
2. parks every pending/processing outbox row;
3. pauses every active automation;
4. makes `send_gate` refuse with `emergency_stop`.

Resuming is manual and audited. A campaign paused by stop-loss also needs a human:
the rule can pause but never restart.

### Webhook receiver

```
POST /api/webhooks/delivery
  x-qadam-signature: <hex hmac-sha256 of "<timestamp>.<body>">
  x-qadam-timestamp: <unix seconds, within 5 minutes>
  x-qadam-provider: <provider name>
```

An unverified body is never ingested — not even flagged as unverified — because a forged
event would move a number on the owner's dashboard. A correctly signed but stale body is
refused as a replay. A repeat of the same `externalEventId` returns `200 duplicate:true`
so an at-least-once provider stops retrying without double-counting.

### Connector states

| State | Meaning | How it is reached |
|---|---|---|
| `not_configured` | Nothing set up | Default; also a mock adapter in PRODUCTION_MODE |
| `simulated` | Nothing leaves the building | Mock adapter in DEMO_MODE |
| `sandbox` | Real adapter, provider test environment | Webhook adapter with credentials and a passing health check |
| `connected` | Real adapter, real credentials, live | Health check that declares `environment: production`, in PRODUCTION_MODE, with stored evidence |
| `error` | Was configured, last check failed | Health check failure; raises a `connector_error` notification |

A database CHECK refuses to store `connected` without `last_health_check_at` and a
`health_check` key in `health_evidence`, so no form submission can label a channel live.

### TAMYR demo time jump

`/app/analytics` → «Выполнить скачок» (DEMO_MODE, owner/manager only). Deterministic:
18 delivered, 15 opened, 9 redeemed; 103 500 ₸ influenced; 48 700 ₸ incremental;
18 200 ₸ contribution; 6 800 ₸ cost; 168% ROI; 145 minutes saved. Every row is `is_mock`
and `mock_actual`; a repeat returns the original receipt and creates no new events.

## Platform operations (Prompt 6, 2026-08-01)

### Granting a platform role

There is no UI for this on purpose: the ability to create platform admins must not itself be
reachable from the console.

```sql
insert into private.platform_admin_assignments(user_id, role, active, assigned_by)
values ('<auth.users.id>', 'platform_admin', true, '<granting admin id>')
on conflict (user_id) do update set role = excluded.role, active = true;
```

Roles: `platform_admin` (everything, including rollback), `platform_editor` (catalogue and templates,
no rollback), `platform_analyst` (read-only).

Revoke by setting `active = false`. The assignment table is `private` and carries no grants to
`authenticated`, so no application query can read or write it.

### Sensitive admin operations

Archiving a tool and rolling back a template require a credential confirmation newer than 15 minutes.
Press **«Подтвердить личность»** on the relevant admin screen, then perform the action. The audit row
records `reauth_verified_at`; without it the database refuses.

### Publishing a template safely

1. Create a draft version, optionally cloning an existing one.
2. Fill `content` (must contain `mechanics`), the compatible business types, and the migration notes
   that describe how a contract on the previous version carries forward.
3. Preview the draft, then publish. Publication freezes the version permanently.
4. If it was wrong: publish a corrected **new** version, or roll back to an earlier published one.
   Rollback leaves the newer version published so the history stays readable.

Never attempt to edit a published version — the database refuses, and the refusal is the feature.

### Performance benchmark

```bash
docker exec -i supabase_db_qadam_serpin psql -U postgres -d postgres \
  -f - < scripts/benchmark-explain.sql
```

Builds a 50k-customer / 400k-transaction tenant inside a transaction, runs EXPLAIN ANALYZE on the hot
queries, and rolls back. Read the output for `Index Scan` / `Index Only Scan`. A `Seq Scan` at that
volume means an index is missing or shadowed.

**Watch for name collisions.** `create index if not exists` silently does nothing when the name is
already taken by a *different* index — that is exactly how `customers_cursor_idx` shadowed the index
the customers list needed. After adding an index, re-run the benchmark and confirm the plan changed.

Run `npx supabase db advisors --local --type all --level warn --fail-on error` as well: it catches the
opposite mistake, a duplicate index under a new name.

### Partitioning: threshold and migration path

Partitioning is **not** in place, and should not be added yet. Record the decision so it is revisited
deliberately:

| Table | Current volume | Partition when | Strategy |
|---|---|---|---|
| `transactions` | ~1.1k seeded; benchmark to 400k | > 50M rows or > 50 GB, or when a month-scoped query stops meeting its budget | `RANGE (occurred_at)` monthly; migrate by creating a partitioned twin, attaching backfilled ranges, then swapping names in one transaction |
| `campaign_events` | thousands | > 20M rows | `RANGE (occurred_at)` monthly; older partitions detach to cold storage after the 365-day retention window |
| `provider_events` | thousands | > 20M rows | `RANGE (received_at)` monthly; the 90-day retention window makes detach-and-drop the normal path |
| `activity_logs` | thousands | > 20M rows | `RANGE (occurred_at)` quarterly |

Partitioning below these volumes costs planning time and constraint complexity for no gain. The
retention policies already bound three of these four tables.

### Connection pooling and timeouts

Serverless functions open many short-lived connections, so application traffic must go through the
Supabase pooler (`:6543`, transaction mode) rather than the direct port (`:5432`). Migrations and the
benchmark use the direct connection because they need session state.

Set a statement timeout on the application role so a pathological query cannot hold a pooled
connection open:

```sql
alter role authenticated set statement_timeout = '8s';
alter role authenticated set idle_in_transaction_session_timeout = '15s';
```

These are deliberately short: every screen in this product is a cursor page or an aggregate, and
anything slower than eight seconds is a bug rather than a slow query.

### Monitoring

`pg_stat_statements` is enabled. The queries worth watching weekly:

```sql
-- slowest by total time
select calls, round(total_exec_time::numeric, 1) total_ms, round(mean_exec_time::numeric, 2) mean_ms,
       left(query, 120) query
from pg_stat_statements order by total_exec_time desc limit 20;

-- sequential scans on tables that should be indexed
select relname, seq_scan, seq_tup_read, idx_scan
from pg_stat_user_tables where schemaname='public' and seq_scan > idx_scan order by seq_tup_read desc limit 20;

-- index bloat / unused indexes
select relname, indexrelname, idx_scan from pg_stat_user_indexes
where schemaname='public' and idx_scan = 0 order by relname;
```

### Backup and restore

Managed by Supabase: daily snapshot with 7-day retention, plus point-in-time recovery.

- **Erasure vs backups.** An anonymisation request applies to the live database immediately. Snapshots
  still contain the prior state until they rotate out, at most 7 days. The privacy page states this
  rather than implying instant global erasure.
- **Restore drill.** Restore into a scratch project, run `npm run db:test` against it, and confirm
  `admin_audit_log` and `impact_baselines` are intact. This has **not** been exercised on a remote
  project — no remote link exists yet, so treat the procedure as written but untested.

### Billing

No payment provider is connected. `QADAM_BILLING_PROVIDER` is unset and `createBillingProvider`
returns a provider that refuses checkout in both modes. When one is attached, the checklist is:
webhook signature verification, event idempotency on `billing_events`, subscription state machine,
`grace_period_ends_at` handling, and an audit entry per state change. Live billing stays **BLOCKED**
until all five exist.

## Инциденты, откат и восстановление (Prompt 7, 2026-08-01)

### Классификация

| Уровень | Что это | Первое действие |
|---|---|---|
| **S1** | Данные тенанта видны не тому тенанту; отправка идёт без согласия; списание денег | Аварийная остановка всех отправок, затем расследование |
| **S2** | Кабинет не открывается; запуск кампании падает; job-цикл не идёт больше часа | Проверить базу и последний деплой |
| **S3** | Один экран не грузится; коннектор отвалился | Завести задачу, чинить в обычном порядке |

### S1: подозрение на утечку между тенантами

```sql
-- 1. Немедленно остановить исходящий поток по всем бизнесам.
update public.business_execution_state
   set emergency_stopped_at = now(),
       emergency_stopped_by = '<ваш auth.users.id>',
       emergency_stop_reason = 'S1: расследование изоляции тенантов';
```

Затем подтвердить или опровергнуть на месте, а не по логам:

```bash
node tests/security/rls-matrix.mjs
```

Матрица обходит все тенантные таблицы от лица настоящего пользователя и падает, если хоть
одна строка чужого тенанта видна. Если она зелёная — утечки на уровне базы нет, и искать
надо в кэшировании ответов.

Отдельно проверьте привилегии, которые RLS **не фильтрует**:

```sql
select grantee, privilege_type, count(*)
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon','authenticated')
  and privilege_type in ('TRUNCATE','TRIGGER','REFERENCES')
group by 1,2;   -- должно быть пусто
```

Непустой результат означает, что подписанный пользователь может уничтожить или прочитать
чужие данные в обход политик. Так было до миграции `20260802020000`, и это воспроизводилось.

### Откат

**Код.** Откатывается деплоем предыдущей сборки. Схема при этом не трогается.

**Схема.** Миграции только вперёд. Откат — это новая миграция, отменяющая предыдущую;
`supabase migration repair` применяется лишь тогда, когда история на сервере разошлась
с репозиторием, и всегда с записью в журнал инцидента.

**Шаблон.** Не откатывать правкой опубликованной версии — база это запретит. Либо новая
версия, либо `rollback_template`, который перенаправляет шаблон и **оставляет более новую
версию опубликованной**, чтобы история «что было в эфире» осталась читаемой. Действующие
Growth Contract не затрагиваются: у каждого свой неизменяемый снимок.

**Данные.** Аудит и снимки контрактов append-only. Если тенант удалил лишнее, восстановление
идёт из бэкапа в отдельный проект и переносом строк, а не восстановлением всей базы поверх
живой.

### Порядок восстановления из бэкапа

1. Восстановить снимок в **отдельный** проект. Никогда поверх работающего.
2. Прогнать `supabase test db` против него: если pgTAP не проходит, снимок непригоден.
3. Проверить, что `admin_audit_log` и `impact_baselines` целы — они не восстанавливаются.
4. Перенести недостающие строки адресно.
5. Записать в журнал инцидента, какие данные вернулись и за какой период.

**Взаимодействие с удалением по запросу.** Анонимизация применяется к живой базе сразу.
Снимки хранят прежнее состояние до ротации, максимум 7 суток. Страница `/privacy` говорит
об этом прямо, а не обещает мгновенное удаление отовсюду. **Если восстановление вернуло
анонимизированного клиента — повторите `anonymize_customer` для него.**

> Процедура **ни разу не выполнялась**: удалённого проекта не существует. Считать написанной,
> но непроверенной.

### Заголовки безопасности

Формируются в `src/lib/security/headers.ts`, ставятся прокси на каждый ответ, включая
редиректы. Проверка после деплоя:

```bash
curl -sI https://<host>/login | grep -iE 'content-security|strict-transport|x-frame|referrer|permissions'
```

На `/login` и любом маршруте кабинета `script-src` обязан содержать `'nonce-…'`. Если nonce
пропал — значит прокси не отработал, и страница осталась без защиты от инлайн-скриптов.

### Мониторинг после релиза

```sql
-- запросы, которые стали медленнее
select calls, round(mean_exec_time::numeric,2) mean_ms, left(query,120)
from pg_stat_statements order by mean_exec_time desc limit 20;

-- застрявшие отправки
select status, count(*), min(created_at) from public.outbox_events group by 1;

-- аварийные остановки за сутки
select business_id, emergency_stopped_at, emergency_stop_reason
from public.business_execution_state
where emergency_stopped_at > now() - interval '1 day';

-- админские действия за сутки
select occurred_at, actor_role, action, resource_code, reason
from public.admin_audit_log where occurred_at > now() - interval '1 day' order by 1 desc;
```

### Начальный SLO

Замерен на **одном локальном инстансе** (`npm run test:perf`). Это не заявление о ёмкости
платформы, а отправная точка, которую нужно перемерить на реальном хостинге.

| Показатель | Цель | Замер |
|---|---|---|
| p95 аутентифицированной страницы, 10 параллельных | < 1500 мс | 329 мс |
| p95 публичной страницы, 16–20 параллельных | < 800 мс | 98 мс |
| Доля ошибок под нагрузкой | 0% | 0% |
| Самый медленный запрос на загрузку страницы | < 100 мс | 27.7 мс |
| Соединений к базе под нагрузкой | < 60 | 22 |

### Подключение платёжного провайдера

Live billing остаётся **BLOCKED**, пока не сделаны все пять пунктов:

1. проверка подписи webhook в постоянном времени;
2. идемпотентность по идентификатору события в `billing_events`;
3. полный конечный автомат подписки, включая неудачную оплату;
4. обработка `grace_period_ends_at`;
5. запись в аудит на каждое изменение состояния.

### Окружения

| Окружение | Где | Данные | Кто применяет миграции |
|---|---|---|---|
| dev | локальная машина | синтетический seed | разработчик, `supabase db reset --local` |
| staging | не создано | своё, без seed | `deploy.yml`, требует `SUPABASE_PROJECT_REF` |
| production | не создано | реальные тенанты | `deploy.yml` после успешного CI |

Seed **никогда** не применяется вне локальной машины: он смешал бы синтетические строки
с реальными тенантами, а на этом держатся все гарантии честности продукта.
