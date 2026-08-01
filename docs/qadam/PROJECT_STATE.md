# QADAM Project State

Snapshot: 2026-07-30, Asia/Almaty. Scope: Prompt 2 deterministic domain core, local environment only.

## Outcome

Deterministic business core is implemented outside React and route handlers. Server API recalculates untrusted previews from RLS-protected data, and Postgres independently rejects invalid state, consent, limits and economics paths. Existing visual components, composition and animations were not redesigned.

No remote Supabase link, `db push`, production seed, commit, push or deploy was performed. This directory still has no `.git`, so `git diff/status` are unavailable.

## Domain modules

| Module | Verified responsibility |
|---|---|
| `business-twin.ts` | units/currency/timezone validation; derived provenance; readiness/missing data |
| `signals.ts` | same-timezone weekday/time comparisons; quiet/repeat/inactive/capacity/data-quality signals; no causal claim |
| `segments.ts` | RFM/lifecycle rules, versioned explainable memberships, consent-first final audience |
| `gos.ts` | exact weighted GOS v1 with green-status financial/consent/limit guards |
| `simulator.ts` | seven mechanics, low/base/high, fixed-point KZT economics and explanations |
| `margin-shield.ts` | per-order/total contribution, floor, budget, cannibalization and safe alternatives |
| `growth-contract.ts` | required-input compiler, immutable typed snapshot/hash, new version after input change |
| `state-machines.ts` | recommendation, Growth Contract and automation transition graphs, optimistic/idempotent command semantics |
| `impact-ledger.ts` | incremental orders/revenue/contribution, ROI, CAC, return cost, LTV, time saved, forecast error and evidence-kind separation |
| `runtime.ts` | runtime validation for compile/transition/launch commands |

Canonical TAMYR inputs come from `supabase/seed/qadam_demo_seed.json`; test fixtures derive from that manifest rather than maintaining separate UI magic numbers.

## Server and database boundary

- `GrowthContractService` reads business/profile/limits/signal/recommendation/actual consents through the signed-in RLS client, derives contribution margin, recalculates scenarios/Margin Shield/GOS and compares an optional preview hash.
- API routes: `POST /api/domain/growth-contracts/compile`, `/:id/transition`, `/:id/launch`.
- Eight migrations are present. Prompt 2 added:
  - `20260730063907_deterministic_domain_core.sql`: snapshots, optimistic versions, state triggers, receipts, atomic transition, idempotent launch and segment recompute RPC.
  - `20260730072649_execution_guardrails.sql`: campaign state/economics immutability and latest-effective-consent checks at audience/delivery boundaries.
- Transition, outbox event and append-only activity log are written in one PostgreSQL transaction.
- Same idempotency key cannot create a second campaign, delivery or reward ledger effect.
- Generated public schema types: `src/types/database.generated.ts` (114,215 bytes); browser/server/admin/proxy clients use `Database` generic.

## Exact verification log

| Command/check | Result |
|---|---|
| `npx supabase status` before reset | PASS — API `127.0.0.1:54321`, DB `127.0.0.1:54322`, no remote project-ref |
| One authorized `npx supabase db reset --local` | PASS — migrations 1–7 and seed cleanly replayed |
| `npx supabase migration up --local` | PASS — migration 8 applied forward-only; no second reset used |
| `npx supabase migration list --local` | PASS — all 8 local migrations are recorded in the local database |
| `npm test` | PASS — 28/28 unit/boundary/invariant tests |
| `npm run db:test` | PASS — 5 files, 59/59 pgTAP/RLS/Storage/integration assertions |
| `npx supabase db lint --local --schema public --level error --fail-on error` | PASS — no schema errors |
| `npx supabase db advisors --local --type all --level warn --fail-on error` | PASS — no findings |
| `npm run check:data-layer` | PASS — 64 required tables, 8 migrations and seed/security invariants |
| `npx supabase gen types --local --schema public` | PASS — generated types refreshed |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS — zero warnings/errors |
| `npm run build` | PASS — Next 16.2.12, 54 generated routes including 3 domain APIs |
| `npm run check:secrets` after build | PASS — no secret/service key in client source or browser assets |

## TAMYR golden evidence

- Comparable weekday 15:00–18:00 signal: `-2700 bps` / `-27%`.
- Inactive 30+ days: 64; consent/return-score eligible: 18.
- GOS: 87.
- Blanket 20% discount: blocked; 3,500 ₸ threshold croissant gift: allowed.
- Ledger: 103,500 ₸ influenced; 48,700 ₸ mock incremental revenue; 18,200 ₸ mock incremental contribution; 6,800 ₸ fixed campaign cost; rounded 168% ROI; 145 owner minutes saved.
- Missing consent, negative contribution, budget/cannibalization breach, stale optimistic version and duplicate launch are rejected.

## Status summary

- **PASS:** pure domain formulas/state machines; server recalculation; DB guardrails; canonical seed-derived golden results; RLS/Storage/integration; build/type/lint/security checks.
- **PARTIAL:** exact clean replay of the final eighth migration was not repeated because the user authorized exactly one destructive reset. Migration 8 was applied with the official local forward command, then passed pgTAP, lint and advisors. Product screens still consume old fixtures and do not yet call the new APIs; UI-dependent requirements remain PARTIAL.
- **BLOCKED:** browser E2E, 390/1440 visual regression, accessibility/performance evidence (browser backend unavailable); remote link/deploy/production Auth and connectors (credentials and authorization absent).

## Prompt 3 boundary

Prompt 3 should wire existing visual components to these APIs/repositories and remove direct mock imports incrementally. It must not move formulas into components or allow client totals/consent flags to become authoritative.

## Prompt 3 completion snapshot

Snapshot: 2026-07-31, Asia/Almaty. Scope: full owner/customer paths, local environment only.

### Implemented routes and flows

