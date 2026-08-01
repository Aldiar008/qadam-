# QADAM Requirements Matrix

Источник: `SERPIN_QADAM_Winning_Blueprint.pdf` (48 страниц, создан 2026-07-29) и нормативные дополнения из Prompt 0. Аудит: 2026-07-30.

Статусы: `NOT_STARTED` — реализации нет; `PARTIAL` — есть UI/fixture/часть пути, но acceptance test не доказан; `VERIFIED` — требование прошло указанный тест; `BLOCKED` — проверка или поставка требует отсутствующего артефакта/среды/разрешения.

Ни один интерактивный сценарий не помечен `VERIFIED` только на основании HTTP 200 или визуального макета.

## Официальная матрица R01–R47

| ID | Обязательное требование | Экран / компонент | Действие | Acceptance test | Статус / evidence |
|---|---|---|---|---|---|
| R01 | Стабильно увеличивать поток и выручку | `/app/today`, Growth Loop, `/app/analytics` | Signal → action → incremental effect | E2E contract lifecycle + ledger kinds | PARTIAL — mock signal/ledger UI |
| R02 | Привлекать новых клиентов простыми digital-инструментами | `/app/tools`, Campaign Studio | Активировать «Первый визит», выбрать new segment | E2E activation + persisted campaign | PARTIAL — catalog cards only |
| R03 | Лояльность/удержание через бонусы, акции, персональные предложения | segments, campaign, automations | Запустить reactivation для 18 consented клиентов | integration consent/exclusion + E2E | PARTIAL — fixtures, no launch |
| R04 | Простая аналитика продаж и поведения | `/app/analytics`, Today | «Объяснить простыми словами» | UI action returns sourced explanation | PARTIAL — metrics UI, no explain action |
| R05 | Автоматизировать скидки, уведомления, повторные продажи | `/app/automations` | Включить правило с approval | rule integration + idempotency/audit | PARTIAL — read-only draft card |
| R06 | ЦА: кофейни, магазины, салоны, сервисные точки | signup/onboarding, solutions | Сменить type и рекомендации | E2E profile-dependent recommendations | PARTIAL — public solution pages only |
| R07 | ЦА: ИП без маркетинговой команды | `/app/today` | Выполнить key action без терминов | moderated usability + task completion | PARTIAL — action-first copy, no study |
| R08 | ЦА: конкурентные городские точки | local radar / nearby | Показать local signal и mock-source | provenance UI assertion | PARTIAL — `/nearby`, no radar evidence |
| R09 | ЦА без digital-опыта | onboarding/Today | Пройти без ad-account setup | usability test | PARTIAL — plain-language UI, no test |
| R10 | Реальная функциональность; mock допустим, путь stateful | whole app | create/edit/launch/history | refresh-persistence E2E | PARTIAL — ephemeral state only |
| R11 | Главная объясняет продукт и аудиторию | `/` hero/use cases | 15-second comprehension | browser content + user test | PARTIAL — route 200/source present |
| R12 | Главная показывает acquisition, sales, automation | `/` sections | scroll outcomes/Impact preview | browser content assertion | PARTIAL — source present; browser blocked |
| R13 | Понятные рабочие CTA | landing deep links | «Найти клиентов» → signal | link crawl + E2E destination/action | PARTIAL — links exist, click QA blocked |
| R14 | Tool cards: name, description, type, Activate/Use | `/app/tools` | Activate/Use tool | state changes and persists | PARTIAL — 4 link cards, no Activate |
| R15 | Пять фильтров: маркетинг, продажи, удержание, аналитика, автоматизация | `/app/tools` | Filter each category | UI list changes + query/state test | NOT_STARTED |
| R16 | Избранное | `/app/tools` | Toggle and view Favorites | persistence E2E | NOT_STARTED |
| R17 | Минимум 2–3 полноценных модуля | campaigns/customers/analytics | complete three modules | three end-to-end acceptance tests | PARTIAL — views exist, workflows incomplete |
| R18 | Модуль: описание, шаги, пример, результат | `/app/campaigns/new` | Complete 4 steps | wizard validation + result persistence | PARTIAL — step navigation only |
| R19 | Тестовые акции, статистика, growth simulation | campaign builder/simulator | Change offer; compare 3 scenarios | deterministic formula unit + E2E | PARTIAL — deterministic seven-mechanic simulator and tests VERIFIED; UI wiring pending |
| R20 | Новые, повторные покупки, эффективность акции | Impact Ledger | Open metric explanation | metric contract/source/period assertion | PARTIAL — ledger formulas/shared explanation VERIFIED; UI still fixture-backed |
| R21 | Кабинет: active tools/campaigns | `/app/*` | Open active tool and campaign | E2E with shared persisted state | PARTIAL — separate static pages |
| R22 | Кабинет: клиенты, продажи, marketing efficiency | app analytics/customers | Compare current/previous 30 days | seeded aggregate integration test | PARTIAL — no period/source contract |
| R23 | История акций, уведомлений, изменений | activity/history | Launch then see new entry | append-only audit E2E | PARTIAL — atomic append-only activity/outbox VERIFIED; history UI pending |
| R24 | Рекомендации с choices | `/app/recommendations` | accept/edit/snooze/reject | command state + audit test | PARTIAL — domain/DB state machine VERIFIED; UI actions pending |
| R25 | Registration: type, size, goals | `/signup` onboarding | Cafe, 1 location, win-back | E2E registration persistence | PARTIAL — presentation form only |
| R26 | Инструменты по профилю | recommendations | Finish onboarding → tailored set | matching unit + E2E | NOT_STARTED |
| R27 | Примеры для кофеен и салонов | solution/demo switcher | Switch cafe → salon | UI/content assertion | PARTIAL — separate pages, no switcher workflow |
| R28 | Admin CRUD tools/templates | `/admin/tools`, `/admin/templates` | create/edit/archive/delete | CRUD integration + RLS + E2E | NOT_STARTED — read-only demo |
| R29 | Admin categories/business types | `/admin/categories` | Add flower shop | CRUD + uniqueness/RLS test | NOT_STARTED — read-only cards |
| R30 | Admin active businesses/popular tools | `/admin/analytics` | Open KPIs/top tools | seeded aggregate test | PARTIAL — unrelated demo metrics |
| R31 | Admin demonstrates scale: versions/categories/audit | admin console | publish version across 3 types | lifecycle/rollback/audit E2E | PARTIAL — version labels only |
| R32 | Clickable navigation; route persistence | public/app/admin nav | Visit main/tools/account | route crawl + refresh E2E | PARTIAL — 49/49 HTTP 200; browser click blocked |
| R33 | Interactive campaign/tool/analytics | app | Discount change recalculates profit | finance unit + E2E | PARTIAL — server/domain recalculation VERIFIED; interactive UI pending |
| R34 | Structured mock/DB users/tools/campaigns/stats | `src/mock-data` / seed | Show counters and seed object | schema validation + referential integrity | VERIFIED — canonical JSON + deterministic SQL + exact-count pgTAP |
| R35 | Logical login → key function | `/login` → Today → Contract → Launch → Impact | Complete without manual bypass | full E2E | PARTIAL — routes exist; auth/launch missing |
| R36 | Online link without installation | deployed build | Open in incognito | production smoke against URL | BLOCKED — no deployment config/URL; deploy not authorized |
| R37 | Submit MVP/repo or Figma | external deliverable | Open short URL/QR | accessibility from clean device | BLOCKED — no `.git`, URL or Figma artifact |
| R38 | Test registration/tools/function/account/admin | acceptance suite | Run five smoke tests | automated E2E suite | NOT_STARTED — no test files/runner |
| R39 | 5–8 slide pitch | presentation artifact | Present seven-slide story | artifact review | BLOCKED — deck absent |
| R40 | Video covers search/activation/campaign/analytics/account/admin | demo video | Play 4:30 recording | artifact review | BLOCKED — video absent |
| R41 | Tech description: stack/functions/mock/roadmap/scale | README + `docs/qadam/*` | Inspect real/mock + architecture | documentation review | PARTIAL — foundation created; later stages pending |
| R42 | Понимание проблемы — 20% | constitution/persona narrative | Start with owner workday/evidence | pitch/product trace review | PARTIAL — JTBD/constraints captured |
| R43 | Функциональность — 25% | five P0 flows | Live demo + history proof | E2E suite | PARTIAL — build/routes work, flows incomplete |
| R44 | UX и дизайн — 20% | action-first RU/KK responsive UI | Action in 1–3 steps | a11y + 390/1440 + usability | BLOCKED — browser backend unavailable; no automated a11y |
| R45 | Влияние и масштабирование — 20% | ledger/formulas/taxonomy | Forecast vs mock actual | metric/formula + taxonomy tests | PARTIAL — formula/kind boundary VERIFIED; UI evidence pending |
| R46 | Инновации — 15% | Growth Contract/Margin Shield/causal ledger | Block 20%; propose safe offer | deterministic guardrail E2E | PARTIAL — domain/API/DB guardrails VERIFIED; browser E2E pending |
| R47 | Не landing-only; stateful CRUD/history | app/admin | Refresh and retain state | persistence E2E | PARTIAL — DB state/outbox/history real; screens not wired |

