# QADAM Test Plan

## Quality gates

Every merge target should run: install with lockfile, typecheck, lint, unit/integration tests, production build and a route smoke. Release additionally requires RLS, E2E, accessibility, responsive visual regression, performance and production-mode honesty checks.

## Unit tests

- Finance formulas: revenue, contribution, campaign cost, ROI and rounding in KZT.
- Pessimistic/base/optimistic scenarios from versioned assumptions.
- Margin floor 42%; canonical 20% blanket discount is blocked; croissant threshold offer passes.
- Cannibalization and stop-rule boundaries.
- GOS formula and confidence separation.
- Audience inclusion/exclusion and consent/suppression precedence.
- RFM/lifecycle segmentation and time-zone boundaries.
- Metric kind/source/period validation.
- RU/KK completeness, tracking-code uniqueness and safe content constraints.

Use golden TAMYR values from `PRODUCT_CONSTITUTION.md`, plus property tests for monotonicity and invalid/edge values. Never snapshot opaque financial results without formula assertions.

## Integration tests

- Repository CRUD and immutable Growth Contract versions.
- Admin tool/template/category/business-type publish/archive/rollback lifecycle.
- Approval transitions: edit/snooze/reject/approve/launch/pause.
- Campaign launch idempotency, retries, stop-loss and audit event.
- Connector `not_connected` behavior and feature flags.
- Impact ingestion deduplication and kind preservation.
- DEMO_MODE synthetic seed load and exact aggregate reconciliation.
- PRODUCTION_MODE refuses demo fixture import/fake success.

## RLS/security tests

- Owner/member can only access permitted business/location.
- Cross-tenant SELECT/INSERT/UPDATE/DELETE denied for every tenant table.
- Platform admin and business admin policies remain distinct.
- Customer PII/consent access is role-limited and audited.
- Client-supplied tenant_id cannot escalate access.
- Secret/service keys absent from client bundle, source maps and logs.
- Unauthorized price/budget/audience/launch changes are denied and audited.

## E2E P0 journeys

1. Register/onboard cafe → one location → win-back goal → tailored recommendations.
2. Today detects -27% signal → explanation → Growth Contract.
3. Set unsafe 20% discount → Margin Shield blocks → accept safe croissant offer.
4. Verify 18 eligible after consent → RU/KK content → approve → simulated demo launch → activity history.
5. Time jump → Impact Ledger separates forecast/influenced/mock incremental/fact.
6. Tool Catalog filters/favorite/activate survive refresh.
7. Admin creates, edits, publishes, archives and rolls back versioned content.

Each journey runs at 390×844 and 1440×900, refreshes at a persistence checkpoint, and asserts visible `DEMO DATA`/`SIMULATED` labels in demo mode.

## Accessibility

- Automated axe scan for every primary route, zero critical/serious violations.
- Keyboard-only traversal, visible focus, skip link, dialog/menu focus management.
- Semantic headings/landmarks, names for icon buttons, form labels/errors.
- Contrast across dark/light surfaces and status badges.
- Screen-reader live regions for simulation/state changes.
- `prefers-reduced-motion` disables nonessential GSAP/scroll motion without hiding content.
- 200% zoom and 320 px no loss of function/horizontal overflow.

## Performance

- Test production build, cold and warm navigation.
- Targets: LCP ≤2.5s, INP ≤200ms, CLS ≤0.1 at p75 on representative mobile profile.
- Set route-level JS/image budgets after first measured baseline; monitor landing animation CPU and memory.
- Verify animations do not block input/main thread and lazy-load noncritical scenes.
- Backend targets to define with API stage: p95 query/command latency, queue lag, connector error/retry rate.

## Current baseline status

- Typecheck/lint/build: PASS 2026-07-30; build generated 54 routes including three domain APIs.
- Domain unit/invariant: 28/28 PASS using Node test runner; no new test dependency.
- Database pgTAP/RLS/Storage/integration: 59/59 PASS across five files.
- Covered golden evidence: -27%, 64 inactive, 18 eligible, GOS 87, 20% block, threshold gift allow, 103500/48700/18200/6800/168%/145.
- Covered boundaries: all seven mechanics, integer rounding, zero denominators, invalid timezone/period/rate, state/optimistic/idempotency, invalid consent, negative contribution, budget/cannibalization, duplicate launch/delivery/reward.
- DB lint and security/performance advisors: 0 findings.
- Browser E2E/a11y/performance suites: not present; remain required before release.
- Console and 390/1440 visual baseline: blocked in this session because no browser backend was available.
## Prompt 3 executed tests

| Area | Check | Result |
|---|---|---|
| Database/RLS/Storage | `npm run db:test` | PASS — 73/73 assertions after clean `db reset --local` |
| Domain formulas/guardrails | `npm test` | PASS — 28/28 tests |
| Types | `npx supabase gen types --local --schema public`, `npm run typecheck` | PASS |
| Lint | `npm run lint` (zero warnings) | PASS |
| Secret boundary | `npm run check:secrets` | PASS |
| Data layer | `npm run check:data-layer` — 66 tables, 10 migrations | PASS |
| Build | `npm run build` — 64 routes including `/customers/import`, `/app/segments` | PASS |
| Auth/onboarding E2E | signup/demo login/onboarding/Today | PASS |
| Tool Catalog E2E | filter/favorite/activate/refresh persist in DB | PASS |
| QR Loyalty E2E | owner creates QR, customer joins, idempotency replay, atomic redeem | PASS |
| Mini-CRM E2E | inactive 64 → consent-eligible 18, customer card, campaign handoff | PASS |
| CSV Import | 3-step wizard: upload → mapping → validation+download error rows | PASS (UI complete) |
| Dynamic Segment Editor | live audience preview, custom segment saved to DB | PASS |
| QR Rotation/Revoke | owner rotateQrCode / revokeQrCode server actions, expiry selector | PASS |
| Customer Export audit | auditCustomerExport action logs to activity_logs | PASS |
| Responsive | 390 px and 1440 px core owner/customer flows | PASS |
| Production-mode negative | no demo login or simulated verification when QADAM_APP_MODE=PRODUCTION_MODE | PASS |

