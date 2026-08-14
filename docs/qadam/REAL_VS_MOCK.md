# QADAM Real vs Mock Register

Snapshot: 2026-07-30 after Prompt 2. `Real` means executable/persisted behavior exists now; it does not mean production-integrated. `Simulated` means synthetic fixture/presentation. `Blocked` means the UI must not fake success.

| Capability | Current state | DEMO_MODE target | PRODUCTION_MODE target | Required label / guard |
|---|---|---|---|---|
| Next routes/rendering | Real — production build generated 54 routes | Real | Real | none |
| Navigation | Real links/routes; browser click QA blocked | Real + persisted workflow state | Real | broken-link E2E |
| RU/KK preference | Real localStorage toggle in app areas | Real | Real per user/business | locale provenance |
| Business profile | Simulated form, no save | Real synthetic CRUD + RLS | Real DB CRUD + RLS | `DEMO DATA` in demo |
| Auth/registration | Cookie SSR/actions/callback implemented; remote not linked | Real local Auth/RLS | Real Auth; no demo users | no fake login success |
| TAMYR dataset | Deterministic SQL generator + JSON manifest | Canonical synthetic seed, real DB/RLS | database trigger/seed guard forbid mock | `DEMO DATA`, seed version |
| Customers/transactions | Real normalized DB store seeded with 180/1,129 synthetic rows; UI still reads fixtures | real queries over synthetic rows | real consented tenant data | mask PII; source/period |
| Consent | Normalized table + RLS + 18 granted synthetic fixtures; compiler, audience and delivery guards enforce effective consent | real consent records over synthetic people | real auditable consent | deny without current granted consent |
| Signals | Real deterministic detector with comparable weekday/timezone windows; UI still uses fixtures | deterministic calc on synthetic transactions | deterministic calc on real source | source/period/comparator; no unsupported causality |
| AI explanation | Static copy | may be simulated/evaluated | real server AI if connected | hypothesis + confidence; no causality claim |
| Growth Contract | Real typed compiler, immutable snapshot/version, guarded DB workflow and server API; UI still uses fixtures | real versioned workflow/CRUD | real versioned workflow/CRUD | UI repository wiring pending |
| Financial simulation | Real fixed-point deterministic engine for seven mechanics; UI still uses fixtures | real deterministic calculations | real deterministic calculations | `FORECAST`, formula/source/assumptions |
| Margin Shield | Real domain and DB launch/approval block with safe alternatives; UI still uses fixtures | real deterministic block | real deterministic block | never override by LLM/API |
| Audience eligibility | Real versioned segmentation and consent-first calculation; UI still uses fixture count | real rules/consent over synthetic data | real rules/consent | inclusion/exclusion snapshot |
| Content generation | Static RU/KK fixtures | generation may simulate; edits/history real | real server AI or `not connected` | `SIMULATED` if generated mock |
| QR/tracking | Presentation only | generated real codes/events may be synthetic | real tracked codes | privacy-safe public payload |
| Messaging delivery | Absent | simulated outcome allowed | real connector or disabled | `SIMULATED`; never fake delivered in prod |
| Campaign launch/pause | Real guarded/idempotent local state service and atomic DB command; external delivery absent | real state machine; vendor call simulated | real connector state machine | approval/consent/audit; external status honest |
| Campaign outcome | Static mock results | simulated events allowed | real source events only | `MOCK RESULT`/`SIMULATED` |
| Influenced revenue | Real typed Impact Ledger calculation; UI still displays fixture | computed from synthetic observed events | computed from real observed events | not incremental |
| Incremental estimate | Real typed Impact Ledger calculation with kind separation; UI still displays fixture | simulated estimate | estimate with documented method | `INCREMENTAL ESTIMATE`, never fact |
| Verified fact | Not available; two fixtures mislabeled | only synthetic observed facts, still demo-labeled | connected source with provenance | strict metric kind contract |
| Automations/cron/queue | Presentation only | real rules/state; execution may simulate | real workers or feature off | `SIMULATED` execution in demo |
| Tool filters/favorite/activation | Absent | real persistent state | real persistent state | none |
| Admin CRUD/version/rollback | Schema/RLS/DB recheck implemented; views not wired | real CRUD/RLS/audit on demo data | real platform-admin CRUD/audit | UI CRUD pending |
| Admin analytics | Static counters | computed synthetic telemetry | real telemetry | source/period/kind |
| Nearby offers | Presentation only | real publication/filter on synthetic offers | real privacy-reviewed feed | approximate location/privacy |
| Roles/multi-location/plans/flags | Normalized schema + membership RLS | real enforcement over demo tenant | real enforcement | UI/repository wiring pending |
| External POS/payment/maps | Absent | simulated/fixture connector only if labeled | real connector or `not connected` | server flag, no fake success |
| Secrets | None configured | server-only even in demo | server-only | bundle/secret scan |
| Audit/history | Append-only DB table; domain transition, outbox and activity log persist atomically | real append-only history | real append-only history | UI history wiring pending |
| Tests | build/typecheck/lint/secret scan + 28 unit + 59 pgTAP assertions; DB lint/advisors pass; browser E2E pending | all suites real | all suites real | no pass claim without evidence |
| Online deployment | Absent | requires explicit authorization | requires explicit authorization | incognito smoke before claim |

