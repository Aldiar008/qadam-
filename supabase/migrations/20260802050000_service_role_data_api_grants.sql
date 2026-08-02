begin;

-- The server-only role needs the privileges the design says it already has.
--
-- 20260802020000 states it plainly: "`service_role` keeps its privileges
-- deliberately. It is the server-only key used by the admin client ... and the
-- migration and maintenance paths do need them." 20260802030000 then wrote the
-- Data API surface down explicitly — and listed `anon` and `authenticated` and
-- nobody else, because it read the set back from a local database where
-- `service_role` still held the privileges Supabase used to grant automatically
-- on table creation.
--
-- On a project created after that platform default changed (changelog
-- 2026-04-28), nothing is granted automatically, so `service_role` arrived with
-- no access to any of the 58 tables the application's admin client reads. This
-- is precisely the failure 20260802030000 was written to prevent; it simply
-- missed the third role.
--
-- What it broke, in production, silently: the execution cycle. `runDueAutomations`
-- asks for due automations as `service_role`, got "permission denied for table
-- automations" on every call, and — because the caller discarded the error —
-- reported that there was no work to do. An automation that was active and due
-- never ran, and the endpoint answered 200 while doing nothing.
--
-- TRUNCATE, TRIGGER and REFERENCES are deliberately not included. `service_role`
-- already bypasses row level security, so they buy it nothing, and the narrower
-- grant keeps a compromised server key from being a schema-destruction key.
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- A table added by a later migration must not silently arrive unreadable, which
-- is the same trap in a year's time.
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
  grant usage, select on sequences to service_role;
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges for role postgres in schema public
  grant usage, select on sequences to service_role;

do $$
declare missing int;
begin
  select count(*) into missing
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and not has_table_privilege('service_role', c.oid, 'SELECT');

  if missing > 0 then
    raise exception 'service_role is still unable to read % table(s) in public', missing;
  end if;
end $$;

commit;
