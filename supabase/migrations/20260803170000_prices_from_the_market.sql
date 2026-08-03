begin;

-- Цены с рынка: Kaspi для товаров, hh.kz для стоимости найма.
--
-- The module already compared what a venue pays against offers somebody typed
-- in. Typing them in is the part nobody does. This lets the search run itself —
-- and keeps the discipline that made the module safe in the first place: every
-- automatically found price arrives `verified = false`, carries the URL it came
-- from, and is shown as «откройте ссылку», never as a fact.
--
-- Just as important is the record of the attempt. A marketplace can block a
-- request, change its response or return nothing; without a run log the screen
-- would silently show last week's prices as though they were today's.

alter table public.supply_items
  add column if not exists search_query text check (search_query is null or char_length(search_query) between 2 and 200);

comment on column public.supply_items.search_query is
 'What to type into a marketplace search for this item. Null means «искать по названию».';

alter table public.supply_offers
  add column if not exists external_id text check (external_id is null or char_length(external_id) between 1 and 120);

comment on column public.supply_offers.external_id is
 'The marketplace''s own id for this listing. Lets a repeated search update a price instead of adding a second row for the same product.';

-- Same listing, same item, same source: one row, updated. Owner-typed offers
-- have no external id and are never touched by a search.
create unique index if not exists supply_offers_external_unique
  on public.supply_offers(supply_item_id, source, external_id)
  where external_id is not null;

create table if not exists public.supply_search_runs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  supply_item_id uuid references public.supply_items(id) on delete cascade,
  source text not null check (source in ('kaspi', 'hh')),
  query text not null check (char_length(query) between 1 and 200),
  -- `blocked` is its own outcome, not an error: a marketplace refusing an
  -- automated request is expected behaviour and the screen should say so
  -- plainly rather than blame the network.
  status text not null check (status in ('ok', 'empty', 'blocked', 'unavailable', 'disabled')),
  http_status integer,
  offers_found integer not null default 0 check (offers_found >= 0),
  error text,
  ran_at timestamptz not null default now(),
  is_mock boolean not null default false
);

create index if not exists supply_search_runs_item_idx on public.supply_search_runs(supply_item_id, ran_at desc);
create index if not exists supply_search_runs_business_idx on public.supply_search_runs(business_id, ran_at desc);

alter table public.supply_search_runs enable row level security;

create policy supply_search_runs_member_read on public.supply_search_runs
  for select to authenticated
  using (exists (select 1 from public.business_members bm where bm.business_id = supply_search_runs.business_id
                 and bm.user_id = (select auth.uid()) and bm.status = 'active'));

grant select on public.supply_search_runs to authenticated;
grant select, insert on public.supply_search_runs to service_role;

comment on table public.supply_search_runs is
 'Every attempt to read prices off a marketplace, successful or not. Without it the screen cannot tell «цены свежие» from «источник молчит третий день».';

/**
 * Сколько сейчас стоит нанять — по опубликованным вакансиям.
 *
 * Labour is the other half of a small venue's costs, and hh.kz publishes a
 * documented API for it. Stored as a snapshot with its sample size, because a
 * median over four vacancies is not a market rate and the screen has to be able
 * to say that.
 */
create table if not exists public.market_salary_snapshots (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  role_query text not null check (char_length(role_query) between 2 and 120),
  area_name text not null default 'Алматы',
  sample_size integer not null check (sample_size >= 0),
  median_minor bigint check (median_minor is null or median_minor >= 0),
  p25_minor bigint check (p25_minor is null or p25_minor >= 0),
  p75_minor bigint check (p75_minor is null or p75_minor >= 0),
  currency text not null default 'KZT',
  source text not null default 'hh' check (source in ('hh')),
  fetched_at timestamptz not null default now(),
  is_mock boolean not null default false,
  unique(business_id, role_query, area_name)
);

alter table public.market_salary_snapshots enable row level security;

create policy market_salary_member_read on public.market_salary_snapshots
  for select to authenticated
  using (exists (select 1 from public.business_members bm where bm.business_id = market_salary_snapshots.business_id
                 and bm.user_id = (select auth.uid()) and bm.status = 'active'));

grant select on public.market_salary_snapshots to authenticated;
grant select, insert, update, delete on public.market_salary_snapshots to service_role;

comment on table public.market_salary_snapshots is
 'Salary ranges read from published vacancies. `sample_size` travels with the figure so a median over four postings is never shown as a market rate.';

commit;