## Дополнительные нормативные требования Prompt 0

| ID | Требование | Экран / boundary | Действие | Acceptance test | Статус |
|---|---|---|---|---|---|
| Q01 | Growth Contract содержит все 10 обязательных блоков/actions | contract schema/detail | inspect/edit/approve/launch/pause | schema + lifecycle tests | PARTIAL — typed compiler/snapshot/lifecycle VERIFIED; detail UI pending |
| Q02 | QR loyalty + transparent consent + stamps/points/coupon | QR join/customer memory | scan/join/earn/redeem | consent/RLS/E2E | PARTIAL — public feature story only |
| Q03 | AI generator gives 2–3 mechanics and separate RU/KK | Campaign Studio | generate/select/edit | contract/content tests | PARTIAL — static variants, no generator |
| Q04 | Simulator shows assumptions and low/base/high incl. contribution/cost/cannibalization/ROI | simulator | change assumption | golden formulas + property tests | PARTIAL — engine/golden/invariant tests VERIFIED; UI pending |
| Q05 | Margin Shield blocks loss and suggests safe alternative | builder | set 20% discount | unit + E2E block | PARTIAL — engine and DB approve/launch block VERIFIED; UI alternative choice pending |
| Q06 | Complete Business Twin with provenance/confidence | settings | edit source/profile | validation/RLS/audit | PARTIAL — typed normalizer/readiness/provenance tests VERIFIED; settings wiring pending |
| Q07 | Customer Memory: transactions, consent, RFM/lifecycle/dynamic segments | customers | open/filter customer | aggregation/RLS/E2E | PARTIAL — RFM rules, consent-first eligibility and idempotent DB recompute VERIFIED; UI pending |
| Q08 | Content bundle: post, 3 stories, 15-sec script, message, RU/KK, alt, CTA, tracking | content | compile/edit variants | schema + E2E | PARTIAL — 3 text items only |
| Q09 | Automation set incl. stop-loss/weekly/data quality | automations | configure/approve/pause | scheduler/idempotency/audit | PARTIAL — one inactive card |
| Q10 | Ledger kinds remain distinct | analytics | inspect each number | metric contract test | PARTIAL — domain/DB kind separation VERIFIED; old UI type pending migration |
| Q11 | Nearby offers by district/radius with privacy | `/nearby` | filter/open offer | geo privacy + E2E | PARTIAL — public presentation only |
| Q12 | Roles, multi-location, RU/KK, timezone/currency, flags, plan limits | settings/admin/policy | switch role/location/language | RLS/entitlement/E2E | PARTIAL — language local state only |
| Q13 | DEMO_MODE labels all synthetic/outcome data; workflow/CRUD/RLS real | cross-cutting | run demo flow | label scan + RLS/CRUD E2E | PARTIAL — badges inconsistent; no CRUD/RLS |
| Q14 | PRODUCTION_MODE forbids demo users/outcomes/fake connectors | server config | start production mode | startup/config/fixture exclusion tests | NOT_STARTED |
| Q15 | AI avoids causal claims on small samples | explanation policy | request explanation | policy/eval test | PARTIAL — Signal output structurally forbids causal claim; AI eval pending |
| Q16 | No send without consent | audience/connector | include opted-out customer | deny + audit integration test | VERIFIED — latest-consent triggers reject audience inclusion and delivery |
| Q17 | Price/budget/audience changes require approval level | policy engine | unauthorized change | RBAC deny/audit test | PARTIAL — campaign economics/audience guarded; catalog price approval workflow pending |
| Q18 | Financial math deterministic; LLM cannot bypass guardrails | finance boundary | adversarial LLM output | golden/property/security tests | VERIFIED — fixed-point core + server recalculation + DB enforcement, 28 unit/59 DB assertions |
| Q19 | Every number has source, period, kind | metric component/API | inspect metric metadata | schema/UI contract test | PARTIAL — shared API/domain explanation contract VERIFIED; UI migration pending |
| Q20 | Service/secret keys never reach browser | deployment/build | scan bundle/config | secret scan + architecture test | PARTIAL — none configured; no enforcement |
| Q21 | Preserve current composition/animation/scroll | frontend | wire data without visual regression | 390/1440 screenshot comparison | BLOCKED — browser backend unavailable |
| Q22 | TAMYR canonical fixture exactly matches constitution | demo seed | load demo tenant | JSON schema + exact totals/formulas | VERIFIED — JSON is formula source; golden and exact-count tests pass |

## Tournament criteria

| Criterion | Weight | Primary evidence target | Current status |
|---|---:|---|---|
| Понимание проблемы | 20% | JTBD, local advantage, owner journey, traceability | PARTIAL |
| Функциональность | 25% | five end-to-end flows, persistence, CRUD/history | PARTIAL |
| UX и дизайн | 20% | action-first RU/KK, responsive/a11y evidence | BLOCKED for browser QA |
| Влияние и масштабируемость | 20% | honest ledger, formulas, multi-type taxonomy | PARTIAL |
| Инновации и креативность | 15% | Growth Contract, Margin Shield, controlled learning | PARTIAL |
## Prompt 3 owner/customer paths status

| Requirement | Screen/action | Evidence/test | Status |
|---|---|---|---|
| Registration and logical path to key action | `/signup` -> `/onboarding` -> `/app/today` | Browser E2E completed all six onboarding steps and redirected to Today | VERIFIED |
| Landing with audience, value proposition and working CTA | `/` | Browser E2E confirmed «Найти клиентов», «Создать акцию», «Начать» | VERIFIED |
| Catalog, five filters, favorites and activation | `/app/tools` | Search/query state, five filters, favorite/activate persistence after refresh | VERIFIED |
| Minimum three working modules | Today, Tool Catalog, QR Loyalty, Mini-CRM, Recommendations | Server-side Supabase state and route guards | VERIFIED |
| Create test promotion, basic stats and growth simulation | `/app/campaigns/new`, domain APIs | Existing Prompt 2 domain APIs verified; UI handoff is partial | PARTIAL |
| New customers, repeat purchases and campaign efficiency | `/customers`, `/customers/[id]`, `/app/today` | CRM list/card and Today KPIs from tenant DB | VERIFIED |
| Cabinet active tools, campaigns and action history | `/app/today`, `/app/tools`, activity logs | Active tools/campaigns rendered from DB; history through activity logs | VERIFIED |
| Profile-based recommendations | `/app/recommendations`, `/app/today` | GOS/signal/expected contribution cards and persistent status actions | VERIFIED |
| Admin CRUD tools/templates/categories/business types | `/admin/*` | Prompt 1/2 admin foundation remains; Prompt 3 did not expand admin UI | PARTIAL |
| Admin analytics | `/admin/analytics` | Existing analytics route retained | PARTIAL |
| Clickable navigation and saved state | app sidebar/mobile nav, query-state filters | Browser E2E and URL query persistence | VERIFIED |
| Online build testable without install | `npm run build` | PASS local production build | VERIFIED |
| Customer QR loyalty consent and reward | `/app/loyalty`, `/q/[token]` | Browser E2E plus pgTAP join/redeem/replay tests | VERIFIED |
| Viewer cannot mutate customer/consent/campaign data | owner/customer actions | pgTAP role denial and browser negative check | VERIFIED |
| Production mode disables demo login/simulated verification | auth and QR routes | Environment-gated checks | VERIFIED |

## Prompt 3 completion status (2026-08-01)

Closes the items Prompt 3 left PARTIAL and records two defects found while verifying them.