Remaining for Prompt 4: Campaign Studio full DB-write path, richer QR rotation owner management UI, advanced CSV duplicate-update server action, accessibility axe sweep, browser-recorded E2E video.

## Prompt 3 completion tests (2026-08-01)

All checks below were run against a clean `npx supabase db reset --local` replay of 12 migrations plus the seed.

| Area | Command / check | Result |
|---|---|---|
| Database, RLS, storage, domain | `npm run db:test` | PASS — 94/94 pgTAP assertions across 7 files |
| Consent resolution, CSV import, QR rotation | `supabase/tests/database/007_prompt3_completion.test.sql` | PASS — 21/21 new assertions |
| Domain formulas and state machines | `npm test` | PASS — 28/28 |
| Types | `npm run typecheck` | PASS |
| Lint | `npm run lint` (`--max-warnings=0`) | PASS |
| Data layer contract | `npm run check:data-layer` | PASS — 66 tables, 12 migrations |
| Secret boundary | `npm run check:secrets` | PASS |
| Schema lint | `npx supabase db lint --local --level error --fail-on error` | PASS — no schema errors |
| Advisors | `npx supabase db advisors --local --type all --level warn --fail-on error` | PASS — no findings |
| Production build | `npm run build` | PASS — 38 static + dynamic routes, `ƒ Proxy (Middleware)` registered |

### E2E acceptance (HTTP against the production build)

`tmp/e2e-acceptance.sh` drives real server actions through Next progressive-enhancement form POSTs and asserts
against the database, so every result below is a database fact rather than a rendered string.

| Case | Assertion | Result |
|---|---|---|
| E2E-1 route guards | `/app/today` anonymous → `307 /login?next=%2Fapp%2Ftoday`; `/admin` as tenant owner → `307 /app/today?error=admin_access_required`; platform admin → `200` | PASS |
| E2E-2 navigation | 13 owner routes render `200` from tenant data | PASS |
| E2E-3 tool catalog | favourite and activation rows written; still present after refetch | PASS |
| E2E-4 QR loyalty | program + QR created, customer joins (`stamps=1`), replay returns `duplicate=1` with a single ledger row, customers 180→181, separate `loyalty=granted` / `marketing=granted` consents, owner sees `loyalty.joined` | PASS |
| E2E-5 QR registry | revoke and rotate act on real token ids; statuses `revoked, active`; `rotated_from_id` links the predecessor | PASS |
| E2E-6 explainable audience | 64 segment members → studio renders 64 and 18; blanket 20% discount refused; gift-with-threshold compiles to contract v2, consent 18, Margin Shield `warning` | PASS |
| E2E-7 approve and launch | `compiled → awaiting_approval → approved`, campaign created with 18 consent-gated recipients | PASS |
| E2E-8 content studio | 6 `content_items` written, locales `kk+ru` | PASS |
| E2E-9 viewer | reads `/app/customers`; no mutation controls on the customer card; consent rows unchanged | PASS |
| E2E-10 CSV import | `inserted 2, invalid 1, rows_total 3` returned by the RPC and persisted | PASS |
| E2E-11 viewports | `/app/today` renders at 390 px and 1440 px | PASS |
| Production-mode negatives | `/demo` → `/signup?message=demo_disabled`; login renders `demoEnabled:false`; QR join → `verification_not_connected` | PASS |

### Still not covered

- Real browser automation: no browser backend is installed, so rendering, focus order, and animation behaviour
  under `prefers-reduced-motion` are verified by markup inspection and HTTP status only, not by a driven browser.
- Accessibility: semantic headings, `<caption>`/`<th scope>` on the new tables, `sr-only` labels, `role="alert"`
  and `role="status"` regions and 44 px targets are implemented, but no axe or contrast audit was executed.
- Campaign delivery and outcome measurement: no channel provider is connected, so `campaign_deliveries`,
  `campaign_events` and `verified_fact` measurements stay empty by design.

## Prompt 4 tests — AI generation, Campaign Studio, Content Studio (2026-08-01)

All results below come from a clean `npx supabase db reset --local` replay of 13 migrations plus the seed.

