begin;

-- Consent scope resolution.
--
-- Customers acquired through QR join or CSV import grant the umbrella scope
-- 'marketing', because no channel is known at that moment. Campaign audiences
-- and deliveries are guarded on the channel scope 'marketing.<channel>'.
-- Without a resolution rule those customers could never be reached, so the
-- umbrella grant is treated as consent for every marketing channel that the
-- customer has not answered explicitly. An explicit channel row always wins,
-- which keeps per-channel opt-out and revoke effective and immediate.

create or replace function private.has_consent_row(p_business_id uuid,p_customer_id uuid,p_scope text)
returns boolean language sql stable security invoker set search_path=''
as $$
 select exists(
  select 1 from public.customer_consents cc
  where cc.business_id=p_business_id and cc.customer_id=p_customer_id and cc.scope=p_scope
 )
$$;

-- `has_effective_consent` picks the newest row with `order by created_at desc
-- limit 1`, so two consent changes written in the same transaction share a
-- timestamp and the winner is arbitrary. On the enforcement path that ambiguity
-- must never resolve in favour of contacting the customer: every row carrying
-- the newest timestamp has to be a live grant.
create or replace function private.latest_consent_is_granted(p_business_id uuid,p_customer_id uuid,p_scope text)
returns boolean language sql stable security invoker set search_path=''
as $$
 select coalesce((
  select bool_and(cc.status='granted' and (cc.expires_at is null or cc.expires_at>now()))
  from public.customer_consents cc
  where cc.business_id=p_business_id and cc.customer_id=p_customer_id and cc.scope=p_scope
   and cc.created_at=(
    select max(x.created_at) from public.customer_consents x
    where x.business_id=p_business_id and x.customer_id=p_customer_id and x.scope=p_scope
   )
 ),false)
$$;

create or replace function private.resolve_effective_consent(p_business_id uuid,p_customer_id uuid,p_scope text)
returns boolean language sql stable security invoker set search_path=''
as $$
 select case
  when private.has_consent_row(p_business_id,p_customer_id,p_scope)
   then private.latest_consent_is_granted(p_business_id,p_customer_id,p_scope)
  when p_scope like 'marketing.%'
   then private.latest_consent_is_granted(p_business_id,p_customer_id,'marketing')
  else false
 end
$$;

revoke all on function private.has_consent_row(uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function private.latest_consent_is_granted(uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function private.resolve_effective_consent(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.has_consent_row(uuid,uuid,text) to authenticated;
grant execute on function private.latest_consent_is_granted(uuid,uuid,text) to authenticated;
grant execute on function private.resolve_effective_consent(uuid,uuid,text) to authenticated;

-- Audience and delivery guards now use the resolution rule.
create or replace function private.enforce_audience_consent()
returns trigger language plpgsql set search_path=''
as $$
declare v_channel text; v_scope text;
begin
 if new.customer_id is null or new.inclusion_status='excluded' then return new; end if;
 select c.channel into v_channel from public.campaigns c where c.id=new.campaign_id and c.business_id=new.business_id;
 v_scope:='marketing.'||v_channel;
 if not private.resolve_effective_consent(new.business_id,new.customer_id,v_scope) then
  raise exception 'effective consent required before audience inclusion' using errcode='42501';
 end if;
 new.consent_scope:=v_scope; new.consent_status:='granted';
 return new;
end $$;
revoke all on function private.enforce_audience_consent() from public,anon,authenticated,service_role;

create or replace function private.enforce_delivery_consent()
returns trigger language plpgsql set search_path=''
as $$
declare v_channel text;
begin
 select c.channel into v_channel from public.campaigns c where c.id=new.campaign_id and c.business_id=new.business_id;
 if not private.resolve_effective_consent(new.business_id,new.customer_id,'marketing.'||v_channel) then
  raise exception 'effective consent required before delivery' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function private.enforce_delivery_consent() from public,anon,authenticated,service_role;

-- One authoritative eligibility list for previews, compilation and audiences.
create or replace function private.effective_consent_customers(p_business_id uuid,p_scope text,p_customer_ids uuid[])
returns setof uuid language sql stable security invoker set search_path=''
as $$
 select c.id from public.customers c
 where c.business_id=p_business_id
  and c.lifecycle_stage<>'anonymized'
  and (p_customer_ids is null or c.id=any(p_customer_ids))
  and private.resolve_effective_consent(p_business_id,c.id,p_scope)
$$;
revoke all on function private.effective_consent_customers(uuid,text,uuid[]) from public,anon,authenticated,service_role;
grant execute on function private.effective_consent_customers(uuid,text,uuid[]) to authenticated;

create or replace function public.effective_consent_customers(p_business_id uuid,p_scope text,p_customer_ids uuid[])
returns setof uuid language sql stable security invoker set search_path=''
as $$ select private.effective_consent_customers(p_business_id,p_scope,p_customer_ids) $$;
revoke all on function public.effective_consent_customers(uuid,text,uuid[]) from public,anon;
grant execute on function public.effective_consent_customers(uuid,text,uuid[]) to authenticated;

comment on function public.effective_consent_customers(uuid,text,uuid[]) is
 'Consent-first audience resolution: explicit channel consent wins, umbrella marketing consent applies only where the channel was never answered.';

commit;
