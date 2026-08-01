# QADAM Data Model

Статус: модель реализована восемью migrations, типизирована в `src/types/database.generated.ts` и дополнена детерминированным domain layer. Product UI пока не переведён со старых TypeScript fixtures.

## Владение и связи

```text
Business 1─* Location 1─* TeamMembership
Business 1─1 BusinessTwin ─* ProductService
Business 1─* Customer 1─* ConsentRecord
Customer 1─* Transaction ─* TransactionItem
Business 1─* Segment ─* SegmentMembership *─1 Customer
Business 1─* Signal 1─* Explanation
Signal 1─* GrowthContract 1─* GrowthContractVersion
GrowthContractVersion ─1 AudienceSnapshot
GrowthContractVersion ─1 Simulation (low/base/high)
GrowthContractVersion ─* ContentVariant
GrowthContractVersion 1─* Campaign 1─* Delivery/OutcomeEvent
Campaign 1─* ImpactMetric
Business 1─* AutomationRule 1─* AutomationRun
Tool/Template ─* Version ─* BusinessType/Category
Actor 1─* AuditEvent
```

## Сущности и минимальные поля

| Сущность | Назначение и ключевые поля | Tenant scoped |
|---|---|---|
| Business | id, name, type, currency, timezone, plan, mode | да |
| Location | business_id, address/geo, district, hours, capacity | да |
| BusinessTwin | goals, budget, channels, brand_voice, confidence/provenance | да |
| ProductService | sku, name_ru/kk, price, unit_cost, margin, active | да |
| User/TeamMembership | identity, business_id, role, location scope | identity/global + tenant membership |
| Customer | business_id, pseudonymous id, contacts, lifecycle/RFM | да |
| ConsentRecord | customer_id, purpose, channel, status, captured_at, source, evidence | да |
| Transaction | customer/location, occurred_at, gross/net/cost, source | да |
| Segment | definition/version, dynamic flag | да |
| SegmentMembership | segment/customer, evaluated_at, reason | да |
| Signal | metric, source, period, comparator, delta, detected_at | да |
| Explanation | signal_id, hypothesis, evidence, confidence, model/version | да |
| GrowthContractVersion | immutable payload, status, approvals, formula version | да |
| AudienceSnapshot | inclusion/exclusion, consent result, count, frozen_at | да |
| Simulation | assumptions, pessimistic/base/optimistic outputs, margin/cannibalization | да |
| ContentVariant | locale, channel, body, alt_text, CTA, tracking code/QR | да |
| Campaign | contract version, connector status, schedule, budget, stop state | да |
| DeliveryEvent | delivered/opened/clicked/redeemed with source/event id | да |
| ImpactMetric | kind, value, unit, source, period, method, confidence | да |
| AutomationRule/Run | trigger, guardrails, approvals, idempotency, result | да |
| Tool/Template/Version | platform catalog, business-type applicability, publish lifecycle | platform |
| FeatureFlag/Entitlement | scope, key, enabled/limit, reason | platform/tenant |
| AuditEvent | actor, action, resource/version, before/after hash, timestamp | да/platform |

## Классификация данных

| Класс | Примеры | Правила |
|---|---|---|
| P0 Public | опубликованная акция, публичный tool description | допустимо в витрине после privacy review |
| P1 Internal | агрегаты продаж, business settings, campaign economics | tenant-only, encrypted in transit/at rest |
| P2 Personal | имя, телефон, Telegram/WhatsApp id, birthday | least privilege, masking, retention, export/delete workflow |
| P3 Sensitive | consent evidence, precise visit history, behavioural segments | strict RLS, audit read/write, purpose limitation |
| P4 Secret | service keys, connector tokens, webhook secrets | server secret store only; never DB plaintext/client bundle/log |

Текущие mock customers содержат маскированные телефоны и имена синтетических персон. Даже в demo они должны иметь явный `DEMO DATA` provenance.

## Metric contract

Каждое число в продукте должно иметь:

```ts
type MetricKind = 'forecast' | 'influenced' | 'incremental_estimate' | 'mock_actual' | 'verified_fact';
type Metric = {
  kind: MetricKind;
  value: number;
  unit: string;
  source: string;
  periodStart: string;
  periodEnd: string;
  comparison?: string;
  methodVersion?: string;
  confidence?: number;
};
```

DB contract использует эти пять kind; UI labels отображают `INFLUENCED REVENUE` и `MOCK RESULT` без изменения stored kind. Старый TypeScript `ImpactMetric.type` пока неполон, а fixture ошибочно маркирует simulated contribution/time saved как `verified_fact`; repository wiring должно убрать это расхождение.

## Retention и deletion

Политика retention ещё не утверждена. До её появления production ingestion PII блокируется. Требуются сроки для raw transactions, consent evidence, delivery events, audit trail, exported reports и deleted customer tombstones; deletion не должна уничтожать обязательное audit evidence, но должна необратимо деидентифицировать customer data.

## Реализованный physical contract

