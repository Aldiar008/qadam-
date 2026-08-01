# ERD — QADAM Growth OS

Сгенерировано из живой схемы: `node scripts/generate-erd.mjs`. Диаграмма не может разойтись
со схемой, потому что она из неё и строится. Всего таблиц: **80**, внешних
ключей: **139**.

Каждая таблица с колонкой `business_id` — тенантная: на ней включён row level security, и
изоляция проверяется автоматически (`node tests/security/rls-matrix.mjs`).

## Тенант и доступ

```mermaid
erDiagram
  businesses {
    uuid id "NOT NULL"
    uuid created_by "NOT NULL"
    uuid business_type_id
    text name "NOT NULL"
    text legal_name
    text currency "NOT NULL"
    text timezone "NOT NULL"
    text mode "NOT NULL"
    text status "NOT NULL"
    bool is_mock "NOT NULL"
    timestamptz created_at "NOT NULL"
    timestamptz updated_at "NOT NULL"
  }
  business_members {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    uuid user_id "NOT NULL"
    text role "NOT NULL"
    text status "NOT NULL"
    uuid invited_by
    bool is_mock "NOT NULL"
    timestamptz created_at "NOT NULL"
    timestamptz updated_at "NOT NULL"
  }
  business_locations {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    text name "NOT NULL"
    text city "NOT NULL"
    text district
    text address_text
    text timezone "NOT NULL"
    int capacity
    bool is_active "NOT NULL"
    bool is_mock "NOT NULL"
    timestamptz created_at "NOT NULL"
    timestamptz updated_at "NOT NULL"
  }
  business_profiles {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    bigint average_check_minor
    text currency "NOT NULL"
    int margin_floor_bps "NOT NULL"
    bigint monthly_marketing_budget_minor
    smallint profile_confidence
    jsonb source_evidence "NOT NULL"
    bool is_mock "NOT NULL"
    timestamptz created_at "NOT NULL"
    timestamptz updated_at "NOT NULL"
  }
  business_goals {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    text code "NOT NULL"
    bigint target_minor
    text currency
    date target_date
    smallint priority "NOT NULL"
    text status "NOT NULL"
    bool is_mock "NOT NULL"
    timestamptz created_at "NOT NULL"
    timestamptz updated_at "NOT NULL"
  }
  business_limits {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    bigint monthly_budget_minor "NOT NULL"
    text currency "NOT NULL"
    int max_campaigns_per_month "NOT NULL"
    int max_contacts_per_month "NOT NULL"
    bigint approval_threshold_minor "NOT NULL"
    bool is_mock "NOT NULL"
    timestamptz created_at "NOT NULL"
    timestamptz updated_at "NOT NULL"
  }
  profiles {
    uuid id "NOT NULL"
    text display_name
    text preferred_locale "NOT NULL"
    text timezone "NOT NULL"
    bool is_mock "NOT NULL"
    timestamptz created_at "NOT NULL"
    timestamptz updated_at "NOT NULL"
  }
  team_invitations {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    bytea email_hash "NOT NULL"
    text masked_email "NOT NULL"
    text role "NOT NULL"
    bytea token_hash "NOT NULL"
    text status "NOT NULL"
    uuid invited_by "NOT NULL"
    uuid accepted_by
    timestamptz expires_at "NOT NULL"
    timestamptz accepted_at
    timestamptz revoked_at
    text ellipsis "ещё 2 колонок"
  }
  operating_hours {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    uuid location_id "NOT NULL"
    smallint day_of_week "NOT NULL"
    time_without_time_zone opens_at
    time_without_time_zone closes_at
    bool is_closed "NOT NULL"
    bool is_mock "NOT NULL"
    timestamptz created_at "NOT NULL"
    timestamptz updated_at "NOT NULL"
  }
  feature_flags {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    text key "NOT NULL"
    bool enabled "NOT NULL"
    jsonb config "NOT NULL"
    bool is_mock "NOT NULL"
    timestamptz created_at "NOT NULL"
    timestamptz updated_at "NOT NULL"
  }
  onboarding_sessions {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    uuid user_id "NOT NULL"
    smallint current_step "NOT NULL"
    jsonb draft "NOT NULL"
    text import_mode
    text status "NOT NULL"
    int optimistic_version "NOT NULL"
    timestamptz completed_at
    bool is_mock "NOT NULL"
    timestamptz created_at "NOT NULL"
    timestamptz updated_at "NOT NULL"
  }
  businesses ||--o{ business_goals : "business_id"
  businesses ||--o{ business_limits : "business_id"
  businesses ||--o{ business_locations : "business_id"
  businesses ||--o{ business_members : "business_id"
  businesses ||--o{ business_profiles : "business_id"
  businesses ||--o{ feature_flags : "business_id"
  businesses ||--o{ onboarding_sessions : "business_id"
  businesses ||--o{ operating_hours : "business_id"
  business_locations ||--o{ operating_hours : "location_id"
  businesses ||--o{ team_invitations : "business_id"
```

