begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

set local role postgres;
create temporary table exec_fixture as
select
 '10000000-0000-4000-8000-000000000001'::uuid as business_id,
 (select id from public.campaigns where business_id='10000000-0000-4000-8000-000000000001' order by created_at limit 1) as campaign_id,
 (select cc.customer_id from public.customer_consents cc
   where cc.business_id='10000000-0000-4000-8000-000000000001' and cc.scope='marketing.whatsapp' and cc.status='granted'
   order by cc.created_at limit 1) as consented_customer,
 (select cc.customer_id from public.customer_consents cc
   where cc.business_id='10000000-0000-4000-8000-000000000001' and cc.scope='marketing.whatsapp' and cc.status='denied'
   order by cc.created_at limit 1) as denied_customer;

-- Quiet hours are wide open for most of these assertions; the quiet-hours test
-- sets its own window explicitly.
insert into public.business_execution_state(business_id, quiet_hours_start, quiet_hours_end, daily_send_cap)
values('10000000-0000-4000-8000-000000000001','03:00','03:01',500)
on conflict (business_id) do update set quiet_hours_start='03:00', quiet_hours_end='03:01';

-- ---------------------------------------------------------------------------
-- Send gate
-- ---------------------------------------------------------------------------
select is((private.send_gate((select business_id from exec_fixture),(select consented_customer from exec_fixture),'whatsapp')->>'allowed')::boolean,
 true,'a consented customer passes the send gate');

select is(private.send_gate((select business_id from exec_fixture),(select denied_customer from exec_fixture),'whatsapp')->>'reason',
 'no_effective_consent','a customer who refused this channel is refused at send time');

-- Consent revoked between approval and send must win.
insert into public.customer_consents(business_id,customer_id,scope,status,source,revoked_at,is_mock)
select business_id, consented_customer, 'marketing.whatsapp','revoked','owner_request',now(),true from exec_fixture;
select is(private.send_gate((select business_id from exec_fixture),(select consented_customer from exec_fixture),'whatsapp')->>'reason',
 'no_effective_consent','consent revoked after approval blocks the send');
delete from public.customer_consents cc using exec_fixture f
 where cc.customer_id=f.consented_customer and cc.status='revoked' and cc.source='owner_request';

-- Suppression outranks consent.
insert into public.suppression_entries(business_id,customer_id,channel,reason,is_mock)
select business_id, consented_customer, 'whatsapp','unsubscribed',true from exec_fixture;
select is(private.send_gate((select business_id from exec_fixture),(select consented_customer from exec_fixture),'whatsapp')->>'reason',
 'suppressed','the suppression list outranks a granted consent');
delete from public.suppression_entries se using exec_fixture f where se.customer_id=f.consented_customer;

-- Quiet hours.
update public.business_execution_state set quiet_hours_start='00:00', quiet_hours_end='23:59'
where business_id=(select business_id from exec_fixture);
select is(private.send_gate((select business_id from exec_fixture),(select consented_customer from exec_fixture),'whatsapp')->>'reason',
 'quiet_hours','a send inside quiet hours is refused');
update public.business_execution_state set quiet_hours_start='03:00', quiet_hours_end='03:01'
where business_id=(select business_id from exec_fixture);

-- Frequency cap: one delivery already queued in the last 24h is enough.
insert into public.campaign_deliveries(business_id,campaign_id,customer_id,idempotency_key,status,queued_at,is_mock)
select business_id, campaign_id, consented_customer, 'freq-cap-fixture-1','queued',now(),true from exec_fixture;
select is(private.send_gate((select business_id from exec_fixture),(select consented_customer from exec_fixture),'whatsapp')->>'reason',
 'frequency_cap','the frequency cap blocks a second message inside 24 hours');
delete from public.campaign_deliveries where idempotency_key='freq-cap-fixture-1';

-- Emergency stop.
insert into public.business_execution_state(business_id) values((select business_id from exec_fixture)) on conflict do nothing;
update public.business_execution_state set emergency_stopped_at=now() where business_id=(select business_id from exec_fixture);
select is(private.send_gate((select business_id from exec_fixture),(select consented_customer from exec_fixture),'whatsapp')->>'reason',
 'emergency_stop','an emergency stop refuses every send');
select is((select count(*)::integer from private.claim_outbox_batch((select business_id from exec_fixture),'test-worker',10)),
 0,'an emergency stop also stops the worker claiming any work');
update public.business_execution_state set emergency_stopped_at=null where business_id=(select business_id from exec_fixture);

