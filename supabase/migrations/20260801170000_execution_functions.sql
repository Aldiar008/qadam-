begin;

-- ===========================================================================
-- Execution functions: dispatch, gating, measurement.
-- All of these are short transactions. No function here performs network I/O;
-- the worker calls the connector between `claim` and `complete`.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Send gate.
--
-- Called immediately before a message leaves, not when the audience was built.
-- Consent can be revoked, a customer suppressed or an emergency stop pressed in
-- the minutes between approval and dispatch, and each of those must win.
-- ---------------------------------------------------------------------------
create or replace function private.send_gate(p_business_id uuid, p_customer_id uuid, p_channel text, p_at timestamptz default now())
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare
 v_state public.business_execution_state%rowtype;
 v_local time; v_tz text; v_sent_today integer; v_cap integer;
 v_freq integer; v_window_start timestamptz;
begin
 select * into v_state from public.business_execution_state where business_id=p_business_id;
 v_tz := coalesce(v_state.timezone,'Asia/Almaty');
 v_cap := coalesce(v_state.daily_send_cap,500);

 if v_state.emergency_stopped_at is not null then
  return jsonb_build_object('allowed',false,'reason','emergency_stop');
 end if;
 if not exists(select 1 from public.businesses where id=p_business_id and status='active') then
  return jsonb_build_object('allowed',false,'reason','business_inactive');
 end if;
 if exists(select 1 from public.suppression_entries s
   where s.business_id=p_business_id and s.customer_id=p_customer_id
    and (s.channel is null or s.channel=p_channel)) then
  return jsonb_build_object('allowed',false,'reason','suppressed');
 end if;
 if not private.resolve_effective_consent(p_business_id,p_customer_id,'marketing.'||p_channel) then
  return jsonb_build_object('allowed',false,'reason','no_effective_consent');
 end if;

 -- Quiet hours are evaluated in the business timezone, and the window may wrap midnight.
 v_local := (p_at at time zone v_tz)::time;
 if v_state.business_id is not null then
  if (v_state.quiet_hours_start < v_state.quiet_hours_end
       and v_local >= v_state.quiet_hours_start and v_local < v_state.quiet_hours_end)
   or (v_state.quiet_hours_start > v_state.quiet_hours_end
       and (v_local >= v_state.quiet_hours_start or v_local < v_state.quiet_hours_end)) then
   return jsonb_build_object('allowed',false,'reason','quiet_hours','local_time',v_local::text);
  end if;
 end if;

 select count(*) into v_sent_today from public.campaign_deliveries d
 where d.business_id=p_business_id and d.status in ('sent','delivered')
  and d.queued_at >= date_trunc('day', p_at at time zone v_tz) at time zone v_tz;
 if v_sent_today >= v_cap then
  return jsonb_build_object('allowed',false,'reason','daily_cap','sent',v_sent_today);
 end if;

 -- Frequency cap: at most one message to this customer per rolling 24h.
 v_window_start := p_at - interval '24 hours';
 select count(*) into v_freq from public.campaign_deliveries d
 where d.business_id=p_business_id and d.customer_id=p_customer_id
  and d.status in ('queued','sent','delivered') and d.queued_at >= v_window_start;
 if v_freq >= 1 then
  return jsonb_build_object('allowed',false,'reason','frequency_cap','recent',v_freq);
 end if;

 return jsonb_build_object('allowed',true,'reason','ok');
end $$;
revoke all on function private.send_gate(uuid,uuid,text,timestamptz) from public,anon,authenticated,service_role;
grant execute on function private.send_gate(uuid,uuid,text,timestamptz) to authenticated, service_role;

