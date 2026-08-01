begin;

alter table public.signals add column baseline jsonb not null default '{}'::jsonb;
alter table public.signals add column delta jsonb not null default '{}'::jsonb;
alter table public.signals add column assumptions jsonb not null default '[]'::jsonb;
alter table public.signals add column formula_version text not null default 'signal-detector.v1';

alter table public.customer_segments add column rule_version integer not null default 1 check (rule_version > 0);
alter table public.customer_segments add column last_evaluated_at timestamptz;

alter table public.recommendations add column optimistic_version integer not null default 1 check (optimistic_version > 0);
alter table public.recommendations add column last_idempotency_key text;
alter table public.recommendations drop constraint recommendations_status_check;
update public.recommendations set status=case status when 'pending' then 'open' when 'edited' then 'accepted' else status end;
alter table public.recommendations add constraint recommendations_status_check check (status in ('open','accepted','snoozed','rejected','expired'));

alter table public.growth_contracts add column optimistic_version integer not null default 1 check (optimistic_version > 0);
alter table public.growth_contracts add column last_idempotency_key text;
alter table public.growth_contracts add column consent_summary jsonb;
alter table public.growth_contracts add column simulator_result jsonb;
alter table public.growth_contracts add column margin_decision jsonb;
alter table public.growth_contracts add column attribution_plan jsonb;
alter table public.growth_contracts add column owner_limits_snapshot jsonb;
alter table public.growth_contracts add column compiled_at timestamptz;
alter table public.growth_contracts drop constraint growth_contracts_status_check;
update public.growth_contracts set status=case status when 'launched' then 'running' when 'rejected' then 'cancelled' when 'archived' then 'cancelled' else status end;
alter table public.growth_contracts add constraint growth_contracts_status_check check (status in ('draft','compiled','awaiting_approval','approved','launching','running','simulated','paused','completed','cancelled','failed'));

alter table public.forecast_runs add column explanations jsonb not null default '{}'::jsonb;
alter table public.campaigns add column idempotency_key text;
alter table public.campaigns add column optimistic_version integer not null default 1 check (optimistic_version > 0);
create unique index campaigns_business_idempotency_uidx on public.campaigns(business_id,idempotency_key) where idempotency_key is not null;

alter table public.automations add column optimistic_version integer not null default 1 check (optimistic_version > 0);
alter table public.automations add column last_idempotency_key text;
alter table public.automations drop constraint automations_status_check;
update public.automations set status='disabled' where status='archived';
alter table public.automations add constraint automations_status_check check (status in ('draft','active','paused','disabled'));

create table private.domain_command_receipts (
 business_id uuid not null references public.businesses(id) on delete cascade,
 idempotency_key text not null,
 command_type text not null,
 aggregate_type text not null,
 aggregate_id uuid not null,
 result jsonb not null,
 created_at timestamptz not null default now(),
 primary key(business_id,idempotency_key),
 check (char_length(idempotency_key) between 8 and 200)
);
revoke all on private.domain_command_receipts from public, anon, authenticated, service_role;

