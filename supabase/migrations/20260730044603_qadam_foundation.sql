begin;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
alter default privileges for role postgres in schema public revoke select, insert, update, delete on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke usage, select on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated, service_role;

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text, preferred_locale text not null default 'ru' check (preferred_locale in ('ru','kk')),
 timezone text not null default 'Asia/Almaty', is_mock boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.business_types (
 id uuid primary key default gen_random_uuid(), code text not null unique check (code ~ '^[a-z][a-z0-9_]{1,63}$'),
 name_ru text not null, name_kk text not null, status text not null default 'published' check (status in ('draft','published','archived')),
 is_public boolean not null default true, is_mock boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.plans (
 id uuid primary key default gen_random_uuid(), code text not null unique check (code ~ '^[a-z][a-z0-9_]{1,63}$'),
 name text not null, status text not null default 'active' check (status in ('draft','active','archived')),
 price_minor bigint not null default 0 check (price_minor >= 0), currency text not null default 'KZT' check (currency ~ '^[A-Z]{3}$'),
 billing_period text not null default 'month' check (billing_period in ('month','year','custom')),
 is_public boolean not null default true, is_mock boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.entitlements (
 id uuid primary key default gen_random_uuid(), key text not null unique check (key ~ '^[a-z][a-z0-9_.]{1,127}$'),
 description text not null, value_kind text not null check (value_kind in ('boolean','integer','text','json')),
 is_mock boolean not null default false, created_at timestamptz not null default now()
);
create table public.plan_entitlements (
 id uuid primary key default gen_random_uuid(), plan_id uuid not null references public.plans(id) on delete cascade,
 entitlement_id uuid not null references public.entitlements(id) on delete cascade, value jsonb not null,
 is_mock boolean not null default false, created_at timestamptz not null default now(), unique (plan_id, entitlement_id)
);
create table public.businesses (
 id uuid primary key default gen_random_uuid(), created_by uuid not null references auth.users(id) on delete restrict,
 business_type_id uuid references public.business_types(id) on delete restrict, name text not null check (char_length(name) between 1 and 200),
 legal_name text, currency text not null default 'KZT' check (currency ~ '^[A-Z]{3}$'), timezone text not null default 'Asia/Almaty',
 mode text not null default 'production' check (mode in ('demo','production')), status text not null default 'active' check (status in ('active','suspended','closed')),
 is_mock boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check ((mode='demo' and is_mock) or (mode='production' and not is_mock))
);
create table public.business_members (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade, role text not null check (role in ('owner','manager','marketer','analyst','viewer')),
 status text not null default 'active' check (status in ('invited','active','disabled')), invited_by uuid references auth.users(id) on delete set null,
 is_mock boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique (business_id,user_id)
);
create table public.business_locations (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 name text not null, city text not null, district text, address_text text, timezone text not null default 'Asia/Almaty',
 capacity integer check (capacity is null or capacity >= 0), is_active boolean not null default true, is_mock boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.business_profiles (
 id uuid primary key default gen_random_uuid(), business_id uuid not null unique references public.businesses(id) on delete cascade,
 average_check_minor bigint check (average_check_minor is null or average_check_minor >= 0),
 currency text not null default 'KZT' check (currency ~ '^[A-Z]{3}$'), margin_floor_bps integer not null default 0 check (margin_floor_bps between 0 and 10000),
 monthly_marketing_budget_minor bigint check (monthly_marketing_budget_minor is null or monthly_marketing_budget_minor >= 0),
 profile_confidence smallint check (profile_confidence between 0 and 100), source_evidence jsonb not null default '{}'::jsonb,
 is_mock boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.business_goals (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 code text not null, target_minor bigint, currency text check (currency is null or currency ~ '^[A-Z]{3}$'), target_date date,
 priority smallint not null default 1 check (priority between 1 and 5), status text not null default 'active' check (status in ('active','achieved','paused','archived')),
 is_mock boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.business_limits (
 id uuid primary key default gen_random_uuid(), business_id uuid not null unique references public.businesses(id) on delete cascade,
 monthly_budget_minor bigint not null default 0 check (monthly_budget_minor >= 0), currency text not null default 'KZT' check (currency ~ '^[A-Z]{3}$'),
 max_campaigns_per_month integer not null default 0 check (max_campaigns_per_month >= 0),
 max_contacts_per_month integer not null default 0 check (max_contacts_per_month >= 0),
 approval_threshold_minor bigint not null default 0 check (approval_threshold_minor >= 0),
 is_mock boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.brand_memory (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 locale text not null check (locale in ('ru','kk')), voice_rules jsonb not null default '{}'::jsonb,
 banned_phrases jsonb not null default '[]'::jsonb, source_evidence jsonb not null default '{}'::jsonb,
 is_mock boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique (business_id,locale)
);
create table public.business_channels (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 channel_type text not null check (channel_type in ('whatsapp','telegram','sms','email','instagram','push','pos')),
 status text not null default 'not_connected' check (status in ('not_connected','pending','connected','disabled','error')),
 external_account_ref text, settings jsonb not null default '{}'::jsonb, is_mock boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (business_id,channel_type)
);
create table public.feature_flags (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 key text not null check (key ~ '^[a-z][a-z0-9_.]{1,127}$'), enabled boolean not null default false, config jsonb not null default '{}'::jsonb,
 is_mock boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique (business_id,key)
);
create table public.subscriptions (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 plan_id uuid not null references public.plans(id) on delete restrict, provider text not null default 'manual', provider_subscription_ref text,
 status text not null check (status in ('trialing','active','past_due','paused','canceled')),
 period_start timestamptz not null, period_end timestamptz not null, is_mock boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check (period_end > period_start)
);
create table public.usage_counters (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 entitlement_key text not null, period_start timestamptz not null, period_end timestamptz not null, used bigint not null default 0 check (used >= 0),
 is_mock boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique (business_id,entitlement_key,period_start), check (period_end > period_start)
);
commit;