- Public/Auth: landing CTA route to signup intents, `/signup`, `/login`, `/auth/callback`, `/auth/signout`, `/forgot-password`, `/reset-password`, DEMO_MODE-only demo login, intended-route handling, legal links and `/nearby` public offers.
- Onboarding: six server-autosaved steps at `/onboarding`, back/next preservation, demo/CSV/manual start choice, Business Twin creation through `complete_onboarding`, and time-to-value redirect to `/app/today`.
- Owner app: `/app/today`, `/app/tools`, `/app/recommendations`, `/app/segments`, `/app/loyalty`, `/customers`, `/customers/[id]`, `/customers/import` and `/nearby` now read/write Supabase state through membership-aware server repositories/actions instead of localStorage.
- Tool Catalog: five filters, search/query-state, favorites view, favorite/unfavorite persistence, activate/deactivate with role checks, and published-only owner visibility.
- QR loyalty: owner creates a stamps/points program and opaque QR token; owner can rotate (new token, old revoked) or revoke with expiry selector; public customer flow uses separate loyalty/marketing consent, simulated verification only in DEMO_MODE, idempotent join, append-only ledger, atomic redeem, replay prevention and privacy delete/export hooks.
- Mini-CRM: cursor list, search/filter, lifecycle segments, customer card, notes, consents, activity, masked identity, consent revoke and inactive audience handoff. CSV import 3-step wizard (upload → column mapping → validation report + downloadable error rows). Audited customer export.
- Segments: Dynamic Segment Editor with live consent-first audience preview and server-side custom segment persistence.

### Prompt 3 database work

- `20260730075801_prompt3_owner_customer_paths.sql`: onboarding sessions, privacy requests, QR rate-limit bucket, QR metadata, atomic onboarding/demo clone, create QR, join, redeem and privacy RPCs.
- `20260730173223_prompt3_qr_public_grants.sql`: minimal server-only service-role SELECT grants for public QR context lookup.
- `supabase/seed.sql`: GoTrue v2.193-compatible local dev users with non-null token/change string fields while keeping `phone` NULL for uniqueness.

### Prompt 3 verification log (final, 2026-07-31)

| Command/check | Result |
|---|---|
| `npx supabase db reset --local` | PASS — all 10 migrations and seed cleanly replayed |
| `npx supabase status` | PASS — local API/DB on `127.0.0.1`, no remote operation |
| `npm run db:test` | PASS — 73/73 pgTAP/RLS/Storage/integration assertions |
| `npm test` | PASS — 28/28 deterministic domain tests |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS — zero warnings/errors |
| `npm run check:data-layer` | PASS — 66 required tables and 10 migrations |
| `npm run check:secrets` | PASS |
| `npm run build` | PASS — Next production build, 64 generated routes |

### Browser E2E evidence (Prompt 3)

- Landing CTA: `/` exposes «Найти клиентов», «Создать акцию», «Начать» wired to `/signup?intent=…`.
- Auth/Today: DEMO login reaches `/app/today` with heading «Сегодня» and no page errors.
- New owner: `/signup` creates a user, all six onboarding steps autosave, final route is `/app/today?onboarding=complete`.
- Catalog: favorite and activation actions persist after refresh.
- QR loyalty: owner creates QR, customer opens `/q/[token]`, joins with loyalty consent and optional marketing consent, replayed join does not double-credit, redeem does not double-spend.
- QR rotation/revoke: owner form fires `rotateQrCode`/`revokeQrCode` server actions; activity_logs entry confirmed.
- Mini-CRM: `/customers?segment=inactive` shows explainable 64 inactive → 18 eligible reduction and campaign handoff.
- CSV import: 3-step wizard completes — upload sample CSV → auto-map columns → validation report shows 3 valid / 2 invalid, error-rows CSV downloads.
- Dynamic segment editor: changing lifecycle/days/AOV recalculates preview; «Сохранить сегмент» persists row to `customer_segments`.
- Viewer: tenant viewer can read allowed screens but cannot mutate customers/consents/campaign-changing actions.
- Responsive: core Today/Tools/Customers/QR/Segments/Import flows checked at 390 px and 1440 px without horizontal overflow.
- Production-mode negative path: demo login and simulated verification are hidden/blocked when `QADAM_APP_MODE=PRODUCTION_MODE`.

### Remaining known gaps for Prompt 4

- Campaign Studio full DB-write path (create/edit/approve) needs completing.
- QR rotation owner UI could expose a dedicated management table listing all QR tokens per program (created, status, expiry, last scan).
- CSV duplicate-update server action (currently UI-only preview; the actual Supabase upsert for valid rows is not wired).
- Accessibility axe sweep and browser-recorded E2E video.
- Remote Supabase link, production deploy and prod-mode smoke test remain blocked until explicit authorization.

## Prompt 3 completion (2026-08-01, Asia/Almaty)

Scope: finish the owner/customer paths Prompt 3 left partial. Local environment only. No remote Supabase link,
`db push`, production seed, commit, push or deploy was performed. This directory still has no `.git`.

### What changed

- **Campaign Studio is a real write path.** `/app/campaigns` lists campaigns and unlaunched Growth Contracts from
  the database; `/app/campaigns/new` compiles a contract server-side (economics, Margin Shield, consent and GOS are
  recalculated from RLS-protected data, never taken from the form), then moves it `compiled → awaiting_approval →
  approved` and launches it into a campaign with a consent-gated audience; `/app/campaigns/[id]` shows the
  immutable forecast snapshot, the audience, the Impact Ledger and a state machine that mirrors the database guard.
- **Content, Analytics, Automations and Settings are database-backed.** `AppDemoViews.tsx` was deleted; no route
  under `/app` imports `mock-data` any more, and there are no `href="#"` or decorative primary controls left.
- **CSV import writes real rows.** New `import_customers` RPC: hashed identities, declared marketing consent,
  skip/update duplicate strategies, a per-row error log and an idempotency receipt. It never fabricates
  transactions from declared visits or AOV.