create or replace function public.send_gate(p_business_id uuid, p_customer_id uuid, p_channel text, p_at timestamptz default now())
returns jsonb language sql stable security invoker set search_path=''
as $$ select private.send_gate(p_business_id,p_customer_id,p_channel,p_at) $$;
revoke all on function public.send_gate(uuid,uuid,text,timestamptz) from public,anon;
grant execute on function public.send_gate(uuid,uuid,text,timestamptz) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Emergency stop
-- ---------------------------------------------------------------------------
create or replace function private.set_emergency_stop(p_business_id uuid, p_stop boolean, p_reason text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_actor uuid := (select auth.uid()); v_mock boolean;
begin
 if v_actor is null or not private.has_business_role(p_business_id, array['owner','manager']) then
  raise exception 'forbidden' using errcode='42501';
 end if;
 select mode='demo' into v_mock from public.businesses where id=p_business_id;
 insert into public.business_execution_state(business_id) values(p_business_id) on conflict do nothing;
 update public.business_execution_state
 set emergency_stopped_at = case when p_stop then now() else null end,
     emergency_stopped_by = case when p_stop then v_actor else null end,
     emergency_stop_reason = case when p_stop then p_reason else null end
 where business_id=p_business_id;

 -- A stop also parks everything currently in flight.
 if p_stop then
  update public.outbox_events set status='pending', available_at=now()+interval '100 years'
  where business_id=p_business_id and status in ('pending','processing');
  update public.automations set status='paused', optimistic_version=optimistic_version+1
  where business_id=p_business_id and status='active';
 end if;

 insert into public.activity_logs(business_id,actor_id,action,resource_type,resource_id,metadata,is_mock)
 values(p_business_id,v_actor, case when p_stop then 'execution.emergency_stopped' else 'execution.resumed' end,
  'business',p_business_id, jsonb_build_object('reason',p_reason), v_mock);
 return jsonb_build_object('business_id',p_business_id,'stopped',p_stop);
end $$;
revoke all on function private.set_emergency_stop(uuid,boolean,text) from public,anon,authenticated,service_role;
grant execute on function private.set_emergency_stop(uuid,boolean,text) to authenticated;

create or replace function public.set_emergency_stop(p_business_id uuid, p_stop boolean, p_reason text)
returns jsonb language sql security invoker set search_path=''
as $$ select private.set_emergency_stop(p_business_id,p_stop,p_reason) $$;
revoke all on function public.set_emergency_stop(uuid,boolean,text) from public,anon;
grant execute on function public.set_emergency_stop(uuid,boolean,text) to authenticated;

-- ---------------------------------------------------------------------------
-- Outbox: lease a batch, then complete or fail it.
-- The worker does its network call between these two calls, never inside one.
-- ---------------------------------------------------------------------------
create or replace function private.claim_outbox_batch(p_business_id uuid, p_worker text, p_limit integer)
returns setof public.outbox_events language plpgsql security definer set search_path=''
as $$
begin
 if exists(select 1 from public.business_execution_state
   where business_id=p_business_id and emergency_stopped_at is not null) then
  return;
 end if;
 return query
 update public.outbox_events o set status='processing', locked_at=now(), locked_by=p_worker, attempts=o.attempts+1
 where o.id in (
   select id from public.outbox_events
   where business_id=p_business_id and status='pending' and available_at<=now()
   order by available_at, id
   for update skip locked
   limit greatest(1, least(100, coalesce(p_limit,10)))
 )
 returning o.*;
end $$;
revoke all on function private.claim_outbox_batch(uuid,text,integer) from public,anon,authenticated,service_role;
grant execute on function private.claim_outbox_batch(uuid,text,integer) to service_role;

create or replace function public.claim_outbox_batch(p_business_id uuid, p_worker text, p_limit integer)
returns setof public.outbox_events language sql security invoker set search_path=''
as $$ select * from private.claim_outbox_batch(p_business_id,p_worker,p_limit) $$;
revoke all on function public.claim_outbox_batch(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.claim_outbox_batch(uuid,text,integer) to service_role;

create or replace function private.settle_outbox_event(p_event_id uuid, p_success boolean, p_error text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare e public.outbox_events%rowtype; v_delay interval; v_status text;
begin
 select * into e from public.outbox_events where id=p_event_id for update;
 if e.id is null then raise exception 'outbox event not found' using errcode='23503'; end if;

 if p_success then
  update public.outbox_events set status='published', processed_at=now(), locked_at=null, locked_by=null, last_error=null
  where id=p_event_id;
  return jsonb_build_object('id',p_event_id,'status','published');
 end if;

 if e.attempts >= e.attempts_max then
  -- Out of attempts: park it for a human rather than losing it.
  update public.outbox_events set status='dead_letter', dead_lettered_at=now(), locked_at=null, locked_by=null, last_error=p_error
  where id=p_event_id;
  insert into public.notifications(business_id,notification_type,category,title,body,action_url,is_mock)
  values(e.business_id,'connector_error','connector_error','Отправка не удалась после всех попыток',
   coalesce(p_error,'Событие переведено в dead letter и ждёт вашего решения.'),'/app/automations',e.is_mock);
  return jsonb_build_object('id',p_event_id,'status','dead_letter');
 end if;

 -- Exponential backoff: 30s, 60s, 120s, 240s.
 v_delay := (30 * power(2, greatest(0, e.attempts - 1)))::integer * interval '1 second';
 v_status := 'pending';
 update public.outbox_events set status=v_status, available_at=now()+v_delay, locked_at=null, locked_by=null, last_error=p_error
 where id=p_event_id;
 return jsonb_build_object('id',p_event_id,'status',v_status,'retry_in_seconds',extract(epoch from v_delay)::integer,'attempt',e.attempts);
end $$;
revoke all on function private.settle_outbox_event(uuid,boolean,text) from public,anon,authenticated,service_role;
grant execute on function private.settle_outbox_event(uuid,boolean,text) to service_role;

create or replace function public.settle_outbox_event(p_event_id uuid, p_success boolean, p_error text)
returns jsonb language sql security invoker set search_path=''
as $$ select private.settle_outbox_event(p_event_id,p_success,p_error) $$;
revoke all on function public.settle_outbox_event(uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.settle_outbox_event(uuid,boolean,text) to service_role;

-- ---------------------------------------------------------------------------
-- Queue one delivery. Idempotent on (business, idempotency_key).
-- ---------------------------------------------------------------------------
create or replace function private.enqueue_delivery(
 p_business_id uuid, p_campaign_id uuid, p_customer_id uuid, p_content_item_id uuid,
 p_channel text, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_gate jsonb; v_existing public.campaign_deliveries%rowtype; v_id uuid; v_mock boolean;
begin
 select * into v_existing from public.campaign_deliveries
 where business_id=p_business_id and idempotency_key=p_idempotency_key;
 if v_existing.id is not null then
  return jsonb_build_object('delivery_id',v_existing.id,'duplicate',true,'status',v_existing.status);
 end if;

 v_gate := private.send_gate(p_business_id,p_customer_id,p_channel);
 if not (v_gate->>'allowed')::boolean then
  return jsonb_build_object('delivery_id',null,'duplicate',false,'status','suppressed','reason',v_gate->>'reason');
 end if;

 select mode='demo' into v_mock from public.businesses where id=p_business_id;
 insert into public.campaign_deliveries(business_id,campaign_id,customer_id,content_item_id,idempotency_key,status,is_mock)
 values(p_business_id,p_campaign_id,p_customer_id,p_content_item_id,p_idempotency_key,'queued',v_mock)
 returning id into v_id;

 insert into public.outbox_events(business_id,aggregate_type,aggregate_id,event_type,payload,idempotency_key,is_mock)
 values(p_business_id,'campaign_delivery',v_id,'delivery.requested',
  jsonb_build_object('delivery_id',v_id,'campaign_id',p_campaign_id,'customer_id',p_customer_id,'channel',p_channel),
  'outbox:delivery:'||p_idempotency_key,v_mock)
 on conflict do nothing;

 return jsonb_build_object('delivery_id',v_id,'duplicate',false,'status','queued');
end $$;
revoke all on function private.enqueue_delivery(uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function private.enqueue_delivery(uuid,uuid,uuid,uuid,text,text) to authenticated, service_role;

create or replace function public.enqueue_delivery(
 p_business_id uuid, p_campaign_id uuid, p_customer_id uuid, p_content_item_id uuid,
 p_channel text, p_idempotency_key text)
returns jsonb language sql security invoker set search_path=''
as $$ select private.enqueue_delivery(p_business_id,p_campaign_id,p_customer_id,p_content_item_id,p_channel,p_idempotency_key) $$;
revoke all on function public.enqueue_delivery(uuid,uuid,uuid,uuid,text,text) from public,anon;
grant execute on function public.enqueue_delivery(uuid,uuid,uuid,uuid,text,text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Provider event ingestion.
--
-- The raw event is stored first and separately. Derived rows (campaign_events)
-- are written from it exactly once; a replay returns the original receipt.
-- ---------------------------------------------------------------------------
create or replace function private.ingest_provider_event(
 p_business_id uuid, p_provider text, p_channel text, p_external_event_id text,
 p_event_type text, p_delivery_id uuid, p_signature_verified boolean, p_payload jsonb,
 p_occurred_at timestamptz)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_existing public.provider_events%rowtype; v_raw_id uuid; v_campaign uuid; v_customer uuid; v_mock boolean;
begin
 if not p_signature_verified then
  raise exception 'provider event signature is not verified' using errcode='42501';
 end if;
 if p_event_type not in ('sent','delivered','opened','clicked','redeemed','bounced','unsubscribed','stopped') then
  raise exception 'unsupported provider event type' using errcode='22023';
 end if;

 select * into v_existing from public.provider_events
 where business_id=p_business_id and provider=p_provider and external_event_id=p_external_event_id;
 if v_existing.id is not null then
  return jsonb_build_object('provider_event_id',v_existing.id,'duplicate',true,'event_type',v_existing.event_type);
 end if;

 select mode='demo' into v_mock from public.businesses where id=p_business_id;

 if p_delivery_id is not null then
  select campaign_id, customer_id into v_campaign, v_customer
  from public.campaign_deliveries where id=p_delivery_id and business_id=p_business_id;
  -- A delivery that belongs to another tenant must never attach here.
  if v_campaign is null then raise exception 'delivery does not belong to this business' using errcode='42501'; end if;
 end if;

 insert into public.provider_events(business_id,provider,channel,external_event_id,event_type,delivery_id,campaign_id,
  signature_verified,received_at,payload,is_mock)
 values(p_business_id,p_provider,p_channel,p_external_event_id,p_event_type,p_delivery_id,v_campaign,
  true,now(),coalesce(p_payload,'{}'::jsonb),v_mock)
 returning id into v_raw_id;

 -- Derived projections. Each is keyed so a second raw event with a different id
 -- but the same meaning still cannot double count.
 if v_campaign is not null then
  insert into public.campaign_events(business_id,campaign_id,delivery_id,customer_id,event_type,occurred_at,source,external_event_ref,metadata,is_mock)
  values(p_business_id,v_campaign,p_delivery_id,v_customer,p_event_type,coalesce(p_occurred_at,now()),p_provider,p_external_event_id,
   jsonb_build_object('provider_event_id',v_raw_id),v_mock)
  on conflict (business_id,source,external_event_ref) do nothing;

  if p_event_type in ('sent','delivered') then
   update public.campaign_deliveries
   set status=p_event_type, sent_at=coalesce(sent_at, coalesce(p_occurred_at,now())),
       delivered_at=case when p_event_type='delivered' then coalesce(p_occurred_at,now()) else delivered_at end
   where id=p_delivery_id and business_id=p_business_id;
  elsif p_event_type='bounced' then
   update public.campaign_deliveries set status='failed', failure_code='bounced'
   where id=p_delivery_id and business_id=p_business_id;
  end if;
 end if;

 -- An unsubscribe must take effect immediately, not at the next audience build.
 if p_event_type in ('unsubscribed','stopped') and v_customer is not null then
  insert into public.customer_consents(business_id,customer_id,scope,status,source,revoked_at,evidence,is_mock)
  values(p_business_id,v_customer,'marketing','revoked',p_provider,now(),
   jsonb_build_object('provider_event_id',v_raw_id,'immediate',true),v_mock);
  insert into public.suppression_entries(business_id,customer_id,channel,reason,is_mock)
  values(p_business_id,v_customer,p_channel,'unsubscribed',v_mock);
 end if;

 update public.provider_events set processed_at=now() where id=v_raw_id;
 return jsonb_build_object('provider_event_id',v_raw_id,'duplicate',false,'event_type',p_event_type,'campaign_id',v_campaign);
end $$;
revoke all on function private.ingest_provider_event(uuid,text,text,text,text,uuid,boolean,jsonb,timestamptz) from public,anon,authenticated,service_role;
grant execute on function private.ingest_provider_event(uuid,text,text,text,text,uuid,boolean,jsonb,timestamptz) to service_role;

create or replace function public.ingest_provider_event(
 p_business_id uuid, p_provider text, p_channel text, p_external_event_id text,
 p_event_type text, p_delivery_id uuid, p_signature_verified boolean, p_payload jsonb,
 p_occurred_at timestamptz)
returns jsonb language sql security invoker set search_path=''
as $$ select private.ingest_provider_event(p_business_id,p_provider,p_channel,p_external_event_id,p_event_type,p_delivery_id,p_signature_verified,p_payload,p_occurred_at) $$;
revoke all on function public.ingest_provider_event(uuid,text,text,text,text,uuid,boolean,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.ingest_provider_event(uuid,text,text,text,text,uuid,boolean,jsonb,timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- Stop-loss: pause automatically, but require a human to restart.
-- ---------------------------------------------------------------------------
create or replace function private.evaluate_stop_loss(p_campaign_id uuid, p_min_redemption_bps integer, p_min_delivered integer)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare c public.campaigns%rowtype; v_delivered integer; v_redeemed integer; v_bps integer; v_mock boolean;
begin
 select * into c from public.campaigns where id=p_campaign_id for update;
 if c.id is null then raise exception 'campaign not found' using errcode='23503'; end if;
 select mode='demo' into v_mock from public.businesses where id=c.business_id;

 select count(*) filter (where event_type in ('sent','delivered')),
        count(*) filter (where event_type='redeemed')
 into v_delivered, v_redeemed
 from public.campaign_events where campaign_id=p_campaign_id and business_id=c.business_id;

 if v_delivered < greatest(1, coalesce(p_min_delivered,10)) then
  return jsonb_build_object('campaign_id',p_campaign_id,'action','none','reason','insufficient_sample','delivered',v_delivered);
 end if;

 v_bps := (v_redeemed::numeric / nullif(v_delivered,0) * 10000)::integer;
 if v_bps >= coalesce(p_min_redemption_bps,500) then
  return jsonb_build_object('campaign_id',p_campaign_id,'action','none','reason','performing','redemption_bps',v_bps);
 end if;

 if c.status not in ('running','scheduled') then
  return jsonb_build_object('campaign_id',p_campaign_id,'action','none','reason','not_running','status',c.status);
 end if;

 update public.campaigns set status='paused', optimistic_version=optimistic_version+1 where id=p_campaign_id;
 insert into public.notifications(business_id,notification_type,category,title,body,action_url,is_mock)
 values(c.business_id,'risk','risk','Кампания остановлена автоматически',
  'Отклик '||(v_bps/100.0)||'% ниже порога. Кампания на паузе — возобновить может только владелец.',
  '/app/campaigns/'||p_campaign_id, v_mock);
 insert into public.activity_logs(business_id,action,resource_type,resource_id,metadata,is_mock)
 values(c.business_id,'campaign.stop_loss_paused','campaign',p_campaign_id,
  jsonb_build_object('redemption_bps',v_bps,'delivered',v_delivered,'redeemed',v_redeemed,'restart_requires_owner',true),v_mock);
 return jsonb_build_object('campaign_id',p_campaign_id,'action','paused','redemption_bps',v_bps,'delivered',v_delivered);
end $$;
revoke all on function private.evaluate_stop_loss(uuid,integer,integer) from public,anon,authenticated,service_role;
grant execute on function private.evaluate_stop_loss(uuid,integer,integer) to authenticated, service_role;

create or replace function public.evaluate_stop_loss(p_campaign_id uuid, p_min_redemption_bps integer, p_min_delivered integer)
returns jsonb language sql security invoker set search_path=''
as $$ select private.evaluate_stop_loss(p_campaign_id,p_min_redemption_bps,p_min_delivered) $$;
revoke all on function public.evaluate_stop_loss(uuid,integer,integer) from public,anon;
grant execute on function public.evaluate_stop_loss(uuid,integer,integer) to authenticated, service_role;

commit;