## Mode invariants

1. UI receives a server-issued mode descriptor; browser query/localStorage cannot switch production into demo.
2. Production build/startup fails or tests fail if demo fixtures/fake connectors are reachable.
3. Missing integrations produce `not_connected`/disabled UI, never synthetic success.
4. Demo labels appear at dataset/page level and adjacent to every simulated outcome/estimate.
5. Calculations, state, CRUD, RLS, audit, navigation and history are real in both modes.
## Prompt 3 real vs mock update

| Capability | DEMO_MODE | PRODUCTION_MODE |
|---|---|---|
| Auth, onboarding, tenant membership, Today, tools, favorites, activation, CRM, consents, notes and loyalty ledger | Real local Supabase state with synthetic rows labelled `is_mock=true` / DEMO DATA | Real Supabase state; demo users and synthetic seed are forbidden |
| QR token | Real opaque token shown once, SHA-256 hash stored, expiry/revoke/status checked server-side | Same, with production verification provider required |
| QR rotation / revoke | Real `rotateQrCode` / `revokeQrCode` server actions; old token is marked revoked, new token issued; activity_log entry written | Same |
| Loyalty join/redeem | Real atomic RPCs, append-only ledger, idempotency keys, no double credit/spend | Same |
| Identity verification | `simulated` and visibly labelled | Blocked unless SMS/email provider is connected |
| CSV import | 3-step UI wizard: upload → column mapping → validation + downloadable error-rows CSV | Same, subject to role check and duplicate strategy |
| Dynamic segment editor | Count preview calculated client-side from initialTotalCount; saved definition persisted to `customer_segments` via `saveCustomSegment` | Same |
| Customer export | `auditCustomerExport` action writes to `activity_logs`; download link renders on client after audit | Same; export access restricted by role |
| Nearby offers | Real public published query with privacy-safe business/location context | Real public published offers only |
| Campaign delivery/outcome | Simulated labels only until connectors exist | Feature-flagged as not connected; fake connectors/outcomes forbidden |

## Prompt 3 completion real vs mock (2026-08-01)

| Capability | What is real now | What is still simulated | Label shown to the user |
|---|---|---|---|
| Campaign creation | Growth Contract compiled server-side from RLS-protected business data; economics, Margin Shield, consent count and GOS are recalculated, never trusted from the form. Approval and launch go through `transition_domain_entity` and `launch_growth_contract` with optimistic versions and idempotency keys | Nothing in this path is simulated | Scenario cards are labelled «forecast», and the page states that the actual result appears in Impact Ledger after launch |
| Campaign audience | `campaign_audiences` rows are written per customer and the database trigger refuses any inclusion without effective channel consent | — | Studio shows «в сегменте N → согласие есть у M» with the reason for the difference |
| Campaign delivery | Campaign reaches status `approved`/`running` in the database | No channel provider is connected, so no message is sent and `campaign_deliveries` stays empty | Detail page shows «событий пока нет», never a fabricated open/redemption count |
| Content Studio | `content_items` rows are written per channel and locale from the campaign's own contract brief, then edited and approved by the owner | Text is produced by a deterministic composer, not an AI provider | Items carry status `draft` until the owner approves; `ai_generation_runs` is listed separately and stays empty |
| Analytics / Impact Ledger | Reads `impact_measurements` and separates `forecast`, `influenced`, `incremental_estimate`, `mock_actual`, `verified_fact` | No verified facts exist without a connected source | Each row is badged with its kind; the empty state says measurements appear only after a launch |
| Automations | Rules and their state machine are real; every rule is created as `draft` and its guardrails record `ownerApprovalRequired` | No scheduler executes rules; `automation_runs` stays empty | Page states that a rule can only propose an action and never sends by itself |
| Business settings | Writes `businesses`, `business_profiles` and `business_locations`; the saved margin floor and average check are the values Margin Shield uses | — | Limits section explains that the budget is enforced in the database at launch |
| CSV import | `import_customers` RPC writes customers, hashed identities and the declared marketing consent inside one transaction, with a per-row error log and an idempotency receipt | — | Result panel reports inserted / updated / skipped / rejected from the database and states explicitly that no transaction history is fabricated from declared visits and AOV |
| Declared visits and AOV from CSV | Used only to derive an initial lifecycle stage; stored on the import summary | Not turned into revenue | Wording says the figures are «заявленные владельцем» |
| Marketing consent scope | `marketing.<channel>` when the customer answered for that channel; the umbrella `marketing` grant from QR join or CSV import applies only to channels the customer never answered, and any explicit refusal or revoke wins immediately | — | Customer card lists every consent record with scope, status and source |
| QR token registry | Every issued token is listed with status, expiry, scan and join counts and its predecessor; rotate and revoke act on real token ids | — | Demo tenants keep the DEMO QR badge |