- 64 обязательные public/private application tables; UUID public IDs.
- Money: `bigint *_minor` + ISO currency; basis points для margin/ROI; float/real отсутствуют.
- Time: `timestamptz`; business/location timezone хранится отдельно.
- Tenant rows имеют `business_id`; trigger запрещает его смену.
- Production business reject-ит `is_mock=true`; demo business требует `is_mock=true`.
- Every FK index создаётся из catalog в safeguards migration; основные cursor/composite/partial indexes заданы явно.
- `activity_logs`, `loyalty_ledger`, `campaign_events`, `impact_measurements`, `platform_events` append-only.
- Customer lookup хранит one-way `lookup_hash` и masked value; raw identity не находится в exposed table.
- Source connections содержат только opaque `credential_reference`, не external secret.
- Growth Contract accepted snapshot защищён от mutation; новая редакция создаёт новую version.
- Metric kind: `forecast | influenced | incremental_estimate | mock_actual | verified_fact`; verified fact запрещён для mock row.

Canonical seed manifest: `supabase/seed/qadam_demo_seed.json`; executable generator: `supabase/seed.sql`.

## Prompt 2 state и command contract

- `signals`: `baseline`, `delta`, `assumptions`, `formula_version`; evidence не содержит causal claim.
- `customer_segments`: versioned `rule_version` и `last_evaluated_at`; memberships upsert/delete пересчитываются одной DB command.
- `recommendations`, `growth_contracts`, `automations`, `campaigns`: optimistic version и idempotency keys.
- Growth Contract materializes `consent_summary`, `simulator_result`, `margin_decision`, `attribution_plan`, `owner_limits_snapshot`; после compile inputs immutable.
- `private.domain_command_receipts`: закрытый dedup store.
- `public.transition_domain_entity`: optimistic transition + outbox + activity в одной transaction.
- `public.launch_growth_contract`: server-rechecked, idempotent campaign creation.
- Delivery/audience triggers перечитывают latest effective consent; client `consent_status` не считается доказательством.
- Campaign budget/channel/contract/economics immutable после draft; direct pre-approved insert запрещён.

## Проверенная физическая схема

- Clean replay migrations 1–7 + seed: PASS; migration 8 applied forward-only with `migration up --local` due one-reset authorization and tested in place.
- Generated types: `src/types/database.generated.ts`, 114,215 bytes на snapshot.
- pgTAP: 5 файлов, 59 assertions, PASS.
- Supabase schema lint и security/performance advisors: 0 findings.

## Prompt 6 additions — governance, RBAC, plans, privacy (2026-08-01)

### Platform governance

| Table | Purpose | Key rules |
|---|---|---|
| `private.platform_admin_assignments` | Who holds a platform role | Pre-existing. Read only through `private.is_platform_admin` / `current_platform_role`; never from `user_metadata` |
| `private.admin_reauth` | Last credential confirmation per admin | Sensitive operations require an entry newer than 15 minutes |
| `public.admin_audit_log` | Every admin mutation | actor, actor_role, action, resource, before_state, after_state, reason (3–500 chars), reauth_verified_at. Append-only: a trigger refuses UPDATE and DELETE |

### Catalogue lifecycle

`tools`, `tool_categories`, `business_types` and `templates` gained archive/deprecate states and
`archived_at` / `deprecated_at`. A `guard_catalog_delete` trigger refuses DELETE while any historical
row still references the record, so the only way out is archive or deprecate.

`tools.compatible_business_types text[]` narrows the owner catalogue; an empty array means all types.

### Template versioning

| Column | Meaning |
|---|---|
| `template_versions.locales` | Must contain both `ru` and `kk` before publication |
| `template_versions.compatible_business_types` | Which business types may use this version |
| `template_versions.migrates_from_version` | The version this one supersedes |
| `template_versions.migration_notes` | How a contract built on the previous version is carried forward |
| `template_versions.published_by` / `published_at` | Who published it and when |

`protect_published_template_version` freezes content, schema version, version number, locales and
compatibility once published; the only permitted onward transition is `archived`. A published version
cannot be deleted. Rollback repoints `templates.current_version` and leaves newer versions published,
so the record of what was live remains readable — and a Growth Contract keeps its own immutable
`accepted_snapshot` regardless of any template change.

### Team and RBAC

| Table | Purpose |
|---|---|
| `public.team_invitations` | email_hash + masked_email + token_hash, role, expiry, accepted/revoked state |

`guard_last_owner` refuses to demote, deactivate or delete the last active owner; ownership must be
transferred first via `transfer_ownership`, which promotes the target and demotes the actor in one
transaction.

The role matrix itself lives in `src/server/qadam/rbac.ts` as data: 15 capabilities × 5 roles, with
seven marked critical. It is rendered to the owner and asserted cell-by-cell in the test suite.

### Plans and entitlements

Five plans (Free, Start, Growth, Pro, Partner) with nine entitlement keys, stored as
`plan_entitlements.value` jsonb scalars. `unlimited` is an explicit value; a missing grant resolves to
null, which callers treat as **not permitted**. A business with no subscription resolves against Free.

