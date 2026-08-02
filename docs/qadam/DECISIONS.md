# QADAM Architecture Decision Log

Формат: append-only. Новое решение не переписывает прошлое; оно добавляет запись, связывает superseded decision и объясняет migration.

## ADR-001 — Growth Contract is the aggregate root

- Date: 2026-07-30
- Status: accepted
- Decision: центральная доменная сущность — версионируемый Growth Contract, а не chat, customer или promotion.
- Consequence: campaign, audience snapshot, simulations, content, approvals и measurement ссылаются на конкретную immutable contract version.

## ADR-002 — Deterministic financial and policy boundary

- Date: 2026-07-30
- Status: accepted
- Decision: simulations, Margin Shield, consent, audience exclusions и approval checks выполняются детерминированными services/policies; LLM не имеет write-path вокруг них.
- Consequence: формулы версионируются и покрываются golden/property tests; LLM output считается untrusted proposal.

## ADR-003 — Evidence kinds are first-class

- Date: 2026-07-30
- Status: accepted
- Decision: `forecast`, `influenced_revenue`, `incremental_estimate`, `mock_result`, `verified_fact` — разные значения enum и визуальные состояния.
- Consequence: текущее трёхзначное `ImpactMetric.type` требует миграции; simulated contribution/time saved нельзя маркировать `verified_fact`.

## ADR-004 — One UI, explicit runtime modes

- Date: 2026-07-30
- Status: accepted
- Decision: DEMO_MODE и PRODUCTION_MODE используют общие domain/workflow contracts, но разные разрешённые adapters. Mode определяется server-side.
- Consequence: production startup/test запрещает demo fixtures; отсутствующий connector возвращает `not_connected`, а не fake success.

## ADR-005 — Preserve visual direction

- Date: 2026-07-30
- Status: accepted
- Decision: текущие композиция, animation и scroll storytelling сохраняются; wiring проводится за существующими component props/facades.
- Consequence: редизайн возможен только после измеримого usability/accessibility/performance дефекта и visual regression baseline.

## ADR-006 — Tenant isolation at repository and database boundaries

- Date: 2026-07-30
- Status: proposed (backend not implemented)
- Decision: tenant identity приходит из server session; все tenant entities защищены RLS и repository API без client-supplied trust.
- Consequence: DEMO_MODE также должен проходить реальные RLS tests на synthetic tenant data.

## ADR-007 — Do not add dependencies during Prompt 0

- Date: 2026-07-30
- Status: accepted
- Context: текущий stack проходит build/lint/typecheck, а задача Prompt 0 — baseline и documentation foundation.
- Decision: зависимости не добавлялись; lockfile не менялся.

## ADR-008 — No external mutations without authorization

- Date: 2026-07-30
- Status: accepted
- Decision: commit, push, deploy, production/environment changes не выполняются до отдельного разрешения.
- Consequence: R36/R37 остаются `BLOCKED`, пока не предоставлены URL/repository/deploy authority.

## ADR-009 — Fixed-point domain math

- Date: 2026-07-30
- Status: accepted
- Decision: money is safe integer minor units; rates become integer ppm/basis points before multiplication and use explicit rounded division.
- Consequence: browser preview and server result share formulas, but only server recalculation can persist/approve/launch.

## ADR-010 — Guardrails at domain and database boundaries

- Date: 2026-07-30
- Status: accepted
- Decision: TypeScript rejects invalid commands early; Postgres independently enforces state, consent, margin snapshot immutability, optimistic version and idempotency.
- Consequence: direct Data API cannot create pre-approved campaigns, send without current consent or mutate approved economics.

## ADR-011 — Explain Every Number is a shared contract

- Date: 2026-07-30
- Status: accepted
- Decision: API/UI receive the same typed object with what, period, source, formula, confidence, assumptions, status, next action and evidence kind.
- Consequence: separate UI prose cannot silently relabel forecast/mock/influenced/verified values.

## ADR-012 — Row level security is not the whole story

- Date: 2026-08-01
- Status: accepted
- Decision: `anon` and `authenticated` are stripped of `TRUNCATE`, `TRIGGER` and `REFERENCES`
  on every table in `public`, and of `INSERT`/`UPDATE`/`DELETE` for `anon`, with default
  privileges altered so a new table cannot regain them.
- Reason: Postgres does not consult row policies for TRUNCATE. Before this, a signed-in owner
  of one tenant could destroy every tenant's data while unable to read a single row of it.
  Reproduced against the local database before the fix.
- Consequence: "RLS protects this table" is a claim that has to name which operations it
  covers. The security suite asserts the revoke and re-attempts the truncate on every run.

## ADR-013 — The strict CSP follows the data, not the route count

- Date: 2026-08-01
- Status: accepted
- Decision: `script-src` is `'self'` plus a per-request nonce on every route that renders
  tenant or customer data. Statically prerendered marketing pages keep `'unsafe-inline'`.
  `'strict-dynamic'` is not used anywhere.
- Reason: a static page's HTML is written at build time and cannot carry a per-request nonce.
  `'strict-dynamic'` makes `'self'` inert, so under it those pages could not load their own
  chunks. Forcing every marketing page to render per request to satisfy a header would cost
  real performance on the highest-traffic page for no security gain — those pages render no
  user input at all.