create or replace function private.enforce_domain_transition()
returns trigger language plpgsql set search_path=''
as $$
declare allowed boolean := false;
begin
 if tg_op='INSERT' then
  if new.optimistic_version<>1 then raise exception 'new aggregate optimistic_version must be 1' using errcode='23514'; end if;
  if tg_table_name='recommendations' and new.status<>'open' then raise exception 'new recommendation must be open' using errcode='23514'; end if;
  if tg_table_name='automations' and new.status<>'draft' and current_user not in ('postgres','supabase_admin') then raise exception 'new automation must be draft' using errcode='23514'; end if;
  if tg_table_name='growth_contracts' then
   if new.status not in ('draft','compiled') and current_user not in ('postgres','supabase_admin') then raise exception 'new Growth Contract must be draft or compiled' using errcode='23514'; end if;
   if new.status<>'draft' and (coalesce(new.margin_decision->>'status','blocked') not in ('allowed','warning') or coalesce((new.consent_summary->>'granted')::integer,0)<=0
     or coalesce(jsonb_typeof(new.simulator_result),'null')<>'object' or coalesce(jsonb_typeof(new.attribution_plan),'null')<>'object' or coalesce(jsonb_typeof(new.owner_limits_snapshot),'null')<>'object') then
    raise exception 'compiled Growth Contract requires consent, safe economics, attribution and owner limits' using errcode='23514';
   end if;
  end if;
  return new;
 end if;
 if new.status is not distinct from old.status then
  if new.optimistic_version <> old.optimistic_version + 1 then raise exception 'optimistic_version must increment by one' using errcode='40001'; end if;
  return new;
 end if;
 if tg_table_name='recommendations' then
  allowed := (old.status='open' and new.status in ('accepted','snoozed','rejected','expired'))
   or (old.status='snoozed' and new.status in ('open','rejected','expired'));
 elsif tg_table_name='growth_contracts' then
  allowed := (old.status='draft' and new.status in ('compiled','cancelled'))
   or (old.status='compiled' and new.status in ('awaiting_approval','draft','cancelled'))
   or (old.status='awaiting_approval' and new.status in ('approved','draft','cancelled'))
   or (old.status='approved' and new.status in ('launching','cancelled'))
   or (old.status='launching' and new.status in ('running','simulated','failed'))
   or (old.status='running' and new.status in ('paused','completed','failed'))
   or (old.status='simulated' and new.status in ('completed','failed'))
   or (old.status='paused' and new.status in ('running','completed','cancelled'))
   or (old.status='failed' and new.status='draft');
  if new.status in ('compiled','awaiting_approval','approved','launching','running','simulated') then
   if coalesce(new.margin_decision->>'status','blocked') not in ('allowed','warning') then raise exception 'Margin Shield blocks transition' using errcode='23514'; end if;
   if coalesce((new.consent_summary->>'granted')::integer,0) <= 0 then raise exception 'consent eligible audience required' using errcode='23514'; end if;
   if coalesce(jsonb_typeof(new.simulator_result),'null')<>'object' or coalesce(jsonb_typeof(new.attribution_plan),'null')<>'object' or coalesce(jsonb_typeof(new.owner_limits_snapshot),'null')<>'object' then
    raise exception 'compiled economics, attribution and owner limits required' using errcode='23514';
   end if;
  end if;
 elsif tg_table_name='automations' then
  allowed := (old.status='draft' and new.status in ('active','disabled'))
   or (old.status='active' and new.status in ('paused','disabled'))
   or (old.status='paused' and new.status in ('active','disabled'));
 end if;
 if not allowed then raise exception 'invalid % transition: % -> %',tg_table_name,old.status,new.status using errcode='23514'; end if;
 if new.optimistic_version <> old.optimistic_version + 1 then raise exception 'optimistic_version must increment by one' using errcode='40001'; end if;
 return new;
end $$;
revoke all on function private.enforce_domain_transition() from public,anon,authenticated,service_role;
create trigger recommendations_domain_transition before insert or update on public.recommendations for each row execute function private.enforce_domain_transition();
create trigger growth_contracts_domain_transition before insert or update on public.growth_contracts for each row execute function private.enforce_domain_transition();
create trigger automations_domain_transition before insert or update on public.automations for each row execute function private.enforce_domain_transition();

create or replace function private.protect_accepted_growth_contract()
returns trigger language plpgsql set search_path=''
as $$
begin
 if old.status<>'draft' and (
  new.accepted_snapshot is distinct from old.accepted_snapshot or new.schema_version is distinct from old.schema_version
  or new.version is distinct from old.version or new.content_hash is distinct from old.content_hash
  or new.consent_summary is distinct from old.consent_summary or new.simulator_result is distinct from old.simulator_result
  or new.margin_decision is distinct from old.margin_decision or new.attribution_plan is distinct from old.attribution_plan
  or new.owner_limits_snapshot is distinct from old.owner_limits_snapshot
 ) then raise exception 'accepted Growth Contract snapshot is immutable; create a new version' using errcode='42501'; end if;
 return new;
end $$;