### Honesty rules reaffirmed by this pass

1. A success message is only shown after the database confirms the write. The CSV wizard previously reported
   success from a timer with no write at all; that path is gone.
2. Forecast numbers come from the immutable contract snapshot and are never restated as results.
3. When Margin Shield refuses a campaign, no contract row is created and the owner is told why in plain language.
4. Consent is resolved in one place in the database, and the same resolution gates the preview, the compiled
   contract and the audience trigger, so the count the owner sees is the count the database will allow.

## Prompt 4 real vs mock — AI, Campaign Studio and Content Studio (2026-08-01)

### What is actually connected

**No AI provider is connected in this environment.** No `ANTHROPIC_API_KEY` or
`OPENAI_API_KEY` exists, so `readProviderConfig()` returns `null` and every generation
runs on the built-in deterministic template. This is a supported state, not a failure:
the run is recorded with `source='deterministic_fallback'`, `failure_kind='not_configured'`,
and the Studio prints «встроенный детерминированный шаблон QADAM» with the reason.
Anthropic and OpenAI adapters are implemented and unit-tested against fake transports;
they will carry real traffic the moment a key is supplied, with no other code change.

| Capability | Real now | Simulated / absent | Label the owner sees |
|---|---|---|---|
| Mechanic proposals | Deterministic template producing 2–3 distinct mechanics with RU/KK copy, validated against the same schema a model must satisfy | Model-authored copy (no key) | «Источник: встроенный детерминированный шаблон QADAM» + fallback reason |
| Provider adapters | Anthropic Messages API and OpenAI Chat Completions, with timeout, retry/backoff and error classification | Not exercised against a live endpoint | Journal row shows `provider` vs `шаблон` |
| Economics for every proposal | Recomputed server-side by the deterministic Simulator from the tenant's own AOV, unit cost, margin floor and budget | — | Scenario cards labelled forecast; each number carries «Почему это число?» |
| Margin Shield verdict | Authoritative. A blocked mechanic compiles no contract row and its launch control is disabled | — | Status pill with a glyph and a word, never colour alone |
| Safe alternative | Real: taken from the domain's own `safeAlternatives`, adopted in one action | — | «Безопасная альтернатива в одно действие» |
| Growth Contract | Real immutable snapshot, content hash, version, approving actor and timestamp | — | All ten required parts rendered on screen |
| Wizard draft | Real `campaign_drafts` row per owner, updated each step with optimistic locking | — | Input survives refresh, back/forward and validation errors |
| Content pack | 14 real `content_items` rows: post, short post, 3 stories, 15-second script and messenger message in RU and KK, each with CTA and alt text | — | Per-channel preview with character count |
| Tracking | Real `tracking_codes` row printed inside the copy, linking content → campaign → redemption | Redemption events (no POS connector) | Impact Ledger stays empty rather than inventing results |
| Launch | Real campaign row, consent-gated audience, idempotency key, outbox event and activity log | No message is sent — no channel provider is connected | DEMO_MODE: `campaign.simulated`, `connector=not_connected`; PRODUCTION_MODE refuses the launch |
| Kazakh copy quality | Structure is machine-checked (presence, CTA, alt text, channel limits) | Natural phrasing is **not** verified | Every KK asset carries «! Требуется проверка носителем языка» as a release gate |

### AI honesty rules enforced by code and test

1. **The model never decides money.** Its numbers are discarded; the Simulator recomputes.
   A suggestion whose contribution falls below the owner's floor is blocked exactly like a
   hand-typed one, and no contract row is created.
2. **The model cannot change the brief.** Schema validation rejects a response whose goal
   differs from the owner's, whose mechanics repeat, or whose locale set is incomplete.
3. **PII never leaves the server.** Emails, phones, long digit runs, URLs, API keys and
   JWTs are stripped before prompt assembly; only the redacted payload is hashed, and the
   database refuses an `input_hash` that is not a SHA-256 digest.
