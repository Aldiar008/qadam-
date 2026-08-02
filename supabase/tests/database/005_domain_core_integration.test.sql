begin;
create extension if not exists pgtap with schema extensions;
select plan(23);
grant execute on function private.deterministic_uuid(text) to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000101',true);

select throws_ok(
 $$update public.growth_contracts set status='approved',optimistic_version=2 where id=private.deterministic_uuid('contract-2')$$,
 '23514',null,'direct draft to approved is rejected at database boundary');

select throws_ok($$
 insert into public.growth_contracts(id,business_id,signal_id,recommendation_id,schema_version,version,status,accepted_snapshot,content_hash,created_by,is_mock,consent_summary,simulator_result,margin_decision,attribution_plan,owner_limits_snapshot)
 values('39999999-0000-4000-8000-000000000090','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',private.deterministic_uuid('recommendation-2'),1,90,'compiled','{}','blocked-contract','00000000-0000-4000-8000-000000000101',true,'{"granted":18}','{"scenarios":{"base":{"campaignCostMinor":1}}}','{"status":"blocked"}','{}','{}')
 $$,'23514',null,'blocked Growth Contract cannot be compiled through direct insert');

select lives_ok($$
 update public.growth_contracts
 set accepted_snapshot=accepted_snapshot||'{"stopRule":{"maxCostMinor":7000}}'::jsonb,optimistic_version=2
 where id=private.deterministic_uuid('contract-2')
 $$,'draft inputs may change only with optimistic version increment');

select is(
 (public.transition_domain_entity('growth_contract',private.deterministic_uuid('contract-2'),'compiled',2,'contract-compile-2')->>'status'),
 'compiled','atomic draft to compiled transition succeeds');
select is((select count(*)::integer from public.outbox_events where idempotency_key='outbox:contract-compile-2'),1,'transition writes one outbox event');
select is((select count(*)::integer from public.activity_logs where metadata->>'idempotency_key'='contract-compile-2'),1,'transition writes one append-only activity record');

select is(
 (public.transition_domain_entity('growth_contract',private.deterministic_uuid('contract-2'),'compiled',0,'contract-compile-2')->>'status'),
 'compiled','same transition idempotency key returns receipt before version check');
select is((select count(*)::integer from public.outbox_events where idempotency_key='outbox:contract-compile-2'),1,'duplicate transition creates no second outbox event');

select throws_ok(
 $$select public.transition_domain_entity('growth_contract',private.deterministic_uuid('contract-2'),'awaiting_approval',2,'contract-awaiting-conflict')$$,
 '40001',null,'stale optimistic version is rejected');

select is((public.transition_domain_entity('growth_contract',private.deterministic_uuid('contract-2'),'awaiting_approval',3,'contract-awaiting-2')->>'status'),'awaiting_approval','compiled contract enters approval queue');
select is((public.transition_domain_entity('growth_contract',private.deterministic_uuid('contract-2'),'approved',4,'contract-approved-2')->>'status'),'approved','safe consented contract can be approved');

select is((public.launch_growth_contract(private.deterministic_uuid('contract-2'),'Integration safe gift','telegram',5,'campaign-launch-safe-2')->>'duplicate')::boolean,false,'approved safe contract launches once');
select is((public.launch_growth_contract(private.deterministic_uuid('contract-2'),'Integration safe gift','telegram',1,'campaign-launch-safe-2')->>'duplicate')::boolean,true,'duplicate launch key returns existing campaign');
select is((select count(*)::integer from public.campaigns where idempotency_key='campaign-launch-safe-2'),1,'duplicate launch creates no second campaign');
select throws_ok($$
 insert into public.campaigns(business_id,growth_contract_id,name,status,channel,budget_minor,currency,stop_rule,created_by,is_mock,idempotency_key)
 values('10000000-0000-4000-8000-000000000001',private.deterministic_uuid('contract-2'),'Bypass launch','approved','telegram',1,'KZT','{}','00000000-0000-4000-8000-000000000101',true,'campaign-bypass-direct-1')
 $$,'23514',null,'authenticated client cannot insert pre-approved campaign');
select throws_ok($$
 update public.campaigns set budget_minor=1,optimistic_version=2 where idempotency_key='campaign-launch-safe-2'
 $$,'42501',null,'approved campaign economics cannot be changed directly');