| Requirement | Screen/action | Evidence | Status |
|---|---|---|---|
| Create promotion, simulate economics, launch campaign | `/app/campaigns`, `/app/campaigns/new`, `/app/campaigns/[id]` | E2E-6/E2E-7: signal → segment → mechanic → compiled Growth Contract v2 (consent 18, Margin Shield `warning`) → `awaiting_approval` → `approved` → campaign `approved` with 18 consent-gated recipients | VERIFIED |
| Margin Shield stops an unsafe decision | Campaign Studio | E2E-6: blanket 20% discount refused before any row is written; owner sees a plain-language refusal, safe gift-with-threshold variant compiles | VERIFIED |
| Simulator scenarios visible before confirmation | `/app/campaigns/new` | Pessimistic/base/optimistic contribution, cost and ROI rendered from the contract snapshot; uplift assumptions are owner-editable inputs | VERIFIED |
| Content studio produces channel/locale material tied to a campaign | `/app/content` | E2E-8: 6 items written to `content_items`, RU + KK, status `draft`, editable and approvable | VERIFIED |
| Analytics separates forecast / mock result / verified fact | `/app/analytics` | Impact Ledger table renders `impact_measurements` grouped by `kind`; empty state states that measurements appear only after launch | VERIFIED |
| Automations with owner approval and stop-rule | `/app/automations` | Create writes `automations` as `draft`; activate/pause/disable go through `transition_domain_entity` with optimistic version | VERIFIED |
| Business settings persist and feed the calculations | `/app/settings` | Save round-trip changed `average_check_minor` 3450→3600 and `margin_floor_bps` 4200→4300, wrote `business.settings_updated` audit row | VERIFIED |
| CSV import writes real customers | `/customers/import` | E2E-10 and pgTAP 007: 2 inserted / 1 rejected / 3 rows recorded; skip and update strategies; replayed key returns the original receipt | VERIFIED |
| QR token registry with rotate/revoke per token | `/app/loyalty` | E2E-5: table lists created/status/expiry/scans/last scan; revoke and rotate act on real token ids; `rotated_from_id` links the predecessor | VERIFIED |
| Route guards and intended-route return | proxy | E2E-1: `/app/today` anonymous → `/login?next=%2Fapp%2Ftoday`; `/admin` as tenant owner → `/app/today?error=admin_access_required`; platform admin → 200 | VERIFIED |
| Production mode hides demo affordances | `/login`, `/demo`, `/q/[token]` | PRODUCTION_MODE: `/demo` → `/signup?message=demo_disabled`, login renders `demoEnabled:false`, QR join → `verification_not_connected` | VERIFIED |
| No dead buttons or decorative primary controls in the cabinet | all `/app/*` | `AppDemoViews.tsx` deleted; no `href="#"` and no `mock-data` import remains under `src/app/app`, `src/app/customers`, `src/app/q`, `src/server` | VERIFIED |

### Defects found and fixed during verification

| Defect | Impact | Fix |
|---|---|---|
| `proxy.ts` sat at the repository root while the project uses `src/`, so Next never registered it | Every route guard was dead code: unauthenticated `/app/*` rendered, `/admin` had no role gate, `/demo` was reachable in production mode, and the Supabase session was never refreshed | Moved to `src/proxy.ts`; build now reports `ƒ Proxy (Middleware)` and all guards are exercised in E2E-1 |
| `intValue()` returned `0` for an absent form field because `Number('') === 0` | Uplift assumptions collapsed to zero, so Margin Shield blocked **every** campaign — the studio could never produce a contract | Fall back on empty input; uplift is now three explicit owner-editable fields instead of a hidden default |
| CSV import reported success from a `setTimeout`, writing nothing | The wizard claimed "успешно импортировано N клиентов" while the database was untouched | Real `import_customers` RPC; the UI now reports server counts including rejected rows |
| Marketing consent from QR join / CSV import used scope `marketing`, campaigns require `marketing.<channel>` | Customers acquired through QR or import could never be reached by any campaign | `resolve_effective_consent`: explicit channel consent wins, umbrella applies only to channels the customer never answered |
| `has_effective_consent` picked an arbitrary row when two consent changes shared a timestamp | A revoke written in the same transaction as a grant could resolve as "granted" | `latest_consent_is_granted` requires every row at the newest timestamp to be a live grant |

## Prompt 4 status — AI generator, Campaign Studio, Growth Contract, Content Studio (2026-08-01)

### AI architecture

| Requirement | Evidence | Status |
|---|---|---|
| Provider-neutral interface | `AiProvider` in `src/ai/contract.ts`; Anthropic and OpenAI adapters implement it without leaking into the domain | VERIFIED |
| Provider and model chosen server-side only | `readProviderConfig()` reads `QADAM_AI_*` / key env; no `NEXT_PUBLIC_` variant exists; grep confirms the browser bundle contains no key or `x-api-key` | VERIFIED |
| Strict runtime schema on request and response | `parseCampaignProposal` validates type, range, length, enum, distinctness and locale coverage | VERIFIED |
| Structured JSON, not free text | Balanced-brace extraction handles fenced/prose responses; anything else is `malformed_json` | VERIFIED |
| `ai_generation_run` with full provenance | provider, model, source, prompt/schema version, redacted input hash, latency, attempts, tokens, cost, status, failure kind, fallback reason | VERIFIED |
| No raw PII in prompt logs | Only the redacted payload is hashed; DB CHECK forces `input_hash` to a SHA-256 digest | VERIFIED |
| Timeout, bounded retry with backoff, rate limit, per-business quota, cost guard | Unit tests for each; `ai_usage_quota` enforces daily generations and cost in the database | VERIFIED |
| Deterministic fallback with identical schema | `generateDeterministicProposal`; its output re-validates through `parseCampaignProposal` | VERIFIED |
| Provider outage keeps demo working and is labelled | E2E P4-5: `deterministic_fallback / completed / not_configured`, label shown in the Studio | VERIFIED |
| Prompt injection cannot change rules, budget, consent or target | Injection neutralisation (EN + RU), `<business_data>` declared non-authoritative, and the response's goal/audience are re-checked server-side regardless | VERIFIED |
| Content safety plus human approval | `checkContentSafety` blocks unsafe copy; every asset is created `draft` and needs owner approval | VERIFIED |
| Provider secret never in the client bundle | Bundle grep in TEST_PLAN | VERIFIED |

### AI Campaign Generator

| Requirement | Evidence | Status |
|---|---|---|
| Inputs: business type, location, brand voice, goal, PII-free segment summary, capacity, timing, channel, catalogue price/cost, margin floor, budget, frequency cap, previous campaign, RU/KK | `CampaignGenerationInput` + `loadAiBusinessContext`; only aggregates cross the boundary | VERIFIED |
| Output: 2–3 distinct mechanics with title, hypothesis, audience, offer, threshold, duration, channel, why-fit, risks, assumptions | Schema-enforced; E2E shows 3 distinct kinds | VERIFIED |
| Separate RU and KK, not a literal translation | Schema refuses identical RU/KK bodies; template authors each language separately | VERIFIED |
| No LLM financial output is authoritative | `CampaignAiService.evaluate` recomputes every scenario and the Margin Shield verdict | VERIFIED |
| All required mechanics available | 2+1, happy hours, gift with threshold, return coupon, bonus points, percentage/fixed discount — all in `MECHANIC_KINDS` and in the comparison table | VERIFIED |
| The discount variant is one Margin Shield can block | E2E P4-6: 20% discount blocked, no contract row created | VERIFIED |

### Campaign Studio

| Requirement | Evidence | Status |
|---|---|---|
| Seven steps: goal, audience, offer, timing/channel/content, simulator, contract review, approval and launch | `STUDIO_STEPS`; each rendered at `/app/campaigns/studio` | VERIFIED |
| Server-side draft on every step | `campaign_drafts` row per owner, optimistic version on each write | VERIFIED |
| Back/forward and resume | E2E P4-3 | VERIFIED |
| Field-level validation | `validateStep` returns per-field issues; the page marks the field and lists the message | VERIFIED |
| Input is not lost on error | Draft is persisted before validation runs; E2E P4-4 confirms the rejected value is still stored, and the render path no longer crashes on it | VERIFIED |
| Server does the authoritative check | Preview and compile both recompute from RLS-protected data | VERIFIED |
| Changing inputs after approval creates a new version | `compileGrowthContract` versions on content-hash change; `protect_accepted_growth_contract` refuses in-place edits of a non-draft snapshot | VERIFIED |

### Simulator and Margin Shield UI

| Requirement | Evidence | Status |
|---|---|---|
| Side-by-side comparison of variants | Comparison table over all seven mechanics on identical assumptions | VERIFIED |
| low/base/high | Three scenario cards | VERIFIED |
| Orders, revenue, incremental revenue, contribution, total cost, ROI, break-even, cannibalization, confidence | Rendered per scenario from `SimulatorResult` | VERIFIED |
| Explain on every number | `<details>` "Почему это число?" with formula, source, status, kind, confidence, assumptions and next action | VERIFIED |
| Blocked 20% discount visually clear and not launchable | Pill reads «✕ Заблокировано»; compile button disabled and labelled «Запуск заблокирован Margin Shield» | VERIFIED |
| Safe alternative accepted in one action | «Принять безопасный вариант» adopts the domain's own suggestion | VERIFIED |
| Colour is never the only status carrier | `StatusPill` always renders a glyph plus a word | VERIFIED |