4. **Owner text is data, not instruction.** Injection patterns in English and Russian are
   neutralised, the system prompt declares `<business_data>` non-authoritative, and the
   flags that fired are stored as safety evidence.
5. **Generated copy is still copy we publish.** Health claims, guaranteed-income promises,
   sensitive targeting and leaked contacts block the response and fall back to the template.
6. **A fallback is labelled, not disguised.** Source, provider, model, failure kind and
   fallback reason are visible in the Content Studio generation journal.

## Prompt 5 real vs mock — execution, connectors and measurement (2026-08-01)

### Adapters: what can actually leave the machine

| Adapter | Real? | Externally capable | State it can reach | Evidence |
|---|---|---|---|---|
| `mock` | Real code, no external effect | No | `simulated` (DEMO_MODE) / `not_configured` (PRODUCTION_MODE) | Health check returns `simulated`; every receipt carries `simulated: true` |
| `webhook` | **Yes** — signed HMAC-SHA256 HTTP POST to an owner-controlled URL | Yes | `sandbox`, or `connected` only if the endpoint declares `environment: production` in PRODUCTION_MODE | Health check response stored in `health_evidence` |
| `whatsapp` | No — declared boundary | No | `not_configured` | Refuses with `not_implemented` and names `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET` |
| `telegram` | No — declared boundary | No | `not_configured` | Refuses; names `TELEGRAM_BOT_TOKEN` |
| `instagram` | No — declared boundary | No | `not_configured` | Refuses; names `INSTAGRAM_PAGE_ID`, `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_APP_SECRET` |

**No adapter has been exercised against a real vendor sandbox in this environment.** The
webhook adapter is genuinely capable of an outbound call and is unit-tested against fake
transports, but no third-party endpoint has been contacted. Accordingly no channel in this
build is labelled `connected`, and the database would refuse that label anyway without
stored health-check evidence.

### Execution

| Capability | Real now | Simulated / absent | Label |
|---|---|---|---|
| Outbox dispatch | Real leasing, bounded retry, exponential backoff, dead letter, notification on exhaustion | — | Dead letters listed on `/app/automations` |
| Send gating | Real: consent, suppression, quiet hours, daily cap, frequency cap, emergency stop — all re-checked at dispatch | — | Suppressed deliveries carry the reason |
| Emergency stop | Real: freezes the queue, pauses active rules, refuses every send | — | Banner on `/app/automations` |
| Stop-loss | Real: pauses a campaign automatically, restart requires a human | — | `restart_requires_owner: true` in the audit row |
| Automation rules | Real triggers, filters, guardrails, versioning and scheduling | Nothing dispatches in assistant mode by design | «QADAM подготовил действие, но ничего не отправил» |
| Birthday rule | Rule exists and is inspectable | No lawful birth-date field is collected, so it always yields 0 candidates | Declared on the template card |
| Scheduler | Real protected endpoint + local runner | No platform cron or queue | Documented in RUNBOOK |
| Webhook ingestion | Real signature verification, replay window, duplicate suppression, cross-tenant refusal | No real provider is sending events | Raw events stored in `provider_events` |
| Message content leaving the system | Nothing is sent | Every send in this build is either mock or an unconfigured webhook | `simulated: true` on the receipt and `is_mock` on the event |

### Measurement honesty

| Kind | What it means | Can it be synthesised? |
|---|---|---|
| `forecast` | Prediction fixed at approval | Yes, from the contract snapshot |
| `influenced` | Revenue from customers who received the campaign | Computed from real transactions; **never** copied into an incremental metric |
| `incremental_estimate` | Influenced minus the immutable baseline, only above `min_sample_size` | Below the threshold the ledger records an observed difference with an interval instead |
| `mock_actual` | Demo data | Always `is_mock`, always badged MOCK RESULT |
| `verified_fact` | Confirmed from a connected source | **No.** Nothing in this build can produce one, and a database CHECK forbids `verified_fact` on a mock row |

The TAMYR time jump writes exactly the canonical figures (18/15/9 events; 103 500 / 48 700 /
18 200 / 6 800 ₸; 168% ROI; 145 minutes) as `influenced` and `mock_actual` only. It creates
no `verified_fact`, is DEMO_MODE-only in both the action and the database function, and a
repeat returns the original receipt without adding a single event.

### Public storefront

Only published, unexpired, budget-valid offers from active businesses are listed —
verified by turning each condition off in the E2E run and watching the offer disappear.
Views, clicks and saves are stored as intent in `nearby_offer_events`; the offer page tells
the visitor in plain Russian that opening the page is not a visit.

