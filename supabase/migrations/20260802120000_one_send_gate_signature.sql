begin;

-- Leave exactly one `public.send_gate`.
--
-- The previous migration added a five-argument version whose last two arguments
-- have defaults, and left the four-argument version in place. Postgres then had
-- two equally good candidates for any call with three or four arguments and
-- refused to choose: "function public.send_gate(...) is not unique". Every
-- caller that had worked for weeks — the acceptance suites, the audience
-- preview — started failing at once.
--
-- Adding an optional parameter to an existing function is not a compatible
-- change in Postgres unless the old signature is removed; the default makes the
-- new one match the old call shapes rather than complementing them.
--
-- `private.send_gate` is unaffected: its five-argument form has no defaults, so
-- a three- or four-argument call still resolves to exactly one candidate.
drop function if exists public.send_gate(uuid, uuid, text, timestamptz);

-- Recreated so the grants are stated here rather than inherited from a function
-- that no longer exists.
create or replace function public.send_gate(
  p_business_id uuid, p_customer_id uuid, p_channel text,
  p_at timestamptz default now(), p_exclude_delivery_id uuid default null)
returns jsonb language sql stable security invoker set search_path=''
as $$ select private.send_gate(p_business_id,p_customer_id,p_channel,p_at,p_exclude_delivery_id) $$;
revoke all on function public.send_gate(uuid,uuid,text,timestamptz,uuid) from public,anon;
grant execute on function public.send_gate(uuid,uuid,text,timestamptz,uuid) to authenticated, service_role;

do $$
declare v_count integer;
begin
  select count(*) into v_count
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'send_gate';
  if v_count <> 1 then
    raise exception 'public.send_gate must have exactly one signature, found %', v_count;
  end if;
end $$;

commit;