### Growth Contract

| Requirement | Evidence | Status |
|---|---|---|
| All ten parts displayed | E2E P4-8 counts 10/10 rendered | VERIFIED |
| edit / snooze / reject / approve / launch | All five controls present and wired to real transitions | VERIFIED |
| Approval writes an immutable snapshot, actor and timestamp | `approved_by` and `approved_at` persisted (defect found and fixed); snapshot protected by trigger | VERIFIED |

### Content Studio and localisation

| Requirement | Evidence | Status |
|---|---|---|
| Post, short version, 3 stories with CTA, 15-second script, messenger message, RU and KK, alt text, tracking code, per-channel preview | 14 assets per brief; E2E P4-10 | VERIFIED |
| content_item → campaign → tracking → impact | `content_items.campaign_id`, `tracking_codes.campaign_id`, code printed in the copy | VERIFIED |
| RU and KK as separate meaningful variants with identical offer economics | Distinct text per language; the offer line is derived from the contract's own mechanic | VERIFIED |
| Language reviewer status and manual edit | `native_review_required` on KK; every asset editable and approvable | VERIFIED |
| Curated demo copy is stable | Deterministic output; unit test asserts stability | VERIFIED |
| KK quality treated as a release gate, not assumed perfect | Banner states native review is mandatory; flagged per asset | VERIFIED |

### Launch

| Requirement | Evidence | Status |
|---|---|---|
| Final confirmation shows audience, consent, cost, budget, margin decision, frequency cap, stop-rule, channel and connector state | Step 7 confirmation panel | VERIFIED |
| Server recompiles and re-checks before launching | `launchStudioCampaign` re-reads status, version and Margin Shield verdict | VERIFIED |
| Idempotency key and outbox event | `launch_growth_contract` uses a per-contract key and writes an outbox event | VERIFIED |
| DEMO_MODE returns a labelled simulated state | `campaign.simulated`, `connector=not_connected`, `mode=DEMO_MODE` | VERIFIED |
| PRODUCTION_MODE refuses without a connector and offers connection instead of fake success | Guard in `launchStudioCampaign`; message points at settings | VERIFIED |

## Prompt 5 status — automations, channels, notifications, storefront, impact (2026-08-01)

### Automation Center

| Requirement | Evidence | Status |
|---|---|---|
| Ten versioned rules (welcome, reactivation, quiet hours, repeat service, birthday, VIP, content queue, stop-loss, weekly review, data quality) | `src/automations/catalog.ts`; E2E P5-1 shows 10/10 with `*.v1` | VERIFIED |
| Each rule has trigger, filters, action, mode, budget/frequency/quiet-hours limits, approved template version, next_run, last_run, status, owner | `automations` columns plus template fields; rendered per rule | VERIFIED |
| Default mode is assistant / manual approval | Every template except stop-loss defaults to `assistant`; unit test asserts it | VERIFIED |
| Autopilot off until trust gates are met | `allowedModes` withholds autopilot; DB CHECK requires approved template and owner; only the protective stop-loss is allowed | VERIFIED |

### Execution design

| Requirement | Evidence | Status |
|---|---|---|
| Outbox pattern for side effects | `enqueue_delivery` writes delivery and outbox in one transaction; the worker dispatches outside it | VERIFIED |
| At-least-once with idempotent consumer | Worker skips a delivery not in `queued`; keys on all six tables | VERIFIED |
| Unique idempotency key per run/action/delivery/reward | Unique indexes on deliveries, outbox, automation runs, provider events, reward ledger | VERIFIED |
| Bounded retry, exponential backoff, dead-letter | `settle_outbox_event`: 30/60/120/240s then `dead_letter` plus notification | VERIFIED |
| Business-level emergency stop | `set_emergency_stop` freezes queue, pauses rules, gate refuses | VERIFIED |
| Pause/resume with audit | Every transition writes `activity_logs` | VERIFIED |
| Stop-loss pauses automatically, restart requires owner | `evaluate_stop_loss`; audit metadata `restart_requires_owner: true` | VERIFIED |
| No HTTP inside a long DB transaction | Lease then call then settle; the worker holds no transaction across the call | VERIFIED |
| Protected job endpoint plus local runner; demo cycle button | `/api/jobs/run-cycle` with secret, rate limit, replay prevention; runner documented in RUNBOOK; demo cycle button in DEMO_MODE | VERIFIED |
| Every attempt creates an automation_run and an activity log | `execute_automation` | VERIFIED |

### Connector adapters

| Requirement | Evidence | Status |
|---|---|---|
| Unified prepare/send/status/cancel | `ConnectorAdapter` interface | VERIFIED |
| Mock, webhook adapters and prepared vendor boundaries | `createMockAdapter`, `createWebhookAdapter`, `createUnimplementedVendorAdapter` | VERIFIED |
| Production adapter needs flag plus validated credentials plus successful health check | `resolveConnectorState` plus a DB CHECK that refuses `connected` without stored evidence | VERIFIED |
| Secrets server-side only | Read in the worker and adapter from `process.env`; `check:secrets` passes | VERIFIED |
| Consent and suppression checked before every send | `send_gate` called by the worker at dispatch, not only at audience build | VERIFIED |
| Quiet hours and frequency cap | `send_gate`, business timezone, rolling 24h | VERIFIED |
| Unsubscribe/revoke handled immediately | `ingest_provider_event` writes a revoked consent and a suppression entry in the same transaction | VERIFIED |
| Webhook signature and idempotency | HMAC plus timestamp window plus unique `(business, provider, external_event_id)` | VERIFIED |
| UI shows Connected / Sandbox / Simulated / Error / Not configured | Connector table on `/app/automations` with label and hint per state | VERIFIED |

### Notifications

| Requirement | Evidence | Status |
|---|---|---|
| In-app inbox for opportunity, approval, risk, result, connector error | `/app/notifications`, five categories | VERIFIED |
| Read/unread, mute on permitted categories | Mark read/unread/dismiss; DB CHECK forbids muting risk and connector_error | VERIFIED |
| Actionable link | `action_url` rendered as a primary button | VERIFIED |
| Server refresh rather than unproven realtime | Force-dynamic pages plus `revalidatePath`; no realtime subscription added | VERIFIED |

### Public storefront

| Requirement | Evidence | Status |
|---|---|---|
| Only published, active, non-expired, budget-valid offers | `listPublicOffers`; E2E P5-10 turns each condition off and the offer disappears | VERIFIED |
| City / district / category / radius filters | Form plus `listPublicOffers` | VERIFIED |
| PostGIS if available, otherwise district/lat-lng fallback | PostGIS is absent; haversine over privacy-rounded coordinates with a district-first fallback and an explicit no-location message | VERIFIED |
| No customer coordinates or PII published | Only rounded business coordinates exist; visitor location is a query parameter and is never persisted | VERIFIED |
| Public campaign page with QR/tracking, terms, expiry, business info | `/nearby/[slug]` | VERIFIED |
| View/click/save not counted as a visit | `nearby_offer_events` intent kinds; the page states it explicitly | VERIFIED |
| Redemption tied to a verified code/QR event | Redemptions arrive only via signed provider events or the loyalty QR path | VERIFIED |
| Owner can unpublish; empty/loading/error and no-location fallback | Status change hides the offer; all states rendered | VERIFIED |

### Impact pipeline and dashboard

| Requirement | Evidence | Status |
|---|---|---|
| Ingest deliveries, opens, clicks, QR scans, redemptions, transactions | `ingest_provider_event`, loyalty path, `recompute_campaign_impact` | VERIFIED |
| Raw events stored separately from derived metrics | `provider_events` versus `campaign_events` and `impact_measurements` | VERIFIED |
| Duplicate provider events do not double the result | Unique external event id; derived insert uses `on conflict do nothing` | VERIFIED |
| Baseline fixed before launch and immutable per measurement version | `impact_baselines` plus immutability trigger | VERIFIED |
| Small sample shows observed difference with an interval | Below `min_sample_size` the pipeline records `observed_difference` with an interval and a note | VERIFIED |
| Five kinds kept separate with visual labels | `KIND_META`, badge with glyph and word on every ledger row | VERIFIED |
| Formula, source, period, assumptions and missing data openable | Details disclosure on every ledger row | VERIFIED |
| Full KPI set, period compare, cursor pagination | 12 KPIs, previous-period delta, cursor-based "show more" | VERIFIED |
| TAMYR time jump with exact figures, DEMO badge, idempotent | E2E P5-11 | VERIFIED |

## Prompt 6 status — Admin Console, roles, templates, plans, privacy, scale (2026-08-01)

### Admin access