## Клиенты и согласия

```mermaid
erDiagram
  customers {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    text display_name
    text preferred_locale
    text lifecycle_stage "NOT NULL"
    timestamptz first_seen_at
    timestamptz last_seen_at
    timestamptz anonymized_at
    bool is_mock "NOT NULL"
    timestamptz created_at "NOT NULL"
    timestamptz updated_at "NOT NULL"
  }
  customer_identities {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    uuid customer_id "NOT NULL"
    text identity_type "NOT NULL"
    bytea lookup_hash "NOT NULL"
    text masked_value "NOT NULL"
    timestamptz verified_at
    bool is_primary "NOT NULL"
    bool is_mock "NOT NULL"
    timestamptz created_at "NOT NULL"
  }
  customer_consents {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    uuid customer_id "NOT NULL"
    text scope "NOT NULL"
    text status "NOT NULL"
    text source "NOT NULL"
    jsonb evidence "NOT NULL"
    timestamptz granted_at
    timestamptz revoked_at
    timestamptz expires_at
    bool is_mock "NOT NULL"
    timestamptz created_at "NOT NULL"
  }
  customer_notes {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    uuid customer_id "NOT NULL"
    uuid author_id "NOT NULL"
    text note "NOT NULL"
    bool is_mock "NOT NULL"
    timestamptz created_at "NOT NULL"
    timestamptz updated_at "NOT NULL"
  }
  customer_segments {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    text code "NOT NULL"
    text name_ru "NOT NULL"
    text name_kk "NOT NULL"
    jsonb definition "NOT NULL"
    bool is_dynamic "NOT NULL"
    text status "NOT NULL"
    bool is_mock "NOT NULL"
    timestamptz created_at "NOT NULL"
    timestamptz updated_at "NOT NULL"
    int rule_version "NOT NULL"
    text ellipsis "ещё 1 колонок"
  }
  segment_memberships {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    uuid segment_id "NOT NULL"
    uuid customer_id "NOT NULL"
    timestamptz evaluated_at "NOT NULL"
    jsonb reason "NOT NULL"
    bool is_mock "NOT NULL"
  }
  transactions {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    uuid location_id
    uuid customer_id
    text external_ref
    timestamptz occurred_at "NOT NULL"
    bigint gross_minor "NOT NULL"
    bigint discount_minor "NOT NULL"
    bigint net_minor "NOT NULL"
    bigint cost_minor
    text currency "NOT NULL"
    text source "NOT NULL"
    text ellipsis "ещё 2 колонок"
  }
  transaction_items {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    uuid transaction_id "NOT NULL"
    uuid catalog_item_id
    text item_name "NOT NULL"
    int quantity "NOT NULL"
    bigint unit_price_minor "NOT NULL"
    bigint unit_cost_minor
    bigint total_minor "NOT NULL"
    text currency "NOT NULL"
    bool is_mock "NOT NULL"
    timestamptz created_at "NOT NULL"
  }
  data_imports {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    text source_type "NOT NULL"
    text status "NOT NULL"
    text storage_path
    int rows_total "NOT NULL"
    int rows_processed "NOT NULL"
    text checksum
    timestamptz started_at
    timestamptz completed_at
    bool is_mock "NOT NULL"
    timestamptz created_at "NOT NULL"
    text ellipsis "ещё 3 колонок"
  }
  data_import_errors {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    uuid data_import_id "NOT NULL"
    int row_number
    text code "NOT NULL"
    text message "NOT NULL"
    jsonb details "NOT NULL"
    bool is_mock "NOT NULL"
    timestamptz created_at "NOT NULL"
  }
  customers ||--o{ customer_consents : "customer_id"
  customers ||--o{ customer_identities : "customer_id"
  customers ||--o{ customer_notes : "customer_id"
  data_imports ||--o{ data_import_errors : "data_import_id"
  customers ||--o{ segment_memberships : "customer_id"
  customer_segments ||--o{ segment_memberships : "segment_id"
  transactions ||--o{ transaction_items : "transaction_id"
  customers ||--o{ transactions : "customer_id"
```

