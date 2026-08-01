-- Performance benchmark.
--
-- The committed seed is deliberately small (180 customers), so every plan on it
-- is a sequential scan — which is correct, not a finding. This script inflates a
-- throwaway tenant to realistic volume, runs EXPLAIN ANALYZE on the exact
-- queries the hot screens issue, and rolls everything back.
--
--   docker exec -i supabase_db_qadam_serpin psql -U postgres -d postgres \
--     -f - < scripts/benchmark-explain.sql
--
-- Read the output for "Index Scan" / "Index Only Scan" on the named indexes.
-- A Seq Scan on a table of this size means the index is not doing its job.

begin;

\set bench_business '99999999-0000-4000-8000-000000000001'
\set customers 50000
\set transactions 400000

\echo ''
\echo '### Building benchmark tenant (50k customers, 400k transactions)'

-- A demo-mode business must be flagged is_mock; the schema enforces the pair.
insert into public.businesses(id, name, mode, status, currency, timezone, business_type_id, created_by, is_mock)
select :'bench_business', 'Benchmark tenant', 'demo', 'active', 'KZT', 'Asia/Almaty',
       (select id from public.business_types limit 1),
       (select id from auth.users order by created_at limit 1), true;

insert into public.business_profiles(business_id, average_check_minor, margin_floor_bps, is_mock)
values (:'bench_business', 3450, 4200, true);

-- Customers spread across two years and every lifecycle stage.
insert into public.customers(id, business_id, display_name, lifecycle_stage, first_seen_at, last_seen_at, created_at, is_mock)
select
 gen_random_uuid(), :'bench_business', 'Bench ' || g,
 (array['new','active','loyal','vip','inactive','churned'])[1 + (g % 6)],
 now() - make_interval(days => (g % 700) + 30),
 now() - make_interval(days => (g % 90)),
 now() - make_interval(days => (g % 700) + 30),
 true
from generate_series(1, :customers) g;

-- Consents: roughly a third granted for whatsapp.
insert into public.customer_consents(business_id, customer_id, scope, status, source, granted_at, created_at, is_mock)
select :'bench_business', c.id, 'marketing.whatsapp',
 case when (row_number() over ()) % 3 = 0 then 'granted' else 'denied' end,
 'benchmark',
 case when (row_number() over ()) % 3 = 0 then now() else null end,
 now() - make_interval(days => 100), true
from public.customers c where c.business_id = :'bench_business';

-- Customers are numbered once and joined by that number. A lateral OFFSET per
-- generated row would be quadratic and take minutes; this is a single hash join.
create temporary table bench_customers on commit drop as
select id, row_number() over (order by id) - 1 as n
from public.customers where business_id = :'bench_business';
create index on bench_customers(n);

insert into public.transactions(business_id, customer_id, occurred_at, gross_minor, discount_minor, net_minor, currency, source, is_mock)
select
 :'bench_business',
 bc.id,
 now() - make_interval(days => (g % 730), hours => (g % 24)),
 3000 + (g % 4000), 0, 3000 + (g % 4000), 'KZT', 'benchmark', true
from generate_series(1, :transactions) g
join bench_customers bc on bc.n = g % :customers;

insert into public.notifications(business_id, notification_type, category, title, body, read_at, created_at, is_mock)
select :'bench_business', 'result', 'result', 'Bench ' || g, 'body',
 case when g % 4 = 0 then null else now() end,
 now() - make_interval(days => (g % 120)), true
from generate_series(1, 20000) g;

insert into public.impact_measurements(business_id, metric_key, kind, value_minor, unit, period_start, period_end, source, created_at, is_mock)
select :'bench_business', 'influenced_revenue', 'influenced', 1000 + g, 'currency_minor',
 now() - make_interval(days => (g % 200) + 1), now() - make_interval(days => (g % 200)),
 'benchmark', now() - make_interval(days => (g % 200)), true
from generate_series(1, 20000) g;

analyze public.customers;
analyze public.transactions;
analyze public.customer_consents;
analyze public.notifications;
analyze public.impact_measurements;

\echo ''
\echo '### 1. Today — recent transactions (expects transactions_business_recent_idx)'
explain (analyze, buffers, costs off)
select customer_id, net_minor, occurred_at from public.transactions
where business_id = :'bench_business' order by occurred_at desc limit 3000;

\echo ''
\echo '### 2. Customers — cursor page (expects customers_cursor_idx)'
explain (analyze, buffers, costs off)
select id, display_name, lifecycle_stage from public.customers
where business_id = :'bench_business' and lifecycle_stage <> 'anonymized'
order by created_at desc, id desc limit 26;

\echo ''
\echo '### 3. Customers — segment filter (expects customers_segment_idx)'
explain (analyze, buffers, costs off)
select id from public.customers
where business_id = :'bench_business' and lifecycle_stage = 'inactive'
order by created_at desc limit 26;

\echo ''
\echo '### 4. Notifications — unread inbox (expects notifications_unread_idx)'
explain (analyze, buffers, costs off)
select id, title from public.notifications
where business_id = :'bench_business' and read_at is null and dismissed_at is null
order by created_at desc limit 60;

\echo ''
\echo '### 5. Impact ledger — cursor page (expects impact_measurements_ledger_idx)'
explain (analyze, buffers, costs off)
select id, metric_key from public.impact_measurements
where business_id = :'bench_business' order by created_at desc, id desc limit 21;

\echo ''
\echo '### 6. Consent resolution — per customer at send time (expects customer_consents_lookup_idx)'
explain (analyze, buffers, costs off)
select status from public.customer_consents
where business_id = :'bench_business'
  and customer_id = (select id from public.customers where business_id = :'bench_business' limit 1)
  and scope = 'marketing.whatsapp'
order by created_at desc limit 1;

\echo ''
\echo '### 7. Audience build — consent-eligible customers for a channel'
explain (analyze, buffers, costs off)
select c.id from public.customers c
where c.business_id = :'bench_business' and c.lifecycle_stage = 'inactive'
  and exists (
   select 1 from public.customer_consents cc
   where cc.business_id = c.business_id and cc.customer_id = c.id
     and cc.scope = 'marketing.whatsapp' and cc.status = 'granted'
  )
limit 500;

rollback;

\echo ''
\echo '### Benchmark tenant rolled back. No benchmark row remains.'
