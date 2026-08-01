begin;

-- ===========================================================================
-- Index corrections found by running EXPLAIN ANALYZE on a 50k-customer /
-- 400k-transaction benchmark tenant rather than on the 180-row seed.
-- ===========================================================================

-- Finding 1: `customers_cursor_idx` already existed from an earlier migration as
-- (business_id, last_seen_at DESC NULLS LAST, id). The index intended for the
-- customers list — ordered by created_at with the anonymized rows excluded — was
-- written with `create index if not exists` under that same name, so it was
-- silently skipped and the list fell back to a full scan plus a top-N sort
-- (50k rows, ~17 ms). Naming it distinctly makes the intent explicit.
create index customers_list_cursor_idx
 on public.customers(business_id, created_at desc, id desc)
 where lifecycle_stage <> 'anonymized';

-- Finding 2: `transactions_business_recent_idx` duplicated the pre-existing
-- `transactions_cursor_idx` (business_id, occurred_at DESC, id DESC), which the
-- planner already chose. A second index on the same leading columns only costs
-- write throughput on the hottest table in the schema.
drop index if exists public.transactions_business_recent_idx;

-- Finding 3: the audience build joined customers to consents with a nested loop
-- over every candidate. A partial index over granted consents only turns that
-- inner lookup into a much smaller index, and keeps the index off the ~2/3 of
-- rows that record a refusal.
create index customer_consents_granted_idx
 on public.customer_consents(business_id, scope, customer_id)
 where status = 'granted';

comment on index public.customers_list_cursor_idx is
 'Customers list cursor pagination. Distinct from customers_cursor_idx, which orders by last_seen_at for the loyalty views.';
comment on index public.customer_consents_granted_idx is
 'Audience build: granted consents only, so the partial index stays small.';

commit;

begin;

-- The caller's own platform role, so the console can distinguish an editor from
-- an analyst without exposing the assignment table itself.
create or replace function private.current_platform_role()
returns text language sql stable security definer set search_path=''
as $$
 select pa.role from private.platform_admin_assignments pa
 where pa.user_id=(select auth.uid()) and pa.active
 order by case pa.role when 'platform_admin' then 0 when 'platform_editor' then 1 else 2 end
 limit 1
$$;
revoke all on function private.current_platform_role() from public,anon,authenticated,service_role;
grant execute on function private.current_platform_role() to authenticated;

create or replace function public.current_platform_role()
returns text language sql stable security invoker set search_path=''
as $$ select private.current_platform_role() $$;
revoke all on function public.current_platform_role() from public,anon;
grant execute on function public.current_platform_role() to authenticated;

commit;