| Requirement | Evidence | Status |
|---|---|---|
| Admin routes are not merely hidden; access is checked server-side and by RLS | `src/app/admin/layout.tsx` calls `requirePlatformAdmin` on every render; each action re-checks; RLS re-checks in the database. E2E P6-1 shows a tenant owner redirected off every admin route | VERIFIED |
| `user_metadata` is never used for the role | pgTAP inspects the `is_platform_admin` body for `user_metadata` and asserts zero matches | VERIFIED |
| Platform admin confirmed via a private assignment table | `private.platform_admin_assignments`, no grants to `authenticated` | VERIFIED |
| Sensitive operations require a fresh check | `has_fresh_reauth(15 minutes)`; archive and rollback refuse without it | VERIFIED |
| All admin actions audited with actor, before, after, reason, timestamp | `admin_audit_log` + the `admin_audit` entry point; append-only trigger | VERIFIED |
| Demo admin exists only in DEMO_MODE/dev | The seeded `admin@qadam.local` assignment lives in `supabase/seed.sql`, which carries the local/dev-only guard | VERIFIED |

### Admin Dashboard

| Requirement | Evidence | Status |
|---|---|---|
| Active businesses, onboarding completion, active campaigns, tool activation, popular tools, template adoption, AI fallback/error rate, automation failures, platform event health | `platform_overview` returns all of these; the page renders them | VERIFIED |
| Filters by period, business type and city | Form on `/admin`; parameters passed into the aggregate | VERIFIED |
| Values come from aggregated data, not hardcoded cards | Every card reads `platform_overview`; E2E compares a card against a direct count | VERIFIED |

### CRUD

| Requirement | Evidence | Status |
|---|---|---|
| Tools: create, edit, archive, restore, publish | `/admin/tools` with `saveTool` and `setToolStatus` | VERIFIED |
| Categories: create, edit, reorder, deprecate with dependency guard | `/admin/categories`; deprecation refused while published tools remain | VERIFIED |
| Business types: add, edit, deprecate | Same screen; deprecation warns when active businesses use the type | VERIFIED |
| Templates: clone, edit, validate, version, publish, rollback, archive | `/admin/templates` with all six actions | VERIFIED |
| A published template version is immutable | `protect_published_template_version`; pgTAP asserts update and delete both refused | VERIFIED |
| Draft preview | `<details>` preview of the draft JSON before publication | VERIFIED |
| Schema validation | Content must parse as JSON and contain `mechanics`; both locales required to publish | VERIFIED |
| Publish is transactional and logged | `publish_template_version` freezes the version, repoints the template and audits in one transaction | VERIFIED |
| Owner catalogue shows only the published, compatible version | Owner tools query filters `status='published' and is_public`; E2E P6-4 shows the draft hidden and the published tool visible | VERIFIED |
| Hard delete refused where historical references exist | `guard_catalog_delete` on tools, categories, business types and templates | VERIFIED |

### Template content

| Requirement | Evidence | Status |
|---|---|---|
| Mechanics, cycles, channel copy, defaults, guardrails | Carried in `template_versions.content`, validated on publish | VERIFIED |
| RU/KK | `locales` must contain both before publication; pgTAP asserts a RU-only draft is refused | VERIFIED |
| Compatibility by business type | `compatible_business_types` on both template and version | VERIFIED |
| Migration path between schema versions | `migrates_from_version` + `migration_notes`, captured when a version is created | VERIFIED |
| An admin change never rewrites a historical Growth Contract snapshot | Contracts carry their own immutable `accepted_snapshot`; E2E P6-6 confirms snapshots are untouched across publish and rollback | VERIFIED |
| Five business-type template sets (coffee, salon, retail, service point, solo) | The versioning machinery and compatibility fields exist and are tested; the five curated content sets are **not** authored | PARTIAL |

### Team and RBAC

| Requirement | Evidence | Status |
|---|---|---|
| Five roles | `TENANT_ROLES`, matching the database CHECK | VERIFIED |
| Invitation flow with expiry, accept, revoke | `team_invitations` + `invite_team_member` / `accept_team_invitation`; token hashed, email masked | VERIFIED |
| The last owner cannot remove themselves without transfer | `guard_last_owner` trigger; `transfer_ownership` promotes then demotes in one transaction | VERIFIED |
| Role matrix documented and tested | `src/server/qadam/rbac.ts` is both; rendered on `/app/team` and asserted cell-by-cell | VERIFIED |
| Critical actions identified | `CRITICAL_CAPABILITIES`: billing, team, export, delete, limits, connector secrets, launch approval | VERIFIED |
| Cross-business role leakage tested | pgTAP: another tenant sees no invitations; earlier suites cover customers, campaigns and events | VERIFIED |

### Plans and entitlements

| Requirement | Evidence | Status |
|---|---|---|
| Free, Start, Growth, Pro, Partner as configurable records | Five plans, nine entitlement keys, 45 grant rows; no code branches on a plan code | VERIFIED |
| Server-side entitlements for businesses, locations, contracts/month, channels, automations, team size, AI quota | All nine keys defined and resolvable | VERIFIED |
| Idempotent usage counters | `consume_entitlement` keyed on a request key; pgTAP asserts a replay leaves the counter at one | VERIFIED |
| Over-limit explains the restriction without losing the draft | Studio surfaces plan, limit and usage; the wizard state is untouched | VERIFIED |
| Provider-neutral billing interface | `src/billing/provider.ts` | VERIFIED |
| No provider configured → checkout cannot be simulated in PRODUCTION_MODE | The default refuses in both modes; unit tests assert it | VERIFIED |
| Live billing marked BLOCKED | Stated on `/app/plan`, in REAL_VS_MOCK and in the RUNBOOK | VERIFIED |
| Webhook signature, idempotency, subscription state, grace period, audit | Schema and checklist in place (`billing_events`, `grace_period_ends_at`); enforcement lands with the adapter | PARTIAL |

### Internationalisation

| Requirement | Evidence | Status |
|---|---|---|
| RU and KK today | Message catalogue and glossary carry both | VERIFIED |
| Architecture allows new languages without touching domain logic | Adding a locale is a catalogue entry; domain modules never import the registry | VERIFIED |
| Timezone and ISO currency per business | `businesses.timezone` / `currency` feed `Intl` formatters | VERIFIED |
| Intl formatting | `formatMoney`, `formatDateTime`, `formatNumber`, `formatPercent` | VERIFIED |
| No concatenated UI text | Messages take named parameters; unit test asserts placeholders | VERIFIED |
| Strings survive expansion | Layout-budget test across locales | VERIFIED |
| Pluralization | `Intl.PluralRules`; Russian three-form behaviour asserted | VERIFIED |
| Separate glossary | `GLOSSARY` with per-term notes, tested | VERIFIED |
| Native KK review is a release gate | Emitted per asset since Prompt 4; restated here | VERIFIED |
| Financial formulas use minor units and currency metadata | Domain unchanged; formatting is presentation-only | VERIFIED |
| The RU/KK switcher drives server-rendered copy | It persists in `localStorage` and survives navigation, but server-rendered text is Russian | PARTIAL |

### Privacy and data lifecycle

| Requirement | Evidence | Status |
|---|---|---|
| Data inventory and PII classification | `data_inventory` table, rendered on the privacy page | VERIFIED |
| Purpose/scope consent | Consent scope resolution from Prompt 3, unchanged | VERIFIED |
| Export request | `privacy_requests` with a hashed, expiring export token | VERIFIED |
| Delete/anonymise request | `anonymize_customer`; E2E P6-10 | VERIFIED |
| Retention policy per record type | `retention_policies`, 13 declared types | VERIFIED |
| Immutable financial/audit records retained only anonymised | Transactions and redemptions keep amounts and lose the person; consent proof retained as revoked | VERIFIED |
| Signed export URL with expiry | `export_token_hash` + `export_expires_at` | VERIFIED |
| Admin cannot see customer PII without specific need | Platform analytics is aggregate-only and cohort-suppressed; E2E asserts zero PII in the markup | VERIFIED |
| Logs and AI traces redacted | Prompt 4 redaction; `input_hash` CHECK forces a digest | VERIFIED |
| Backup/restore policy documented | RUNBOOK, including how erasure interacts with snapshots | VERIFIED |
| The privacy page describes real behaviour | It renders the live inventory and retention tables | VERIFIED |
| Legal review flagged as an external gate | Stated on the page itself | VERIFIED |

### Performance foundation

