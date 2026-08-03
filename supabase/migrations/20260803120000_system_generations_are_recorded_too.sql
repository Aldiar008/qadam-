begin;

-- Провенанс системных генераций пропадал молча.
--
-- `record_ai_generation_run` refuses a caller who is not a signed-in member,
-- which is right for the cabinet: a generation is spent on somebody's behalf and
-- the person has to be entitled to spend it. But the bot answering a guest at
-- two in the morning has no signed-in member behind it — it runs as
-- `service_role` — so every one of those generations was refused, the caller
-- swallowed the refusal (by design, so the owner keeps the result), and the
-- journal quietly stayed empty while tokens were being spent.
--
-- The system is allowed to record its own work. It is still charged against the
-- same daily quota, so an assistant left talking to a stuck client cannot spend
-- without limit.
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
 -- A background job runs as service_role and has no member behind it. That is a
 -- different thing from an anonymous stranger, and only this role gets the pass.
 v_system boolean := (select current_user) in ('service_role', 'postgres', 'supabase_admin');
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

 -- Column list copied from the table, not from memory: the first attempt at
 -- this migration invented an `actor_id` that does not exist, and every system
 -- generation failed to record for a second time, differently.
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

commit;