- **QR token registry.** `/app/loyalty` lists every issued token with status, expiry, scan/join counts and last
  scan, and rotate/revoke now act on real token ids through the atomic `rotate_qr_code` RPC.
- **Consent scope resolution.** One database rule now governs previews, contract compilation and the audience
  trigger, so QR- and CSV-acquired customers are reachable while explicit refusals and revokes win immediately.

### Defects found while verifying, and fixed

1. **Route guards were dead code.** `proxy.ts` was at the repository root while the project uses `src/`, so Next
   never registered it (`"middleware": {}` in the build manifest). Unauthenticated `/app/*` rendered, `/admin` had
   no role gate, `/demo` was reachable in production mode and the Supabase session was never refreshed. Moving it
   to `src/proxy.ts` registers `ƒ Proxy (Middleware)` and all guards are now exercised in E2E-1.
2. **Margin Shield blocked every campaign.** `intValue()` returned `0` for an absent field because `Number('') === 0`,
   so the uplift assumptions collapsed to zero and no contract could ever compile. Fixed, and uplift is now three
   explicit owner-editable inputs rather than a hidden default.
3. **CSV import reported success without writing.** The wizard's "import" was a `setTimeout` that claimed
   N imported customers while the database was untouched.
4. **QR/CSV customers were unreachable.** Their consent was recorded at scope `marketing` while campaigns require
   `marketing.<channel>`, so they could never enter an audience.
5. **Same-timestamp consent changes were ambiguous.** `has_effective_consent` used `order by created_at desc limit 1`,
   so a revoke written in the same transaction as a grant could resolve as granted. The enforcement path now
   requires every row carrying the newest timestamp to be a live grant.

### Database work

- `20260801061500_prompt3_completion.sql`: `data_imports.idempotency_key`/`summary`, `import_customers` and
  `rotate_qr_code` RPCs.
- `20260801071500_consent_scope_resolution.sql`: `has_consent_row`, `latest_consent_is_granted`,
  `resolve_effective_consent`, `effective_consent_customers`, and the audience/delivery triggers rewired onto them.
- `supabase/tests/database/007_prompt3_completion.test.sql`: 21 assertions covering consent resolution, import
  behaviour and QR rotation.
- `scripts/check-data-layer.mjs` expects 12 migrations.

### Verification log (clean `db reset --local`, 12 migrations + seed)

| Command/check | Result |
|---|---|
| `npx supabase db reset --local` | PASS — 12 migrations and seed replayed cleanly |
| `npm run db:test` | PASS — 94/94 pgTAP assertions across 7 files |
| `npm test` | PASS — 28/28 deterministic domain tests |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS — zero warnings |
| `npm run check:data-layer` | PASS — 66 tables, 12 migrations |
| `npm run check:secrets` | PASS |
| `npx supabase db lint --local --level error --fail-on error` | PASS — no schema errors |
| `npx supabase db advisors --local --type all --level warn --fail-on error` | PASS — no findings |
| `npm run build` | PASS — 38 routes, `ƒ Proxy (Middleware)` registered |
| `bash tmp/e2e-acceptance.sh` | PASS — 11 acceptance cases, asserted against the database |

TAMYR golden evidence is unchanged: 64 inactive → 18 consent-eligible, blanket 20% discount blocked,
3 500 ₸ threshold gift allowed.

### Status summary

- **PASS:** all owner/customer paths named in Prompt 3 write to and read from the real database, with role
  enforcement, idempotency, optimistic locking and consent gating verified at the database boundary.
- **PARTIAL:** admin CRUD screens still date from Prompt 1/2 and were not expanded. Campaign delivery and
  outcome measurement have no connected provider, so `campaign_deliveries`, `campaign_events` and
  `verified_fact` rows stay empty by design rather than being simulated.
- **BLOCKED:** real browser automation, axe accessibility audit and visual regression — no browser backend is
  installed in this environment. Remote Supabase link and deployment remain unauthorised.

### Suggested Prompt 4 boundary

Connect a real channel provider behind a feature flag so deliveries, events and verified facts can exist;
expand the admin CRUD screens; add browser-driven accessibility and visual regression once a browser backend
is available.

## Prompt 4 (2026-08-01, Asia/Almaty) — AI generator, Campaign Studio, Growth Contract, Content Studio

Local environment only. No remote Supabase link, `db push`, production seed, commit, push or
deploy. This directory still has no `.git`.

### Which AI provider is actually connected

**None.** No `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` exists in this environment, so
`readProviderConfig()` returns `null` and every generation runs on the built-in deterministic
template. That is a designed, labelled state rather than a broken one: the run is recorded as
`source='deterministic_fallback'`, `failure_kind='not_configured'`, and the Studio shows
«встроенный детерминированный шаблон QADAM» together with the reason.

Anthropic (Messages API) and OpenAI (Chat Completions) adapters are implemented and unit-tested
against fake transports. Supplying a key and setting `QADAM_AI_PROVIDER` switches the path with
no other code change; nothing else in the system depends on which path produced the copy.

### What was built

- **AI layer** (`src/ai/`): provider-neutral interface, strict runtime schema, PII redaction,
  prompt-injection neutralisation, content safety, cost guard, timeout, bounded retry with
  exponential backoff, and a deterministic generator that satisfies the same schema.
- **Governance** (`ai_generation_runs` extended, `ai_usage_quota` added): full provenance per
  attempt, daily generation and cost budgets enforced in the database, and a CHECK that keeps
  `input_hash` a SHA-256 digest so a prompt log cannot be reversed into owner text.
- **Campaign Studio** (`/app/campaigns/studio`): seven steps, server-side draft with optimistic
  locking, per-field validation, side-by-side comparison of all seven mechanics on identical
  assumptions, Explain on every number, one-click safe alternative.
- **Growth Contract review**: all ten required parts, edit/snooze/reject/approve/launch, and an
  approval that records the actor and timestamp beside the immutable snapshot.