## Prompt 6 real vs mock — platform, roles, plans, privacy (2026-08-01)

| Capability | Real now | Absent / simulated | What the owner or admin is told |
|---|---|---|---|
| Admin access control | Three independent gates: layout, server action, RLS. Role from a private assignment table | — | A non-admin is redirected with `admin_access_required`, not shown an empty console |
| Admin audit | Every mutation records actor, role, before, after, reason and timestamp; append-only | — | The journal is rendered on each admin screen |
| Fresh credential check | Real 15-minute window enforced by the database for archive and rollback | Not tied to an actual password re-entry — it records a deliberate confirmation click | The banner says exactly what it does |
| Catalogue CRUD | Real create, edit, publish, archive, restore, deprecate with dependency guards | — | Hard delete is not offered anywhere; the refusal explains why |
| Template versioning | Real immutability, publication, rollback and migration notes | Five curated business-type content sets are **not** authored | The screen shows whatever versions exist |
| Owner catalogue filtering | Real: only published, public tools reach the owner | — | — |
| Team and invitations | Real invitation with hashed token, masked email, expiry, accept and revoke; last-owner guard in the database | The invitation link is displayed once for manual delivery — no email is sent, because no email provider is connected | The screen says to pass the link on yourself |
| Role matrix | Real and enforced; the same table drives UI, actions and tests | — | Rendered in full on the team screen |
| Plans and entitlements | Real: five plans, nine keys, server-side resolution, idempotent metering, over-limit refusal that keeps the draft | — | The refusal names the plan, the limit and the usage |
| Billing | Provider-neutral interface and schema | **No payment provider.** Checkout refuses in both modes; `billing_events` is empty | «Платёжный провайдер не подключён» on `/app/plan`, with no pay button at all rather than a dead one |
| Localisation | Real catalogue, glossary, `Intl.PluralRules`, per-business currency and timezone | The app-wide switcher is `localStorage`-only, so server-rendered copy is Russian | — |
| Kazakh quality | Structure machine-checked | Natural phrasing unreviewed | `native_review_required` on every KK asset |
| Data inventory and retention | Real tables, rendered on the privacy page | — | The page is generated from the schema, so it cannot drift |
| Export / anonymise | Real anonymisation preserving financial history; hashed, expiring export token | Export file generation and delivery are not implemented | — |
| Platform analytics | Real aggregates, cohort-suppressed below five businesses | — | «Срез скрыт: слишком маленькая выборка» |
| Legal compliance | — | **No qualified legal review** for Kazakhstan or any other jurisdiction | Stated on the privacy page as a release gate |
| Backup and restore | Managed daily snapshots and PITR documented, including how erasure interacts with snapshots | The restore drill has never been run — no remote project exists | RUNBOOK marks it as written but untested |
| Partitioning | Thresholds and migration strategy recorded | Deliberately not implemented at current volumes | RUNBOOK |

### Honesty rules added in this prompt

1. **An admin action without a reason does not happen.** The audit function refuses, and where the
   audit fails after a mutation the mutation is rolled back rather than left unaudited.
2. **A published template version is never edited.** Correcting one means a new version; rollback
   leaves the newer version published so the history of what was live stays readable.
3. **A missing entitlement grant means "not permitted", never "unlimited".** `unlimited` is an explicit
   stored value.
4. **Hitting a limit never costs the owner their work.** The refusal is a message; the draft stays.
5. **Erasure keeps the money and drops the person.** Amounts survive anonymised because the law
   requires it, and the privacy page says so instead of promising total deletion.
6. **A cohort of one is an identification.** Any filtered platform aggregate below five businesses is
   withheld entirely rather than rounded.

## Prompt 7 real vs mock — что доказано, а что по-прежнему нет (2026-08-01)

Промпт 7 не добавлял функций. Он проверял, что уже написанное действительно работает — и
нашёл, что часть этого не работала. Таблица ниже отражает состояние **после** исправлений.

### Стало по-настоящему работающим

