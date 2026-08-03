begin;

-- Две причины, по которым системные генерации не записывались, а не одна.
--
-- The first was the membership gate, lifted in the previous migration. The
-- second was simpler and invisible from the SQL editor: the **public** wrapper
-- — the one PostgREST exposes and the application actually calls — was granted
-- to `authenticated` only. Every call from a background job came back
-- «permission denied for function», the caller swallowed it by design so the
-- owner would keep their result, and the journal stayed empty while tokens were
-- spent. Testing through the Management API hid it, because that runs as
-- `postgres` and needs no grant at all.
--
-- And the role check itself was wrong. Inside a `security definer` function
-- `current_user` is the function's owner, not the caller, so «is this the
-- system?» was answering «yes» for everybody — a gate that always opens. The
-- caller's real role lives in the request's JWT claim.
create or replace function private.is_system_caller()
returns boolean language sql stable set search_path=''
as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                  (current_setting('request.jwt.claims', true)::jsonb ->> 'role'),
                  '') = 'service_role'
      -- A direct psql or Management API session has no JWT at all; that is the
      -- platform owner and is trusted for the same reason migrations are.
      or session_user in ('postgres', 'supabase_admin')
$$;

revoke all on function private.is_system_caller() from public, anon, authenticated, service_role;
grant execute on function private.is_system_caller() to authenticated, service_role;

create or replace function private.record_ai_generation_run(
 p_business_id uuid, p_purpose text, p_provider text, p_model text, p_source text,
 p_prompt_version text, p_schema_version text, p_input_hash text, p_output jsonb,
 p_status text, p_latency_ms integer, p_attempts integer, p_cost_micros bigint,
 p_failure_kind text, p_fallback_reason text, p_safety_evidence jsonb, p_token_usage jsonb,
 p_growth_contract_id uuid, p_idempotency_key text,
 p_max_generations_per_day integer, p_max_cost_micros_per_day bigint)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
 v_actor uuid := (select auth.uid());
 v_system boolean := private.is_system_caller();
 v_mock boolean; v_existing public.ai_generation_runs%rowtype; v_run_id uuid;
 v_generations integer; v_cost bigint; v_result jsonb;
begin
 if not v_system and (v_actor is null or not private.has_business_role(p_business_id, array['owner','manager','marketer'])) then
  raise exception 'forbidden' using errcode='42501';
 end if;
 if char_length(coalesce(p_idempotency_key,'')) not between 8 and 200 then
  raise exception 'invalid idempotency key' using errcode='22023';
 end if;
 if p_input_hash !~ '^[0-9a-f]{64}$' then
  raise exception 'input_hash must be a sha-256 digest' using errcode='22023';
 end if;

 select * into v_existing from public.ai_generation_runs
 where business_id=p_business_id and idempotency_key=p_idempotency_key;
 if v_existing.id is not null then
  return jsonb_build_object('run_id', v_existing.id, 'duplicate', true, 'status', v_existing.status);
 end if;

 select mode='demo' into v_mock from public.businesses where id=p_business_id and status='active';
 if v_mock is null then raise exception 'business not found or not active' using errcode='23503'; end if;

 -- The quota is only spent when a provider was actually reached: an outage must
 -- not exhaust the day's allowance.
 if p_source='provider' then
  select coalesce(generations,0), coalesce(cost_micros,0) into v_generations, v_cost
  from public.ai_usage_quota where business_id=p_business_id and window_date=current_date;
  v_generations := coalesce(v_generations,0); v_cost := coalesce(v_cost,0);
  if v_generations >= coalesce(p_max_generations_per_day, 40)
   or v_cost + coalesce(p_cost_micros,0) > coalesce(p_max_cost_micros_per_day, 2000000) then
   raise exception 'daily AI quota exhausted' using errcode='53400';
  end if;
  insert into public.ai_usage_quota(business_id, window_date, generations, cost_micros)
  values(p_business_id, current_date, 1, coalesce(p_cost_micros,0))
  on conflict(business_id, window_date) do update
  set generations = public.ai_usage_quota.generations + 1,
      cost_micros = public.ai_usage_quota.cost_micros + coalesce(p_cost_micros,0);
 end if;

 insert into public.ai_generation_runs(
  business_id, growth_contract_id, purpose, provider, model, source, prompt_version, schema_version,
  input_hash, output, status, latency_ms, attempts, cost_micros, failure_kind, fallback_reason,
  safety_evidence, token_usage, idempotency_key, is_mock, completed_at)
 values(
  p_business_id, p_growth_contract_id, p_purpose, p_provider, p_model, p_source, p_prompt_version, p_schema_version,
  p_input_hash, p_output, p_status, coalesce(p_latency_ms,0), coalesce(p_attempts,1), coalesce(p_cost_micros,0),
  p_failure_kind, p_fallback_reason, coalesce(p_safety_evidence,'{}'::jsonb), coalesce(p_token_usage,'{}'::jsonb),
  p_idempotency_key, v_mock, now())
 returning id into v_run_id;

 v_result := jsonb_build_object('run_id', v_run_id, 'duplicate', false, 'status', p_status);
 return v_result;
end $$;

revoke all on function private.record_ai_generation_run(uuid,text,text,text,text,text,text,text,jsonb,text,integer,integer,bigint,text,text,jsonb,jsonb,uuid,text,integer,bigint) from public, anon, authenticated, service_role;
grant execute on function private.record_ai_generation_run(uuid,text,text,text,text,text,text,text,jsonb,text,integer,integer,bigint,text,text,jsonb,jsonb,uuid,text,integer,bigint) to authenticated, service_role;

-- The grant that was actually missing.
grant execute on function public.record_ai_generation_run(uuid,text,text,text,text,text,text,text,jsonb,text,integer,integer,bigint,text,text,jsonb,jsonb,uuid,text,integer,bigint) to service_role;

-- The assistant and the interaction log are called by the same background paths,
-- so they are checked here rather than discovered the same way later.
do $$
declare v_missing text[] := '{}';
begin
  if not has_function_privilege('service_role', 'public.record_ai_generation_run(uuid,text,text,text,text,text,text,text,jsonb,text,integer,integer,bigint,text,text,jsonb,jsonb,uuid,text,integer,bigint)', 'execute')
    then v_missing := array_append(v_missing, 'record_ai_generation_run'); end if;
  if not has_function_privilege('service_role', 'public.record_customer_interaction(uuid,uuid,text,text,text,text,jsonb)', 'execute')
    then v_missing := array_append(v_missing, 'record_customer_interaction'); end if;
  if not has_function_privilege('service_role', 'public.assistant_context(uuid,uuid)', 'execute')
    then v_missing := array_append(v_missing, 'assistant_context'); end if;
  if array_length(v_missing, 1) is not null then
    raise exception 'service_role cannot call: %', array_to_string(v_missing, ', ');
  end if;
end $$;

commit;