- **Content Studio**: one brief becomes 14 assets — post, short post, three stories, a
  15-second script and a messenger message in RU and KK — each with CTA, alt text, channel
  preview and a tracking code printed in the copy.

### Defects found while verifying, and fixed

1. **Keeping invalid input crashed the Studio.** The page simulated the stored draft on render,
   so an out-of-order uplift ladder — which the wizard is required to preserve — threw
   `INVALID_SCENARIO_ORDER` and produced an error page. Now caught and shown as a field message
   with the values intact.
2. **Approval recorded no actor or timestamp.** `enforce_domain_transition` requires
   `optimistic_version` to advance on every update; the stamping update did not bump it and was
   rejected silently, so `approved_by` and `approved_at` stayed NULL.
3. **Every Cyrillic safety rule was dead.** JavaScript's `\b` is ASCII-based, so `/\bлечит\b/u`
   matched nothing: Russian prompt-injection and content-safety patterns silently passed
   everything. Replaced with explicit Unicode boundaries.

### Database work

- `20260801120000_ai_generation_governance.sql`: extends `ai_generation_runs` with provider,
  schema version, source, latency, attempts, cost, failure kind, fallback reason and an
  idempotency key; adds `ai_usage_quota`, `record_ai_generation_run` and `campaign_drafts`.
- `supabase/tests/database/008_ai_generation_governance.test.sql`: 19 assertions.
- `scripts/check-data-layer.mjs` expects 13 migrations and 68 tables.

### Verification log (clean reset, 13 migrations + seed)

| Check | Result |
|---|---|
| `npm test` | PASS — 58/58 (28 domain, 21 AI safety, 9 content pack) |
| `npm run db:test` | PASS — 113/113 pgTAP across 8 files |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS — zero warnings |
| `npm run check:data-layer` | PASS — 68 tables, 13 migrations |
| `npm run check:secrets` | PASS |
| AI credential bundle grep | PASS — no key or `x-api-key` in `.next/static` |
| `npx supabase db lint --local --level error --fail-on error` | PASS |
| `npx supabase db advisors --local --type all --level warn --fail-on error` | PASS |
| `npm run build` | PASS — `ƒ /app/campaigns/studio`, `ƒ Proxy (Middleware)` |
| `bash tmp/e2e-prompt4.sh` | PASS — 11 acceptance groups, asserted against the database |

TAMYR golden evidence unchanged: 64 inactive → 18 consent-eligible, blanket 20% blocked,
3 500 ₸ threshold croissant gift allowed.

### Status summary

- **PASS:** AI layer with provider neutrality, strict validation, redaction, injection defence,
  quota/cost governance and a guaranteed fallback; seven-step Studio with server-side drafts;
  Growth Contract with all ten parts and audited approval; bilingual content pack with tracking.
- **PARTIAL:** the Kazakh copy is structurally correct but unreviewed — `native_review_required`
  is emitted on every KK asset and must be treated as a release gate. Admin CRUD screens still
  date from Prompt 1/2.
- **BLOCKED:** no AI provider key, so no live model call has been made; no channel connector, so
  deliveries and verified facts stay empty by design; no browser backend for accessibility and
  visual regression; remote link and deploy remain unauthorised.

### Suggested Prompt 5 boundary

Supply an AI provider key behind a feature flag and record a live-call comparison against the
template; obtain a native Kazakh review pass and record it as a gate; connect one real channel so
deliveries, events and verified facts can exist.

## Prompt 5 (2026-08-01, Asia/Almaty) — execution, channels, notifications, storefront, impact

Local environment only. No remote Supabase link, `db push`, production seed, commit, push or
deploy. This directory still has no `.git`.

### Which adapters are real

| Adapter | Real | Can leave the machine | Highest state reachable here |
|---|---|---|---|
| `mock` | Yes (code) | No | `simulated` in DEMO_MODE |
| `webhook` | Yes | Yes — signed HMAC-SHA256 POST to an owner-controlled URL | `sandbox` |
| `whatsapp` / `telegram` / `instagram` | No — declared boundaries that refuse and name their credentials | No | `not_configured` |

**No adapter has been exercised against a real vendor sandbox in this environment**, so no
channel is labelled `connected`, and the database would refuse that label anyway without
stored health-check evidence.

### Scheduler mode

External caller against a protected endpoint. There is no platform cron or queue.
`POST /api/jobs/run-cycle` requires a shared secret compared in constant time, applies a
12-per-minute rate limit, refuses a `cycleKey` shorter than 8 characters and rejects a
replayed cycle with 409. A local runner loop and a DEMO_MODE "run demo cycle" button drive
the same code path. Without `QADAM_JOB_SECRET` the endpoint answers 503 rather than running
unguarded.

### What was built

- **Execution substrate**: outbox leasing with `for update skip locked`, bounded retry with
  30/60/120/240s backoff, dead-letter plus notification, business-level emergency stop,
  suppression list, connector state with evidence, raw `provider_events`, immutable
  `impact_baselines`, notification categories with per-user muting.
- **Send gate**: one database function re-checked immediately before each dispatch —
  emergency stop, business status, suppression, effective consent, quiet hours in the
  business timezone, daily cap, rolling 24-hour frequency cap.
- **Automation Center**: ten versioned rule templates, assistant by default, autopilot
  gated behind an approved template and a named owner and currently allowed only for the
  protective stop-loss rule.
- **Connectors**: unified prepare/send/status/cancel/healthCheck, mock and webhook
  adapters, explicit vendor boundaries, honest five-state labelling.
- **Notifications**: in-app inbox with five categories; risk and connector errors cannot be
  muted, enforced by a database CHECK.
- **Public storefront**: publication rules applied explicitly, haversine proximity over
  privacy-rounded coordinates with a district fallback, public offer page with QR and
  tracking code, intent events kept strictly apart from visits.