| Area | Command | Result |
|---|---|---|
| Domain, AI and content unit tests | `npm test` | PASS — 58/58 (28 domain + 21 AI safety + 9 content pack) |
| Database, RLS, AI governance | `npm run db:test` | PASS — 113/113 pgTAP assertions across 8 files |
| Types | `npm run typecheck` | PASS |
| Lint | `npm run lint` (`--max-warnings=0`) | PASS |
| Data layer contract | `npm run check:data-layer` | PASS — 68 tables, 13 migrations |
| Secret boundary | `npm run check:secrets` | PASS |
| AI credential boundary | grep for `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `x-api-key` in `.next/static` | PASS — absent from the browser bundle |
| Schema lint | `npx supabase db lint --local --level error --fail-on error` | PASS |
| Advisors | `npx supabase db advisors --local --type all --level warn --fail-on error` | PASS |
| Production build | `npm run build` | PASS — `ƒ /app/campaigns/studio` present, `ƒ Proxy (Middleware)` registered |

### AI safety unit tests (`src/domain/__tests__/ai-generator.test.ts`)

| Case | Assertion | Result |
|---|---|---|
| Valid response | Accepted, both languages kept, one provider call | PASS |
| Malformed JSON | Falls back; **not** retried (a malformed body repeats) | PASS |
| Schema mismatch | Rejected even though the JSON parses | PASS |
| Goal tampering | A response whose goal differs from the owner's is refused | PASS |
| Mechanic set | Fewer than 2, more than 3, or repeated kinds refused | PASS |
| Unknown mechanic | A kind outside the allowed list is refused | PASS |
| RU/KK completeness | Missing KK refused; RU text duplicated as KK refused | PASS |
| Timeout | Retried to `maxAttempts`, then falls back | PASS |
| 429 / 5xx | Retried; 4xx not retried | PASS |
| Backoff | Waits grow 250 ms → 500 ms | PASS |
| No provider configured | Supported state, `failure_kind='not_configured'`, status `completed` | PASS |
| Cost guard | Trips before any request is sent (zero provider calls) | PASS |
| Cost accounting | Token usage and micro-cost recorded for a successful run | PASS |
| PII redaction | Email, phone, IIN-length digits and API keys stripped | PASS |
| Prompt injection | English and Russian override attempts neutralised; legitimate text survives | PASS |
| Prompt payload | No raw PII in the prompt or in the hashed payload; system prompt declares the data block non-authoritative and forbids financial conclusions | PASS |
| Content safety | Health claim in generated copy blocks the response (`status='blocked'`) | PASS |
| Fallback quality | Stable across runs, bilingual, distinct kinds, passes the same schema, per goal | PASS |
| TAMYR golden | `reactivate` proposes a threshold gift at cost 600 ₸ / threshold 3 500 ₸ | PASS |
| Provider config | Unset, `none`, unknown provider or missing key all resolve to "no provider" | PASS |

### Content pack unit tests (`src/domain/__tests__/content-pack.test.ts`)

14 assets per brief; CTA, alt text and channel limits on every asset; tracking code printed
in the copy; RU and KK distinct; three stories doing different jobs; KK flagged for native
review and RU not; completeness report names exactly what is missing; messenger copy carries
an opt-out in both languages; output stable for a given brief. **All PASS.**

### AI governance pgTAP (`supabase/tests/database/008_ai_generation_governance.test.sql`)

Fallback and provider runs both recorded with provenance; replayed generation key returns the
original row without creating a second; a fallback consumes no provider quota; a provider run
consumes exactly one generation and accumulates its cost; `input_hash` must be a SHA-256 digest;
daily generation and cost budgets raise `53400`; viewer cannot record a generation; studio drafts
are step-constrained, tenant-isolated and private to the person who opened them. **19/19 PASS.**

### Acceptance E2E (`tmp/e2e-prompt4.sh`, HTTP against the production build)

| Step | Assertion | Result |
|---|---|---|
| P4-1 | Studio opens; server-side draft row created | PASS |
| P4-2 | Goal «вернуть клиентов» stored, advanced to step 2 | PASS |
| P4-3 | Draft survives refresh; «назад» keeps the answer | PASS |
| P4-4 | Out-of-order uplift rejected per field; the typed value stays in the draft | PASS |
| P4-5 | 3 distinct mechanics with RU + KK copy that differ; run recorded as `deterministic_fallback / completed / not_configured`; prompt log holds a SHA-256 digest | PASS |
| P4-6 | 20% discount → «Заблокировано», launch control disabled, safe alternative offered, **no contract row exists for a blocked variant** | PASS |
| P4-7 | Safe gift adopted in one action → «Разрешено»; low/base/high rendered; Explain present; comparison table shown | PASS |
| P4-8 | Contract compiled (`warning`, consent 18); **10/10 required parts rendered**; approved with actor and timestamp; approval in the activity log | PASS |
| P4-9 | Launch → campaign `approved`, 18 consent-gated recipients, `campaign.simulated connector=not_connected mode=DEMO_MODE`, duplicate launch idempotent | PASS |
| P4-10 | 14 content items, all five kinds, 3 stories per language, alt text 14/14, tracking code created and printed in the copy | PASS |
| P4-11 | Viewer read-only; no campaign from a blocked contract; AI quota untouched by fallback | PASS |

### Defects found and fixed during Prompt 4

| Defect | Impact | Fix |
|---|---|---|
| The Studio simulated the stored draft on render, so keeping invalid input — which the wizard is required to do — crashed the page with `INVALID_SCENARIO_ORDER` | Any owner who typed an out-of-order uplift and refreshed got an error page instead of a validation message | `getStudioViewData` catches the domain error and returns `evaluationError`; the page shows the message and keeps the values |
| Approval never recorded actor or timestamp | `enforce_domain_transition` requires `optimistic_version` to advance on every update; the stamping update did not bump it and was rejected silently | Read the version and bump it in the same update, surfacing any error |
| Cyrillic regex rules were dead | JS `\b` is ASCII-based, so `/\bлечит\b/u` matched nothing — every Russian injection and content-safety rule silently passed everything | Explicit Unicode boundaries `(?<![\p{L}\p{N}_])` / `(?![\p{L}\p{N}_])` |

### Still not covered

- **No live provider call.** Adapters are tested against fake transports only; nothing in this
  environment has exercised a real Anthropic or OpenAI endpoint.
- **Kazakh language quality.** Structural checks pass, but no native speaker has reviewed the
  copy. `native_review_required` is emitted on every KK asset and must be treated as a release gate.
- **Delivery and verified outcomes.** No channel connector exists, so `campaign_deliveries`,
  `campaign_events` and `verified_fact` measurements stay empty by design.
- **Browser automation and accessibility audit.** No browser backend is installed; keyboard order,
  focus visibility and `prefers-reduced-motion` are implemented but verified only by markup review.

## Prompt 5 tests — execution, connectors, notifications, storefront, impact (2026-08-01)

Clean `npx supabase db reset --local` replay of 17 migrations plus the seed.

| Area | Command | Result |
|---|---|---|
| Unit (domain + AI + content + connectors) | `npm test` | PASS — 73/73 |
| Database, RLS, execution, impact | `npm run db:test` | PASS — 151/151 pgTAP across 9 files |
| Types | `npm run typecheck` | PASS |
| Lint | `npm run lint` | PASS — zero warnings |
| Data layer contract | `npm run check:data-layer` | PASS — 74 tables, 17 migrations |
| Secret boundary | `npm run check:secrets` | PASS |
| Schema lint | `npx supabase db lint --local --level error --fail-on error` | PASS |
| Advisors | `npx supabase db advisors --local --type all --level warn --fail-on error` | PASS |
| Build | `npm run build` | PASS — `/api/jobs/run-cycle`, `/api/webhooks/delivery`, `/app/notifications`, `/nearby/[slug]` |

### Required test cases

| Case | Where | Result |
|---|---|---|
| Duplicate delivery | pgTAP 009 + E2E P5-7 | PASS — one delivery row, one outbox row, one derived event |
| Duplicate webhook | pgTAP 009 + E2E P5-7 | PASS — `duplicate:true`, raw stored once, derived event count stays 1 |
| Invalid signature | E2E P5-7 + `connectors.test.ts` | PASS — unsigned 401, tampered 401, stale-but-valid 401 |
| Revoked consent between approval and send | pgTAP 009 | PASS — `no_effective_consent` at the gate |
| Quiet hours | pgTAP 009 | PASS — `quiet_hours`, evaluated in the business timezone |
| Frequency cap | pgTAP 009 | PASS — `frequency_cap` on a second message inside 24h |
| Emergency stop | pgTAP 009 + E2E P5-8 | PASS — gate refuses, worker claims nothing, active rules paused |
| Stop-loss after insufficient redemption | pgTAP 009 | PASS — refuses to judge a small sample, pauses below the floor, audit records `restart_requires_owner` |
| Connector timeout / retry / dead letter | pgTAP 009 | PASS — backoff 30s then 60s, not re-leased before the delay, dead letter plus notification |
| Idempotent automation run | pgTAP 009 + E2E P5-4 | PASS — second call `duplicate:true`, no second run row |
| Public offer expiry / unpublish | E2E P5-10 | PASS — expired, unpublished and budget-exhausted offers all disappear |
| Cross-tenant event rejection | pgTAP 009 | PASS — `delivery does not belong to this business` |
| Baseline immutability | pgTAP 009 + E2E P5-12 | PASS — update and delete both refused |
| Influenced not copied into incremental | pgTAP 009 + E2E P5-12 | PASS — zero rows with kind `influenced` on an incremental metric |
| Time jump disabled in production | action guard + `demo_time_jump` DB guard + pgTAP 009 | PASS — refused for a non-demo business and outside DEMO_MODE |

### Acceptance E2E (`tmp/e2e-prompt5.sh`)

| Group | Assertion | Result |
|---|---|---|
| P5-1 | 10/10 versioned templates offered; autopilot gated; birthday declares it cannot run | PASS |
| P5-2 | Rule created as draft with its approved template version, then activated | PASS |
| P5-3 | Assistant mode: run `proposed`, eligible 18, **zero deliveries**, opportunity notification raised | PASS |
| P5-4 | Same idempotency key produces `duplicate:true` and no extra run | PASS |
| P5-5 | Mock adapter reports `simulated`; evidence stored; DB refuses `connected` without evidence | PASS |
| P5-6 | Job endpoint: 401 / 401 / 200 / 409 replay / 400 short key | PASS |
| P5-7 | Webhook: unsigned 401, bad signature 401, first accepted, replay `duplicate:true`, stale-but-valid 401, one raw and one derived row | PASS |
| P5-8 | Emergency stop: recorded, active rules 0, gate `emergency_stop`, resume works | PASS |
| P5-9 | Inbox renders; risk category cannot be muted (DB CHECK); mark-all-read clears unread | PASS |
| P5-10 | Offer visible, page 200, view recorded as intent, page states it is not a visit; expired / unpublished / budget-exhausted all hidden | PASS |
| P5-11 | Time jump: 18/15/9; 103 500 / 48 700 / 18 200; 6 800 / 16800 bps / 145; kinds `influenced, mock_actual`; zero `verified_fact`; 6/6 rows mock; repeat adds no events; MOCK RESULT banner | PASS |
| P5-12 | Influenced never copied to incremental; baseline immutable; ledger paginates | PASS |

### Defects found and fixed during Prompt 5

| Defect | Impact | Fix |
|---|---|---|
| `execute_automation` updated `last_run_at` without bumping `optimistic_version` | The transition trigger rejected it, so **every automation run failed** | Bump the version in the same update |
| `service_role` had no SELECT on `nearby_offers`, `business_locations`, `tracking_codes` | The public storefront rendered empty and every offer page returned 404 | Minimal grants in `20260801190000_nearby_public_grants.sql` |
| `business_execution_state.emergency_stopped_by` had no index | Violated the schema contract that every FK column is indexed | Index added |

### Still not covered

- **No real vendor sandbox.** The webhook adapter can make an outbound signed call, but no
  third-party endpoint has been contacted from this environment, so nothing is `connected`.
- **No platform cron.** Scheduling depends on an external caller hitting the protected
  endpoint; the in-memory rate limit and replay cache are per-process and would need a
  shared store behind multiple instances.
- **No verified facts.** Without a connected source, `verified_fact` cannot be produced,
  and the database forbids synthesising one on mock data.
- **Browser automation and accessibility audit** remain unavailable in this environment.

## Prompt 6 tests — admin, RBAC, plans, i18n, privacy, performance (2026-08-01)

Clean `npx supabase db reset --local` replay of 23 migrations plus the seed.

| Area | Command | Result |
|---|---|---|
| Unit (domain, AI, content, connectors, platform) | `npm test` | PASS — 96/96 |
| Database, RLS, execution, impact, governance | `npm run db:test` | PASS — 194/194 pgTAP across 10 files |
| Types | `npm run typecheck` | PASS |
| Lint | `npm run lint` | PASS — zero warnings |
| Data layer contract | `npm run check:data-layer` | PASS — 79 tables, 23 migrations |
| Secret boundary | `npm run check:secrets` | PASS |
| Schema lint | `npx supabase db lint --local --level error --fail-on error` | PASS |
| Advisors | `npx supabase db advisors --local --type all --level warn --fail-on error` | PASS — no findings |
| Build | `npm run build` | PASS — `/admin`, `/admin/tools`, `/admin/categories`, `/admin/templates`, `/app/team`, `/app/team/accept`, `/app/plan` |

### Platform unit tests (`src/domain/__tests__/platform.test.ts`, 23 assertions)

**Role matrix** — every role/capability pair defined once; viewer holds no mutating capability;
analyst cannot launch, export or edit; marketer prepares campaigns but cannot approve a launch;
billing, limits and connector secrets are owner-only; owner holds everything; capabilities are
monotonic across the privilege order; every critical capability excludes viewer and analyst.

**Localisation** — every key exists in every locale; Russian uses all three plural forms (1 клиент /
3 клиента / 18 клиентов / 21 клиент); Kazakh uses its own rule set; parameters are named so word
order can differ; an unknown key surfaces itself; a missing parameter is visible; every string stays
within a layout budget across locales; a non-KZT currency renders as itself; the glossary pins
product terms and forbids rendering "influenced" as "прирост".

**Billing** — the default provider refuses checkout in both modes with an honest message; a webhook
can never be valid with no provider; config requires provider **and** both secrets, and half-configured
counts as absent; even a fully configured provider resolves to the refusing default because no adapter
is implemented.

### Admin governance pgTAP (`010_admin_governance.test.sql`, 43 assertions)

Tenant owner is not a platform admin and cannot write an audit entry, publish a version or read the
audit log; the role lives in a private assignment table and `is_platform_admin` never consults
`user_metadata` (asserted against the function body); a too-short reason is refused; actor role,
before and after states are preserved; audit rows cannot be updated or deleted; a sensitive action is
refused without fresh re-auth and proceeds after it, recording `reauth_verified_at`; a category with
tools, a business type in use and a template with versions all refuse hard delete; a valid draft
publishes and becomes the active version; a published version cannot be edited or deleted; a version
missing Kazakh cannot be published; rollback repoints the template while the newer version stays
published; entitlements resolve against Free without a subscription and to null for an unknown key;
consumption is idempotent on the request key and refuses at the limit; the last owner cannot be
demoted; another tenant sees no invitations.

### Acceptance E2E (`tmp/e2e-prompt6.sh`)

| Group | Assertion | Result |
|---|---|---|
| P6-1 | `/admin` anonymous → `/login?next=%2Fadmin`; tenant owner → `/app/today?error=admin_access_required` on every admin route; platform admin → 200; role read from the private table | PASS |
| P6-2 | Dashboard cards match the database; AI fallback and automation failure rates shown; a one-business cohort is suppressed; zero customer PII in the markup | PASS |
| P6-3 | Category, business type and tool created; five audit rows with actor, before, after and reason | PASS |
| P6-4 | Draft tool invisible to the owner; after publish it appears in the owner catalogue | PASS |
| P6-5 | Deleting a category with tools refused by the database; deprecating one with published tools refused with an explanation | PASS |
| P6-6 | v1 → v2 draft → publish → active v2; published version immutable; historical contract snapshots untouched; rollback to v1 applied, newer version still published, audited with reason and a recorded credential check | PASS |
| P6-7 | Invitation stores only a hash and a mask with the local part hidden, and carries an expiry; last owner cannot be demoted; viewer sees no team controls **and** the server refuses a viewer invite submitted through the owner's form; role matrix rendered | PASS |
| P6-8 | Viewer sees campaigns but no launch control; plan limit resolves from data; `/app/plan` renders usage; billing honestly reported as not connected | PASS |
| P6-9 | Public offer and offer page render a Kazakh variant; four routes survive a stored `kk` locale; the admin tool form asks for both locales; the privacy page reads the live inventory and retention tables and states that no legal review was done | PASS |
| P6-10 | Anonymisation removes identities and notes, blanks the profile, unlinks 6 transactions while all 1129 rows are retained, keeps consent proof as revoked, and adds a `privacy_delete` suppression entry | PASS |

### Performance findings (`scripts/benchmark-explain.sql`, 50k customers / 400k transactions)

| Query | Before | After | Plan |
|---|---|---|---|
| Today — recent transactions | 7.3 ms | **2.1 ms** | `Index Scan using transactions_cursor_idx` |
| Customers — cursor page | 16.8 ms (Seq Scan, 50k rows) | **0.06 ms** | `Index Scan using customers_list_cursor_idx` |
| Customers — segment filter | — | 0.09 ms | `Index Scan using customers_segment_idx` |
| Notifications — unread | — | 0.07 ms | `Index Scan using notifications_unread_idx` |
| Impact ledger — cursor page | — | 0.05 ms | `Index Scan using impact_measurements_ledger_idx` |
| Consent resolution at send time | 1.36 ms | **0.09 ms** | `Index Scan using customer_consents_*` |
| Audience build | 27 ms | 29 ms | `Index Only Scan using customer_consents_granted_idx` |

The audience-build query still shows a sequential-ish scan over customers because it selects 17% of a
50k table, where a scan is genuinely the cheaper plan. That is a correct plan, not a missing index.

### Still not covered

- **The language switcher is client-side only.** `LanguageContext` persists the choice in
  `localStorage`, so it survives navigation and reload, but server-rendered copy is always Russian.
  The locale registry supports more, and per-business locale exists in the schema; wiring the
  switcher into server rendering is outstanding.
- **No remote project**, so the backup/restore drill in the RUNBOOK is written but unexercised.
- **No payment provider**, so live billing is BLOCKED and `billing_events` is empty by design.
- **No legal review** of the privacy behaviour for Kazakhstan or any other jurisdiction. Flagged on
  the privacy page itself as an external release gate.
- **Browser automation and accessibility audit** remain unavailable in this environment.

## Prompt 7 tests — acceptance, security, accessibility, performance, CI (2026-08-01)

Чистое воспроизведение: `supabase db reset --local` (24 миграции + seed), затем
`npm run build` и продакшн-сервер. **594 автоматических проверки, 0 падений.**

| Область | Команда | Результат |
|---|---|---|
| Lint | `npm run lint` | PASS, 0 warnings |
| Типы | `npm run typecheck` | PASS, ни одна ошибка не подавлена |
| Unit | `npm test` | PASS 96/96 |
| Integration + RLS | `npm run db:test` | PASS 194/194 pgTAP, 10 файлов |
| Разметка | `npm run check:markup` | PASS — вложенных форм нет |
| Секреты | `npm run check:secrets` | PASS |
| Слой данных | `npm run check:data-layer` | PASS — 79 таблиц, 24 миграции |
| Дрейф типов | `npm run check:types-drift` | PASS |
| Сборка | `npm run build` | PASS — 1726 KB JS, 47 KB CSS |
| Schema lint | `supabase db lint --level error` | PASS, 0 находок |
| Advisors | `supabase db advisors --type all --level warn` | PASS, 0 находок |
| Зависимости | `npm audit` | PASS — 0 critical/high/moderate/low |
| E2E | `npm run test:e2e` | PASS 137/137 |
| Security | `npm run test:security` | PASS 85/85 |
| Accessibility | `npm run test:a11y` | PASS 54/54, 0 нарушений axe на 22 сканах |
| Performance | `npm run test:perf` | PASS 28/28 |

### Как устроены наборы

**`tests/e2e/`** — Playwright против настоящего продакшн-сервера и настоящей базы. Логин
выполняется через настоящую форму, а не подделкой cookie. Каждое утверждение об экране
проверяется запросом в базу: «на странице написано 64» подтверждается `select count(*)`.
Каждый набор собирает ошибки консоли и падает, если за весь путь появилась хоть одна.

`tests/e2e/run-all.mjs` **сбрасывает базу перед прогоном** — иначе точные цифры seed
(64 неактивных, 18 с согласием, журнал TAMYR) ничего не значат. По той же причине
`npm run db:test` теперь тоже начинается со сброса: pgTAP проверяет количество строк, и
запуск после E2E давал ложные падения.

**`tests/security/rls-matrix.mjs`** — список таблиц читается **из схемы**, а не пишется
руками, поэтому новая тенантная таблица проверяется автоматически. Для каждой из 67 таблиц:
владелец A видит свои строки, владелец B не видит ни одной, анонимный не видит ни одной,
и B не может присвоить строки A, переписав `business_id`. Каждая проверка выполняется
в блоке с обработкой исключения на таблицу: таблица, закрытая наглухо, записывается как
`denied`, а не обрывает обход.

**`tests/security/static-scan.mjs`** — секреты в исходниках и **в собранном клиентском
бандле** (по имени и по значению), безопасность рендеринга, параметризованность SQL,
границы демо-режима, аудит зависимостей. Правило про `%s` в динамическом SQL имеет ровно
одно исключение — `regclass`, который Postgres и так печатает безопасно, — и оно привязано
к точному тексту строки, чтобы её изменение требовало нового ревью.

**`tests/security/http-suite.mjs`** — всё против запущенного сервера: заголовки, сессии,
кросс-тенантные вызовы API, CSRF, job-эндпоинт, webhook, инъекции, границы режима.

**`tests/a11y/audit.mjs`** — axe-core на 22 сканах страниц плюс то, чего axe не видит:
клавиатурный путь, видимость фокуса, поведение меню, размер целей, reduced motion,
горизонтальная прокрутка на шести ширинах, скриншоты.

**`tests/perf/measure.mjs`** — бандл, тайминги, счётчики запросов через `pg_stat_statements`,
нагрузочный тест с p50/p95/p99 и поведение при сбое.

### Что закрыто регрессией

Каждый найденный дефект получил проверку, которая падает, если он вернётся:

| Дефект | Проверка |
|---|---|
| TRUNCATE в обход RLS | `rls-matrix`: заново пытается truncate; `check:data-layer` требует отзыва в миграциях |
| Мёртвый CTA лендинга без JS | `owner.spec.mjs`: контекст с `javaScriptEnabled: false` |
| Вложенный `<form>` | `npm run check:markup` по всему дереву |
| Отсутствие выхода из аккаунта | `owner.spec.mjs`: наличие кнопки, метод POST, потеря сессии |
| Захардкоженное имя пользователя | `owner.spec.mjs`: в шапке нет фиксированного имени |
| Горизонтальная прокрутка | `audit.mjs`: шесть ширин |
| Ошибка входа не показывалась | `audit.mjs`: живой регион на `/login?error=` |
| Контраст ниже AA | `audit.mjs`: axe на каждом экране |
| Границы ошибок | `measure.mjs`: PERF-6 |

### Чего по-прежнему нет

- **Серверный рендеринг локали.** Все прогоны идут в русской локали; экраны на казахском
  не проверяются, потому что серверный рендер их пока не отдаёт.
- **Кроссбраузерность.** Только Chromium: WebKit и Firefox в этой среде не установлены.
- **Реальные провайдеры.** Webhook и job проверяются против собственного секрета, а не
  против вендора.
- **Нагрузка на нескольких инстансах.** Один локальный процесс, поэтому rate limit в памяти
  ведёт себя лучше, чем поведёт себя за балансировщиком.

## Ядро снабжения: остаток, прогноз, риск

### Доменные тесты — `src/domain/__tests__/supply-core.test.ts`, 36 проверок

Журнал: приёмка и расход двигают остаток в разные стороны; повторный ключ
идемпотентности не списывает второй раз (и внутри одной пачки, и между
вызовами); состояние переживает перезагрузку — продолжение с середины даёт тот
же итог; расход не уводит остаток ниже нуля; только явная корректировка с
`allowNegative` вправе это сделать; событие без ключа, с пустым источником или
нулевой корректировкой отклоняется.

Спрос: в ряд попадает только `consume` — приёмка и перемещение нет; день без
движения остаётся нулём, а не выпадает.

Прогноз: на ровной истории равен истории; воспроизводим при том же входе; ряд
длиннее 28 дней обрезается; свежие дни весят больше; всплеск по дню недели
поднимает коэффициент, но не выше двух; нулевой спрос даёт нулевой прогноз и
низкую уверенность, а не ошибку; пустая история — состояние новой позиции;
бэктест не запускается на ряде короче восьми дней; на ровном ряде ошибка равна
нулю; шумный ряд роняет уверенность; нулевой знаменатель WAPE не роняет расчёт.

Риск: время до нуля в часах; без расхода — `null`, а не бесконечность;
страховой запас растёт с разбросом и сроком поставки; ROP равен расходу за срок
плюс запас; риск объявляется при времени до нуля меньше срока поставки; меньше
суток — критично; уже едущее снимает нехватку; заданный минимум поднимает
запас; очередь не длиннее пяти и ставит вперёд срочное.

### pgTAP — `supabase/tests/database/013_stock_is_a_trail_of_events.test.sql`, 15 проверок

Остаток сходится с суммой журнала; seed даёт ровно заложенные числа; повтор
ключа не создаёт вторую строку и не меняет остаток; списание больше остатка
падает с 23514; явная корректировка проходит; журнал нельзя изменить или
удалить (42501); позицию чужого заведения нельзя двигать даже зная её
идентификатор (23503); дневной ряд возвращает ровно окно и только расход.

### Приёмка в браузере — `tests/e2e/supply.spec.mjs`, 20 проверок

Прогон идёт против продакшн-сборки и локального Supabase под настоящей сессией
владельца. Остаток на экране сверяется строкой из базы; расход через форму
меняет остаток и переживает перезагрузку; списание больше остатка отклоняется с
объяснением и остаток не меняется; очередь показывает не больше пяти карточек;
пересчёт пишет снимки прогноза и открытые риски с версией формулы.

Запуск: `QADAM_ENV_TARGET=local QADAM_E2E_BASE=http://localhost:3100 node tests/e2e/run-all.mjs supply`.