-- ---------------------------------------------------------------------------
-- Delivery queueing and idempotency
-- ---------------------------------------------------------------------------
select is((private.enqueue_delivery((select business_id from exec_fixture),(select campaign_id from exec_fixture),
 (select consented_customer from exec_fixture),null,'whatsapp','exec-test-delivery-1')->>'status'),
 'queued','a permitted delivery is queued');

select is((private.enqueue_delivery((select business_id from exec_fixture),(select campaign_id from exec_fixture),
 (select consented_customer from exec_fixture),null,'whatsapp','exec-test-delivery-1')->>'duplicate')::boolean,
 true,'the same delivery key never queues twice');

select is((select count(*)::integer from public.campaign_deliveries where idempotency_key='exec-test-delivery-1'),
 1,'a duplicate enqueue leaves exactly one delivery row');

select is((select count(*)::integer from public.outbox_events where idempotency_key='outbox:delivery:exec-test-delivery-1'),
 1,'the outbox holds exactly one event for that delivery');

-- ---------------------------------------------------------------------------
-- Outbox retry, backoff and dead letter
-- ---------------------------------------------------------------------------
create temporary table exec_outbox as
select id from public.outbox_events where idempotency_key='outbox:delivery:exec-test-delivery-1';

select is((select count(*)::integer from private.claim_outbox_batch((select business_id from exec_fixture),'test-worker',10)),
 1,'the worker leases the pending event');
select is((select status from public.outbox_events where id=(select id from exec_outbox)),'processing',
 'a leased event is marked processing so a second worker cannot take it');

select is((private.settle_outbox_event((select id from exec_outbox), false, 'connector timeout')->>'status'),
 'pending','a retryable failure returns the event to the queue');
-- The event is deliberately not claimable until its backoff elapses; that is
-- the point of the delay. Fast-forward it, then re-lease: attempts increment on
-- the lease, so the next failure must back off further.
select is((select count(*)::integer from private.claim_outbox_batch((select business_id from exec_fixture),'test-worker',10)),
 0,'a backed-off event is not re-leased before its delay elapses');
update public.outbox_events set available_at=now()-interval '1 minute' where id=(select id from exec_outbox);
select is((select count(*)::integer from private.claim_outbox_batch((select business_id from exec_fixture),'test-worker',10)),
 1,'once the delay elapses the event is leased again');
select is((private.settle_outbox_event((select id from exec_outbox), false, 'connector timeout')->>'retry_in_seconds')::integer,
 60,'backoff grows with each attempt');

update public.outbox_events set attempts=attempts_max where id=(select id from exec_outbox);
select is((private.settle_outbox_event((select id from exec_outbox), false, 'connector timeout')->>'status'),
 'dead_letter','an exhausted event is dead-lettered rather than lost');
select is((select count(*)::integer from public.notifications
 where category='connector_error' and business_id=(select business_id from exec_fixture)),
 1,'a dead letter raises a connector error notification');

-- ---------------------------------------------------------------------------
-- Provider events: signature, duplication, tenancy
-- ---------------------------------------------------------------------------
select throws_ok($$select private.ingest_provider_event('10000000-0000-4000-8000-000000000001','webhook','whatsapp',
 'evt-unsigned-1','delivered',null,false,'{}'::jsonb,now())$$,
 '42501','provider event signature is not verified','an unverified provider event is never ingested');

create temporary table exec_delivery as
select id from public.campaign_deliveries where idempotency_key='exec-test-delivery-1';

select is((private.ingest_provider_event('10000000-0000-4000-8000-000000000001','webhook','whatsapp',
 'evt-dup-1','delivered',(select id from exec_delivery),true,'{}'::jsonb,now())->>'duplicate')::boolean,
 false,'a first, signed provider event is ingested');
select is((private.ingest_provider_event('10000000-0000-4000-8000-000000000001','webhook','whatsapp',
 'evt-dup-1','delivered',(select id from exec_delivery),true,'{}'::jsonb,now())->>'duplicate')::boolean,
 true,'the same provider event id is recognised as a duplicate');
select is((select count(*)::integer from public.campaign_events where external_event_ref='evt-dup-1'),
 1,'a duplicated webhook produces exactly one derived event');
select is((select count(*)::integer from public.provider_events where external_event_id='evt-dup-1'),
 1,'the raw event is stored once, separately from the derived metric');

