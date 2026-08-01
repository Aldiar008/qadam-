-- Deterministic IDs support idempotent local/dev fixtures without exposing a
-- seed endpoint through the Data API. The function stays in the private schema.
create or replace function private.deterministic_uuid(seed text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select (
    pg_catalog.substr(pg_catalog.md5(seed), 1, 8) || '-' ||
    pg_catalog.substr(pg_catalog.md5(seed), 9, 4) || '-4' ||
    pg_catalog.substr(pg_catalog.md5(seed), 14, 3) || '-8' ||
    pg_catalog.substr(pg_catalog.md5(seed), 18, 3) || '-' ||
    pg_catalog.substr(pg_catalog.md5(seed), 21, 12)
  )::uuid
$$;

revoke all on function private.deterministic_uuid(text) from public, anon, authenticated;