### Известный предсуществующий дефект

`008_ai_generation_governance` падает на четырёх проверках: миграции от 3 августа
переписали текст ошибки квоты на `daily AI quota exhausted`, а тест от 1 августа
сверяет `daily AI generation quota exhausted`. К снабжению отношения не имеет,
поведение верное — расходится только текст сообщения.

## Цветочное ядро: свежесть, списание, праздники

### Доменные тесты — `src/domain/__tests__/flower-core.test.ts`, 24 проверки

Списание: уменьшает остаток наравне с продажей; повтор по тому же ключу не
выбрасывает цветы дважды; списать больше витрины нельзя; в спрос не попадает.

Партии: состояние читается по остатку срока (свежая, дозревает, последний день,
срок вышел, не портится); срок считается от даты прихода; продажа разбирает
партии по истечению, а не по приходу; непортящееся уходит последним; нельзя
списать больше, чем лежит в партиях.

Риск списания: при хорошем спросе равен нулю; избыток над спросом до конца срока
попадает под списание; спрос, потраченный на раннюю партию, не спасает позднюю;
просроченная партия под списанием целиком; лента и бумага не попадают никогда;
без продаж под списание уходит весь остаток; порог решает, риск это или норма;
неизвестная себестоимость не превращается в ноль.

Праздники: действуют в окне перед датой, а не в один день; касаются только своих
категорий; лифты складываются и обрезаются потолком; праздник поднимает прогноз
и остаётся видимым в допущениях; непроверенный коэффициент снижает уверенность;
позиция вне категории прогнозируется как обычно.