- Consequence: the policy differs by route and the difference is documented rather than
  discovered. `style-src` keeps `'unsafe-inline'` and is recorded as a known gap.

## ADR-014 — A test that reads the screen proves nothing

- Date: 2026-08-01
- Status: accepted
- Decision: every acceptance assertion about a number or a state is confirmed by a query
  against the database in the same step. Suites reset the database first.
- Reason: a screen can show 64 because the data says so or because someone typed 64. Only
  the second source of truth distinguishes them. Exact seed figures are meaningless on a
  database a previous run has mutated.
- Consequence: suites are slower and depend on Docker. That is the price of the assertions
  meaning something.

## ADR-015 — Enumerate what to test from the schema, not from memory

- Date: 2026-08-01
- Status: accepted
- Decision: the tenant isolation matrix reads its table list from `information_schema` at run
  time rather than from a list in the test file.
- Reason: a hand-written list goes stale silently — a table added tomorrow simply never gets
  checked, and the suite still reports success.
- Consequence: adding a tenant table automatically adds four isolation assertions. A table
  that is closed outright is recorded as denied rather than aborting the sweep.

## ADR-016 — A blocked deploy states the blocker instead of pretending

- Date: 2026-08-01
- Status: accepted
- Decision: the deploy workflow runs only after a successful CI run and fails explicitly when
  no Supabase project or hosting provider is configured, naming what is missing.
- Reason: a pipeline that appears to deploy and quietly does nothing is worse than one that
  refuses. The same rule governs billing, connectors and verified facts elsewhere in this
  product.
- Consequence: the deploy path is visibly incomplete until real infrastructure exists, which
  is the accurate state.

## ADR-017 — Режим — свойство заведения, а не развёртывания

- Date: 2026-08-02
- Status: accepted
- Decision: `public.businesses.mode` решает, что позволено арендатору;
  `QADAM_DEMO_TENANTS_ENABLED` управляет только тем, предлагает ли установка
  демонстрационный вход. Демо- и боевые заведения живут в одной базе.
- Reason: владельцу нужна одна ссылка, на которой можно попробовать и то и
  другое. Разделение при этом не ослабло: его и раньше держали констрейнт
  `(mode='demo' and is_mock) or (mode='production' and not is_mock)` и триггер
  «mock rows are forbidden in production businesses», а переменная окружения
  была лишь вторым, более грубым слоем поверх.
- Consequence: гарантия честности переехала с уровня развёртывания на уровень
  строки. `mode-separation` больше не собирает приложение дважды — он
  регистрирует настоящее заведение на том же сервере и сравнивает двух
  арендаторов на одной сборке, а оба отказа базы проверяет попыткой.
  DEPLOY_RUNBOOK части D и E переписаны: «DEMO_MODE на общем окружении» больше
  не инцидент, потому что такого переключателя больше нет.

## ADR-018 — Две таблицы намеренно закрыты, и это записано

- Date: 2026-08-02
- Status: accepted
- Decision: `private.platform_admin_assignments` и `public.platform_events`
  имеют включённый RLS и ни одной политики. Это deny-all по замыслу: обе
  читаются только через security-definer функции.
- Reason: советник Supabase помечает их как INFO «RLS enabled, no policy», и
  без записанного решения следующий человек не отличит намерение от упущения —
  а «добавить политику на всякий случай» здесь означало бы открыть таблицу,
  которая должна быть закрыта.
- Consequence: предупреждение остаётся и должно оставаться. Приёмочные наборы
  это подтверждают: «the platform role lives in a private table», «that table
  is not readable by an application role», «a table with no grant is closed on
  purpose, not by omission».

## ADR-019 — Telegram как первый настоящий канал

- Date: 2026-08-03
- Status: accepted
- Decision: Telegram доводит сообщение до человека по-настоящему; WhatsApp убран
  из выбора до появления доступов Meta. Настоящий адрес доставки живёт в
  `private.channel_addresses` без грантов Data API, а публичные таблицы
  по-прежнему хранят контакт только хэшем и маской.
- Reason: `PreparedMessage.recipientRef` изначально задокументирован как
  маскированная ссылка, которую адаптер разрешает «из своего хранилища» —
  место под это было оставлено с самого начала. Хэшу нельзя отправить, но и
  раскрывать контакты в публичной схеме нельзя; отдельная приватная таблица
  разрешает противоречие, не ослабляя ни одну из сторон.
- Consequence: гость проходит через ту же `process_loyalty_join`, что и со
  страницы, — второго, более мягкого пути в программу лояльности не появилось.
  Согласие на рассылку берётся отдельно и **обратимо**: повторное «да» снимает
  собственную отписку человека, но не отменяет жалобу или блок владельца.
  Владелец подтверждает запуск кнопкой, и путь тот же, что в кабинете: тот же
  Margin Shield, тот же `send_gate`, то же правило «один запуск на контракт».
  Сообщение уходит по-настоящему, а выручка по нему у демо-заведения остаётся
  демонстрационной — отправка и утверждение о деньгах разные вещи.