## Лояльность и QR

```mermaid
erDiagram
  loyalty_programs {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    text name "NOT NULL"
    text program_type "NOT NULL"
    jsonb rules "NOT NULL"
    text status "NOT NULL"
    bool is_mock "NOT NULL"
    timestamptz created_at "NOT NULL"
    timestamptz updated_at "NOT NULL"
  }
  loyalty_accounts {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    uuid loyalty_program_id "NOT NULL"
    uuid customer_id "NOT NULL"
    bigint points_balance "NOT NULL"
    int stamps_balance "NOT NULL"
    bool is_mock "NOT NULL"
    timestamptz created_at "NOT NULL"
    timestamptz updated_at "NOT NULL"
    int optimistic_version "NOT NULL"
  }
  loyalty_ledger {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    uuid loyalty_account_id "NOT NULL"
    text entry_type "NOT NULL"
    bigint points_delta "NOT NULL"
    int stamps_delta "NOT NULL"
    text source_type "NOT NULL"
    uuid source_id
    text idempotency_key "NOT NULL"
    timestamptz occurred_at "NOT NULL"
    jsonb metadata "NOT NULL"
    bool is_mock "NOT NULL"
    text ellipsis "ещё 1 колонок"
  }
  rewards {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    uuid loyalty_program_id
    text name_ru "NOT NULL"
    text name_kk "NOT NULL"
    bigint cost_points
    int cost_stamps
    int inventory_limit
    text status "NOT NULL"
    bool is_mock "NOT NULL"
    timestamptz created_at "NOT NULL"
    timestamptz updated_at "NOT NULL"
  }
  reward_redemptions {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    uuid reward_id "NOT NULL"
    uuid customer_id "NOT NULL"
    uuid loyalty_ledger_id "NOT NULL"
    text status "NOT NULL"
    timestamptz issued_at "NOT NULL"
    timestamptz redeemed_at
    bool is_mock "NOT NULL"
    text idempotency_key
  }
  qr_codes {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    uuid location_id
    bytea token_hash "NOT NULL"
    text purpose "NOT NULL"
    text status "NOT NULL"
    timestamptz expires_at
    uuid rotated_from_id
    bool is_mock "NOT NULL"
    timestamptz created_at "NOT NULL"
    uuid loyalty_program_id
    jsonb public_context "NOT NULL"
    text ellipsis "ещё 2 колонок"
  }
  qr_scans {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    uuid qr_code_id "NOT NULL"
    uuid customer_id
    timestamptz scanned_at "NOT NULL"
    jsonb coarse_location "NOT NULL"
    bytea user_agent_hash
    bool is_mock "NOT NULL"
    timestamptz created_at "NOT NULL"
    text request_key
    bytea ip_hash
    text scan_kind "NOT NULL"
  }
  loyalty_programs ||--o{ loyalty_accounts : "loyalty_program_id"
  loyalty_accounts ||--o{ loyalty_ledger : "loyalty_account_id"
  loyalty_programs ||--o{ qr_codes : "loyalty_program_id"
  qr_codes ||--o{ qr_scans : "qr_code_id"
  loyalty_ledger ||--o{ reward_redemptions : "loyalty_ledger_id"
  rewards ||--o{ reward_redemptions : "reward_id"
  loyalty_programs ||--o{ rewards : "loyalty_program_id"
```

## Сигналы и решения