| Requirement | Evidence | Status |
|---|---|---|
| Cursor pagination | Customers, impact ledger, admin lists | VERIFIED |
| Connection pooling for serverless access | Pooler port and rationale documented in RUNBOOK | VERIFIED |
| Query timeouts | `statement_timeout` / `idle_in_transaction_session_timeout` documented with values | VERIFIED |
| Short transactions | Lease → call → settle in the worker; no HTTP inside a transaction | VERIFIED |
| No N+1 | Page loaders batch with `Promise.all` and `in (...)`; the audience build is a single join | VERIFIED |
| Batch inserts for import and events | `import_customers` and the content pack insert in one statement | VERIFIED |
| Composite and partial indexes | Twelve added, six of them partial | VERIFIED |
| EXPLAIN ANALYZE on a realistic seed | `scripts/benchmark-explain.sql` at 50k/400k; results recorded in TEST_PLAN | VERIFIED |
| Monitoring plan | `pg_stat_statements` queries in RUNBOOK | VERIFIED |
| Partitioning deferred with a recorded threshold and migration strategy | RUNBOOK table for four candidate tables | VERIFIED |
| Benchmark data never leaves the tenant; cross-tenant aggregates only above a cohort threshold | `platform_overview` suppresses below five businesses | VERIFIED |

## Prompt 7 status — интеграция, безопасность, E2E, accessibility, performance, CI (2026-08-01)

Статус **VERIFIED** ставится только там, где есть воспроизводимое доказательство: тест,
скриншот или вывод команды. PARTIAL и BLOCKED оставлены честно.

### Owner E2E (`tests/e2e/owner.spec.mjs`, 56 проверок)

| # | Сценарий | Доказательство | Статус |
|---|---|---|---|
| 1 | Landing CTA → sign-up / demo login | Клик по настоящей ссылке ведёт на форму; кнопка DEMO_MODE есть; **CTA виден без JavaScript** | VERIFIED |
| 2 | Onboarding → demo/CSV → персональный Today | Создан бизнес, в базе есть строка, новый тенант не видит демо-сигнал | VERIFIED |
| 3 | Каталог: фильтр → избранное → активация → перезагрузка | `favorite_tools` и `business_tools` меняются и переживают перезагрузку; на экране «Активен» | VERIFIED |
| 4 | Сигнал −27%, 64 неактивных, 18 доступных | `change_bps = -2700`; `count(*) = 64`; `effective_consent_customers(...) = 18` | VERIFIED |
| 5 | Генератор возвращает 2–3 механики | `jsonb_array_length(output->'mechanics') = 3`; источник назван; `input_hash` — 64 hex | VERIFIED |
| 6 | Скидка 20% заблокирована | «Margin Shield запрещает»; кнопка сборки контракта заменена на заблокированную | VERIFIED |
| 7 | Подарок при пороге принят | Шаг 5 без запрета, числа на экране | VERIFIED |
| 8 | Growth Contract собран и подтверждён | Строка создана, снимок есть, статус `approved`, актор и время записаны | VERIFIED |
| 9 | RU/KK контент или детерминированный откат | 17 материалов, обе локали, предупреждение о носителе на экране | VERIFIED |
| 10 | Симулированный запуск → журнал | `activity_logs` растёт; ни одна кампания не помечена как реальная | VERIFIED |
| 11 | Скачок во времени → точные значения Impact Ledger | 18/15/9; influenced и incremental раздельно; `verified_fact = 0`; повтор идемпотентен | VERIFIED |
| 12 | Пауза автоматизации и аварийная остановка | Состояния из базы; стоп записывает кто/когда/почему; `send_gate` = false, после возобновления = true | VERIFIED |
| — | Ни одной ошибки в консоли за весь путь | Сбор `console` и `pageerror` по всему набору | VERIFIED |

### Customer E2E (`tests/e2e/customer.spec.mjs`, 36 проверок)

| # | Сценарий | Доказательство | Статус |
|---|---|---|---|
| 1 | Сканирование QR | Настоящий токен, выданный продуктом; неизвестный токен — 404; в URL нет PII | VERIFIED |
| 2 | Раздельные согласия | Лояльность обязательна, маркетинг — отдельный неотмеченный флажок | VERIFIED |
| 3 | Вступление | Клиент создан; **колонки под адрес в схеме нет**; хранится хеш и маска; оба согласия записаны | VERIFIED |
| 4 | Начисление | Запись в `loyalty_ledger`, тип `earn` | VERIFIED |
| 5 | Баланс | Значение из `loyalty_accounts` совпадает с экраном | VERIFIED |
| 6 | Погашение | Запись `redeem` со ссылкой на награду; баланс списан | VERIFIED |
| 7 | Повтор и replay заблокированы | Второй клиент не создан, начисление не удвоено; снятая галочка записана как `denied`; отозванный QR — 404 | VERIFIED |
| 8 | Отзыв согласия исключает из будущей аудитории | Аудитория 1 → 0; `send_gate` = false; доказательство отзыва сохранено; лояльность не затронута | VERIFIED |

### Admin E2E (`tests/e2e/admin.spec.mjs`, 45 проверок)

| # | Сценарий | Доказательство | Статус |
|---|---|---|---|
| 1 | Вход администратора | 200 на `/admin`, роль в шапке | VERIFIED |
| 2 | Создание, публикация, архивирование инструмента | Черновик → опубликован → архивирован; архив требует свежей проверки личности | VERIFIED |
| 3 | Создание и **изменение порядка** категории | Переименование и `sort_order` меняются, дубликат не создаётся, есть before/after в аудите | VERIFIED |
| 4 | Добавление типа бизнеса | Строка создана со статусом черновика | VERIFIED |
| 5 | Клон, версия, публикация, откат шаблона | Версия склонирована с примечанием о миграции; опубликованную изменить нельзя; откат перенаправляет и аудируется | VERIFIED |
| 6 | Каталог владельца получает опубликованную версию | Черновик невидим, после публикации виден | VERIFIED |
| 7 | Аналитика администратора | Карточки совпадают с прямым счётом; маленький срез скрыт; PII нет | VERIFIED |
| 8 | Прямой доступ не-администратора запрещён | Анонимный → `/login?next=%2Fadmin`; владелец тенанта отбит на **пяти** маршрутах; роль в приватной таблице; `user_metadata` не используется | VERIFIED |

### Security suite (85 проверок)

| Требование | Доказательство | Статус |
|---|---|---|
| Негативные two-tenant RLS тесты для **каждой** тенантной таблицы | 67 таблиц, список из схемы; чтение, присвоение чужого `business_id`, вставка в чужой тенант | VERIFIED |
| Матрица анонимного доступа | Ни одного права на запись; читаемы только 4 справочные таблицы; схема `private` недоступна | VERIFIED |
| Матрица ролей | Viewer не создаёт кампанию и не меняет лимиты; marketer не меняет лимиты; владелец не пишет каталог и аудит | VERIFIED |
| Попытка сменить `business_id` | Отклонено или не затронуло ни одной строки на всех 67 таблицах | VERIFIED |
| Обход UI через прямой вызов API | Тенант B не может перевести и запустить контракт тенанта A; состояние не изменилось | VERIFIED |
| Скан секретов и инспекция клиентского бандла | 51 чанк проверен по имени и по значению; `.env.example` без реальных значений | VERIFIED |
| Истечение сессии и выход | Выход только POST (GET → 405), сессия исчезает; поддельная cookie отклонена | VERIFIED |
| CSRF / Origin | Action с чужим Origin **не меняет данные** и отвечает ошибкой; тот же вызов с правильным Origin срабатывает | VERIFIED |
| Rate limit на auth, AI, QR, import, launch, export, jobs | Job-эндпоинт: 429 на 11-м вызове; AI: дневная квота и потолок стоимости; QR и импорт: idempotency + лимит строк | VERIFIED |
| Upload MIME/size/path | Импорт ограничен 1000 строк и длиной полей, отвергает некорректную строку; бакеты приватные | PARTIAL — разбор CSV идёт в браузере, серверной проверки MIME файла нет |
| Подпись и replay webhook | Отвергает неподписанное, неверно подписанное и **просроченное**; повтор не создаёт второй записи | VERIFIED |
| Инъекции и кривой CSV | SQL-подобный payload не роняет таблицу; кривая строка даёт `{"invalid": 1}` и не создаёт клиента | VERIFIED |
| XSS в контенте, заметках, шаблоне | Payload сохранён как данные, отрендерен экранированным, диалог не появился | VERIFIED |
| Безопасный рендеринг, без опасного HTML | Два использования `dangerouslySetInnerHTML` — константы; нет `innerHTML`, `eval`, `javascript:` | VERIFIED |
| Параметризованный доступ к SQL | Ни один файл не строит SQL строкой; миграции не склеивают операторы; `%I`/`%L` вместо `%s` | VERIFIED |
| Аудит зависимостей с триажем | Было 3 high (postcss, sharp через next) → `overrides` → **0 находок**; ломающий откат Next отвергнут | VERIFIED |
| Supabase advisors без нерешённых предупреждений | 0 находок security и performance | VERIFIED |
| Нет открытых SECURITY DEFINER и широких грантов | Все definer-функции фиксируют `search_path`; нет grant на `PUBLIC`; **отозваны TRUNCATE/TRIGGER/REFERENCES** | VERIFIED |
| Нет продакшн mock-эндпоинтов | Скачок во времени под двойным гейтом; демо-логин отказывает вне DEMO_MODE; ни один mock не называется фактом | VERIFIED |

