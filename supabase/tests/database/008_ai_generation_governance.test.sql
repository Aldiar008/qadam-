begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000101',true);

-- ---------------------------------------------------------------------------
-- Provenance is recorded for both provider and fallback runs
-- ---------------------------------------------------------------------------
select lives_ok($$select public.record_ai_generation_run(
 '10000000-0000-4000-8000-000000000001','campaign_generation','deterministic','qadam-template-v1','deterministic_fallback',
 'campaign-generator-prompt.v1','campaign-generator.v1',repeat('a',64),'{"mechanics":[]}'::jsonb,
 'completed',12,0,0,'not_configured','AI provider is not configured','{}'::jsonb,'{}'::jsonb,
 null,'ai-test-fallback-1',40,2000000)$$,
 'a fallback run is recorded even though no provider was reached');

select is((select source from public.ai_generation_runs where idempotency_key='ai-test-fallback-1'),'deterministic_fallback',
 'the run states it came from the template, not a model');
select is((select failure_kind from public.ai_generation_runs where idempotency_key='ai-test-fallback-1'),'not_configured',
 'the reason the model was not used is preserved');

select is((public.record_ai_generation_run(
 '10000000-0000-4000-8000-000000000001','campaign_generation','deterministic','qadam-template-v1','deterministic_fallback',
 'campaign-generator-prompt.v1','campaign-generator.v1',repeat('a',64),'{}'::jsonb,
 'completed',12,0,0,null,null,'{}'::jsonb,'{}'::jsonb,null,'ai-test-fallback-1',40,2000000)->>'duplicate')::boolean,
 true,'replaying the same generation key returns the original record');

select is((select count(*)::integer from public.ai_generation_runs where idempotency_key='ai-test-fallback-1'),1,
 'a replayed generation does not create a second row');

-- A fallback must not burn the daily provider budget: an outage would otherwise
-- exhaust the quota and lock the owner out of their own template.
select is((select coalesce(generations,0)::integer from public.ai_usage_quota
 where business_id='10000000-0000-4000-8000-000000000001' and window_date=current_date),0,
 'a fallback run consumes no provider quota');

select lives_ok($$select public.record_ai_generation_run(
 '10000000-0000-4000-8000-000000000001','campaign_generation','anthropic','claude-sonnet-5','provider',
 'campaign-generator-prompt.v1','campaign-generator.v1',repeat('b',64),'{"mechanics":[]}'::jsonb,
 'completed',840,1,17100,null,null,'{"injectionFlags":[]}'::jsonb,'{"input":1200,"output":900}'::jsonb,
 null,'ai-test-provider-1',40,2000000)$$,
 'a provider run is recorded with its telemetry');

select is((select generations::integer from public.ai_usage_quota
 where business_id='10000000-0000-4000-8000-000000000001' and window_date=current_date),1,
 'a provider run consumes one generation of the daily quota');
select is((select cost_micros::bigint from public.ai_usage_quota
 where business_id='10000000-0000-4000-8000-000000000001' and window_date=current_date),17100::bigint,
 'the daily cost counter accumulates the recorded cost');
select is((select latency_ms from public.ai_generation_runs where idempotency_key='ai-test-provider-1'),840,
 'latency is preserved for the run log');

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------
select throws_ok($$select public.record_ai_generation_run(
 '10000000-0000-4000-8000-000000000001','campaign_generation','anthropic','claude-sonnet-5','provider',
 'p.v1','s.v1','not-a-digest','{}'::jsonb,'completed',10,1,0,null,null,'{}'::jsonb,'{}'::jsonb,
 null,'ai-test-badhash-1',40,2000000)$$,
 '22023','input_hash must be a sha-256 digest',
 'prompt logs must store a digest, never reversible owner text');

select throws_ok($$select public.record_ai_generation_run(
 '10000000-0000-4000-8000-000000000001','campaign_generation','anthropic','claude-sonnet-5','provider',
 'p.v1','s.v1',repeat('c',64),'{}'::jsonb,'completed',10,1,0,null,null,'{}'::jsonb,'{}'::jsonb,
 null,'ai-test-quota-1',1,2000000)$$,
 '53400','daily AI generation quota exhausted',
 'the daily generation quota is enforced in the database');

select throws_ok($$select public.record_ai_generation_run(
 '10000000-0000-4000-8000-000000000001','campaign_generation','anthropic','claude-sonnet-5','provider',
 'p.v1','s.v1',repeat('d',64),'{}'::jsonb,'completed',10,1,9000000,null,null,'{}'::jsonb,'{}'::jsonb,
 null,'ai-test-cost-1',40,2000000)$$,
 '53400','daily AI cost budget exhausted',
 'the daily cost budget is enforced in the database');

-- Viewer cannot spend the tenant's AI budget.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000103',true);
select throws_ok($$select public.record_ai_generation_run(
 '10000000-0000-4000-8000-000000000001','campaign_generation','anthropic','m','provider',
 'p.v1','s.v1',repeat('e',64),'{}'::jsonb,'completed',10,1,0,null,null,'{}'::jsonb,'{}'::jsonb,
 null,'ai-test-viewer-1',40,2000000)$$,
 '42501','forbidden','viewer cannot trigger or record AI generation');

-- ---------------------------------------------------------------------------
-- Campaign Studio drafts
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000101',true);

select lives_ok($$insert into public.campaign_drafts(business_id,user_id,current_step,draft,is_mock)
 values('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000101',1,'{"goal":"reactivate"}'::jsonb,true)$$,
 'owner can open a studio draft');

select throws_ok($$insert into public.campaign_drafts(business_id,user_id,current_step,draft,is_mock)
 values('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000101',9,'{}'::jsonb,true)$$,
 '23514',null,'a draft cannot point at a step outside the seven-step wizard');

-- Another tenant's member must not see this draft.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000201',true);
select is((select count(*)::integer from public.campaign_drafts
 where business_id='10000000-0000-4000-8000-000000000001'),0,
 'campaign drafts do not leak across tenants');

-- A colleague in the same business must not read a personal draft either.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000102',true);
select is((select count(*)::integer from public.campaign_drafts
 where user_id='00000000-0000-4000-8000-000000000101'),0,
 'a studio draft is private to the person who opened it');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000103',true);
select is((select count(*)::integer from public.ai_usage_quota
 where business_id='10000000-0000-4000-8000-000000000001'),1,
 'members can read their own AI usage counter');

rollback;