```mermaid
erDiagram
  signals {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    uuid location_id
    text signal_type "NOT NULL"
    text metric_key "NOT NULL"
    timestamptz period_start "NOT NULL"
    timestamptz period_end "NOT NULL"
    timestamptz comparison_start "NOT NULL"
    timestamptz comparison_end "NOT NULL"
    int change_bps "NOT NULL"
    smallint growth_opportunity_score "NOT NULL"
    smallint confidence "NOT NULL"
    text ellipsis "ещё 10 колонок"
  }
  recommendations {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    uuid signal_id
    text title_ru "NOT NULL"
    text title_kk "NOT NULL"
    jsonb explanation "NOT NULL"
    smallint confidence "NOT NULL"
    text status "NOT NULL"
    timestamptz snoozed_until
    uuid acted_by
    timestamptz acted_at
    bool is_mock "NOT NULL"
    text ellipsis "ещё 6 колонок"
  }
  growth_contracts {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    uuid signal_id "NOT NULL"
    uuid recommendation_id
    int schema_version "NOT NULL"
    int version "NOT NULL"
    text status "NOT NULL"
    jsonb accepted_snapshot "NOT NULL"
    text content_hash "NOT NULL"
    uuid created_by "NOT NULL"
    uuid approved_by
    timestamptz approved_at
    text ellipsis "ещё 11 колонок"
  }
  forecast_runs {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    uuid growth_contract_id "NOT NULL"
    text formula_version "NOT NULL"
    jsonb assumptions "NOT NULL"
    jsonb pessimistic "NOT NULL"
    jsonb base "NOT NULL"
    jsonb optimistic "NOT NULL"
    int margin_floor_bps "NOT NULL"
    int cannibalization_risk_bps "NOT NULL"
    bool passed_margin_shield "NOT NULL"
    bool is_mock "NOT NULL"
    text ellipsis "ещё 2 колонок"
  }
  ai_generation_runs {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    uuid growth_contract_id
    text purpose "NOT NULL"
    text model "NOT NULL"
    text prompt_version "NOT NULL"
    text input_hash "NOT NULL"
    jsonb output
    text status "NOT NULL"
    jsonb safety_evidence "NOT NULL"
    jsonb token_usage "NOT NULL"
    bool is_mock "NOT NULL"
    text ellipsis "ещё 11 колонок"
  }
  ai_usage_quota {
    uuid business_id "NOT NULL"
    date window_date "NOT NULL"
    int generations "NOT NULL"
    bigint cost_micros "NOT NULL"
    timestamptz updated_at "NOT NULL"
  }
  campaign_drafts {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    uuid user_id "NOT NULL"
    smallint current_step "NOT NULL"
    jsonb draft "NOT NULL"
    uuid growth_contract_id
    text status "NOT NULL"
    int optimistic_version "NOT NULL"
    bool is_mock "NOT NULL"
    timestamptz created_at "NOT NULL"
    timestamptz updated_at "NOT NULL"
  }
  brand_memory {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    text locale "NOT NULL"
    jsonb voice_rules "NOT NULL"
    jsonb banned_phrases "NOT NULL"
    jsonb source_evidence "NOT NULL"
    bool is_mock "NOT NULL"
    timestamptz created_at "NOT NULL"
    timestamptz updated_at "NOT NULL"
  }
  growth_contracts ||--o{ ai_generation_runs : "growth_contract_id"
  growth_contracts ||--o{ campaign_drafts : "growth_contract_id"
  growth_contracts ||--o{ forecast_runs : "growth_contract_id"
  recommendations ||--o{ growth_contracts : "recommendation_id"
  signals ||--o{ growth_contracts : "signal_id"
  signals ||--o{ recommendations : "signal_id"
```

## Кампании и исполнение