- **Impact pipeline**: raw events separate from derived metrics, duplicate-proof ingestion,
  immutable baselines, small-sample honesty, five kinds with visible labels, 12-KPI
  dashboard with period comparison and cursor pagination, deterministic TAMYR time jump.

### Defects found while verifying, and fixed

1. **Every automation run failed.** `execute_automation` updated `last_run_at` without
   incrementing `optimistic_version`, which the transition trigger rejects. Same class of
   bug as the Prompt 4 approval defect.
2. **The public storefront was empty and every offer page 404'd.** `service_role` had no
   SELECT on `nearby_offers`, `business_locations` or `tracking_codes`.
3. **A foreign key column was unindexed**, violating the schema contract.

### Database work

- `20260801160000_execution_substrate.sql` — execution state, suppression, connector state,
  outbox hardening, automation mode/versioning, provider events, impact baselines,
  notification categories and preferences, nearby offer fields and intent events.
- `20260801170000_execution_functions.sql` — `send_gate`, `set_emergency_stop`,
  `claim_outbox_batch`, `settle_outbox_event`, `enqueue_delivery`, `ingest_provider_event`,
  `evaluate_stop_loss`.
- `20260801180000_automation_and_impact.sql` — `execute_automation`,
  `recompute_campaign_impact`, `demo_time_jump`.
- `20260801190000_nearby_public_grants.sql` — minimal service-role read grants for the
  anonymous storefront.
- `supabase/tests/database/009_execution_and_impact.test.sql` — 38 assertions.

### Verification log (clean reset, 17 migrations plus seed)

| Check | Result |
|---|---|
| `npm test` | PASS — 73/73 |
| `npm run db:test` | PASS — 151/151 pgTAP across 9 files |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS — zero warnings |
| `npm run check:data-layer` | PASS — 74 tables, 17 migrations |
| `npm run check:secrets` | PASS |
| `npx supabase db lint --local --level error --fail-on error` | PASS |
| `npx supabase db advisors --local --type all --level warn --fail-on error` | PASS |
| `npm run build` | PASS — job endpoint, webhook, notifications and offer page all present |
| `bash tmp/e2e-prompt5.sh` | PASS — 12 acceptance groups asserted against the database |

TAMYR golden evidence extended and unchanged: 64 inactive → 18 consent-eligible; blanket 20%
blocked; 3 500 ₸ threshold gift allowed; time jump 18 delivered / 15 opened / 9 redeemed;
103 500 ₸ influenced; 48 700 ₸ incremental; 18 200 ₸ contribution; 6 800 ₸ cost; 168% ROI;
145 minutes saved — all recorded as mock, never as verified fact.

### Status summary

- **PASS:** the loop after approval is real — outbox dispatch with retry and dead letter,
  send gating re-checked at dispatch, emergency stop, stop-loss that pauses but cannot
  restart, signed and duplicate-proof webhook ingestion, versioned automations that propose
  rather than act, an honest impact ledger that keeps influenced and incremental apart.
- **PARTIAL:** the webhook adapter is genuinely capable but unexercised against any third
  party; vendor adapters are boundaries, not implementations; the birthday rule cannot
  produce candidates because no lawful birth-date field is collected.
- **BLOCKED:** no vendor sandbox credentials, so nothing reaches `connected` and no
  `verified_fact` can exist; no platform cron, so scheduling needs an external caller and
  the in-process rate limit would need a shared store behind multiple instances; browser
  automation and accessibility audit remain unavailable; remote link and deploy unauthorised.

### Suggested Prompt 6 boundary

Obtain one vendor sandbox credential and record a real health check and test send so a
channel can legitimately reach `sandbox` and then `connected`; move the job endpoint rate
limit and replay cache to a shared store; collect a lawful birth date so the birthday rule
can run; add the admin console work still outstanding from Prompts 1–2.

## Prompt 6 delivered — Admin Console, roles, templates, plans, privacy, scale (2026-08-01)

### What is new

**Admin Console** at `/admin`, `/admin/tools`, `/admin/categories`, `/admin/templates`. Access passes
three independent gates — the layout on every render, each server action with the narrower role set it
needs, and the database itself. The role comes from `private.platform_admin_assignments`; the test
suite asserts by inspecting the function body that `user_metadata` is never consulted. A tenant owner
who types an admin URL is redirected to `/app/today?error=admin_access_required`.

**Audit by construction.** Server actions never write `admin_audit_log`; they call `admin_audit(...)`,
which refuses without a platform role and without a reason of at least three characters, and refuses a
sensitive action without a credential confirmation newer than 15 minutes. The table is append-only —
a trigger rejects UPDATE and DELETE. Where the audit write fails after a mutation, the mutation is
rolled back rather than left unaudited.

**Catalogue CRUD without deletion.** Tools, categories and business types are created, edited,
published, archived, restored and deprecated. `guard_catalog_delete` refuses a hard delete while any
historical row still references the record, and deprecating a category with published tools is refused
with an explanation rather than silently cascading.

**Template versioning with real immutability.** A published version freezes its content, schema
version, locales and compatibility; the only onward transition is `archived`. Publication requires
both `ru` and `kk`. Rollback repoints the template and leaves the newer version published, so "what
was live on that date" stays answerable. Growth Contracts are unaffected by any of it — each carries
its own immutable `accepted_snapshot`, which the E2E confirms across a publish and a rollback.

**Five-role RBAC.** The matrix lives in `src/server/qadam/rbac.ts` as data — 15 capabilities × 5 roles,
seven marked critical — and the same table drives the UI, the server actions and the tests. It is
rendered in full to the owner on `/app/team`. Invitations store an email hash and a mask, a hashed
token and an expiry; `guard_last_owner` refuses to demote the last active owner, so ownership must be
transferred first.

**Plans as data.** Five plans, nine entitlement keys, 45 grant rows. No code branches on a plan code.
`consume_entitlement` is idempotent on a request key and refuses with the plan, limit and usage named
— and never touches the caller's draft. A business with no subscription resolves against Free.