### Quality

| Требование | Доказательство | Статус |
|---|---|---|
| Lint | 0 warnings | VERIFIED |
| Typecheck без подавленных ошибок | В репозитории нет `@ts-ignore` и `@ts-expect-error` | VERIFIED |
| Unit | 96/96 | VERIFIED |
| Integration | 194 pgTAP | VERIFIED |
| RLS | 22 проверки матрицы + pgTAP | VERIFIED |
| E2E | 137 проверок в браузере | VERIFIED |
| Продакшн-сборка | PASS | VERIFIED |
| Нет ошибок консоли и необработанных промисов | Каждый набор падает при первой | VERIFIED |
| Нет битых маршрутов и мёртвых главных кнопок | Найдены и исправлены четыре: CTA лендинга, «Назад к контракту», поиск, колокольчик | VERIFIED |
| Границы ошибок | Корневая, глобальная и в кабинете; PERF-6 их проверяет | VERIFIED |
| Сеть / офлайн / повтор | Офлайн-навигация падает чисто и восстанавливается; кнопка «Повторить» | VERIFIED |
| Сохранение после перезагрузки | Избранное, активация, черновик мастера | VERIFIED |
| Идемпотентность | Скачок во времени, вступление по QR, cycle key, webhook, `consume_entitlement` | VERIFIED |
| Таймзона и валюта | Контекст браузера `Asia/Almaty`; формат из метаданных бизнеса | VERIFIED |
| RU/KK без отсутствующих ключей | Unit-тест реестра: каждый ключ есть в каждой локали | VERIFIED |
| Точное соответствие seed | E2E и pgTAP начинаются со сброса; иначе цифры бессмысленны | VERIFIED |

### Accessibility

| Требование | Доказательство | Статус |
|---|---|---|
| Клавиатурные пути | Скип-ссылка первой; вход без мыши; нет положительного `tabindex` | VERIFIED |
| Видимый фокус | Стиль есть, глобального `outline: none` нет | VERIFIED |
| Семантические заголовки | 0 нарушений `heading-order` после четырёх исправлений | VERIFIED |
| Метки и связь с ошибкой | Все видимые поля подписаны; ошибка в `role="alert"` | VERIFIED |
| Ловушка фокуса в модальности | Мобильное меню: `aria-expanded`, открытие, закрытие | PARTIAL — настоящих модальных диалогов в продукте нет, проверено то, что есть |
| Контраст WCAG AA | 0 нарушений axe; токены подняты до 5.47:1 / 5.48:1 / 5.02:1 | VERIFIED |
| Цели 44 px | Ни одной цели меньше 24 px; интерактивные элементы `min-h-11` (44 px) | VERIFIED |
| Статус не только цветом | Состояние кампании передаётся текстом | VERIFIED |
| Reduced motion | CTA виден сразу, длинный pinned-скролл не включается | VERIFIED |
| Alt-тексты | У всех изображений; декоративные иконки скрыты | VERIFIED |
| Объявление асинхронного результата | `role="status"` и `role="alert"` на успехе и ошибке | VERIFIED |
| Нет горизонтальной прокрутки на 320 и 390 | Проверено на шести ширинах | VERIFIED |

### Visual и responsive

| Требование | Доказательство | Статус |
|---|---|---|
| 320, 390, 768, 1024, 1440 и широкий десктоп | Шесть ширин, прокрутки нет ни на одной | VERIFIED |
| Кинематографический скролл лендинга сохранён | Таймлайн не тронут; изменена только видимость без JS | VERIFIED |
| Дашборд без перехвата прокрутки | Пиннинг только на лендинге; в кабинете обычная прокрутка | VERIFIED |
| Нет обрезанного RU/KK текста | Overflow-проверка + бюджет длины строк в unit-тесте локализации | VERIFIED |
| Графики читаемы и подписаны | KPI подписаны текстом, не только цветом | PARTIAL — сложных графиков в продукте пока нет |
| Скелет загрузки не сдвигает вёрстку | `gotoReady` ждёт замены скелета; прокрутки нет в обоих состояниях | PARTIAL — CLS не измерялся отдельно |
| Скриншоты ключевых экранов | 35 файлов в `tests/e2e/screenshots/` | VERIFIED |

### Performance

| Требование | Доказательство | Статус |
|---|---|---|
| Замер продакшн-сборки | 1726 KB JS в 50 чанках, крупнейший 222 KB, CSS 47 KB | VERIFIED |
| Ленивая загрузка тяжёлого | gsap, recharts, qrcode, framer-motion не в общем входе | VERIFIED |
| Меньше ненужных клиентских компонентов | 57 из 128; **ни одна страница с данными тенанта не грузится с клиента** | VERIFIED |
| Оптимизация изображений и шрифтов | `next/image` с AVIF/WebP; шрифты через `next/font` | VERIFIED |
| Число запросов и медленные запросы | 164 запроса на три загрузки, самый медленный 27.7 мс | VERIFIED |
| Нет N+1 | Ни один запрос не повторяется по числу строк | VERIFIED |
| Курсорная пагинация | Клиенты, Impact Ledger, админские списки | VERIFIED |
| Нагрузочный тест | Today, клиенты, симулятор, «Акции рядом», лендинг; QR-вступление проверено в E2E, а не под нагрузкой | PARTIAL |
| Реалистичный начальный SLO без выдуманной ёмкости | Записан как «то, что выдержал один локальный инстанс» | VERIFIED |
| Настройки пула соединений | Порт пулера и таймауты в RUNBOOK | VERIFIED |
| p95, доля ошибок, соединения к базе | 329 мс / 0% / 22 | VERIFIED |
| Исправлены существенные регрессии | Устранено переполнение по ширине и падение при сбое базы | VERIFIED |

### CI

| Требование | Доказательство | Статус |
|---|---|---|
| Воспроизводимая установка из lockfile | `npm ci` во всех задачах | VERIFIED |
| lint / typecheck / unit / integration / build на PR | Задача `static` | VERIFIED |
| E2E против тестового окружения | Задача `e2e`: сборка, продакшн-сервер, три набора | VERIFIED |
| Реплей миграций и RLS-тесты | Задача `database`: чистый старт, pgTAP, RLS-матрица | VERIFIED |
| Сканирование секретов | Задача `secrets`: gitleaks по истории, запрет коммита `.env` | VERIFIED |
| Проверка дрейфа сгенерированных типов | `check:types-drift` локально и в CI | VERIFIED |
| Нет деплоя при упавших проверках | `deploy.yml` падает, если CI завершился неуспехом | VERIFIED |
| Разделение dev/staging/production | GitHub Environments, у каждого свой `SUPABASE_PROJECT_REF` | VERIFIED |
| Запрет продакшн-seed | Явная проверка в CI; deploy не применяет seed | VERIFIED |
| Реальный деплой | Нет привязанного проекта и хостинга — оба шага честно отказывают | BLOCKED |

### Documentation

| Требование | Где | Статус |
|---|---|---|
| README с точной установкой | `README.md` — переписан, прежний утверждал, что бэкенда нет | VERIFIED |
| `env.example` без секретов | Проверяется автоматически | VERIFIED |
| Команды миграций и seed | README + RUNBOOK | VERIFIED |
| Команды тестов | README, таблица из семи команд | VERIFIED |
| Демо-доступы только для демо | README, с явной оговоркой про DEMO_MODE | VERIFIED |
| Диаграмма архитектуры | ARCHITECTURE — mermaid, включая пунктиром неподключённое | VERIFIED |
| ERD | `docs/qadam/ERD.md`, **генерируется из живой схемы**: 80 таблиц, 139 внешних ключей | VERIFIED |
| Контракт API и домена | ARCHITECTURE + DATA_MODEL | VERIFIED |
| Матрица ролей | `src/server/qadam/rbac.ts`, отрисована на `/app/team` | VERIFIED |
| Real vs mock | REAL_VS_MOCK | VERIFIED |
| Бэкап и восстановление | RUNBOOK, с честной пометкой «не выполнялось» | VERIFIED |
| Runbook инцидентов и отката | RUNBOOK, S1–S3 | VERIFIED |
| AI-провайдер и откат | README + ARCHITECTURE | VERIFIED |
| Внешние блокеры | README, отдельная таблица | VERIFIED |