`consume_entitlement(business, key, amount, request_key)` is idempotent on the request key and refuses
with a structured payload naming the plan, limit and usage — the caller's draft is never touched.
`usage_counters` is unique on `(business_id, entitlement_key, period_start)`.

Billing is provider-neutral and **unconnected**: `subscriptions` gained `grace_period_ends_at`,
`cancel_at` and `last_provider_event_id`, a CHECK forbids a `provider_subscription_ref` while the
provider is `none`, and `billing_events` records signed provider events. Nothing writes to it yet.

### Privacy and retention

| Table | Purpose |
|---|---|
| `public.data_inventory` | Declared PII inventory: table, column, classification, storage form, lawful basis |
| `public.retention_policies` | Per record type: category, retention days, anonymise-instead-of-delete, lawful basis |

`privacy_requests` gained `export_token_hash`, `export_expires_at` and `export_downloaded_at` so an
export link is signed and expiring rather than open.

`anonymize_customer` deletes identities and notes, revokes and anonymises consent evidence, unlinks
transactions / redemptions / campaign events while keeping their amounts, marks the customer
`anonymized`, and adds a `privacy_delete` suppression entry. The privacy page renders both tables
directly from the database, so the document cannot drift from the schema.

### Platform analytics

`platform_overview(from, to, business_type, city)` returns aggregates only and withholds a filtered
segment containing fewer than five businesses, because a count of one is an identification.

### Performance indexes

| Index | Query it serves |
|---|---|
| `customers_list_cursor_idx` | Customers list cursor pagination (partial: excludes anonymized) |
| `customers_segment_idx` | Lifecycle segment filter |
| `signals_open_score_idx` | Today's top open signal (partial) |
| `recommendations_open_idx` | Open recommendation queue (partial) |
| `campaigns_active_idx` | Live campaigns on Today (partial) |
| `notifications_unread_idx` | Unread inbox (partial) |
| `impact_measurements_ledger_idx` | Impact ledger cursor pagination |
| `impact_measurements_campaign_kind_idx` | Per-campaign metric lookup |
| `campaign_events_campaign_type_idx` | Impact recompute aggregate |
| `customer_consents_granted_idx` | Audience build (partial: granted only) |
| `ai_generation_runs_period_idx`, `automation_runs_period_idx` | Admin analytics by period |

## Prompt 7 — привилегии, обходящие RLS (2026-08-01)

### Миграция `20260802020000_revoke_rls_bypassing_grants.sql`

Новых таблиц нет. Изменены **права**, и это изменение существеннее большинства новых таблиц.

Бутстрап Supabase выдаёт `GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated`.
Три привилегии из этого набора **не фильтруются политиками строк**:

| Привилегия | Чем опасна |
|---|---|
| `TRUNCATE` | Постгрес не консультируется с политиками при TRUNCATE. Подписанный пользователь любого тенанта мог выполнить `truncate public.customers cascade` и уничтожить данные **всех** тенантов, не имея права прочитать ни одной строки |
| `TRIGGER` | Позволяет повесить свою триггерную функцию на таблицу, которую видно только через политику. Триггер наблюдает строки, которые политика скрывает |
| `REFERENCES` | Позволяет создать внешний ключ на нечитаемую таблицу и по нарушениям ограничения выяснить, какие значения в ней есть |

Все три отозваны у `anon` и `authenticated`, вместе с default privileges, чтобы новая
таблица их не получила. `anon` дополнительно лишён `INSERT`, `UPDATE` и `DELETE`: у
незалогиненного посетителя есть ровно три пути — публичная витрина, страница QR и страница
приватности, и все три идут через security definer функции или серверный ключ.

`service_role` не тронут: это серверный ключ админ-клиента, он никогда не попадает в браузер
(`npm run check:secrets` это проверяет), и миграциям он нужен.

`supabase_admin` изменить из миграции нельзя (permission denied), поэтому страховкой от
возврата служит security-сьют: он падает, если хоть одна таблица в `public` снова выдаст
эти привилегии приложенческой роли.

### Права после миграции

| Роль | Права в `public` |
|---|---|
| `anon` | `SELECT` на 4 справочные таблицы |
| `authenticated` | `SELECT` 79, `INSERT` 70, `UPDATE` 65, `DELETE` 61 — всё под политиками строк |
| `service_role` | без изменений, серверный ключ |

### ERD

`docs/qadam/ERD.md` **генерируется из живой схемы** командой `node scripts/generate-erd.mjs`:
80 таблиц, 139 внешних ключей, сгруппированных по частям продукта, плюс диаграмма связей
между группами. Диаграмма не может разойтись со схемой, потому что строится из неё, а не из
чьей-то памяти.

Из 80 таблиц **67 несут `business_id`** — это тенантные таблицы, и изоляция каждой из них
проверяется автоматически (`node tests/security/rls-matrix.mjs`).