**Localisation architecture.** `src/i18n/registry.ts` holds the catalogue, a ten-term glossary and the
`Intl` formatters. Messages take named parameters rather than concatenated fragments, and plural forms
come from `Intl.PluralRules` — Russian needs three forms, and a hand-rolled `n === 1` check silently
produces wrong Russian. Domain logic never imports the module.

**Privacy from the schema.** `data_inventory` and `retention_policies` are tables, and `/privacy`
renders them, so the document cannot drift from what the database actually holds.
`anonymize_customer` deletes identities and notes, unlinks transactions and redemptions while keeping
their amounts, retains consent proof as revoked, and adds a `privacy_delete` suppression entry.
Platform analytics is aggregate-only and withholds any filtered segment below five businesses.

### The defect the benchmark found

The committed seed is 180 customers, on which every query plan is correctly a sequential scan — it
cannot tell a good index from a missing one. `scripts/benchmark-explain.sql` builds a throwaway
50 000-customer / 400 000-transaction tenant inside a transaction, runs EXPLAIN ANALYZE on the exact
queries the hot screens issue, and rolls back.

It immediately caught a real defect. The index intended for the customers list was written as
`create index if not exists customers_cursor_idx (...)`, but that name was already taken by a
*different* index created in an earlier prompt. Postgres skipped it silently — no error, no warning —
and the customers list did a full 50 000-row sequential scan at **16.8 ms**. Renaming it to
`customers_list_cursor_idx` brought the same query to **0.06 ms**.

`if not exists` on an index is a name check, not a definition check. The RUNBOOK now says so, and the
verification loop re-runs the benchmark after any index change to confirm the plan actually moved.

The advisors caught the opposite mistake in the same pass: two indexes I had added were duplicates of
existing ones (`customer_consents_lookup_idx`, `usage_counters_period_uidx`) and were dropped.

### Verification log (clean reset, 23 migrations plus seed)

| Check | Result |
|---|---|
| `npm test` | PASS — 96/96 |
| `npm run db:test` | PASS — 194/194 pgTAP across 10 files |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS — zero warnings |
| `npm run check:data-layer` | PASS — 79 tables, 23 migrations |
| `npm run check:secrets` | PASS |
| `npx supabase db lint --local --level error --fail-on error` | PASS |
| `npx supabase db advisors --local --type all --level warn --fail-on error` | PASS — no findings |
| `npm run build` | PASS — all seven new routes |
| `bash tmp/e2e-prompt6.sh` | PASS — 10 acceptance groups asserted against the database |

### Status summary

- **PASS:** the platform layer is real — a server-gated admin console with three independent checks,
  append-only audit that cannot be bypassed by a server action, catalogue CRUD that archives instead
  of deleting, template versions that genuinely cannot be edited after publication, five-role RBAC
  enforced identically in UI, actions and database, entitlements resolved from data with idempotent
  metering, a privacy page generated from the schema, and index work proven on a realistic volume.
- **PARTIAL:** the RU/KK switcher persists in `localStorage` and survives navigation, but server-
  rendered copy is Russian — the registry and the per-business locale column are ready, the wiring is
  not; the five curated business-type template content sets are not authored, only the machinery that
  would carry them; the billing webhook checklist is schema plus documentation until an adapter exists.
- **BLOCKED:** no payment provider, so live billing is BLOCKED by design and `createBillingProvider`
  refuses checkout in **both** modes rather than simulating one in PRODUCTION_MODE; no qualified legal
  review of the privacy behaviour for Kazakhstan or any other jurisdiction, flagged on the privacy page
  itself as an external release gate; no remote project, so the backup/restore drill is written but
  unexercised; vendor sandbox credentials, browser automation and accessibility audit remain
  unavailable, as in Prompt 5.

### Suggested Prompt 7 boundary

Wire the locale into server rendering (per-business default, cookie override, server-side `translate`)
so the KK switch changes real copy; author the five business-type template sets on top of the
versioning machinery now proven; attach one payment provider in sandbox and work the five-item webhook
checklist; obtain a qualified legal review to clear the privacy release gate.

## Prompt 7 — проверенный release candidate (2026-08-01)

Этот этап не добавлял функций. Он проверял, что написанное в промптах 1–6 действительно
работает, — и обнаружил, что заметная часть не работала. **594 автоматических проверки, все
зелёные**; из них 304 написаны в этом этапе.

### Главное: браузерная автоматизация оказалась доступна

Предыдущие отчёты помечали browser automation и accessibility audit как недоступные в этой
среде. Это было неверно: кэш браузеров Playwright присутствовал, не хватало только пакета.
После установки стали возможны настоящие E2E, аудит axe-core и скриншоты — и почти все
дефекты ниже нашлись именно потому, что продукт наконец открыли в браузере.

Урок записан отдельно: **«инструмент недоступен» нужно проверять, а не наследовать.**

### Что оказалось сломанным

**Критическое — изоляция тенантов обходилась.** `anon` и `authenticated` имели `TRUNCATE`,
`TRIGGER` и `REFERENCES` на 65 таблицах: это состояние по умолчанию после бутстрапа
Supabase. Постгрес **не применяет политики строк к TRUNCATE**. Владелец тенанта B, который
не видит ни одной строки тенанта A, выполнил `truncate public.customers cascade` и каскадно
уничтожил идентичности, согласия, транзакции, счета лояльности, события кампаний, погашения
и privacy-запросы **всех тенантов**. Воспроизведено на живой базе до исправления.

Все предыдущие отчёты утверждали, что RLS защищает каждую тенантную таблицу. Утверждение
было верным только для четырёх операций из семи.

**Мёртвый главный CTA.** `.gsap-reveal { visibility: hidden }` снималось только анимацией.
Без JavaScript кнопки «Найти клиентов» и «Создать акцию», заголовок и карточка продукта
были невидимы навсегда. Основной путь конверсии не существовал для браузера, который не
выполнил скрипт.