```mermaid
erDiagram
  campaigns {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    uuid growth_contract_id "NOT NULL"
    text name "NOT NULL"
    text status "NOT NULL"
    text channel "NOT NULL"
    bigint budget_minor "NOT NULL"
    text currency "NOT NULL"
    timestamptz starts_at
    timestamptz ends_at
    jsonb stop_rule "NOT NULL"
    uuid created_by "NOT NULL"
    text ellipsis "ещё 6 колонок"
  }
  campaign_audiences {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    uuid campaign_id "NOT NULL"
    uuid customer_id
    uuid segment_id
    text inclusion_status "NOT NULL"
    text exclusion_reason
    text consent_scope
    text consent_status
    timestamptz evaluated_at "NOT NULL"
    jsonb rules_evidence "NOT NULL"
    bool is_mock "NOT NULL"
  }
  campaign_deliveries {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    uuid campaign_id "NOT NULL"
    uuid customer_id "NOT NULL"
    uuid content_item_id
    text provider_message_ref
    text idempotency_key "NOT NULL"
    text status "NOT NULL"
    timestamptz queued_at "NOT NULL"
    timestamptz sent_at
    timestamptz delivered_at
    text failure_code
    text ellipsis "ещё 2 колонок"
  }
  campaign_events {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    uuid campaign_id "NOT NULL"
    uuid delivery_id
    uuid customer_id
    text event_type "NOT NULL"
    timestamptz occurred_at "NOT NULL"
    text source "NOT NULL"
    text external_event_ref
    jsonb metadata "NOT NULL"
    bool is_mock "NOT NULL"
    timestamptz created_at "NOT NULL"
  }
  content_items {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    uuid campaign_id
    text content_kind "NOT NULL"
    text channel "NOT NULL"
    text locale "NOT NULL"
    text body "NOT NULL"
    text alt_text
    text cta
    text status "NOT NULL"
    int version "NOT NULL"
    bool is_mock "NOT NULL"
    text ellipsis "ещё 2 колонок"
  }
  promotions {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    uuid campaign_id "NOT NULL"
    text mechanism "NOT NULL"
    jsonb rules "NOT NULL"
    bigint min_order_minor
    bigint estimated_unit_cost_minor
    text currency "NOT NULL"
    bool is_mock "NOT NULL"
    timestamptz created_at "NOT NULL"
    timestamptz updated_at "NOT NULL"
  }
  redemptions {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    uuid campaign_id "NOT NULL"
    uuid promotion_id
    uuid customer_id
    uuid transaction_id
    uuid tracking_code_id
    timestamptz redeemed_at "NOT NULL"
    bigint order_total_minor "NOT NULL"
    bigint campaign_cost_minor "NOT NULL"
    text currency "NOT NULL"
    bool is_mock "NOT NULL"
    text ellipsis "ещё 1 колонок"
  }
  tracking_codes {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    uuid campaign_id "NOT NULL"
    uuid content_item_id
    bytea code_hash "NOT NULL"
    text public_code "NOT NULL"
    text purpose "NOT NULL"
    timestamptz expires_at
    bool is_mock "NOT NULL"
    timestamptz created_at "NOT NULL"
  }
  outbox_events {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    text aggregate_type "NOT NULL"
    uuid aggregate_id "NOT NULL"
    text event_type "NOT NULL"
    jsonb payload "NOT NULL"
    text status "NOT NULL"
    int attempts "NOT NULL"
    timestamptz available_at "NOT NULL"
    timestamptz processed_at
    text idempotency_key "NOT NULL"
    bool is_mock "NOT NULL"
    text ellipsis "ещё 6 колонок"
  }
  provider_events {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    text provider "NOT NULL"
    text channel "NOT NULL"
    text external_event_id "NOT NULL"
    text event_type "NOT NULL"
    uuid delivery_id
    uuid campaign_id
    bool signature_verified "NOT NULL"
    timestamptz received_at "NOT NULL"
    jsonb payload "NOT NULL"
    timestamptz processed_at
    text ellipsis "ещё 1 колонок"
  }
  business_channels {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    text channel_type "NOT NULL"
    text status "NOT NULL"
    text external_account_ref
    jsonb settings "NOT NULL"
    bool is_mock "NOT NULL"
    timestamptz created_at "NOT NULL"
    timestamptz updated_at "NOT NULL"
    text connector_state "NOT NULL"
    text adapter "NOT NULL"
    timestamptz last_health_check_at
    text ellipsis "ещё 2 колонок"
  }
  business_execution_state {
    uuid business_id "NOT NULL"
    timestamptz emergency_stopped_at
    uuid emergency_stopped_by
    text emergency_stop_reason
    time_without_time_zone quiet_hours_start "NOT NULL"
    time_without_time_zone quiet_hours_end "NOT NULL"
    text timezone "NOT NULL"
    int daily_send_cap "NOT NULL"
    timestamptz updated_at "NOT NULL"
  }
  suppression_entries {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    uuid customer_id
    bytea identity_hash
    text channel
    text reason "NOT NULL"
    timestamptz created_at "NOT NULL"
    bool is_mock "NOT NULL"
  }
  automations {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    text name "NOT NULL"
    text automation_type "NOT NULL"
    jsonb trigger_rules "NOT NULL"
    jsonb action_rules "NOT NULL"
    jsonb guardrails "NOT NULL"
    text status "NOT NULL"
    uuid created_by "NOT NULL"
    bool is_mock "NOT NULL"
    timestamptz created_at "NOT NULL"
    timestamptz updated_at "NOT NULL"
    text ellipsis "ещё 9 колонок"
  }
  automation_runs {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    uuid automation_id "NOT NULL"
    text status "NOT NULL"
    text idempotency_key "NOT NULL"
    timestamptz scheduled_at "NOT NULL"
    timestamptz started_at
    timestamptz completed_at
    jsonb result "NOT NULL"
    bool is_mock "NOT NULL"
    timestamptz created_at "NOT NULL"
    smallint attempt "NOT NULL"
    text ellipsis "ещё 2 колонок"
  }
  automations ||--o{ automation_runs : "automation_id"
  campaigns ||--o{ campaign_audiences : "campaign_id"
  campaigns ||--o{ campaign_deliveries : "campaign_id"
  content_items ||--o{ campaign_deliveries : "content_item_id"
  campaigns ||--o{ campaign_events : "campaign_id"
  campaign_deliveries ||--o{ campaign_events : "delivery_id"
  campaigns ||--o{ content_items : "campaign_id"
  campaigns ||--o{ promotions : "campaign_id"
  campaigns ||--o{ provider_events : "campaign_id"
  campaign_deliveries ||--o{ provider_events : "delivery_id"
  campaigns ||--o{ redemptions : "campaign_id"
  promotions ||--o{ redemptions : "promotion_id"
  tracking_codes ||--o{ redemptions : "tracking_code_id"
  campaigns ||--o{ tracking_codes : "campaign_id"
  content_items ||--o{ tracking_codes : "content_item_id"
```

