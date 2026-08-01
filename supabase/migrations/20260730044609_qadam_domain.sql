begin;
create table public.operating_hours (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 location_id uuid not null references public.business_locations(id) on delete cascade, day_of_week smallint not null check (day_of_week between 0 and 6),
 opens_at time, closes_at time, is_closed boolean not null default false, is_mock boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(location_id,day_of_week), check (is_closed or (opens_at is not null and closes_at is not null and closes_at > opens_at))
);
create table public.capacity_slots (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 location_id uuid not null references public.business_locations(id) on delete cascade, starts_at timestamptz not null, ends_at timestamptz not null,
 capacity integer not null check (capacity >= 0), booked integer not null default 0 check (booked >= 0 and booked <= capacity),
 is_mock boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(location_id,starts_at), check (ends_at > starts_at)
);
create table public.catalog_items (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 location_id uuid references public.business_locations(id) on delete cascade, sku text, item_kind text not null check (item_kind in ('product','service')),
 name_ru text not null, name_kk text, price_minor bigint not null check (price_minor >= 0), cost_minor bigint check (cost_minor is null or cost_minor >= 0),
 currency text not null default 'KZT' check (currency ~ '^[A-Z]{3}$'), is_active boolean not null default true, is_mock boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(business_id,sku)
);
create table public.data_imports (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 source_type text not null, status text not null default 'pending' check (status in ('pending','validating','running','completed','failed','canceled')),
 storage_path text, rows_total integer not null default 0 check (rows_total >= 0), rows_processed integer not null default 0 check (rows_processed >= 0),
 checksum text, started_at timestamptz, completed_at timestamptz, is_mock boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.data_import_errors (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 data_import_id uuid not null references public.data_imports(id) on delete cascade, row_number integer check (row_number is null or row_number > 0),
 code text not null, message text not null, details jsonb not null default '{}'::jsonb, is_mock boolean not null default false,
 created_at timestamptz not null default now()
);
create table public.source_connections (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 provider text not null, connection_kind text not null, status text not null default 'not_connected' check (status in ('not_connected','pending','connected','disabled','error')),
 credential_reference text, external_account_ref text, last_synced_at timestamptz, settings jsonb not null default '{}'::jsonb,
 is_mock boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(business_id,provider,connection_kind), check (credential_reference is null or credential_reference !~* '(secret|password|token)=')
);
create table public.customers (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 display_name text, preferred_locale text check (preferred_locale is null or preferred_locale in ('ru','kk')),
 lifecycle_stage text not null default 'new' check (lifecycle_stage in ('new','active','loyal','vip','inactive','churned','anonymized')),
 first_seen_at timestamptz, last_seen_at timestamptz, anonymized_at timestamptz, is_mock boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.customer_identities (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 customer_id uuid not null references public.customers(id) on delete cascade,
 identity_type text not null check (identity_type in ('phone','email','telegram','whatsapp','external')),
 lookup_hash bytea not null, masked_value text not null, verified_at timestamptz, is_primary boolean not null default false,
 is_mock boolean not null default false, created_at timestamptz not null default now(), unique(business_id,identity_type,lookup_hash)
);
create table public.customer_consents (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 customer_id uuid not null references public.customers(id) on delete cascade, scope text not null,
 status text not null check (status in ('granted','denied','revoked','expired')), source text not null,
 evidence jsonb not null default '{}'::jsonb, granted_at timestamptz, revoked_at timestamptz, expires_at timestamptz,
 is_mock boolean not null default false, created_at timestamptz not null default now(),
 check ((status='granted' and granted_at is not null) or status<>'granted')
);
create table public.customer_notes (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 customer_id uuid not null references public.customers(id) on delete cascade, author_id uuid not null references auth.users(id) on delete restrict,
 note text not null check (char_length(note) between 1 and 5000), is_mock boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.transactions (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 location_id uuid references public.business_locations(id) on delete set null, customer_id uuid references public.customers(id) on delete set null,
 external_ref text, occurred_at timestamptz not null, gross_minor bigint not null check (gross_minor >= 0),
 discount_minor bigint not null default 0 check (discount_minor >= 0), net_minor bigint not null check (net_minor >= 0),
 cost_minor bigint check (cost_minor is null or cost_minor >= 0), currency text not null default 'KZT' check (currency ~ '^[A-Z]{3}$'),
 source text not null default 'manual', is_mock boolean not null default false, created_at timestamptz not null default now(),
 unique(business_id,source,external_ref), check (discount_minor <= gross_minor and net_minor <= gross_minor)
);
create table public.transaction_items (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 transaction_id uuid not null references public.transactions(id) on delete cascade, catalog_item_id uuid references public.catalog_items(id) on delete set null,
 item_name text not null, quantity integer not null check (quantity > 0), unit_price_minor bigint not null check (unit_price_minor >= 0),
 unit_cost_minor bigint check (unit_cost_minor is null or unit_cost_minor >= 0), total_minor bigint not null check (total_minor >= 0),
 currency text not null default 'KZT' check (currency ~ '^[A-Z]{3}$'), is_mock boolean not null default false, created_at timestamptz not null default now()
);
create table public.customer_segments (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 code text not null, name_ru text not null, name_kk text not null, definition jsonb not null, is_dynamic boolean not null default true,
 status text not null default 'active' check (status in ('active','archived')), is_mock boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(business_id,code)
);
create table public.segment_memberships (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 segment_id uuid not null references public.customer_segments(id) on delete cascade, customer_id uuid not null references public.customers(id) on delete cascade,
 evaluated_at timestamptz not null default now(), reason jsonb not null default '{}'::jsonb, is_mock boolean not null default false,
 unique(segment_id,customer_id)
);
create table public.loyalty_programs (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 name text not null, program_type text not null check (program_type in ('points','stamps','hybrid')), rules jsonb not null,
 status text not null default 'draft' check (status in ('draft','active','paused','archived')), is_mock boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.loyalty_accounts (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 loyalty_program_id uuid not null references public.loyalty_programs(id) on delete cascade, customer_id uuid not null references public.customers(id) on delete cascade,
 points_balance bigint not null default 0 check (points_balance >= 0), stamps_balance integer not null default 0 check (stamps_balance >= 0),
 is_mock boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(loyalty_program_id,customer_id)
);
create table public.loyalty_ledger (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 loyalty_account_id uuid not null references public.loyalty_accounts(id) on delete restrict,
 entry_type text not null check (entry_type in ('earn','redeem','expire','adjustment')), points_delta bigint not null default 0,
 stamps_delta integer not null default 0, source_type text not null, source_id uuid, idempotency_key text not null,
 occurred_at timestamptz not null default now(), metadata jsonb not null default '{}'::jsonb, is_mock boolean not null default false,
 created_at timestamptz not null default now(), unique(business_id,idempotency_key)
);
create table public.qr_codes (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 location_id uuid references public.business_locations(id) on delete cascade, token_hash bytea not null unique,
 purpose text not null check (purpose in ('loyalty_join','reward','promotion','nearby_offer','tracking')),
 status text not null default 'active' check (status in ('active','rotated','expired','revoked')),
 expires_at timestamptz, rotated_from_id uuid references public.qr_codes(id) on delete set null, is_mock boolean not null default false,
 created_at timestamptz not null default now()
);
create table public.qr_scans (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 qr_code_id uuid not null references public.qr_codes(id) on delete restrict, customer_id uuid references public.customers(id) on delete set null,
 scanned_at timestamptz not null default now(), coarse_location jsonb not null default '{}'::jsonb,
 user_agent_hash bytea, is_mock boolean not null default false, created_at timestamptz not null default now()
);
create table public.rewards (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 loyalty_program_id uuid references public.loyalty_programs(id) on delete cascade, name_ru text not null, name_kk text not null,
 cost_points bigint check (cost_points is null or cost_points >= 0), cost_stamps integer check (cost_stamps is null or cost_stamps >= 0),
 inventory_limit integer check (inventory_limit is null or inventory_limit >= 0),
 status text not null default 'active' check (status in ('active','paused','archived')), is_mock boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.reward_redemptions (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 reward_id uuid not null references public.rewards(id) on delete restrict, customer_id uuid not null references public.customers(id) on delete restrict,
 loyalty_ledger_id uuid not null unique references public.loyalty_ledger(id) on delete restrict,
 status text not null default 'issued' check (status in ('issued','redeemed','expired','canceled')),
 issued_at timestamptz not null default now(), redeemed_at timestamptz, is_mock boolean not null default false
);
create table public.signals (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 location_id uuid references public.business_locations(id) on delete set null, signal_type text not null, metric_key text not null,
 period_start timestamptz not null, period_end timestamptz not null, comparison_start timestamptz not null, comparison_end timestamptz not null,
 change_bps integer not null, growth_opportunity_score smallint not null check (growth_opportunity_score between 0 and 100),
 confidence smallint not null check (confidence between 0 and 100), status text not null default 'open' check (status in ('open','acknowledged','resolved','dismissed')),
 evidence jsonb not null, detected_at timestamptz not null default now(), is_mock boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check (period_end > period_start and comparison_end > comparison_start)
);
create table public.recommendations (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 signal_id uuid references public.signals(id) on delete set null, title_ru text not null, title_kk text not null,
 explanation jsonb not null, confidence smallint not null check (confidence between 0 and 100),
 status text not null default 'pending' check (status in ('pending','accepted','edited','snoozed','rejected','expired')),
 snoozed_until timestamptz, acted_by uuid references auth.users(id) on delete set null, acted_at timestamptz,
 is_mock boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.growth_contracts (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 signal_id uuid not null references public.signals(id) on delete restrict, recommendation_id uuid references public.recommendations(id) on delete set null,
 schema_version integer not null check (schema_version > 0), version integer not null default 1 check (version > 0),
 status text not null default 'draft' check (status in ('draft','approved','launched','paused','completed','rejected','archived')),
 accepted_snapshot jsonb not null, content_hash text not null, created_by uuid not null references auth.users(id) on delete restrict,
 approved_by uuid references auth.users(id) on delete restrict, approved_at timestamptz,
 is_mock boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(business_id,id,version), check ((status='draft') or jsonb_typeof(accepted_snapshot)='object')
);
create table public.forecast_runs (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 growth_contract_id uuid not null references public.growth_contracts(id) on delete cascade,
 formula_version text not null, assumptions jsonb not null, pessimistic jsonb not null, base jsonb not null, optimistic jsonb not null,
 margin_floor_bps integer not null check (margin_floor_bps between 0 and 10000), cannibalization_risk_bps integer not null check (cannibalization_risk_bps between 0 and 10000),
 passed_margin_shield boolean not null, is_mock boolean not null default false, created_at timestamptz not null default now()
);
create table public.campaigns (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 growth_contract_id uuid not null references public.growth_contracts(id) on delete restrict,
 name text not null, status text not null default 'draft' check (status in ('draft','pending_approval','approved','scheduled','running','paused','completed','canceled','failed')),
 channel text not null check (channel in ('whatsapp','telegram','sms','email','instagram','push','qr','in_app')),
 budget_minor bigint not null default 0 check (budget_minor >= 0), currency text not null default 'KZT' check (currency ~ '^[A-Z]{3}$'),
 starts_at timestamptz, ends_at timestamptz, stop_rule jsonb not null, created_by uuid not null references auth.users(id) on delete restrict,
 approved_by uuid references auth.users(id) on delete restrict, is_mock boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create table public.promotions (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 campaign_id uuid not null references public.campaigns(id) on delete cascade, mechanism text not null,
 rules jsonb not null, min_order_minor bigint check (min_order_minor is null or min_order_minor >= 0),
 estimated_unit_cost_minor bigint check (estimated_unit_cost_minor is null or estimated_unit_cost_minor >= 0),
 currency text not null default 'KZT' check (currency ~ '^[A-Z]{3}$'), is_mock boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.campaign_audiences (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 campaign_id uuid not null references public.campaigns(id) on delete cascade, customer_id uuid references public.customers(id) on delete cascade,
 segment_id uuid references public.customer_segments(id) on delete set null, inclusion_status text not null check (inclusion_status in ('included','excluded')),
 exclusion_reason text, consent_scope text, consent_status text check (consent_status is null or consent_status in ('granted','denied','revoked','expired','missing')),
 evaluated_at timestamptz not null default now(), rules_evidence jsonb not null default '{}'::jsonb, is_mock boolean not null default false,
 unique(campaign_id,customer_id), check (customer_id is not null or segment_id is not null)
);
create table public.content_items (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 campaign_id uuid references public.campaigns(id) on delete cascade, content_kind text not null, channel text not null,
 locale text not null check (locale in ('ru','kk')), body text not null, alt_text text, cta text, status text not null default 'draft' check (status in ('draft','approved','published','archived')),
 version integer not null default 1 check (version > 0), is_mock boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.tracking_codes (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 campaign_id uuid not null references public.campaigns(id) on delete cascade, content_item_id uuid references public.content_items(id) on delete cascade,
 code_hash bytea not null unique, public_code text not null unique, purpose text not null, expires_at timestamptz, is_mock boolean not null default false,
 created_at timestamptz not null default now()
);
create table public.campaign_deliveries (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 campaign_id uuid not null references public.campaigns(id) on delete cascade, customer_id uuid not null references public.customers(id) on delete restrict,
 content_item_id uuid references public.content_items(id) on delete set null, provider_message_ref text, idempotency_key text not null,
 status text not null default 'queued' check (status in ('queued','sent','delivered','failed','suppressed')),
 queued_at timestamptz not null default now(), sent_at timestamptz, delivered_at timestamptz, failure_code text,
 is_mock boolean not null default false, created_at timestamptz not null default now(), unique(business_id,idempotency_key)
);
create table public.campaign_events (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 campaign_id uuid not null references public.campaigns(id) on delete cascade, delivery_id uuid references public.campaign_deliveries(id) on delete set null,
 customer_id uuid references public.customers(id) on delete set null, event_type text not null check (event_type in ('sent','delivered','opened','clicked','redeemed','bounced','unsubscribed','stopped')),
 occurred_at timestamptz not null, source text not null, external_event_ref text, metadata jsonb not null default '{}'::jsonb,
 is_mock boolean not null default false, created_at timestamptz not null default now(), unique(business_id,source,external_event_ref)
);
create table public.redemptions (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 campaign_id uuid not null references public.campaigns(id) on delete restrict, promotion_id uuid references public.promotions(id) on delete restrict,
 customer_id uuid references public.customers(id) on delete set null, transaction_id uuid references public.transactions(id) on delete set null,
 tracking_code_id uuid references public.tracking_codes(id) on delete set null, redeemed_at timestamptz not null,
 order_total_minor bigint not null check (order_total_minor >= 0), campaign_cost_minor bigint not null default 0 check (campaign_cost_minor >= 0),
 currency text not null default 'KZT' check (currency ~ '^[A-Z]{3}$'), is_mock boolean not null default false, created_at timestamptz not null default now()
);
create table public.impact_measurements (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 campaign_id uuid references public.campaigns(id) on delete cascade, growth_contract_id uuid references public.growth_contracts(id) on delete cascade,
 metric_key text not null, kind text not null check (kind in ('forecast','influenced','incremental_estimate','mock_actual','verified_fact')),
 value_minor bigint not null, unit text not null, currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
 period_start timestamptz not null, period_end timestamptz not null, source text not null, method_version text, confidence smallint check (confidence between 0 and 100),
 evidence jsonb not null default '{}'::jsonb, is_mock boolean not null default false, created_at timestamptz not null default now(),
 check (period_end > period_start), check ((kind='verified_fact' and not is_mock) or kind<>'verified_fact')
);
create table public.ai_generation_runs (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 growth_contract_id uuid references public.growth_contracts(id) on delete set null, purpose text not null, model text not null,
 prompt_version text not null, input_hash text not null, output jsonb, status text not null check (status in ('queued','running','completed','failed','blocked')),
 safety_evidence jsonb not null default '{}'::jsonb, token_usage jsonb not null default '{}'::jsonb, is_mock boolean not null default false,
 created_at timestamptz not null default now(), completed_at timestamptz
);
create table public.automations (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 name text not null, automation_type text not null, trigger_rules jsonb not null, action_rules jsonb not null, guardrails jsonb not null,
 status text not null default 'draft' check (status in ('draft','active','paused','archived')), created_by uuid not null references auth.users(id) on delete restrict,
 is_mock boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.automation_runs (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 automation_id uuid not null references public.automations(id) on delete cascade, status text not null check (status in ('queued','running','completed','failed','stopped','skipped')),
 idempotency_key text not null, scheduled_at timestamptz not null, started_at timestamptz, completed_at timestamptz,
 result jsonb not null default '{}'::jsonb, is_mock boolean not null default false, created_at timestamptz not null default now(),
 unique(business_id,idempotency_key)
);
create table public.outbox_events (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 aggregate_type text not null, aggregate_id uuid not null, event_type text not null, payload jsonb not null,
 status text not null default 'pending' check (status in ('pending','processing','published','failed','dead_letter')),
 attempts integer not null default 0 check (attempts >= 0), available_at timestamptz not null default now(), processed_at timestamptz,
 idempotency_key text not null, is_mock boolean not null default false, created_at timestamptz not null default now(), unique(business_id,idempotency_key)
);
create table public.notifications (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 user_id uuid references auth.users(id) on delete cascade, notification_type text not null, title text not null, body text not null,
 read_at timestamptz, action_url text, is_mock boolean not null default false, created_at timestamptz not null default now()
);
create table public.activity_logs (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 actor_id uuid references auth.users(id) on delete set null, action text not null, resource_type text not null, resource_id uuid,
 before_hash text, after_hash text, metadata jsonb not null default '{}'::jsonb, occurred_at timestamptz not null default now(),
 is_mock boolean not null default false, created_at timestamptz not null default now()
);
create table public.tool_categories (
 id uuid primary key default gen_random_uuid(), code text not null unique, name_ru text not null, name_kk text not null,
 status text not null default 'published' check (status in ('draft','published','archived')), sort_order integer not null default 0,
 is_mock boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.tools (
 id uuid primary key default gen_random_uuid(), category_id uuid not null references public.tool_categories(id) on delete restrict,
 code text not null unique, name_ru text not null, name_kk text not null, description_ru text not null, description_kk text not null,
 route text not null, status text not null default 'draft' check (status in ('draft','published','archived')),
 version integer not null default 1 check (version > 0), is_public boolean not null default true, is_mock boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.templates (
 id uuid primary key default gen_random_uuid(), code text not null unique, name text not null,
 status text not null default 'draft' check (status in ('draft','published','archived')), current_version integer,
 is_mock boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.template_versions (
 id uuid primary key default gen_random_uuid(), template_id uuid not null references public.templates(id) on delete cascade,
 version integer not null check (version > 0), schema_version integer not null check (schema_version > 0), content jsonb not null,
 status text not null default 'draft' check (status in ('draft','published','archived')),
 published_at timestamptz, created_by uuid references auth.users(id) on delete set null, is_mock boolean not null default false,
 created_at timestamptz not null default now(), unique(template_id,version)
);
create table public.business_tools (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 tool_id uuid not null references public.tools(id) on delete cascade, status text not null default 'active' check (status in ('active','paused','disabled')),
 activated_by uuid not null references auth.users(id) on delete restrict, is_mock boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(business_id,tool_id)
);
create table public.favorite_tools (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 tool_id uuid not null references public.tools(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade,
 is_mock boolean not null default false, created_at timestamptz not null default now(), unique(business_id,tool_id,user_id)
);
create table public.platform_events (
 id uuid primary key default gen_random_uuid(), event_type text not null, actor_id uuid references auth.users(id) on delete set null,
 business_id uuid references public.businesses(id) on delete set null, payload jsonb not null default '{}'::jsonb,
 occurred_at timestamptz not null default now(), is_mock boolean not null default false, created_at timestamptz not null default now()
);
create table public.daily_analytics (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 location_id uuid references public.business_locations(id) on delete cascade, metric_date date not null,
 gross_revenue_minor bigint not null default 0, transactions_count integer not null default 0, new_customers_count integer not null default 0,
 repeat_customers_count integer not null default 0, currency text not null default 'KZT' check (currency ~ '^[A-Z]{3}$'),
 source text not null, is_mock boolean not null default false, created_at timestamptz not null default now(),
 unique(business_id,location_id,metric_date)
);
create table public.nearby_offers (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 location_id uuid not null references public.business_locations(id) on delete cascade, campaign_id uuid references public.campaigns(id) on delete cascade,
 title_ru text not null, title_kk text not null, description_ru text not null, description_kk text not null,
 district text not null, latitude_rounded numeric(6,3), longitude_rounded numeric(6,3),
 status text not null default 'draft' check (status in ('draft','published','paused','expired','archived')),
 published_at timestamptz, expires_at timestamptz, is_mock boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table private.platform_admin_assignments (
 id uuid primary key default gen_random_uuid(), user_id uuid not null unique references auth.users(id) on delete cascade,
 role text not null check (role in ('platform_admin','platform_editor','platform_analyst')),
 active boolean not null default true, assigned_by uuid references auth.users(id) on delete restrict,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table private.platform_admin_assignments enable row level security;
commit;