create or replace function private.transition_domain_entity(p_entity_type text,p_entity_id uuid,p_to_status text,p_expected_version integer,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_business_id uuid; v_status text; v_version integer; v_is_mock boolean; v_result jsonb; v_actor uuid := (select auth.uid());
begin
 if v_actor is null then raise exception 'authentication required' using errcode='42501'; end if;
 if char_length(coalesce(p_idempotency_key,'')) not between 8 and 200 then raise exception 'invalid idempotency key' using errcode='22023'; end if;
 if p_entity_type='recommendation' then select business_id,status,optimistic_version,is_mock into v_business_id,v_status,v_version,v_is_mock from public.recommendations where id=p_entity_id for update;
 elsif p_entity_type='growth_contract' then select business_id,status,optimistic_version,is_mock into v_business_id,v_status,v_version,v_is_mock from public.growth_contracts where id=p_entity_id for update;
 elsif p_entity_type='automation' then select business_id,status,optimistic_version,is_mock into v_business_id,v_status,v_version,v_is_mock from public.automations where id=p_entity_id for update;
 else raise exception 'unsupported entity type' using errcode='22023'; end if;
 if v_business_id is null or not private.has_business_role(v_business_id,array['owner','manager','marketer']) then raise exception 'forbidden' using errcode='42501'; end if;
 select result into v_result from private.domain_command_receipts where business_id=v_business_id and idempotency_key=p_idempotency_key;
 if v_result is not null then return v_result; end if;
 if v_version<>p_expected_version then raise exception 'optimistic lock conflict' using errcode='40001'; end if;
 if p_entity_type='recommendation' then update public.recommendations set status=p_to_status,optimistic_version=optimistic_version+1,last_idempotency_key=p_idempotency_key,acted_by=v_actor,acted_at=now() where id=p_entity_id returning status,optimistic_version into v_status,v_version;
 elsif p_entity_type='growth_contract' then update public.growth_contracts set status=p_to_status,optimistic_version=optimistic_version+1,last_idempotency_key=p_idempotency_key where id=p_entity_id returning status,optimistic_version into v_status,v_version;
 else update public.automations set status=p_to_status,optimistic_version=optimistic_version+1,last_idempotency_key=p_idempotency_key where id=p_entity_id returning status,optimistic_version into v_status,v_version; end if;
 v_result := jsonb_build_object('id',p_entity_id,'entity_type',p_entity_type,'status',v_status,'optimistic_version',v_version,'idempotency_key',p_idempotency_key);
 insert into private.domain_command_receipts values(v_business_id,p_idempotency_key,'transition',p_entity_type,p_entity_id,v_result,now());
 insert into public.outbox_events(business_id,aggregate_type,aggregate_id,event_type,payload,idempotency_key,is_mock) values(v_business_id,p_entity_type,p_entity_id,p_entity_type||'.'||v_status,v_result,'outbox:'||p_idempotency_key,v_is_mock);
 insert into public.activity_logs(business_id,actor_id,action,resource_type,resource_id,metadata,is_mock) values(v_business_id,v_actor,p_entity_type||'.transition',p_entity_type,p_entity_id,v_result,v_is_mock);
 return v_result;
end $$;
revoke all on function private.transition_domain_entity(text,uuid,text,integer,text) from public,anon,authenticated,service_role;
grant execute on function private.transition_domain_entity(text,uuid,text,integer,text) to authenticated;

create or replace function public.transition_domain_entity(p_entity_type text,p_entity_id uuid,p_to_status text,p_expected_version integer,p_idempotency_key text)
returns jsonb language sql security invoker set search_path=''
as $$ select private.transition_domain_entity(p_entity_type,p_entity_id,p_to_status,p_expected_version,p_idempotency_key) $$;
revoke all on function public.transition_domain_entity(text,uuid,text,integer,text) from public,anon;
grant execute on function public.transition_domain_entity(text,uuid,text,integer,text) to authenticated;

create or replace function private.launch_growth_contract(p_contract_id uuid,p_name text,p_channel text,p_expected_version integer,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare c public.growth_contracts%rowtype; existing public.campaigns%rowtype; created public.campaigns%rowtype; v_actor uuid := (select auth.uid()); v_result jsonb; v_budget bigint;
begin
 if v_actor is null then raise exception 'authentication required' using errcode='42501'; end if;
 select * into c from public.growth_contracts where id=p_contract_id for update;
 if c.id is null or not private.has_business_role(c.business_id,array['owner','manager','marketer']) then raise exception 'forbidden' using errcode='42501'; end if;
 select * into existing from public.campaigns where business_id=c.business_id and idempotency_key=p_idempotency_key;
 if existing.id is not null then return jsonb_build_object('campaign_id',existing.id,'duplicate',true,'status',existing.status); end if;
 if c.status<>'approved' or c.optimistic_version<>p_expected_version then raise exception 'contract must be approved at expected version' using errcode='40001'; end if;
 select monthly_budget_minor into v_budget from public.business_limits where business_id=c.business_id;
 if coalesce((c.simulator_result#>>'{scenarios,base,campaignCostMinor}')::bigint,0)>coalesce(v_budget,0) then raise exception 'business budget exceeded' using errcode='23514'; end if;
 update public.growth_contracts set status='launching',optimistic_version=optimistic_version+1,last_idempotency_key=p_idempotency_key where id=c.id;
 insert into public.campaigns(business_id,growth_contract_id,name,status,channel,budget_minor,currency,stop_rule,created_by,approved_by,is_mock,idempotency_key)
 values(c.business_id,c.id,p_name,'approved',p_channel,coalesce((c.simulator_result#>>'{scenarios,base,campaignCostMinor}')::bigint,0),'KZT',c.accepted_snapshot->'stopRule',v_actor,v_actor,c.is_mock,p_idempotency_key) returning * into created;
 v_result:=jsonb_build_object('campaign_id',created.id,'contract_id',c.id,'duplicate',false,'status',created.status);
 insert into private.domain_command_receipts values(c.business_id,p_idempotency_key,'launch','growth_contract',c.id,v_result,now());
 insert into public.outbox_events(business_id,aggregate_type,aggregate_id,event_type,payload,idempotency_key,is_mock) values(c.business_id,'campaign',created.id,'campaign.launch_requested',v_result,'outbox:'||p_idempotency_key,c.is_mock);
 insert into public.activity_logs(business_id,actor_id,action,resource_type,resource_id,metadata,is_mock) values(c.business_id,v_actor,'campaign.launch_requested','campaign',created.id,v_result,c.is_mock);
 return v_result;
end $$;
revoke all on function private.launch_growth_contract(uuid,text,text,integer,text) from public,anon,authenticated,service_role;
grant execute on function private.launch_growth_contract(uuid,text,text,integer,text) to authenticated;
create or replace function public.launch_growth_contract(p_contract_id uuid,p_name text,p_channel text,p_expected_version integer,p_idempotency_key text)
returns jsonb language sql security invoker set search_path=''
as $$ select private.launch_growth_contract(p_contract_id,p_name,p_channel,p_expected_version,p_idempotency_key) $$;
revoke all on function public.launch_growth_contract(uuid,text,text,integer,text) from public,anon;
grant execute on function public.launch_growth_contract(uuid,text,text,integer,text) to authenticated;

create or replace function private.recompute_segment_memberships(p_business_id uuid,p_segment_id uuid,p_members jsonb,p_rule_version integer,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_actor uuid := (select auth.uid()); v_is_mock boolean; v_count integer; v_result jsonb;
begin
 if v_actor is null or not private.has_business_role(p_business_id,array['owner','manager','marketer']) then raise exception 'forbidden' using errcode='42501'; end if;
 if not exists(select 1 from public.customer_segments where id=p_segment_id and business_id=p_business_id and rule_version=p_rule_version) then raise exception 'segment/rule version mismatch' using errcode='23503'; end if;
 select mode='demo' into v_is_mock from public.businesses where id=p_business_id;
 if exists(select 1 from jsonb_array_elements(p_members) x where not exists(select 1 from public.customers c where c.id=(x->>'customer_id')::uuid and c.business_id=p_business_id)) then raise exception 'cross-tenant customer' using errcode='42501'; end if;
 insert into public.segment_memberships(business_id,segment_id,customer_id,evaluated_at,reason,is_mock)
 select p_business_id,p_segment_id,(x->>'customer_id')::uuid,now(),coalesce(x->'reason','{}'::jsonb),v_is_mock from jsonb_array_elements(p_members) x
 on conflict(segment_id,customer_id) do update set evaluated_at=excluded.evaluated_at,reason=excluded.reason;
 delete from public.segment_memberships sm where sm.segment_id=p_segment_id and not exists(select 1 from jsonb_array_elements(p_members) x where (x->>'customer_id')::uuid=sm.customer_id);
 update public.customer_segments set last_evaluated_at=now() where id=p_segment_id;
 select count(*) into v_count from public.segment_memberships where segment_id=p_segment_id;
 v_result:=jsonb_build_object('segment_id',p_segment_id,'rule_version',p_rule_version,'members',v_count);
 insert into public.activity_logs(business_id,actor_id,action,resource_type,resource_id,metadata,is_mock) values(p_business_id,v_actor,'segment.recomputed','customer_segment',p_segment_id,v_result,v_is_mock);
 return v_result;
end $$;
revoke all on function private.recompute_segment_memberships(uuid,uuid,jsonb,integer,text) from public,anon,authenticated,service_role;
grant execute on function private.recompute_segment_memberships(uuid,uuid,jsonb,integer,text) to authenticated;
create or replace function public.recompute_segment_memberships(p_business_id uuid,p_segment_id uuid,p_members jsonb,p_rule_version integer,p_idempotency_key text)
returns jsonb language sql security invoker set search_path=''
as $$ select private.recompute_segment_memberships(p_business_id,p_segment_id,p_members,p_rule_version,p_idempotency_key) $$;
revoke all on function public.recompute_segment_memberships(uuid,uuid,jsonb,integer,text) from public,anon;
grant execute on function public.recompute_segment_memberships(uuid,uuid,jsonb,integer,text) to authenticated;

comment on function public.transition_domain_entity(text,uuid,text,integer,text) is 'Atomic optimistic transition: entity update + outbox + append-only activity.';
comment on function public.launch_growth_contract(uuid,text,text,integer,text) is 'Server-rechecked idempotent campaign launch; blocked Margin Shield/consent contracts cannot launch.';
commit;
