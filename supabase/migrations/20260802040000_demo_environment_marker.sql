begin;

-- A database is a demonstration database only because a human said so, and the
-- saying is this row. The remote demo seed refuses to touch any database where
-- this table is empty, so the production project is protected by never
-- receiving a row rather than by anyone remembering a rule.
--
-- The table is created in every environment on purpose: a guard that only
-- exists where it is satisfied is not a guard. Marking an environment is then
-- one deliberate statement, run by hand:
--
--   insert into private.demo_environment(note) values ('why this database is a demo');
--
-- Unmarking is `delete from private.demo_environment;`.
--
-- This is not a database-level setting because Supabase does not grant the
-- `postgres` role permission to define one, and a guard that cannot be set on
-- the platform we deploy to is a guard that would simply be dropped.
create table if not exists private.demo_environment (
  singleton  boolean primary key default true check (singleton),
  marked_at  timestamptz not null default now(),
  note       text
);

comment on table private.demo_environment is
  'Non-empty only in a demonstration environment. Gates supabase/seed/remote_demo_seed.sql.';

-- Nothing in the application reads this; only migrations and an operator do.
revoke all on table private.demo_environment from public, anon, authenticated, service_role;

commit;
