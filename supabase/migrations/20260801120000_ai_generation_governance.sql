begin;

-- AI generation governance.
--
-- Every generation attempt is recorded whether it reached a provider or fell
-- back to the deterministic template, so "was this written by a model?" is
-- always answerable from the database rather than inferred from the copy.

alter table public.ai_generation_runs add column provider text not null default 'deterministic';
alter table public.ai_generation_runs add column schema_version text not null default 'campaign-generator.v1';
alter table public.ai_generation_runs add column source text not null default 'deterministic_fallback'
 check (source in ('provider','deterministic_fallback'));
alter table public.ai_generation_runs add column latency_ms integer not null default 0 check (latency_ms >= 0);
alter table public.ai_generation_runs add column attempts smallint not null default 1 check (attempts >= 0);
alter table public.ai_generation_runs add column cost_micros bigint not null default 0 check (cost_micros >= 0);
alter table public.ai_generation_runs add column failure_kind text;
alter table public.ai_generation_runs add column fallback_reason text;
alter table public.ai_generation_runs add column idempotency_key text;

-- input_hash must stay a hash. A prompt log that can be reversed into owner text
-- would defeat the redaction step, so the format is constrained here too.
alter table public.ai_generation_runs add constraint ai_generation_runs_input_hash_is_digest
 check (input_hash ~ '^[0-9a-f]{64}$');

create unique index ai_generation_runs_idempotency_uidx
 on public.ai_generation_runs(business_id, idempotency_key) where idempotency_key is not null;
create index ai_generation_runs_business_created_idx
 on public.ai_generation_runs(business_id, created_at desc, id);

-- Per-business, per-day generation quota.
create table public.ai_usage_quota (
 business_id uuid not null references public.businesses(id) on delete cascade,
 window_date date not null,
 generations integer not null default 0 check (generations >= 0),
 cost_micros bigint not null default 0 check (cost_micros >= 0),
 updated_at timestamptz not null default now(),
 primary key (business_id, window_date)
);

alter table public.ai_usage_quota enable row level security;
create policy ai_usage_quota_member_select on public.ai_usage_quota for select to authenticated
 using ((select private.has_business_role(business_id, null)));
revoke all on public.ai_usage_quota from anon, authenticated;
grant select on public.ai_usage_quota to authenticated;
grant all on public.ai_usage_quota to service_role;

/**
 * Records one generation attempt and consumes quota in the same transaction.
 * Raises when the daily generation or cost budget is already spent, so the
 * caller cannot record an over-budget run after the fact.
 */
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
 v_mock boolean; v_existing public.ai_generation_runs%rowtype; v_run_id uuid;
 v_generations integer; v_cost bigint; v_result jsonb;
begin
 if v_actor is null or not private.has_business_role(p_business_id, array['owner','manager','marketer']) then
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

 select mode='demo' into v_mock from public.businesses where id=p_business_id;

 insert into public.ai_usage_quota(business_id, window_date, generations, cost_micros)
 values(p_business_id, current_date, 0, 0)
 on conflict(business_id, window_date) do nothing;

 select generations, cost_micros into v_generations, v_cost
 from public.ai_usage_quota where business_id=p_business_id and window_date=current_date for update;

 -- A run that never reached a provider costs nothing and does not consume the
 -- daily generation budget, otherwise an outage would also exhaust the quota.
 if p_source='provider' then
  if v_generations >= p_max_generations_per_day then
   raise exception 'daily AI generation quota exhausted' using errcode='53400';
  end if;
  if v_cost + coalesce(p_cost_micros,0) > p_max_cost_micros_per_day then
   raise exception 'daily AI cost budget exhausted' using errcode='53400';
  end if;
  update public.ai_usage_quota
  set generations=generations+1, cost_micros=cost_micros+coalesce(p_cost_micros,0), updated_at=now()
  where business_id=p_business_id and window_date=current_date;
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

 v_result := jsonb_build_object('run_id', v_run_id, 'duplicate', false, 'status', p_status, 'source', p_source);
 insert into public.activity_logs(business_id, actor_id, action, resource_type, resource_id, metadata, is_mock)
 values(p_business_id, v_actor, 'ai.generation_recorded', 'ai_generation_run', v_run_id,
  jsonb_build_object('source', p_source, 'provider', p_provider, 'status', p_status, 'failure_kind', p_failure_kind), v_mock);
 return v_result;