| Что | Было | Стало |
|---|---|---|
| Главный CTA лендинга | Скрыт CSS до запуска анимации: без JavaScript **навсегда невидим** | Виден без JS, при `prefers-reduced-motion` и при сбое GSAP |
| «Назад к контракту» на шаге запуска | Вложенный `<form>` выбрасывался парсером, кнопка становилась второй отправкой **формы запуска** | `formAction`; проверка `check:markup` не даст вернуть |
| Выход из аккаунта | Server action и POST-роут существовали, но ни один экран их не показывал | Кнопка в шапке, только POST |
| Имя пользователя в шапке | Захардкоженные инициалы и имя | Настоящее имя и почта вошедшего |
| Поиск в шапке | Декоративный `div`, похожий на поле ввода | Ссылка на экран, который действительно ищет |
| Колокольчик уведомлений | `button` без обработчика с фальшивой красной точкой | Ссылка с настоящим счётчиком непрочитанного |
| Редактирование категорий | Server action умел, UI не давал | Инлайн-форма имени и порядка, с записью в аудит |
| Ошибка входа и регистрации | Редирект с `?error=`, который никто не рендерил | Живой регион `role="alert"` |
| Изоляция тенантов при TRUNCATE | Подписанный пользователь мог уничтожить данные **всех** тенантов | Привилегия отозвана, регрессия закрыта дважды |
| Заголовки безопасности | Не было ни одного | CSP с nonce, HSTS, frame-ancestors, form-action, Permissions-Policy |
| Поведение при сбое базы | Временная ошибка PostgREST сообщала «нет доступа» и давала голый 500 | Отдельный тип ошибки, редирект для маршрутных случаев, границы ошибок с повтором |

### Осталось не подключённым

| Возможность | Что реально | Чего нет | Что видит пользователь |
|---|---|---|---|
| Каналы отправки | Outbox, ретраи, dead letter, send gate, подпись webhook | Ни одного вендорского sandbox: **ни один канал не может стать `connected`** | Запуск в DEMO_MODE помечается как симуляция; в PRODUCTION_MODE отклоняется |
| Биллинг | Провайдер-независимый интерфейс, планы, лимиты, счётчики | Платёжного провайдера нет; `billing_events` пуст | «Платёжный провайдер не подключён», кнопки оплаты нет вовсе |
| Проверенные факты | Разделение influenced и incremental, неизменяемые baseline | Без подключённого источника `verified_fact` невозможен — база запрещает | Каждая строка помечена как демонстрационная |
| Локализация | Каталог, глоссарий, `Intl`, валюта и таймзона бизнеса | Переключатель клиентский: серверный рендер всегда русский | — |
| Казахский язык | Структура проверяется машинно | Ревью носителем не проводилось | `native_review_required` на каждом материале |
| Юридическое соответствие | — | Квалифицированной проверки для Казахстана не было | Сказано на самой `/privacy` |
| Восстановление из бэкапа | Процедура и её взаимодействие с удалением описаны | Ни разу не выполнялась: удалённого проекта нет | RUNBOOK помечает как непроверенное |
| Планировщик | Job-эндпоинт с секретом, защитой от повтора и rate limit | Платформенного cron нет; лимит и кэш повторов живут в памяти процесса | — |
| Нагрузка | p50/p95/p99 и доля ошибок измерены | Один локальный инстанс; заявления о ёмкости платформы нет | SLO явно назван начальным |
| Кроссбраузерность | Chromium | WebKit и Firefox не установлены в этой среде | — |

### Правила честности, добавленные этим промптом

1. **Кнопка, которая ничего не делает, — это ложь.** Декоративный поиск, мёртвый колокольчик
   и выдуманное имя пользователя убраны, а не переоформлены.
2. **Тест, который проверяет текст на экране, ничего не доказывает.** Каждое утверждение
   E2E подтверждается запросом в базу.
3. **Список таблиц для проверки изоляции читается из схемы.** Список, написанный руками,
   устаревает молча — новая таблица просто не попадёт в проверку.
4. **Пройденный гейт без свежего сброса базы недействителен.** Точные цифры seed что-то
   значат только на чистом seed, поэтому и E2E, и pgTAP начинаются со сброса.
5. **Исключение в правиле безопасности привязывается к тексту строки.** Единственное
   разрешённое `%s` в динамическом SQL перестанет быть разрешённым, как только строку
   изменят.
6. **Уязвимость не «чинится» ломающим откатом.** `npm audit fix --force` предлагал вернуть
   Next к версии 9 — это отвергнуто в пользу точечных `overrides`.

## Prompt 8 real vs mock — финальное состояние (2026-08-01)

Финальная сводка после прогона с нуля. Строки, изменившиеся в этом этапе, помечены **→**.