## Prompt 8 status — финальный release audit и SERPIN acceptance (2026-08-01)

Прогон с нуля: `rm -rf node_modules .next` → `npm ci` → реплей 25 миграций на пустую базу →
детерминированный seed → продакшн-сборка → 676 автоматических проверок, 0 падений.

### Release gates

| Гейт | Статус | Проверок | Что осталось вне нашей власти |
|---|---|---|---|
| G1 Product — пять связанных P0-потоков | PASS | 6/6 | — |
| G2 SERPIN feature set | PASS | 9/9 | — |
| G3 Data — миграции, seed, типы | PASS | 5/5 | — |
| G4 Security — изоляция, роли, секреты, лимиты | PASS | 5/5 | — |
| G5 AI — структура, откат, редакция, бюджет, согласие | PASS | 7/7 | — |
| G6 Finance — серверный симулятор, Margin Shield | PASS | 4/4 | — |
| G7 Trust — пять видов чисел раздельны | PASS | 4/4 | — |
| G8 QR — согласие, идемпотентность, защита от повтора | PASS | 6/6 | — |
| G9 UX — нет мёртвых кнопок, адаптивность, доступность, состояния ошибок | PASS | 4/4 | — |
| G10 Ops — наблюдаемость, CI, бэкапы, runbook | PASS | 6/6 | — |
| G11 Production — домены, ключи, коннекторы, биллинг | PASS_WITH_BLOCKERS | 6/6 | Платёжный договор, sandbox каналов, проект Supabase, хостинг |
| G12 Compliance — приватность, право, казахский | PASS_WITH_BLOCKERS | 8/8 | Юрист, носитель языка |

`PASS_WITH_BLOCKERS` означает: всё проверяемое без внешней стороны проверено и зелёное,
остальное названо заблокированным, а не пройденным.

### Требования промпта 8

| Требование | Доказательство | Статус |
|---|---|---|
| Перезапуск всех проверок с clean install, replay и детерминированным seed | `rm -rf node_modules .next && npm ci`; реплей 25 миграций; `seed-determinism.mjs` фиксирует 180/1129/64/18/−2700 до запуска любого набора | VERIFIED |
| Исправить failing critical/high в scope | Исправлены: зависимость от автоматических грантов Supabase (HIGH), серверный рендер локали (PARTIAL→сделано), устаревший текст о «неподключённом бэкенде» | VERIFIED |
| Финальный проход owner/customer/admin на production-like сборке | 139 проверок против продакшн-сборки и настоящей базы | VERIFIED |
| Инкогнито, refresh, direct URL, 390 px, 1440 px | 9 проверок в `demo-script.mjs`: холодный профиль, обновление посреди демо, четыре набранных URL, обе ширины с нулевым переполнением | VERIFIED |
| DEMO_MODE и PRODUCTION_MODE не смешиваются | Отдельный сервер собран и запущен в PRODUCTION_MODE; 27/27 | VERIFIED |
| — DEMO badge виден | Проверен на четырёх экранах кабинета | VERIFIED |
| — mock не становится fact | CHECK базы отклоняет вставку; `verified_fact` = 0 | VERIFIED |
| — в production нет demo login, time jump, fake connector | Кнопки нет, `/demo` редиректит, скачка нет, 0 подключённых каналов | VERIFIED |
| — no production seed | Seed local-only, CI проверяет, deploy не применяет | VERIFIED |
| — внешняя интеграция без ключей показывает Not configured | Автоматизации и тарифы пишут «не подключено» | VERIFIED |
| Сверка с актуальными Supabase/Next.js docs и changelog | Проверено 7 breaking changes 2026 года; два касались нас, один потребовал миграции | VERIFIED |
| Deploy на staging | Пользователь не предоставил проект и не давал разрешения | НЕ ВЫПОЛНЯЛСЯ |
| Пошаговый production runbook | `DEPLOY_RUNBOOK.md`: подготовка, dry run, staging, smoke, логи, откат, запреты | VERIFIED |

### Demo 4:30

| Шаг | Доказательство | Статус |
|---|---|---|
| 1. Лендинг и demo login | 200 на холодном профиле, один клик до кабинета | VERIFIED |
| 2. Онбординг из шести шагов | Сессия с номером шага; новая регистрация попадает в онбординг | VERIFIED |
| 3. Today: −27% | `change_bps = -2700`, совпадает с экраном | VERIFIED |
| 4. 64 → 18 | Обе цифры и объяснение разницы на одном экране | VERIFIED |
| 5. Скидка 20% заблокирована | Margin Shield отклоняет в интерфейсе | VERIFIED |
| 6. Безопасный подарок принят | Решение записано сервером на контракт | VERIFIED |
| 7. Growth Contract + RU/KK | Снимок и хеш; обе локали; пометка о носителе на экране | VERIFIED |
| 8. Симулированный запуск и история | Запись в журнале; ни одна кампания не выдана за реальную | VERIFIED |
| 9. Impact: influenced отдельно от incremental | Разные виды, `verified_fact` = 0 | VERIFIED |
| 10. Каталог: фильтр и избранное | Фильтр сужает, избранное пишется в базу | VERIFIED |
| 11. Admin: клон, версия, публикация | 11/11; опубликованная версия заморожена | VERIFIED |
| Помещается в 4:30 | 29 секунд машинного времени на весь путь | VERIFIED |

### SERPIN scoring audit

Самооценка с доказательством на каждый пункт. Там, где доказательства нет, стоит честная
оговорка, а не оценка.

**Problem — 20%.** Локальность, рабочий день владельца, страх за маржу и невозможность
конкурировать ценой показаны конкретно: 64 спящих клиента у конкретного заведения, маржа 42%,
скидка 20% отклоняется с расчётом. Первый экран — одно действие, а не двадцать графиков.
*Не доказано:* с реальными владельцами продукт не тестировался, интервью не проводились.

**Functionality — 25%.** Состояние меняется по-настоящему и сохраняется: избранное,
активация, черновик мастера, контракт, журнал — всё в базе и переживает перезагрузку
(проверено). QR mini-CRM с раздельными согласиями и идемпотентным журналом. Каталог с пятью
фильтрами. Кампания от цели до запуска за семь шагов. Аналитика с раздельными видами чисел.
Рекомендации. Admin CRUD с версионированием и аудитом. 676 проверок.
*Не доказано:* ни одно сообщение реально не отправлено.

**UX — 20%.** Одно главное действие на экране Today. Живой язык вместо терминов. 0 нарушений
axe на 26 сканах. Ноль горизонтального переполнения на шести ширинах от 320 до 1920.
Кинематографическая прокрутка лендинга сохранена, в кабинете — обычная. Локаль определяется
на сервере.
*Частично:* тексты экранов кабинета на казахский не переведены, и интерфейс говорит об этом
на казахском.

**Impact / Scale — 20%.** Вклад-маржа считается сервером до запуска. Impact Ledger разделяет
влияние и прирост и не называет фактом ничего, что фактом не является. Версионирование
шаблонов с настоящей неизменяемостью. Мультиарендность проверена на 67 таблицах. Тарифы —
данные, а не ветки в коде, что и делает архитектуру партнёрской.
*Не доказано:* нагрузка мерилась на одном локальном процессе; заявлений о ёмкости нет.

**Innovation — 15%.** Growth Contract как замороженный исполнимый пакет. Margin Shield,
который запрещает, а не предупреждает, и которого модель не может обойти. Контролируемый AI:
провайдер-независимый, со строгой схемой и гарантированным откатом, работающий и вовсе без
провайдера. Двуязычный контент с честной пометкой о непроверенном казахском. Outcome loop,
который различает пять видов чисел.
*Оговорка:* петля замкнута на смоделированных исходах — реальный факт появится только с
подключённым источником.

### Артефакты

| Документ | Содержание |
|---|---|
| `FINAL_ACCEPTANCE.md` | Итог 676 проверок, гейты, demo 4:30, команды воспроизведения |
| `PRODUCTION_READINESS.md` | Что готово, что блокирует, что нужно сделать нам, изменения платформы |
| `DEPLOY_RUNBOOK.md` | Подготовка, dry run, staging, smoke, логи, откат, запреты |
| `DEMO_SCRIPT.md` | Сценарий по секундам с репликами и ответами на вопросы |
| `TECHNICAL_DESCRIPTION.md` | Система, инварианты и чем они держатся |
| `KNOWN_LIMITATIONS.md` | 23 ограничения: заблокированные, частичные, непроверенные |
| `ERD.md` | 80 таблиц и 139 внешних ключей, генерируется из живой схемы |
