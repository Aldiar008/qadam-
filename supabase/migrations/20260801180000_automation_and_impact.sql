begin;

-- ===========================================================================
-- Automation execution and the honest impact pipeline.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- One automation run. Idempotent per (business, idempotency_key).
--
-- Assistant and manual modes only ever produce a proposal + notification; they
-- never dispatch. Autopilot is the single mode allowed to enqueue, and the
-- table constraint already requires an approved template and a named owner
-- before that mode can be stored at all.
-- ---------------------------------------------------------------------------
create or replace function private.execute_automation(p_automation_id uuid, p_idempotency_key text, p_trigger_source text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
 a public.automations%rowtype; v_actor uuid := (select auth.uid()); v_mock boolean;
 v_existing public.automation_runs%rowtype; v_run_id uuid; v_result jsonb;
 v_candidates integer := 0; v_eligible integer := 0; v_days integer; v_stopped boolean;
begin
 if char_length(coalesce(p_idempotency_key,'')) not between 8 and 200 then
  raise exception 'invalid idempotency key' using errcode='22023';
 end if;
 select * into a from public.automations where id=p_automation_id for update;
 if a.id is null then raise exception 'automation not found' using errcode='23503'; end if;

 select * into v_existing from public.automation_runs
 where business_id=a.business_id and idempotency_key=p_idempotency_key;
 if v_existing.id is not null then
  return jsonb_build_object('run_id',v_existing.id,'duplicate',true,'status',v_existing.status);
 end if;

 select mode='demo' into v_mock from public.businesses where id=a.business_id;
 select emergency_stopped_at is not null into v_stopped
 from public.business_execution_state where business_id=a.business_id;

 insert into public.automation_runs(business_id,automation_id,status,idempotency_key,scheduled_at,started_at,trigger_source,is_mock)
 values(a.business_id,a.id,'running',p_idempotency_key,now(),now(),coalesce(p_trigger_source,'scheduler'),v_mock)
 returning id into v_run_id;

 if coalesce(v_stopped,false) then
  v_result := jsonb_build_object('outcome','skipped','reason','emergency_stop');
  update public.automation_runs set status='skipped', completed_at=now(), result=v_result where id=v_run_id;
  return jsonb_build_object('run_id',v_run_id,'duplicate',false,'status','skipped','result',v_result);
 end if;
 if a.status <> 'active' then
  v_result := jsonb_build_object('outcome','skipped','reason','automation_'||a.status);
  update public.automation_runs set status='skipped', completed_at=now(), result=v_result where id=v_run_id;
  return jsonb_build_object('run_id',v_run_id,'duplicate',false,'status','skipped','result',v_result);
 end if;

 -- Rule evaluation. Each rule counts a candidate set and then narrows it by the
 -- same consent resolution the send gate uses, so the number the owner is shown
 -- is the number the database would actually allow.
 v_days := coalesce((a.trigger_rules->>'days')::integer, 30);

 if a.automation_type in ('reactivation','winback') then
  select count(*) into v_candidates from public.customers c
  where c.business_id=a.business_id and c.lifecycle_stage <> 'anonymized'
   and (c.last_seen_at is null or c.last_seen_at < now() - make_interval(days => v_days));
 elsif a.automation_type = 'welcome' then
  select count(*) into v_candidates from public.customers c
  where c.business_id=a.business_id and c.lifecycle_stage='new'
   and c.first_seen_at >= now() - interval '7 days';
 elsif a.automation_type = 'birthday' then
  -- No lawful birth-date field exists yet, so this rule can only ever report
  -- zero candidates rather than guessing a date.
  v_candidates := 0;
 elsif a.automation_type = 'quiet_hours' then
  select count(*) into v_candidates from public.capacity_slots s
  where s.business_id=a.business_id and s.starts_at between now() and now()+interval '7 days'
   and s.capacity > 0 and (s.booked::numeric / s.capacity) < coalesce((a.trigger_rules->>'utilisationThreshold')::numeric, 0.5);
 elsif a.automation_type in ('repeat_service','vip_care') then
  select count(*) into v_candidates from public.customers c
  where c.business_id=a.business_id and c.lifecycle_stage in ('loyal','vip');
 elsif a.automation_type = 'stop_loss' then
  select count(*) into v_candidates from public.campaigns
  where business_id=a.business_id and status in ('running','scheduled');
 elsif a.automation_type in ('content_queue','weekly_review','data_quality') then
  v_candidates := 1;
 else
  v_candidates := 0;
 end if;

 if a.automation_type in ('reactivation','winback','welcome','repeat_service','vip_care') then
  select count(*) into v_eligible from public.customers c
  where c.business_id=a.business_id and c.lifecycle_stage <> 'anonymized'
   and private.resolve_effective_consent(a.business_id, c.id, 'marketing.'||coalesce(a.action_rules->>'channel','whatsapp'))
   and not exists(select 1 from public.suppression_entries s where s.business_id=a.business_id and s.customer_id=c.id);
  v_eligible := least(v_eligible, v_candidates);
 else
  v_eligible := v_candidates;
 end if;

 -- Stop-loss acts directly: it can pause, but never restart.
 if a.automation_type='stop_loss' then
  perform private.evaluate_stop_loss(id,
    coalesce((a.trigger_rules->>'minRedemptionBps')::integer, 500),
    coalesce((a.trigger_rules->>'minDelivered')::integer, 10))
  from public.campaigns where business_id=a.business_id and status in ('running','scheduled');
 end if;

 v_result := jsonb_build_object(
  'outcome', case when a.mode='autopilot' then 'dispatched' else 'proposed' end,
  'mode', a.mode, 'rule_version', a.rule_version,
  'candidates', v_candidates, 'eligible', v_eligible,
  'requires_owner_approval', a.mode <> 'autopilot');

 -- Assistant/manual: tell the owner, do not act.
 if a.mode <> 'autopilot' and v_eligible > 0 then
  insert into public.notifications(business_id,user_id,notification_type,category,title,body,action_url,is_mock)
  values(a.business_id, a.owner_id, 'opportunity','opportunity',
   a.name||': найдено '||v_eligible||' подходящих клиентов',
   'Правило работает в режиме «'||a.mode||'»: QADAM подготовил действие, но ничего не отправил. Подтвердите запуск вручную.',
   '/app/automations', v_mock);
 end if;

 update public.automation_runs set status='completed', completed_at=now(), result=v_result where id=v_run_id;
 -- `enforce_domain_transition` requires optimistic_version to advance on every
 -- update, including a bookkeeping one that leaves the status alone.
 update public.automations
 set last_run_at=now(),
     next_run_at=now() + make_interval(hours => greatest(1, coalesce((a.trigger_rules->>'intervalHours')::integer, 24))),
     optimistic_version=optimistic_version+1
 where id=a.id;

 insert into public.activity_logs(business_id,actor_id,action,resource_type,resource_id,metadata,is_mock)
 values(a.business_id,v_actor,'automation.run','automation',a.id,v_result,v_mock);
 return jsonb_build_object('run_id',v_run_id,'duplicate',false,'status','completed','result',v_result);
end $$;
revoke all on function private.execute_automation(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function private.execute_automation(uuid,text,text) to authenticated, service_role;

create or replace function public.execute_automation(p_automation_id uuid, p_idempotency_key text, p_trigger_source text)
returns jsonb language sql security invoker set search_path=''
as $$ select private.execute_automation(p_automation_id,p_idempotency_key,p_trigger_source) $$;
revoke all on function public.execute_automation(uuid,text,text) from public,anon;
grant execute on function public.execute_automation(uuid,text,text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Impact recomputation.
--
-- Influenced revenue and incremental estimate are deliberately separate kinds.
-- Influenced is "revenue from customers who interacted": genuine revenue, but
-- not attributable to the campaign. Incremental is influenced minus the recorded baseline, and it
-- is only emitted when the sample clears `min_sample_size`; below that the
-- ledger records an observed difference with its sample size instead.
-- ---------------------------------------------------------------------------
create or replace function private.recompute_campaign_impact(p_campaign_id uuid, p_measurement_version text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
 c public.campaigns%rowtype; b public.impact_baselines%rowtype; v_mock boolean;
 v_delivered integer; v_opened integer; v_redeemed integer;
 v_influenced bigint; v_incremental bigint; v_contribution bigint; v_cost bigint;
 v_margin_bps integer; v_period_start timestamptz; v_period_end timestamptz;
 v_kind text; v_sufficient boolean; v_result jsonb;
begin
 select * into c from public.campaigns where id=p_campaign_id;
 if c.id is null then raise exception 'campaign not found' using errcode='23503'; end if;
 select mode='demo' into v_mock from public.businesses where id=c.business_id;
 select * into b from public.impact_baselines
 where campaign_id=p_campaign_id and measurement_version=p_measurement_version;

 select count(*) filter (where event_type in ('sent','delivered')),
        count(*) filter (where event_type='opened'),
        count(*) filter (where event_type='redeemed')
 into v_delivered, v_opened, v_redeemed
 from public.campaign_events where campaign_id=p_campaign_id and business_id=c.business_id;

 v_period_start := coalesce(c.starts_at, c.created_at);
 v_period_end := greatest(coalesce(c.ends_at, now()), v_period_start + interval '1 hour');

 -- Influenced: revenue booked by customers who received this campaign, within its window.
 select coalesce(sum(t.net_minor),0) into v_influenced
 from public.transactions t
 where t.business_id=c.business_id
  and t.occurred_at between v_period_start and v_period_end
  and t.customer_id in (select customer_id from public.campaign_deliveries where campaign_id=p_campaign_id);

 select coalesce(sum(campaign_cost_minor),0) into v_cost
 from public.redemptions where campaign_id=p_campaign_id;
 if v_cost = 0 then v_cost := c.budget_minor; end if;

 v_sufficient := b.id is not null and v_delivered >= b.min_sample_size;
 v_incremental := case when b.id is null then 0 else greatest(0, v_influenced - b.baseline_revenue_minor) end;

 select coalesce(margin_floor_bps, 4200) into v_margin_bps from public.business_profiles where business_id=c.business_id;
 v_contribution := (v_incremental * v_margin_bps) / 10000;

 -- Influenced is always recorded as its own kind and never copied into incremental.
 insert into public.impact_measurements(business_id,campaign_id,metric_key,kind,value_minor,unit,currency,
  period_start,period_end,source,method_version,confidence,evidence,is_mock)
 values(c.business_id,p_campaign_id,'influenced_revenue','influenced',v_influenced,'currency_minor',c.currency,
  v_period_start,v_period_end,'impact_pipeline',p_measurement_version,
  case when v_delivered >= 30 then 70 else 40 end,
  jsonb_build_object('delivered',v_delivered,'opened',v_opened,'redeemed',v_redeemed,
   'note','Выручка клиентов, получивших кампанию. Не является приростом.'),
  v_mock);

 if b.id is null then
  v_kind := 'forecast';
  v_result := jsonb_build_object('campaign_id',p_campaign_id,'status','no_baseline',
   'influenced_minor',v_influenced,'note','Базовая линия не зафиксирована — прирост не рассчитывается.');
 elsif not v_sufficient then
  -- Honest small-sample path: an observed difference with its interval, not a result.
  insert into public.impact_measurements(business_id,campaign_id,metric_key,kind,value_minor,unit,currency,
   period_start,period_end,source,method_version,confidence,evidence,is_mock)
  values(c.business_id,p_campaign_id,'observed_difference','incremental_estimate',v_influenced - b.baseline_revenue_minor,
   'currency_minor',c.currency,v_period_start,v_period_end,'impact_pipeline',p_measurement_version,25,
   jsonb_build_object('sample',v_delivered,'min_sample',b.min_sample_size,'baseline_method',b.method,
    'note','Выборка меньше порога: показана наблюдаемая разница, а не оценка прироста.',
    'interval_low_minor', (v_influenced - b.baseline_revenue_minor) / 2,
    'interval_high_minor', (v_influenced - b.baseline_revenue_minor) * 2),
   v_mock);
  v_result := jsonb_build_object('campaign_id',p_campaign_id,'status','insufficient_sample',
   'delivered',v_delivered,'min_sample',b.min_sample_size,'observed_difference_minor',v_influenced - b.baseline_revenue_minor);
 else
  v_kind := case when v_mock then 'mock_actual' else 'incremental_estimate' end;
  insert into public.impact_measurements(business_id,campaign_id,metric_key,kind,value_minor,unit,currency,
   period_start,period_end,source,method_version,confidence,evidence,is_mock)
  values(c.business_id,p_campaign_id,'incremental_revenue',v_kind,v_incremental,'currency_minor',c.currency,
   v_period_start,v_period_end,'impact_pipeline',p_measurement_version,60,
   jsonb_build_object('baseline_minor',b.baseline_revenue_minor,'baseline_method',b.method,'sample',v_delivered),v_mock);
  insert into public.impact_measurements(business_id,campaign_id,metric_key,kind,value_minor,unit,currency,
   period_start,period_end,source,method_version,confidence,evidence,is_mock)
  values(c.business_id,p_campaign_id,'incremental_contribution',v_kind,v_contribution,'currency_minor',c.currency,
   v_period_start,v_period_end,'impact_pipeline',p_measurement_version,60,
   jsonb_build_object('margin_floor_bps',v_margin_bps,'from_incremental_minor',v_incremental),v_mock);
  v_result := jsonb_build_object('campaign_id',p_campaign_id,'status','measured','kind',v_kind,
   'influenced_minor',v_influenced,'incremental_minor',v_incremental,'contribution_minor',v_contribution,'cost_minor',v_cost);
 end if;

 insert into public.activity_logs(business_id,action,resource_type,resource_id,metadata,is_mock)
 values(c.business_id,'impact.recomputed','campaign',p_campaign_id,v_result,v_mock);
 return v_result;
end $$;
revoke all on function private.recompute_campaign_impact(uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.recompute_campaign_impact(uuid,text) to authenticated, service_role;

create or replace function public.recompute_campaign_impact(p_campaign_id uuid, p_measurement_version text)
returns jsonb language sql security invoker set search_path=''
as $$ select private.recompute_campaign_impact(p_campaign_id,p_measurement_version) $$;
revoke all on function public.recompute_campaign_impact(uuid,text) from public,anon;
grant execute on function public.recompute_campaign_impact(uuid,text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- TAMYR demo time jump.
--
-- DEMO_MODE only. Produces the canonical demo outcome deterministically from
-- the seed, marks everything is_mock, and is idempotent: a second jump adds no
-- events and no measurements.
-- ---------------------------------------------------------------------------
create or replace function private.demo_time_jump(p_business_id uuid, p_campaign_id uuid, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
 v_actor uuid := (select auth.uid()); v_mode text; v_receipt jsonb; v_result jsonb;
 v_delivery record; v_index integer := 0; v_delivered integer := 0; v_opened integer := 0; v_redeemed integer := 0;
 v_start timestamptz; v_campaign public.campaigns%rowtype;
begin
 if v_actor is null or not private.has_business_role(p_business_id, array['owner','manager']) then
  raise exception 'forbidden' using errcode='42501';
 end if;
 select mode into v_mode from public.businesses where id=p_business_id;
 if v_mode <> 'demo' then
  raise exception 'time jump is available only for demo businesses' using errcode='42501';
 end if;

 select result into v_receipt from private.domain_command_receipts
 where business_id=p_business_id and idempotency_key=p_idempotency_key;
 if v_receipt is not null then return v_receipt||jsonb_build_object('duplicate',true); end if;

 select * into v_campaign from public.campaigns where id=p_campaign_id and business_id=p_business_id;
 if v_campaign.id is null then raise exception 'campaign not found' using errcode='23503'; end if;
 v_start := coalesce(v_campaign.starts_at, v_campaign.created_at);

 -- Baseline is fixed before the simulated events land, exactly as a real
 -- measurement would require, and is immutable afterwards.
 insert into public.impact_baselines(business_id,campaign_id,measurement_version,method,audience_size,
  baseline_orders,baseline_revenue_minor,baseline_period_start,baseline_period_end,min_sample_size,evidence,is_mock)
 values(p_business_id,p_campaign_id,'tamyr-demo.v1','pre_period',18,9,54800,
  v_start - interval '30 days', v_start, 10,
  jsonb_build_object('note','Детерминированная базовая линия демонстрационного набора TAMYR'),true)
 on conflict (campaign_id, measurement_version) do nothing;

 -- 18 delivered, 15 opened, 9 redeemed — deterministic by delivery ordinal.
 for v_delivery in
  select id, customer_id from public.campaign_deliveries
  where business_id=p_business_id and campaign_id=p_campaign_id order by created_at, id limit 18
 loop
  v_index := v_index + 1;
  insert into public.provider_events(business_id,provider,channel,external_event_id,event_type,delivery_id,campaign_id,
   signature_verified,payload,processed_at,is_mock)
  values(p_business_id,'demo_time_jump',v_campaign.channel,p_idempotency_key||':delivered:'||v_index,'delivered',
   v_delivery.id,p_campaign_id,true,jsonb_build_object('ordinal',v_index),now(),true)
  on conflict do nothing;
  insert into public.campaign_events(business_id,campaign_id,delivery_id,customer_id,event_type,occurred_at,source,external_event_ref,metadata,is_mock)
  values(p_business_id,p_campaign_id,v_delivery.id,v_delivery.customer_id,'delivered',v_start+interval '1 hour','demo_time_jump',
   p_idempotency_key||':delivered:'||v_index,jsonb_build_object('simulated',true),true)
  on conflict (business_id,source,external_event_ref) do nothing;
  update public.campaign_deliveries set status='delivered', sent_at=v_start, delivered_at=v_start+interval '1 hour'
  where id=v_delivery.id;
  v_delivered := v_delivered + 1;

  if v_index <= 15 then
   insert into public.campaign_events(business_id,campaign_id,delivery_id,customer_id,event_type,occurred_at,source,external_event_ref,metadata,is_mock)
   values(p_business_id,p_campaign_id,v_delivery.id,v_delivery.customer_id,'opened',v_start+interval '3 hours','demo_time_jump',
    p_idempotency_key||':opened:'||v_index,jsonb_build_object('simulated',true),true)
   on conflict (business_id,source,external_event_ref) do nothing;
   v_opened := v_opened + 1;
  end if;

  if v_index <= 9 then
   insert into public.campaign_events(business_id,campaign_id,delivery_id,customer_id,event_type,occurred_at,source,external_event_ref,metadata,is_mock)
   values(p_business_id,p_campaign_id,v_delivery.id,v_delivery.customer_id,'redeemed',v_start+interval '2 days','demo_time_jump',
    p_idempotency_key||':redeemed:'||v_index,jsonb_build_object('simulated',true),true)
   on conflict (business_id,source,external_event_ref) do nothing;
   insert into public.redemptions(business_id,campaign_id,customer_id,redeemed_at,order_total_minor,campaign_cost_minor,currency,is_mock)
   values(p_business_id,p_campaign_id,v_delivery.customer_id,v_start+interval '2 days',11500,756,'KZT',true);
   v_redeemed := v_redeemed + 1;
  end if;
 end loop;

 -- Canonical TAMYR demo figures, all recorded as mock_actual and never as fact.
 insert into public.impact_measurements(business_id,campaign_id,metric_key,kind,value_minor,unit,currency,
  period_start,period_end,source,method_version,confidence,evidence,is_mock)
 values
  (p_business_id,p_campaign_id,'influenced_revenue','influenced',103500,'currency_minor','KZT',
   v_start,v_start+interval '7 days','demo_time_jump','tamyr-demo.v1',70,
   jsonb_build_object('delivered',18,'opened',15,'redeemed',9,'note','Выручка контактировавших клиентов, не прирост'),true),
  (p_business_id,p_campaign_id,'incremental_revenue','mock_actual',48700,'currency_minor','KZT',
   v_start,v_start+interval '7 days','demo_time_jump','tamyr-demo.v1',60,
   jsonb_build_object('baseline_minor',54800,'baseline_method','pre_period'),true),
  (p_business_id,p_campaign_id,'incremental_contribution','mock_actual',18200,'currency_minor','KZT',
   v_start,v_start+interval '7 days','demo_time_jump','tamyr-demo.v1',60,
   jsonb_build_object('from_incremental_minor',48700),true),
  (p_business_id,p_campaign_id,'campaign_cost','mock_actual',6800,'currency_minor','KZT',
   v_start,v_start+interval '7 days','demo_time_jump','tamyr-demo.v1',90,
   jsonb_build_object('fixed',true),true),
  (p_business_id,p_campaign_id,'roi_bps','mock_actual',16800,'bps',null,
   v_start,v_start+interval '7 days','demo_time_jump','tamyr-demo.v1',60,
   jsonb_build_object('formula','contribution / cost','note','168% симулированный ROI'),true),
  (p_business_id,p_campaign_id,'owner_minutes_saved','mock_actual',145,'minutes',null,
   v_start,v_start+interval '7 days','demo_time_jump','tamyr-demo.v1',50,
   jsonb_build_object('note','Оценка сэкономленного времени владельца'),true);

 v_result := jsonb_build_object('campaign_id',p_campaign_id,'delivered',v_delivered,'opened',v_opened,'redeemed',v_redeemed,
  'influenced_minor',103500,'incremental_minor',48700,'contribution_minor',18200,'cost_minor',6800,
  'roi_bps',16800,'minutes_saved',145,'kind','mock_actual','duplicate',false);
 insert into private.domain_command_receipts values(p_business_id,p_idempotency_key,'demo.time_jump','campaign',p_campaign_id,v_result,now());
 insert into public.activity_logs(business_id,actor_id,action,resource_type,resource_id,metadata,is_mock)
 values(p_business_id,v_actor,'demo.time_jump','campaign',p_campaign_id,v_result,true);
 return v_result;
end $$;
revoke all on function private.demo_time_jump(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.demo_time_jump(uuid,uuid,text) to authenticated;

create or replace function public.demo_time_jump(p_business_id uuid, p_campaign_id uuid, p_idempotency_key text)
returns jsonb language sql security invoker set search_path=''
as $$ select private.demo_time_jump(p_business_id,p_campaign_id,p_idempotency_key) $$;
revoke all on function public.demo_time_jump(uuid,uuid,text) from public,anon;
grant execute on function public.demo_time_jump(uuid,uuid,text) to authenticated;

comment on function public.demo_time_jump(uuid,uuid,text) is
 'DEMO_MODE only: deterministic simulated outcome for the TAMYR set. Idempotent; every row is is_mock and labelled MOCK RESULT.';
comment on function public.recompute_campaign_impact(uuid,text) is
 'Keeps influenced revenue and incremental estimate as separate kinds and refuses to emit an incremental result below the baseline sample threshold.';

commit;