end $$;
revoke all on function private.record_ai_generation_run(uuid,text,text,text,text,text,text,text,jsonb,text,integer,integer,bigint,text,text,jsonb,jsonb,uuid,text,integer,bigint) from public,anon,authenticated,service_role;
grant execute on function private.record_ai_generation_run(uuid,text,text,text,text,text,text,text,jsonb,text,integer,integer,bigint,text,text,jsonb,jsonb,uuid,text,integer,bigint) to authenticated;

create or replace function public.record_ai_generation_run(
 p_business_id uuid, p_purpose text, p_provider text, p_model text, p_source text,
 p_prompt_version text, p_schema_version text, p_input_hash text, p_output jsonb,
 p_status text, p_latency_ms integer, p_attempts integer, p_cost_micros bigint,
 p_failure_kind text, p_fallback_reason text, p_safety_evidence jsonb, p_token_usage jsonb,
 p_growth_contract_id uuid, p_idempotency_key text,
 p_max_generations_per_day integer, p_max_cost_micros_per_day bigint)
returns jsonb language sql security invoker set search_path=''
as $$ select private.record_ai_generation_run(p_business_id,p_purpose,p_provider,p_model,p_source,p_prompt_version,
 p_schema_version,p_input_hash,p_output,p_status,p_latency_ms,p_attempts,p_cost_micros,p_failure_kind,p_fallback_reason,
 p_safety_evidence,p_token_usage,p_growth_contract_id,p_idempotency_key,p_max_generations_per_day,p_max_cost_micros_per_day) $$;
revoke all on function public.record_ai_generation_run(uuid,text,text,text,text,text,text,text,jsonb,text,integer,integer,bigint,text,text,jsonb,jsonb,uuid,text,integer,bigint) from public,anon;
grant execute on function public.record_ai_generation_run(uuid,text,text,text,text,text,text,text,jsonb,text,integer,integer,bigint,text,text,jsonb,jsonb,uuid,text,integer,bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- Campaign Studio drafts: the wizard must survive refresh, back/forward and error.
-- ---------------------------------------------------------------------------
create table public.campaign_drafts (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 current_step smallint not null default 1 check (current_step between 1 and 7),
 draft jsonb not null default '{}'::jsonb check (jsonb_typeof(draft)='object'),
 growth_contract_id uuid references public.growth_contracts(id) on delete set null,
 status text not null default 'open' check (status in ('open','launched','abandoned')),
 optimistic_version integer not null default 1 check (optimistic_version > 0),
 is_mock boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (business_id, user_id, status) deferrable initially deferred
);

create index campaign_drafts_business_user_idx on public.campaign_drafts(business_id, user_id, status, updated_at desc);
-- The schema contract requires an index on every foreign key column.
create index campaign_drafts_user_id_fk_idx on public.campaign_drafts(user_id);
create index campaign_drafts_growth_contract_id_fk_idx on public.campaign_drafts(growth_contract_id);

alter table public.campaign_drafts enable row level security;
create policy campaign_drafts_own_select on public.campaign_drafts for select to authenticated
 using (user_id=(select auth.uid()) and (select private.has_business_role(business_id, array['owner','manager','marketer'])));
create policy campaign_drafts_own_insert on public.campaign_drafts for insert to authenticated
 with check (user_id=(select auth.uid()) and (select private.has_business_role(business_id, array['owner','manager','marketer'])));
create policy campaign_drafts_own_update on public.campaign_drafts for update to authenticated
 using (user_id=(select auth.uid()) and (select private.has_business_role(business_id, array['owner','manager','marketer'])))
 with check (user_id=(select auth.uid()) and (select private.has_business_role(business_id, array['owner','manager','marketer'])));
create policy campaign_drafts_own_delete on public.campaign_drafts for delete to authenticated
 using (user_id=(select auth.uid()) and (select private.has_business_role(business_id, array['owner','manager','marketer'])));

revoke all on public.campaign_drafts from anon, authenticated;
grant select, insert, update, delete on public.campaign_drafts to authenticated;
grant all on public.campaign_drafts to service_role;
create trigger campaign_drafts_set_updated_at before update on public.campaign_drafts
 for each row execute function private.set_updated_at();

comment on function public.record_ai_generation_run(uuid,text,text,text,text,text,text,text,jsonb,text,integer,integer,bigint,text,text,jsonb,jsonb,uuid,text,integer,bigint) is
 'Records provenance for one generation attempt and consumes the daily quota only when a provider was actually used.';
comment on table public.campaign_drafts is
 'Server-side Campaign Studio wizard state so back/forward, refresh and errors never lose owner input.';

commit;
