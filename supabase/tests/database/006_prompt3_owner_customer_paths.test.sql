begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000101',true);
select lives_ok($$select public.create_loyalty_program(
 '10000000-0000-4000-8000-000000000001','Prompt3 stamps','stamps','{"joinStamps":1}',
 '[{"nameRu":"Тестовая награда","nameKk":"Тест сыйлығы","costStamps":1}]',
 '12000000-0000-4000-8000-000000000001','prompt3-opaque-token-abcdefghijklmnopqrstuvwxyz',now()+interval '1 day','prompt3-create-program-1')$$,
 'owner creates active loyalty program and opaque QR atomically');
select is((select count(*)::integer from public.qr_codes where token_hash=extensions.digest(convert_to('prompt3-opaque-token-abcdefghijklmnopqrstuvwxyz','utf8'),'sha256')),1,'only token hash is persisted');

set local role service_role;
select is((public.process_loyalty_join('prompt3-opaque-token-abcdefghijklmnopqrstuvwxyz','email','prompt3@example.test','Алия',true,false,'simulated','prompt3-join-once-1','127.0.0.1')->>'stamps_balance')::integer,1,'QR join creates account and earns one stamp');
select is((public.process_loyalty_join('prompt3-opaque-token-abcdefghijklmnopqrstuvwxyz','email','prompt3@example.test','Алия',true,false,'simulated','prompt3-join-once-1','127.0.0.1')->>'duplicate')::boolean,true,'same join idempotency key returns receipt');
set local role postgres;
select is((select count(*)::integer from public.loyalty_ledger where idempotency_key='earn:prompt3-join-once-1'),1,'replayed join has one ledger effect');
select is((select count(*)::integer from public.customer_consents where source='qr_checkout' and scope in ('loyalty','marketing')),2,'loyalty and marketing choices are separate consent records');
select is((select status from public.customer_consents where source='qr_checkout' and scope='marketing' order by created_at desc limit 1),'denied','marketing consent is optional');
select is((select count(*)::integer from public.qr_scans where request_key='prompt3-join-once-1'),1,'join scan is idempotent');
create temporary table prompt3_reward as select id from public.rewards where name_ru='Тестовая награда';
grant select on prompt3_reward to service_role;

set local role service_role;
select is((public.process_loyalty_redeem('prompt3-opaque-token-abcdefghijklmnopqrstuvwxyz','email','prompt3@example.test',
 (select id from prompt3_reward),'prompt3-redeem-once-1','127.0.0.1')->>'stamps_balance')::integer,0,'atomic redeem spends available stamp');
select is((public.process_loyalty_redeem('prompt3-opaque-token-abcdefghijklmnopqrstuvwxyz','email','prompt3@example.test',
 (select id from prompt3_reward),'prompt3-redeem-once-1','127.0.0.1')->>'duplicate')::boolean,true,'same redeem key cannot double spend');
select throws_ok($$select public.process_loyalty_redeem('prompt3-opaque-token-abcdefghijklmnopqrstuvwxyz','email','prompt3@example.test',
 (select id from prompt3_reward),'prompt3-redeem-insufficient-2','127.0.0.1')$$,'23514',null,'negative loyalty balance is blocked');

select is((public.process_customer_privacy_request('prompt3-opaque-token-abcdefghijklmnopqrstuvwxyz','email','prompt3@example.test','delete','prompt3-privacy-delete-1','127.0.0.1')->>'anonymized')::boolean,true,'customer can request PII deletion');
set local role postgres;
select is((select lifecycle_stage from public.customers where id=(select customer_id from public.privacy_requests where idempotency_key='prompt3-privacy-delete-1')),'anonymized','business retains only anonymized customer record');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000103',true);
select throws_ok($$select public.create_loyalty_program(
 '10000000-0000-4000-8000-000000000001','Viewer program','stamps','{"joinStamps":1}','[]',null,
 'viewer-opaque-token-abcdefghijklmnopqrstuvwxyz',now()+interval '1 day','viewer-program-denied-1')$$,'42501',null,'viewer cannot create loyalty program');

select * from finish();
rollback;