## Измерение

```mermaid
erDiagram
  impact_baselines {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    uuid campaign_id "NOT NULL"
    text measurement_version "NOT NULL"
    text method "NOT NULL"
    int audience_size "NOT NULL"
    int baseline_orders "NOT NULL"
    bigint baseline_revenue_minor "NOT NULL"
    timestamptz baseline_period_start "NOT NULL"
    timestamptz baseline_period_end "NOT NULL"
    int min_sample_size "NOT NULL"
    jsonb evidence "NOT NULL"
    text ellipsis "ещё 2 колонок"
  }
  impact_measurements {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    uuid campaign_id
    uuid growth_contract_id
    text metric_key "NOT NULL"
    text kind "NOT NULL"
    bigint value_minor "NOT NULL"
    text unit "NOT NULL"
    text currency
    timestamptz period_start "NOT NULL"
    timestamptz period_end "NOT NULL"
    text source "NOT NULL"
    text ellipsis "ещё 5 колонок"
  }
  daily_analytics {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    uuid location_id
    date metric_date "NOT NULL"
    bigint gross_revenue_minor "NOT NULL"
    int transactions_count "NOT NULL"
    int new_customers_count "NOT NULL"
    int repeat_customers_count "NOT NULL"
    text currency "NOT NULL"
    text source "NOT NULL"
    bool is_mock "NOT NULL"
    timestamptz created_at "NOT NULL"
  }
  capacity_slots {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    uuid location_id "NOT NULL"
    timestamptz starts_at "NOT NULL"
    timestamptz ends_at "NOT NULL"
    int capacity "NOT NULL"
    int booked "NOT NULL"
    bool is_mock "NOT NULL"
    timestamptz created_at "NOT NULL"
    timestamptz updated_at "NOT NULL"
  }
  catalog_items {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    uuid location_id
    text sku
    text item_kind "NOT NULL"
    text name_ru "NOT NULL"
    text name_kk
    bigint price_minor "NOT NULL"
    bigint cost_minor
    text currency "NOT NULL"
    bool is_active "NOT NULL"
    bool is_mock "NOT NULL"
    text ellipsis "ещё 2 колонок"
  }
```

## Витрина «Акции рядом»

```mermaid
erDiagram
  nearby_offers {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    uuid location_id "NOT NULL"
    uuid campaign_id
    text title_ru "NOT NULL"
    text title_kk "NOT NULL"
    text description_ru "NOT NULL"
    text description_kk "NOT NULL"
    text district "NOT NULL"
    numeric latitude_rounded
    numeric longitude_rounded
    text status "NOT NULL"
    text ellipsis "ещё 12 колонок"
  }
  nearby_offer_events {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    uuid nearby_offer_id "NOT NULL"
    text event_kind "NOT NULL"
    timestamptz occurred_at "NOT NULL"
    text request_key "NOT NULL"
    text coarse_district
    bool is_mock "NOT NULL"
  }
  nearby_offers ||--o{ nearby_offer_events : "nearby_offer_id"
```

## Каталог платформы