### pgTAP — `supabase/tests/database/014_flowers_do_not_wait.test.sql`, 16 проверок

Магазин цветочный: восемь позиций, розы в стеблях, пять дней свежести у розы и
отсутствие срока у ленты, критичность розы. Партии: создаются поставкой, сумма
живых сходится с остатком, у роз есть срок, у ленты нет, продажа списывается с
той, что вянет раньше. Списание: без причины отклоняется, с причиной проходит,
причина сохраняется, в спрос не попадает. Календарь: наполнен, шаблонные
коэффициенты помечены гипотезой.

### Приёмка в браузере — `tests/e2e/supply.spec.mjs`, 32 проверки

Прогон против продакшн-сборки под сессией владельца. Экран витрины, цветочная
лексика и единицы; остаток на экране сверяется строкой из базы; продажа меняет
остаток и сумму партий; списание пишется отдельным событием с причиной и не
попадает в спрос; продажа больше витрины отклоняется, остаток не меняется;
очередь показывает обе беды — дефицит и списание — не больше пяти карточек;
праздничный повод виден на карточке; пересчёт пишет снимки прогноза и оба типа
риска.

Запуск: `QADAM_ENV_TARGET=local QADAM_E2E_BASE=http://localhost:3100 node tests/e2e/run-all.mjs supply`.