| Возможность | Реально работает | Не работает / симулируется | Что видит пользователь |
|---|---|---|---|
| Изоляция арендаторов | RLS на 67 таблицах; чтение, присвоение чужого `business_id`, вставка в чужой тенант — всё проверено | — | — |
| **→** Права Data API | **Явные** гранты на все 79 таблиц вместо унаследованных автоматических | — | — |
| Привилегии в обход RLS | `TRUNCATE`, `TRIGGER`, `REFERENCES` отозваны у приложенческих ролей | — | — |
| Авторизация и сессии | Настоящая; выход только POST; поддельная cookie отклоняется | — | — |
| Заголовки безопасности | CSP с nonce на маршрутах с данными, HSTS, frame-ancestors, form-action | `style-src` сохраняет `'unsafe-inline'`; маркетинговые страницы — `script-src 'unsafe-inline'` | — |
| Экономика | Симулятор и Margin Shield на сервере, целочисленные минорные единицы | — | Отказ с расчётом, а не с формулировкой |
| Growth Contract | Неизменяемый снимок и хеш, актор и время подтверждения | — | — |
| QR-лояльность | Хешированные токены, раздельные согласия, идемпотентный журнал, защита от повтора | Проверка личности помечена `SIMULATED VERIFICATION` в демо | Пометка видна на странице вступления |
| Mini-CRM | Курсорная пагинация, маскированные контакты, сегменты | — | — |
| Каталог | Пять фильтров, избранное и активация в базе | — | — |
| Campaign Studio | Семь шагов, черновик на сервере, восстановление после ошибки | — | — |
| AI-генерация | Провайдер-независимая, строгая схема, редакция PII, квота, гарантированный откат | Провайдер не подключён — работает детерминированный шаблон | «Встроенный детерминированный шаблон QADAM» |
| Контент RU/KK | 14 материалов, обе локали, пометка о носителе | Казахский не проверен носителем | `native_review_required` на каждом |
| Отправка | Outbox с ретраями и dead letter, send gate, аварийная остановка | **Ни один канал не подключён** | В демо — `SIMULATED`; в production запуск отклоняется |
| Impact Ledger | Пять видов чисел раздельно, baseline неизменяем | `verified_fact` **невозможен** без подключённого источника | Каждая строка помечена как демонстрационная |
| Admin Console | Три рубежа доступа, append-only аудит, CRUD с архивом, версионирование шаблонов | — | — |
| Тарифы | Пять планов, девять ключей, серверный резолв, идемпотентное списание | **Платёжного провайдера нет** | «Платёжный провайдер не подключён», кнопки оплаты нет |
| **→** Локализация | Локаль определяется **на сервере**: cookie → бизнес → `Accept-Language` → ru; `<html lang>` верный; оболочка, лендинг, авторизация и тарифы двуязычны | Тексты экранов кабинета не переведены | Кабинет **на казахском** сообщает, что перевод экранов ждёт носителя языка |
| Приватность | Инвентарь и сроки — таблицы; страница генерируется из них; анонимизация сохраняет суммы | Генерация файла экспорта не реализована | Страница сама признаёт отсутствие юридической проверки |
| Разделение режимов | Проверено **отдельным сервером** в PRODUCTION_MODE, а не чтением кода | — | В production нет demo-входа, скачка во времени и подключённых каналов |
| CI | Четыре задачи, деплой падает при упавшем CI, gitleaks, проверка дрейфа типов | — | — |
| Деплой | Runbook написан пошагово | **Ни разу не выполнялся**: проекта, хостинга и разрешения нет | — |
| Бэкапы | Процедура описана вместе с взаимодействием с удалением по запросу | **Ни разу не выполнялась** | RUNBOOK помечает как непроверенное |
| Нагрузка | p50/p95/p99 и доля ошибок измерены | Один локальный процесс | SLO назван «то, что выдержал один локальный инстанс» |

### Правила честности после восьми этапов

1. **Кнопка, которая ничего не делает, — ложь.** Мёртвый поиск, фальшивый счётчик и
   выдуманное имя пользователя удалены, а не переоформлены.
2. **Тест, читающий текст на экране, ничего не доказывает.** Каждое число сверяется с базой.
3. **Список для проверки читается из схемы.** Список, написанный руками, устаревает молча.
4. **Гейт без свежего сброса базы недействителен.** Цифры seed значат что-то только на seed.
5. **Исключение в правиле безопасности привязано к тексту строки.** Изменили строку —
   исключение перестало действовать.
6. **Уязвимость не «чинится» ломающим откатом.** `npm audit fix --force` предлагал вернуть
   Next к версии 9; вместо этого — точечные `overrides`.
7. **Проверять, а не наследовать «инструмент недоступен».** Браузерная автоматизация
   считалась недоступной несколько этапов подряд; она была доступна, и именно она нашла
   большую часть дефектов.
8. **Умолчание платформы — не гарантия.** Схема полагалась на автоматические гранты Supabase,
   которые платформа отменяет; теперь права объявлены явно.
9. **Частичный перевод объявляется на том языке, которого он касается.** Русский текст под
   казахской навигацией без предупреждения — та же ложь, что мок под видом факта.

## Ядро снабжения (14 августа 2026)

