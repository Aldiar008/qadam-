-- Remove the table privileges that row level security does not govern.
--
-- The default Supabase bootstrap grants ALL PRIVILEGES on every table in
-- `public` to `anon` and `authenticated`. Three of those privileges are not
-- filtered by RLS at all:
--
--   TRUNCATE   Postgres does not consult row policies for TRUNCATE. A signed-in
--              user of any tenant could therefore issue
--              `truncate public.customers cascade` and destroy every tenant's
--              customers, identities, consents, transactions, loyalty accounts,
--              campaign events, redemptions and privacy requests — while being
--              unable to SELECT a single one of those rows. This was reproduced
--              against the local database before this migration was written.
--
--   TRIGGER    Lets a user attach their own trigger function to a table they can
--              only read through a policy. The trigger observes rows the policy
--              would otherwise hide, which turns a read restriction into a
--              read-anything primitive.
--
--   REFERENCES Lets a user create a foreign key against a table they cannot
--              read, and then use constraint violations to probe which values
--              exist in it.
--
-- None of the three is used by the application: it reaches the database as
-- `authenticated` through PostgREST, which issues only SELECT/INSERT/UPDATE/
-- DELETE and RPC. Revoking them removes an RLS bypass and costs nothing.
--
-- `service_role` keeps its privileges deliberately. It is the server-only key
-- used by the admin client, never shipped to a browser (`npm run check:secrets`
-- enforces that), and the migration and maintenance paths do need them.

revoke truncate, trigger, references on all tables in schema public from anon, authenticated;

-- Future tables must not silently regain them. Supabase's bootstrap sets default
-- privileges for the roles that create objects here, so the same three are
-- stripped from those defaults as well.
alter default privileges in schema public
  revoke truncate, trigger, references on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke truncate, trigger, references on tables from anon, authenticated;
-- `supabase_admin` is not alterable from a migration (permission denied), so the
-- guard against a future table regaining these privileges is the security suite,
-- which fails if any table in `public` ever grants them again.

-- `anon` has no business writing anything: the only paths a signed-out visitor
-- has are the public storefront, the QR join page and the privacy page, and all
-- three go through security definer functions or the server's own key.
revoke insert, update, delete on all tables in schema public from anon;
alter default privileges in schema public revoke insert, update, delete on tables from anon;
alter default privileges for role postgres in schema public revoke insert, update, delete on tables from anon;