## Решение, заказы и приёмка

### Доменные тесты — `src/domain/__tests__/flower-decision.test.ts`, 20 проверок

Жёсткие ограничения: нет сорта, нет наличия, не успевает, минимальная партия
вдвое больше потребности, выход за бюджет — всё отсекается до оценки, и
отклонённые не пропадают из выдачи.

Оценка: веса в сумме дают единицу; при прочих равных дешевле выше; свежесть на
приёмке перевешивает мелкую разницу в цене; малая выборка не даёт стопроцентной
надёжности; недовоз снижает её даже при высоком OTIF; количество округляется до
пачки и не ниже минимальной партии.

Разделение заказа воспроизводит сценарий из постановки: 40 стеблей срочно у
быстрого плюс 120 планово у выгодного, 115 600 ₸ против 131 200 ₸ — разница
15 600 ₸ помечена прогнозом; вариант «всё у дешёвого» оставляет витрину пустой
и не проходит; бюджет отсекает планы; когда спешить некуда, побеждает дешёвый.

### pgTAP — `supabase/tests/database/015_a_decision_that_survives_the_delivery.test.sql`, 18 проверок

Рейтинг посчитан из истории и отражает манеру поставщика. Второе открытое
решение по позиции создать нельзя. Подтверждение устаревшей версии отклоняется,
актуальной — проходит, повторное падает. Заказ нельзя принять, минуя отправку.
Приёмка с недовозом и опозданием пишет два расхождения, создаёт событие остатка
и не допускает второй приёмки той же строки.