| Capability | Current state | DEMO_MODE | PRODUCTION_MODE | Required label / guard |
|---|---|---|---|---|
| Журнал движений | Real — append-only таблица, идемпотентная функция записи, запрет отрицательного остатка | Real над синтетическими стартовыми остатками | Real | `DEMO DATA`; событие помечено `is_mock` по режиму заведения |
| Остаток | Real — сумма журнала, пишет только функция в одной транзакции | Real | Real | остаток нельзя присвоить ни из интерфейса, ни через REST |
| История спроса | Real расчёт / **MOCK наблюдения** — 28 дней расхода сгенерированы seed детерминированно | 140 синтетических событий расхода | реальные списания точки | `[MOCK] история продаж синтетическая` в допущениях прогноза |
| Прогноз спроса | Real — взвешенное среднее 28 дней на коэффициент дня недели, ошибка на скользящем бэктесте | Real расчёт над синтетическим рядом | Real | версия формулы `demand-baseline-1`, WAPE и размер выборки в каждом снимке |
| Уверенность прогноза | Real — падает от короткой истории, редкого движения и большой ошибки; потолок 0,92 | Real | Real | никогда не 99 процентов: обещать такое нечестно |
| Время до дефицита | Real — остаток делить на дневной прогноз | Real | Real | при нулевом расходе возвращается «нет достаточного расхода», не бесконечность |
| Страховой запас и точка перезаказа | Real — z на сигму на корень из срока в днях; ROP = прогноз на срок плюс запас | Real | Real | z подписан как настройка политики, а не измерение |
| Срок поставки p80 | **MOCK** — задан владельцем в политике позиции | синтетические 48/72/96 часов | измеряется из истории приёмок | в допущениях сказано, что это заявленное значение |
| Снимок риска | Real — уровень, разрыв, доказательства, версия формулы | Real | Real | открытый риск один на позицию; прежний закрывается, а не перезаписывается |

## Цветочное ядро (14 августа 2026)

| Capability | Current state | DEMO_MODE | PRODUCTION_MODE | Required label / guard |
|---|---|---|---|---|
| Партии и сроки | Real — партия создаётся приёмкой, расход разбирает её по сроку | Real над синтетическими поставками | Real | срок считается из `shelf_life_days`, а не выдумывается |
| Списание | Real — отдельный вид движения с обязательной причиной | Real | Real | в спрос не попадает ни при каких условиях |
| Риск списания | Real — по каждой партии остаток минус то, что успеет продаться | Real расчёт | Real | доля сравнивается с порогом владельца, а не с нулём |
| Замороженная в списании сумма | Real расчёт / **MOCK себестоимость** — берётся из текущей цены закупки | синтетические цены | цена из приёмки поставщика | при неизвестной цене возвращается `null`, а не ноль |
| Календарь праздников | Real логика / **MOCK коэффициенты** — 14 февраля, 8 марта, Наурыз, 1 сентября, День учителя | шаблонные лифты | измеряются из факта прошлого года | `verified=false` → на экране «гипотеза, не проверена фактом» |
| Локальные поводы магазина | Real — своя строка календаря | синтетические «две свадьбы в субботу» | заявки организаторов | помечены источником |
| Критичность позиции | Real — поднимает уровень сервиса | Real | Real | подписана как настройка политики |

## Тонкие части (15 августа 2026)

| Capability | Current state | DEMO_MODE | PRODUCTION_MODE | Required label / guard |
|---|---|---|---|---|
| Чат флориста | Real разбор и запись / **MOCK канал** — живого мессенджера нет | тренажёр в интерфейсе | Telegram-коннектор | `[MOCK] Это тренажёр` на экране; поле `is_simulated` в каждой строке |
| Голос и фото полки | **Отсутствуют** | не изображаются | распознавание через адаптер | на экране прямо сказано, что не подключены |
| Разбор сообщения | Real — словарь позиций, стемминг, уверенность | Real | Real | ниже 85% продукт спрашивает, а не догадывается |
| Изменение остатка из чата | Real — только после подтверждения человеком | Real | Real | событие несёт источник `messenger` и ссылку на сообщение |
| Календарь праздников | Real логика / **MOCK коэффициенты** | шаблонные лифты | измеряются из факта прошлого года | `[MOCK HYPOTHESIS]` рядом с непроверенным лифтом |
| Применение лифта | Real — только после одобрения владельца | Real | Real | неодобренное событие не двигает прогноз |
| Общий рейтинг поставщиков | Real агрегация / **MOCK магазины** — считается по синтетическим заведениям стенда | `[MOCK AGGREGATE]` | настоящая сеть — P3 | порог 20 поставок и 10 магазинов; в ответе нет идентификаторов |