```mermaid
erDiagram
  tools {
    uuid id "NOT NULL"
    uuid category_id "NOT NULL"
    text code "NOT NULL"
    text name_ru "NOT NULL"
    text name_kk "NOT NULL"
    text description_ru "NOT NULL"
    text description_kk "NOT NULL"
    text route "NOT NULL"
    text status "NOT NULL"
    int version "NOT NULL"
    bool is_public "NOT NULL"
    bool is_mock "NOT NULL"
    text ellipsis "ещё 4 колонок"
  }
  tool_categories {
    uuid id "NOT NULL"
    text code "NOT NULL"
    text name_ru "NOT NULL"
    text name_kk "NOT NULL"
    text status "NOT NULL"
    int sort_order "NOT NULL"
    bool is_mock "NOT NULL"
    timestamptz created_at "NOT NULL"
    timestamptz updated_at "NOT NULL"
    timestamptz deprecated_at
  }
  business_types {
    uuid id "NOT NULL"
    text code "NOT NULL"
    text name_ru "NOT NULL"
    text name_kk "NOT NULL"
    text status "NOT NULL"
    bool is_public "NOT NULL"
    bool is_mock "NOT NULL"
    timestamptz created_at "NOT NULL"
    timestamptz updated_at "NOT NULL"
    timestamptz deprecated_at
  }
  business_tools {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    uuid tool_id "NOT NULL"
    text status "NOT NULL"
    uuid activated_by "NOT NULL"
    bool is_mock "NOT NULL"
    timestamptz created_at "NOT NULL"
    timestamptz updated_at "NOT NULL"
  }
  favorite_tools {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    uuid tool_id "NOT NULL"
    uuid user_id "NOT NULL"
    bool is_mock "NOT NULL"
    timestamptz created_at "NOT NULL"
  }
  templates {
    uuid id "NOT NULL"
    text code "NOT NULL"
    text name "NOT NULL"
    text status "NOT NULL"
    int current_version
    bool is_mock "NOT NULL"
    timestamptz created_at "NOT NULL"
    timestamptz updated_at "NOT NULL"
    array business_type_codes "NOT NULL"
    timestamptz archived_at
  }
  template_versions {
    uuid id "NOT NULL"
    uuid template_id "NOT NULL"
    int version "NOT NULL"
    int schema_version "NOT NULL"
    jsonb content "NOT NULL"
    text status "NOT NULL"
    timestamptz published_at
    uuid created_by
    bool is_mock "NOT NULL"
    timestamptz created_at "NOT NULL"
    array locales "NOT NULL"
    array compatible_business_types "NOT NULL"
    text ellipsis "ещё 4 колонок"
  }
  tools ||--o{ business_tools : "tool_id"
  tools ||--o{ favorite_tools : "tool_id"
  templates ||--o{ template_versions : "template_id"
  tool_categories ||--o{ tools : "category_id"
```

## Тарифы и биллинг

```mermaid
erDiagram
  plans {
    uuid id "NOT NULL"
    text code "NOT NULL"
    text name "NOT NULL"
    text status "NOT NULL"
    bigint price_minor "NOT NULL"
    text currency "NOT NULL"
    text billing_period "NOT NULL"
    bool is_public "NOT NULL"
    bool is_mock "NOT NULL"
    timestamptz created_at "NOT NULL"
    timestamptz updated_at "NOT NULL"
    smallint tier_order "NOT NULL"
    text ellipsis "ещё 2 колонок"
  }
  entitlements {
    uuid id "NOT NULL"
    text key "NOT NULL"
    text description "NOT NULL"
    text value_kind "NOT NULL"
    bool is_mock "NOT NULL"
    timestamptz created_at "NOT NULL"
  }
  plan_entitlements {
    uuid id "NOT NULL"
    uuid plan_id "NOT NULL"
    uuid entitlement_id "NOT NULL"
    jsonb value "NOT NULL"
    bool is_mock "NOT NULL"
    timestamptz created_at "NOT NULL"
  }
  subscriptions {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    uuid plan_id "NOT NULL"
    text provider "NOT NULL"
    text provider_subscription_ref
    text status "NOT NULL"
    timestamptz period_start "NOT NULL"
    timestamptz period_end "NOT NULL"
    bool is_mock "NOT NULL"
    timestamptz created_at "NOT NULL"
    timestamptz updated_at "NOT NULL"
    timestamptz grace_period_ends_at
    text ellipsis "ещё 2 колонок"
  }
  usage_counters {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    text entitlement_key "NOT NULL"
    timestamptz period_start "NOT NULL"
    timestamptz period_end "NOT NULL"
    bigint used "NOT NULL"
    bool is_mock "NOT NULL"
    timestamptz created_at "NOT NULL"
    timestamptz updated_at "NOT NULL"
  }
  billing_events {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    text provider "NOT NULL"
    text external_event_id "NOT NULL"
    text event_type "NOT NULL"
    bool signature_verified "NOT NULL"
    jsonb payload "NOT NULL"
    timestamptz processed_at
    timestamptz received_at "NOT NULL"
    bool is_mock "NOT NULL"
  }
  entitlements ||--o{ plan_entitlements : "entitlement_id"
  plans ||--o{ plan_entitlements : "plan_id"
  plans ||--o{ subscriptions : "plan_id"
```

## Управление и приватность

