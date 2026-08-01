-- Returns a demonstration database to the state the committed seed describes.
--
-- The acceptance suites assert exact seed figures, and they mutate what they
-- drive: a campaign gets approved, an automation gets stopped, a QR gets
-- scanned. Locally that is handled by `supabase db reset --local` before every
-- run. A hosted demo has no such command, so this is it — and a demo shown to
-- other people needs it anyway, to clear whatever the last visitor did.
--
-- Apply this, then supabase/seed/remote_demo_seed.sql.
--
--   node scripts/apply-remote-sql.mjs <ref> supabase/seed/remote_demo_reset.sql
--   node scripts/apply-remote-sql.mjs <ref> supabase/seed/remote_demo_seed.sql
--
-- The guard is the one the seed uses: an unmarked database is refused outright.
-- This file deletes every application row it can reach, so being wrong about
-- the target would be unrecoverable, and the check runs before anything else.

begin;

do $$
begin
 if not exists (select 1 from private.demo_environment) then
  raise exception 'QADAM demo reset refuses this database: private.demo_environment is empty, so it is not a demonstration environment.';
 end if;
end $$;

-- Every table in public at once, so foreign keys never dictate an order and no
-- table is missed when the schema grows — except the reference tables, which
-- are not the seed's to restore.
--
-- Plans, their entitlements, the retention schedule and the data inventory are
-- inserted by migrations, never by supabase/seed.sql. Locally that distinction
-- is invisible, because `supabase db reset` replays the migrations and the seed
-- together. Here only the seed comes back, so emptying these leaves every
-- business resolving to no plan at all: a business without a subscription falls
-- back to `free`, and if `free` and its entitlements are gone, the fallback
-- finds nothing. The first thing that breaks is compiling a Growth Contract,
-- which is the centre of the demonstration — it refuses with
-- "Тариф none: 0/0 за период" and nothing about the message suggests the seed.
do $$
declare statement text;
declare preserved constant text[] := array[
 'plans', 'plan_entitlements', 'entitlements', 'retention_policies', 'data_inventory'
];
begin
 select 'truncate table ' || string_agg(format('%I.%I', schemaname, tablename), ', ') || ' restart identity cascade'
 into statement
 from pg_tables
 where schemaname = 'public' and tablename <> all (preserved);

 if statement is null then
  raise exception 'QADAM demo reset found no tables in public — refusing to continue against an unexpected database.';
 end if;

 execute statement;
end $$;

-- Accounts follow the rows. Demo identities are recreated by the seed; anything
-- a visitor registered during a session is deliberately not kept.
delete from auth.identities;
delete from auth.sessions;
delete from auth.refresh_tokens;
delete from auth.users;

-- If a later migration starts providing reference data of its own, the list
-- above will be short by exactly that table and nothing will say so. This
-- catches the case the demonstration actually depends on, loudly and before
-- the transaction commits.
do $$
begin
 if not exists (select 1 from public.plans where code = 'free')
    or not exists (
      select 1 from public.plan_entitlements pe
      join public.plans p on p.id = pe.plan_id
      join public.entitlements e on e.id = pe.entitlement_id
      where p.code = 'free' and e.key = 'growth_contracts_month'
    ) then
  raise exception 'QADAM demo reset would leave the environment without a usable plan: the free plan or its entitlements are missing.';
 end if;
end $$;

commit;
