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
-- table is missed when the schema grows.
do $$
declare statement text;
begin
 select 'truncate table ' || string_agg(format('%I.%I', schemaname, tablename), ', ') || ' restart identity cascade'
 into statement
 from pg_tables
 where schemaname = 'public';

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

commit;