```mermaid
erDiagram
  admin_audit_log {
    uuid id "NOT NULL"
    uuid actor_id "NOT NULL"
    text actor_role "NOT NULL"
    text action "NOT NULL"
    text resource_type "NOT NULL"
    uuid resource_id
    text resource_code
    jsonb before_state
    jsonb after_state
    text reason "NOT NULL"
    timestamptz reauth_verified_at
    timestamptz occurred_at "NOT NULL"
  }
  activity_logs {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    uuid actor_id
    text action "NOT NULL"
    text resource_type "NOT NULL"
    uuid resource_id
    text before_hash
    text after_hash
    jsonb metadata "NOT NULL"
    timestamptz occurred_at "NOT NULL"
    bool is_mock "NOT NULL"
    timestamptz created_at "NOT NULL"
  }
  notifications {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    uuid user_id
    text notification_type "NOT NULL"
    text title "NOT NULL"
    text body "NOT NULL"
    timestamptz read_at
    text action_url
    bool is_mock "NOT NULL"
    timestamptz created_at "NOT NULL"
    text category "NOT NULL"
    timestamptz dismissed_at
  }
  notification_preferences {
    uuid business_id "NOT NULL"
    uuid user_id "NOT NULL"
    text category "NOT NULL"
    bool muted "NOT NULL"
    timestamptz updated_at "NOT NULL"
  }
  privacy_requests {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    uuid customer_id "NOT NULL"
    text request_type "NOT NULL"
    text status "NOT NULL"
    bytea requester_hash "NOT NULL"
    text idempotency_key "NOT NULL"
    jsonb result_summary "NOT NULL"
    timestamptz requested_at "NOT NULL"
    timestamptz completed_at
    bool is_mock "NOT NULL"
    timestamptz created_at "NOT NULL"
    text ellipsis "ещё 3 колонок"
  }
  data_inventory {
    text table_name "NOT NULL"
    text column_name "NOT NULL"
    text classification "NOT NULL"
    bool contains_pii "NOT NULL"
    text storage_form "NOT NULL"
    text lawful_basis "NOT NULL"
    text notes
  }
  retention_policies {
    text record_type "NOT NULL"
    text category "NOT NULL"
    bool contains_pii "NOT NULL"
    int retain_days
    bool anonymize_instead_of_delete "NOT NULL"
    text lawful_basis "NOT NULL"
    text notes
  }
  platform_events {
    uuid id "NOT NULL"
    text event_type "NOT NULL"
    uuid actor_id
    uuid business_id
    jsonb payload "NOT NULL"
    timestamptz occurred_at "NOT NULL"
    bool is_mock "NOT NULL"
    timestamptz created_at "NOT NULL"
  }
  source_connections {
    uuid id "NOT NULL"
    uuid business_id "NOT NULL"
    text provider "NOT NULL"
    text connection_kind "NOT NULL"
    text status "NOT NULL"
    text credential_reference
    text external_account_ref
    timestamptz last_synced_at
    jsonb settings "NOT NULL"
    bool is_mock "NOT NULL"
    timestamptz created_at "NOT NULL"
    timestamptz updated_at "NOT NULL"
  }
```

## Связи между группами

```mermaid
erDiagram
  Тенант_и_доступ ||--o{ Управление_и_приватность : ссылается
  Тенант_и_доступ ||--o{ Сигналы_и_решения : ссылается
  Тенант_и_доступ ||--o{ Кампании_и_исполнение : ссылается
  Тенант_и_доступ ||--o{ Тарифы_и_биллинг : ссылается
  Тенант_и_доступ ||--o{ Каталог_платформы : ссылается
  Каталог_платформы ||--o{ Тенант_и_доступ : ссылается
  Клиенты_и_согласия ||--o{ Кампании_и_исполнение : ссылается
  Сигналы_и_решения ||--o{ Кампании_и_исполнение : ссылается
  Тенант_и_доступ ||--o{ Измерение : ссылается
  Тенант_и_доступ ||--o{ Клиенты_и_согласия : ссылается
  Кампании_и_исполнение ||--o{ Измерение : ссылается
  Сигналы_и_решения ||--o{ Измерение : ссылается
  Тенант_и_доступ ||--o{ Лояльность_и_QR : ссылается
  Клиенты_и_согласия ||--o{ Лояльность_и_QR : ссылается
  Тенант_и_доступ ||--o{ Витрина__Акции_рядом_ : ссылается
  Кампании_и_исполнение ||--o{ Витрина__Акции_рядом_ : ссылается
  Клиенты_и_согласия ||--o{ Управление_и_приватность : ссылается
  Измерение ||--o{ Клиенты_и_согласия : ссылается
```
