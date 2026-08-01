begin;

create or replace function private.has_effective_consent(p_business_id uuid,p_customer_id uuid,p_scope text)
returns boolean language sql stable security invoker set search_path=''
as $$
 select coalesce((
  select cc.status='granted' and (cc.expires_at is null or cc.expires_at>now())
  from public.customer_consents cc
  where cc.business_id=p_business_id and cc.customer_id=p_customer_id and cc.scope=p_scope
  order by cc.created_at desc limit 1
 ),false)
$$;
revoke all on function private.has_effective_consent(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.has_effective_consent(uuid,uuid,text) to authenticated;

create or replace function private.enforce_campaign_state_and_economics()
returns trigger language plpgsql set search_path=''
as $$
declare allowed boolean;
begin
 if tg_op='INSERT' then
  if current_user not in ('postgres','supabase_admin') and new.status<>'draft' then raise exception 'new campaign must be draft or created by guarded launch command' using errcode='23514'; end if;
  if new.optimistic_version<>1 then raise exception 'new campaign optimistic_version must be 1' using errcode='23514'; end if;
  if new.budget_minor>(select bl.monthly_budget_minor from public.business_limits bl where bl.business_id=new.business_id) then raise exception 'campaign budget exceeds owner limit' using errcode='23514'; end if;
  return new;
 end if;
 if old.status<>'draft' and (new.budget_minor is distinct from old.budget_minor or new.currency is distinct from old.currency or new.growth_contract_id is distinct from old.growth_contract_id or new.channel is distinct from old.channel) then
  raise exception 'approved campaign economics are immutable; create a new Growth Contract version' using errcode='42501';
 end if;
 if new.optimistic_version<>old.optimistic_version+1 then raise exception 'campaign optimistic_version must increment by one' using errcode='40001'; end if;
 if new.status is distinct from old.status then
  allowed := (old.status='draft' and new.status in ('pending_approval','canceled'))
   or (old.status='pending_approval' and new.status in ('approved','draft','canceled'))
   or (old.status='approved' and new.status in ('scheduled','running','canceled'))
   or (old.status='scheduled' and new.status in ('running','paused','canceled','failed'))
   or (old.status='running' and new.status in ('paused','completed','failed'))
   or (old.status='paused' and new.status in ('running','completed','canceled'));
  if not allowed then raise exception 'invalid campaign transition: % -> %',old.status,new.status using errcode='23514'; end if;
 end if;
 return new;
end $$;
revoke all on function private.enforce_campaign_state_and_economics() from public,anon,authenticated,service_role;
create trigger campaigns_execution_guard before insert or update on public.campaigns for each row execute function private.enforce_campaign_state_and_economics();

create or replace function private.enforce_audience_consent()
returns trigger language plpgsql set search_path=''
as $$
declare v_channel text; v_scope text;
begin
 if new.customer_id is null or new.inclusion_status='excluded' then return new; end if;
 select c.channel into v_channel from public.campaigns c where c.id=new.campaign_id and c.business_id=new.business_id;
 v_scope:='marketing.'||v_channel;
 if not private.has_effective_consent(new.business_id,new.customer_id,v_scope) then raise exception 'effective consent required before audience inclusion' using errcode='42501'; end if;
 new.consent_scope:=v_scope; new.consent_status:='granted';
 return new;
end $$;
revoke all on function private.enforce_audience_consent() from public,anon,authenticated,service_role;
create trigger campaign_audience_consent_guard before insert or update on public.campaign_audiences for each row execute function private.enforce_audience_consent();

create or replace function private.enforce_delivery_consent()
returns trigger language plpgsql set search_path=''
as $$
declare v_channel text;
begin
 select c.channel into v_channel from public.campaigns c where c.id=new.campaign_id and c.business_id=new.business_id;
 if not private.has_effective_consent(new.business_id,new.customer_id,'marketing.'||v_channel) then raise exception 'effective consent required before delivery' using errcode='42501'; end if;
 return new;
end $$;
revoke all on function private.enforce_delivery_consent() from public,anon,authenticated,service_role;
create trigger campaign_delivery_consent_guard before insert or update of customer_id,campaign_id on public.campaign_deliveries for each row execute function private.enforce_delivery_consent();

comment on function private.enforce_delivery_consent() is 'Last database boundary before queueing a customer delivery; checks latest effective channel consent.';
commit;