select throws_ok($$
 insert into public.campaign_audiences(business_id,campaign_id,customer_id,inclusion_status,consent_status,is_mock)
 select '10000000-0000-4000-8000-000000000001',id,private.deterministic_uuid('customer-64'),'included','granted',true from public.campaigns where idempotency_key='campaign-launch-safe-2'
 $$,'42501',null,'client supplied consent status cannot include denied customer');
select throws_ok($$
 insert into public.campaign_deliveries(business_id,campaign_id,customer_id,idempotency_key,status,is_mock)
 select '10000000-0000-4000-8000-000000000001',id,private.deterministic_uuid('customer-64'),'delivery-without-consent-1','queued',true from public.campaigns where idempotency_key='campaign-launch-safe-2'
 $$,'42501',null,'delivery without latest effective channel consent is blocked');

insert into public.campaign_deliveries(id,business_id,campaign_id,customer_id,idempotency_key,status,is_mock)
select '49999999-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',id,private.deterministic_uuid('customer-1'),'delivery-domain-duplicate','queued',true
from public.campaigns where idempotency_key='campaign-launch-safe-2'
on conflict(business_id,idempotency_key) do nothing;
insert into public.campaign_deliveries(id,business_id,campaign_id,customer_id,idempotency_key,status,is_mock)
select '49999999-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',id,private.deterministic_uuid('customer-1'),'delivery-domain-duplicate','queued',true
from public.campaigns where idempotency_key='campaign-launch-safe-2'
on conflict(business_id,idempotency_key) do nothing;
select is((select count(*)::integer from public.campaign_deliveries where idempotency_key='delivery-domain-duplicate'),1,'duplicate delivery idempotency key creates one send');

select throws_ok(
 $$update public.growth_contracts set accepted_snapshot=accepted_snapshot||'{"tampered":true}'::jsonb,optimistic_version=7 where id=private.deterministic_uuid('contract-2')$$,
 '42501',null,'compiled inputs are immutable and require a new contract version');

select public.recompute_segment_memberships(
 '10000000-0000-4000-8000-000000000001',private.deterministic_uuid('segment-2'),
 jsonb_build_array(jsonb_build_object('customer_id',private.deterministic_uuid('customer-1'),'reason',jsonb_build_object('score',90)),jsonb_build_object('customer_id',private.deterministic_uuid('customer-2'),'reason',jsonb_build_object('score',88))),
 1,'segment-recompute-domain-1');
select public.recompute_segment_memberships(
 '10000000-0000-4000-8000-000000000001',private.deterministic_uuid('segment-2'),
 jsonb_build_array(jsonb_build_object('customer_id',private.deterministic_uuid('customer-1'),'reason',jsonb_build_object('score',90)),jsonb_build_object('customer_id',private.deterministic_uuid('customer-2'),'reason',jsonb_build_object('score',88))),
 1,'segment-recompute-domain-1');
select is((select count(*)::integer from public.segment_memberships where segment_id=private.deterministic_uuid('segment-2')),2,'repeated segment recomputation produces the same two memberships');
select throws_ok(
 $$select public.recompute_segment_memberships('10000000-0000-4000-8000-000000000001',private.deterministic_uuid('segment-2'),'[{"customer_id":"20000000-0000-4000-8000-000000000099"}]',1,'segment-cross-tenant-1')$$,
 '42501',null,'segment recompute rejects non-tenant customer ids');

insert into public.loyalty_programs(id,business_id,name,program_type,rules,status,is_mock) values('59999999-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Integration points','points','{}','draft',true);
insert into public.loyalty_accounts(id,business_id,loyalty_program_id,customer_id,is_mock) values('59999999-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','59999999-0000-4000-8000-000000000001',private.deterministic_uuid('customer-1'),true);
insert into public.loyalty_ledger(id,business_id,loyalty_account_id,entry_type,points_delta,source_type,idempotency_key,is_mock) values('59999999-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','59999999-0000-4000-8000-000000000002','earn',10,'integration','reward-duplicate-domain-1',true) on conflict(business_id,idempotency_key) do nothing;
insert into public.loyalty_ledger(id,business_id,loyalty_account_id,entry_type,points_delta,source_type,idempotency_key,is_mock) values('59999999-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','59999999-0000-4000-8000-000000000002','earn',10,'integration','reward-duplicate-domain-1',true) on conflict(business_id,idempotency_key) do nothing;
select is((select count(*)::integer from public.loyalty_ledger where idempotency_key='reward-duplicate-domain-1'),1,'duplicate reward ledger key creates one reward effect');

select * from finish();
rollback;