-- Cross-tenant delivery reference must be refused outright.
select throws_ok($$select private.ingest_provider_event('20000000-0000-4000-8000-000000000001','webhook','whatsapp',
 'evt-cross-1','delivered',(select id from exec_delivery),true,'{}'::jsonb,now())$$,
 '42501','delivery does not belong to this business','a cross-tenant delivery reference is rejected');

-- Unsubscribe takes effect immediately.
select lives_ok($$select private.ingest_provider_event('10000000-0000-4000-8000-000000000001','webhook','whatsapp',
 'evt-unsub-1','unsubscribed',(select id from exec_delivery),true,'{}'::jsonb,now())$$,
 'an unsubscribe event is ingested');
select is(private.send_gate((select business_id from exec_fixture),(select consented_customer from exec_fixture),'whatsapp')->>'reason',
 'suppressed','an unsubscribe suppresses the customer immediately');

-- ---------------------------------------------------------------------------
-- Stop-loss
-- ---------------------------------------------------------------------------
-- The seeded campaigns are already completed, so the stop-loss case gets its
-- own running campaign rather than forcing an invalid transition.
create temporary table exec_running as
with inserted as (
 insert into public.campaigns(business_id,growth_contract_id,name,status,channel,budget_minor,currency,stop_rule,created_by,is_mock)
 select f.business_id, c.growth_contract_id, 'Stop-loss fixture','running','whatsapp',5000,'KZT','{}'::jsonb, c.created_by, true
 from exec_fixture f join public.campaigns c on c.id=f.campaign_id
 returning id
) select id from inserted;

-- Give it delivered events so the sample threshold can be exercised.
insert into public.campaign_events(business_id,campaign_id,customer_id,event_type,occurred_at,source,external_event_ref,is_mock)
select f.business_id, r.id, f.consented_customer, 'delivered', now(), 'stop_loss_fixture', 'sl-delivered-'||g, true
from exec_fixture f, exec_running r, generate_series(1,12) g;

select is(private.evaluate_stop_loss((select id from exec_running), 500, 100000)->>'reason',
 'insufficient_sample','stop-loss refuses to judge on too small a sample');
select is(private.evaluate_stop_loss((select id from exec_running), 9999, 1)->>'action',
 'paused','stop-loss pauses a campaign whose redemption is below the floor');
select is((select status from public.campaigns where id=(select id from exec_running)),'paused',
 'the campaign really is paused, and only an owner can restart it');
select is((select count(*)::integer from public.activity_logs
 where action='campaign.stop_loss_paused' and (metadata->>'restart_requires_owner')::boolean),
 1,'the audit trail records that a restart needs a human');

-- ---------------------------------------------------------------------------
-- Impact: baseline immutability and kind separation
-- ---------------------------------------------------------------------------
insert into public.impact_baselines(business_id,campaign_id,measurement_version,method,audience_size,
 baseline_orders,baseline_revenue_minor,baseline_period_start,baseline_period_end,min_sample_size,is_mock)
select business_id, campaign_id,'exec-test.v1','pre_period',18,9,54800,now()-interval '30 days',now(),10,true from exec_fixture;

select throws_ok($$update public.impact_baselines set baseline_revenue_minor=1
 where measurement_version='exec-test.v1'$$,
 '42501','impact baseline is immutable for this measurement version; record a new version',
 'a recorded baseline cannot be edited');
select throws_ok($$delete from public.impact_baselines where measurement_version='exec-test.v1'$$,
 '42501','impact baselines are immutable and cannot be deleted','a recorded baseline cannot be deleted');

select lives_ok($$select private.recompute_campaign_impact((select campaign_id from exec_fixture),'exec-test.v1')$$,
 'impact recompute runs against raw events and the recorded baseline');
select is((select count(*)::integer from public.impact_measurements
 where campaign_id=(select campaign_id from exec_fixture) and metric_key='influenced_revenue' and kind='influenced'
  and method_version='exec-test.v1'),
 1,'influenced revenue is recorded under its own kind');
select is((select count(*)::integer from public.impact_measurements
 where campaign_id=(select campaign_id from exec_fixture) and kind='influenced' and metric_key='incremental_revenue'),
 0,'influenced revenue is never copied into an incremental metric');

-- ---------------------------------------------------------------------------
-- Demo time jump
-- ---------------------------------------------------------------------------
grant select on exec_fixture to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000101',true);
select throws_ok($$select public.demo_time_jump('20000000-0000-4000-8000-000000000001',
 (select campaign_id from exec_fixture),'exec-jump-cross-1')$$,
 '42501','forbidden','a time jump cannot be run against another tenant');

rollback;