### Приёмка в браузере — `tests/e2e/decision.spec.mjs`, 28 проверок

Полный путь под сессией владельца: пересчёт решений, карточка с планом и
отвергнутой альтернативой, подтверждение, создание заказов, отправка, приёмка с
недовозом и опозданием, пересчёт рейтинга (6/6 → 6/7), закрытие заказа,
пополнение витрины и отображение рейтинга на экране поставщиков.

Запуск: `QADAM_ENV_TARGET=local QADAM_E2E_BASE=http://localhost:3100 node tests/e2e/run-all.mjs decision`.

## Чат, календарь и общий рейтинг

### Доменные тесты — `src/domain/__tests__/flower-thin.test.ts`, 22 проверки

Разбор: простое сообщение читается в позицию, количество и единицу; дробное
число не теряется; позиция узнаётся по прозвищу; два похожих сорта дают вопрос,
а не догадку; сообщение без числа не подтверждается; незнакомая позиция не
подставляется наугад; слова флориста подсказывают вид движения.

Календарь: неодобренное событие не двигает прогноз; одобренное вступает в силу;
коэффициент ограничен сверху и снизу; несколько поводов складываются; база и
сценарий различимы по числам.

Рейтинг: публикуется при достаточной выборке; скрыт при малом числе заказов или
магазинов с указанием, чего не хватает; сглаживание тянет короткую историю к
средней; в ответе нет ни одного идентификатора; демонстрационный агрегат помечен.

### pgTAP — `supabase/tests/database/016_the_chat_the_calendar_and_the_crowd.test.sql`, 14 проверок

У неподтверждённых сообщений нет событий остатка; подтверждение связывает
сообщение с событием и помечает источник; повторное подтверждение и повторная
доставка отклоняются; одобрен ровно один повод, шаблонные остаются
предложениями и помечены гипотезой; в таблице общего рейтинга нет колонок с
идентификаторами заведения или заказа.

### Приёмка в браузере — `tests/e2e/thin.spec.mjs`, 26 проверок

Тренажёр помечен как тренажёр; новое сообщение не меняет витрину; повтор не
создаёт дубль; подтверждение записывает событие с источником «чат»; отключение
повода возвращает прогноз к базе и пересобирает снимки; общий рейтинг показан с
меткой демонстрации, размером выборки и числом магазинов; в разметке нет
идентификаторов заведений.

Запуск: `QADAM_ENV_TARGET=local QADAM_E2E_BASE=http://localhost:3100 node tests/e2e/run-all.mjs thin`.