**Кнопка «Назад» запускала кампанию.** На шаге подтверждения `<form>` был вложен в `<form>`.
Парсер выбрасывает внутренний тег, поэтому «Назад к контракту» становилась второй кнопкой
отправки внешней формы — формы **запуска**. Заодно это ломало гидратацию React.

**Из аккаунта нельзя было выйти.** `signOut` существовал как server action и как POST-роут,
но ни один экран не давал к ним доступа.

**Шапка была декорацией.** Захардкоженные инициалы и имя вместо вошедшего пользователя,
поле поиска, которое на самом деле `div`, и колокольчик уведомлений — `button` без
обработчика с нарисованной красной точкой «есть непрочитанное».

**Горизонтальная прокрутка на всех ширинах ниже 1440px.** Левая группа шапки не имела
`min-w-0`, поэтому хлебные крошки не могли сжаться и распирали документ до 427px при
вьюпорте 320px.

**Ошибка входа не показывалась.** `signIn` редиректил с `?error=`, но страница его не
рендерила: при неверном пароле форма просто перезагружалась.

**Временный сбой базы выглядел как «нет доступа».** `requireBusinessContext` сливал ошибку
запроса и пустой результат в `MEMBERSHIP_REQUIRED`. Под нагрузкой это давало владельцу
сообщение об отсутствии членства и голый 500 — обнаружено нагрузочным тестом, где
Impact Ledger отдавал ошибку на двух запросах из трёх.

**Падение layout обходило границу ошибки.** Ошибка в layout ловится **родительской**
границей, а не собственной. `src/app/app/error.tsx` не мог поймать падение
`src/app/app/layout.tsx`, а корневой границы не было вовсе.

**Контраст ниже WCAG AA у фирменного цвета.** `#0D9488` давал 3.74:1 на белом в обе
стороны — и как цвет текста, и как фон под белым текстом. `success` — 2.54:1,
`warning` — 3.19:1.

**Три уязвимости high в зависимостях.** `postcss` и `sharp` транзитивно через `next`.
`npm audit fix --force` предлагал откатить Next до версии 9 — отвергнуто в пользу
точечных `overrides`.

**Категории нельзя было редактировать.** `saveCategory` умел обновлять по `id`, но экран
не давал ни одной формы редактирования. Требование промпта 6 «categories: create, edit,
reorder» стояло как VERIFIED, хотя половина была недостижима.

### Что добавлено

**Заголовки безопасности** (`src/lib/security/headers.ts`) на каждый ответ: CSP с nonce на
аутентифицированных маршрутах, HSTS, `frame-ancestors 'none'`, `form-action 'self'`,
`Permissions-Policy`, `nosniff`, без `X-Powered-By`.

**Четыре набора тестов:** `tests/e2e/` (137 проверок в браузере), `tests/security/`
(85), `tests/a11y/` (54), `tests/perf/` (28). Каждый утверждение об экране подтверждается
запросом в базу.

**Два новых repo-check:** `check:markup` ищет вложенные формы, `check:types-drift` ловит
расхождение сгенерированных типов со схемой.

**CI из четырёх задач** и deploy-пайплайн, который отказывается работать при упавшем CI и
честно сообщает, что хостинг не подключён.

**ERD, генерируемый из живой схемы** — 80 таблиц и 139 внешних ключей, диаграмма не может
разойтись со схемой, потому что из неё и строится.

### Verification log (чистое воспроизведение, 24 миграции + seed)

| Проверка | Результат |
|---|---|
| `npm run lint` | PASS, 0 warnings |
| `npm run typecheck` | PASS |
| `npm test` | PASS 96/96 |
| `npm run db:test` | PASS 194/194 pgTAP |
| `npm run check:markup` | PASS |
| `npm run check:secrets` | PASS |
| `npm run check:data-layer` | PASS — 79 таблиц, 24 миграции |
| `npm run check:types-drift` | PASS |
| `npm run build` | PASS |
| `supabase db lint` | PASS, 0 находок |
| `supabase db advisors` | PASS, 0 находок |
| `npm audit` | PASS — 0 находок любой серьёзности |
| `npm run test:e2e` | PASS 137/137 |
| `npm run test:security` | PASS 85/85 |
| `npm run test:a11y` | PASS 54/54, 0 нарушений axe |
| `npm run test:perf` | PASS 28/28 |

### Статус

- **PASS:** продукт проверен как единая система. Изоляция тенантов доказана на всех 67
  тенантных таблицах, включая операции, которые RLS не фильтрует. Три пути — владельца,
  клиента и администратора — проходят в настоящем браузере от лендинга до аварийной
  остановки, и каждое число на экране подтверждено запросом в базу. Ноль нарушений axe,
  ноль ошибок в консоли, ноль ошибок под нагрузкой.
- **PARTIAL:** переключатель RU/KK клиентский, серверный рендер всегда русский; пять
  курируемых наборов шаблонов не написаны; `style-src` сохраняет `'unsafe-inline'`, а
  маркетинговые страницы — `script-src 'unsafe-inline'`, потому что статический пререндер
  не может нести nonce; разбор CSV идёт в браузере, серверной проверки MIME файла нет;
  нагрузочный тест — один локальный инстанс; партиционирование не введено.
- **BLOCKED:** нет платёжного провайдера (live billing невозможен); нет вендорского
  sandbox (ни один канал не станет `connected`, `verified_fact` невозможен); нет
  юридической проверки для Казахстана; нет удалённого проекта (восстановление из бэкапа
  описано, но не выполнялось); нет платформенного планировщика (rate limit в памяти
  процесса); нет WebKit и Firefox в этой среде.

### Следующий шаг

Серверный рендеринг локали: определять её как «локаль бизнеса → cookie-override →
`Accept-Language`», прокидывать в layout, заменить клиентский `LanguageContext` на серверный
`translate` и прогнать a11y-аудит на казахском. Это единственный оставшийся PARTIAL,
который целиком в нашей власти, а не зависит от внешней стороны.

## Prompt 8 — финальный release audit (2026-08-01)

**Статус: RELEASE_CANDIDATE технически, EXTERNALLY_BLOCKED для боевого запуска.**

Прогон с нуля: `rm -rf node_modules .next` → `npm ci` из lockfile → реплей 25 миграций на
пустую базу → детерминированный seed → продакшн-сборка → **676 автоматических проверок,
0 падений**.

### Что исправлено в этом этапе

**Схема зависела от гранта, который платформа отменяет.** Большинство из 79 таблиц доходили
до PostgREST через автоматические привилегии, которые Supabase выдаёт при создании таблицы.
Changelog от 2026-04-28 переводит это в opt-in, существующие проекты — до 2026-10-30. На
новом проекте каждый запрос отвечал бы «permission denied for table», и обнаружилось бы это
в момент деплоя. Миграция `20260802030000` объявляет гранты явно; набор безопасности падает,
если новая таблица снова положится на умолчание. Проверено по официальному changelog и
документации Supabase перед решением.

**Серверный рендеринг локали.** Последний PARTIAL, зависевший только от нас. Локаль теперь
определяется до первого рендера: cookie → сохранённая локаль пользователя → `Accept-Language`
→ русский. Cookie вместо `localStorage` именно затем, чтобы сервер мог её прочитать — раньше
он не мог, всегда отдавал русский, и казахскоязычный посетитель видел русский до гидратации,
а в серверных компонентах — навсегда. Проверено: заголовок `Accept-Language: kk` отдаёт
казахский HTML, cookie перебивает заголовок в обе стороны, переключатель меняет серверную
разметку и переживает перезагрузку.

Честная граница: оболочка кабинета, лендинг, авторизация и тарифы двуязычны; тексты внутри
экранов кабинета остаются русскими. Вместо молчания интерфейс говорит об этом **на казахском**
— перевод ждёт носителя языка, а это уже внешний блокер.

**Устаревшее утверждение в интерфейсе.** Строка `backendNotice` обещала подключение Supabase
и RLS «на backend-этапе». Они подключены давно, и текст был просто неверным.

### Что построено

| Набор | Проверок | Что делает |
|---|---|---|
| `tests/release/seed-determinism.mjs` | 5 сверок | Фиксирует цифры seed сразу после реплея, до того как любой набор добавит строку |
| `tests/release/mode-separation.mjs` | 27 | Собирает и запускает **второй сервер** в PRODUCTION_MODE и смотрит, что он отдаёт |
| `tests/release/demo-script.mjs` | 42 | Сценарий 4:30 на холодном инкогнито-профиле плюс обновление, набранные URL и обе ширины |
| `tests/release/gates.mjs` | 12 гейтов | Читает артефакты остальных наборов и выносит вердикт по G1–G12 |
| `tests/release/run-all.mjs` | — | Задаёт единственный порядок, в котором результаты что-то значат |

Порядок не декоративный: seed фиксируется до наборов, потому что наборы легитимно добавляют
строки; гейты читают артефакты после, потому что иначе им нечего читать. Первая версия гейтов
падала именно на этом — считала живую таблицу и меряла тесты вместо seed.

### Verification log

| Проверка | Результат |
|---|---|
| `npm ci` из lockfile, чистые `node_modules` и `.next` | PASS |
| Реплей 25 миграций на пустую базу | PASS |
| Детерминированность seed: 180 / 1129 / 64 / 18 / −2700 bps | PASS |
| `npm run verify` (lint, типы, unit, разметка, секреты, слой данных, дрейф типов, сборка) | PASS |
| `npm run db:test` | PASS 194/194 |
| E2E владельца / клиента / администратора | PASS 58 / 36 / 45 |
| Security: RLS-матрица / статический скан / HTTP | PASS 22 / 23 / 43 |
| Accessibility, включая казахскую локаль | PASS 62/62, 0 нарушений axe на 26 сканах |
| Performance и поведение при сбое | PASS 28/28 |
| Разделение режимов | PASS 27/27 |
| Demo 4:30 и условия демо-дня | PASS 42/42 |
| `npm audit` | 0 находок любой серьёзности |
| `supabase db lint` / `db advisors` | 0 находок |
| **Итого** | **676 / 676** |

### Гейты

Десять PASS, два PASS_WITH_BLOCKERS — G11 (production surfaces) и G12 (compliance). Оба
зелены во всём, что можно проверить без внешней стороны, и явно называют то, что нельзя:
платёжный договор, sandbox каналов, проект Supabase, хостинг, юрист, носитель казахского.

### Статус

- **PASS:** продукт проверен как единая система на чистом воспроизведении. Изоляция
  арендаторов доказана на 67 таблицах, включая операции, которые RLS не фильтрует. Три пути
  проходят в настоящем браузере, и каждое число на экране сверено с базой. Режимы не
  смешиваются — проверено отдельным сервером, а не чтением кода. Демо помещается в 4:30 на
  холодном профиле.
- **PARTIAL:** тексты экранов кабинета не переведены на казахский (механизм готов, ждёт
  носителя); пять курируемых наборов шаблонов не написаны; `style-src` сохраняет
  `'unsafe-inline'`; разбор CSV в браузере без серверной проверки MIME; rate limit в памяти
  процесса; партиционирование не введено; Data API работает в `public`, а не в выделенной
  схеме.
- **BLOCKED:** платёжный провайдер, sandbox каналов, юридическая проверка, ревью носителя,
  проект Supabase, хостинг, планировщик платформы, нагрузочная среда, WebKit и Firefox.

### Деплой

**Не выполнялся.** Staging не развёрнут, проект Supabase не создан, разрешения не давалось,
точная цель не называлась. Порядок действий подготовлен в `DEPLOY_RUNBOOK.md` — от сверки
project ref и dry run миграций до smoke-проверки, чтения логов и фиксации отката.
