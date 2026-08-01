begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

-- ---------------------------------------------------------------------------
-- Consent scope resolution
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000101',true);

select is(
 (select count(*)::integer from public.effective_consent_customers(
  '10000000-0000-4000-8000-000000000001','marketing.whatsapp',
  (select array_agg(sm.customer_id) from public.segment_memberships sm
   join public.customer_segments cs on cs.id=sm.segment_id where cs.code='inactive_30'))),
 18,'consent-first audience reduces 64 inactive customers to 18 eligible');

select is(
 (select count(*)::integer from public.effective_consent_customers(
  '10000000-0000-4000-8000-000000000001','marketing.telegram',
  (select array_agg(sm.customer_id) from public.segment_memberships sm
   join public.customer_segments cs on cs.id=sm.segment_id where cs.code='inactive_30'))),
 0,'whatsapp consent does not leak into another channel');

set local role postgres;
create temporary table prompt3c_customer(id uuid);
with inserted as (
 insert into public.customers(business_id,display_name,preferred_locale,lifecycle_stage,first_seen_at,last_seen_at,is_mock)
 values('10000000-0000-4000-8000-000000000001','Согласие Тест','ru','new',now(),now(),true)
 returning id
) insert into prompt3c_customer select id from inserted;
insert into public.customer_consents(business_id,customer_id,scope,status,source,granted_at,is_mock)
 select '10000000-0000-4000-8000-000000000001',id,'marketing','granted','qr_checkout',now(),true from prompt3c_customer;

select is(private.resolve_effective_consent('10000000-0000-4000-8000-000000000001',(select id from prompt3c_customer),'marketing.whatsapp'),
 true,'umbrella marketing consent reaches a channel the customer never answered');

insert into public.customer_consents(business_id,customer_id,scope,status,source,is_mock)
 select '10000000-0000-4000-8000-000000000001',id,'marketing.whatsapp','denied','owner_request',true from prompt3c_customer;
select is(private.resolve_effective_consent('10000000-0000-4000-8000-000000000001',(select id from prompt3c_customer),'marketing.whatsapp'),
 false,'explicit channel refusal overrides the umbrella grant');

insert into public.customer_consents(business_id,customer_id,scope,status,source,revoked_at,is_mock)
 select '10000000-0000-4000-8000-000000000001',id,'marketing','revoked','owner_request',now(),true from prompt3c_customer;
select is(private.resolve_effective_consent('10000000-0000-4000-8000-000000000001',(select id from prompt3c_customer),'marketing.telegram'),
 false,'revoking the umbrella immediately excludes every unanswered channel');

-- ---------------------------------------------------------------------------
-- CSV customer import
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000101',true);

select is((public.import_customers('10000000-0000-4000-8000-000000000001',
 '[{"row_number":1,"display_name":"Импорт Один","identity_type":"email","identity_value":"import-one@example.test","visits":12,"aov_minor":3500,"marketing_consent":true},
   {"row_number":2,"display_name":"Импорт Два","identity_type":"phone","identity_value":"+77015550001","visits":3,"aov_minor":2100,"marketing_consent":false},
   {"row_number":3,"display_name":"Ошибка","identity_type":"email","identity_value":"not-an-email","visits":1,"aov_minor":0,"marketing_consent":false}]'::jsonb,
 'skip','prompt3c-import-key-1')->>'inserted')::integer,2,'valid rows create customers');

select is((public.import_customers('10000000-0000-4000-8000-000000000001','[]'::jsonb,'skip','prompt3c-import-key-1')->>'duplicate')::boolean,
 true,'replaying the same import key returns the original receipt');

select is((public.import_customers('10000000-0000-4000-8000-000000000001',
 '[{"row_number":1,"display_name":"Импорт Один","identity_type":"email","identity_value":"import-one@example.test","visits":12,"aov_minor":3500,"marketing_consent":true}]'::jsonb,
 'skip','prompt3c-import-key-2')->>'skipped')::integer,1,'skip strategy leaves existing customers untouched');

select is((public.import_customers('10000000-0000-4000-8000-000000000001',
 '[{"row_number":1,"display_name":"Импорт Обновлён","identity_type":"email","identity_value":"import-one@example.test","visits":12,"aov_minor":3500,"marketing_consent":true}]'::jsonb,
 'update','prompt3c-import-key-3')->>'updated')::integer,1,'update strategy refreshes the existing customer');

set local role postgres;
select is((select (result->>'invalid')::integer from private.domain_command_receipts
 where idempotency_key='prompt3c-import-key-1'),1,'malformed identity is rejected, not imported');

select is((select display_name from public.customers c
 join public.customer_identities ci on ci.customer_id=c.id
 where ci.lookup_hash=extensions.digest(convert_to('import-one@example.test','utf8'),'sha256')),
 'Импорт Обновлён','update strategy wrote the new display name');

select is((select count(*)::integer from public.customer_identities
 where lookup_hash=extensions.digest(convert_to('import-one@example.test','utf8'),'sha256')),
 1,'repeated import never creates a duplicate identity');

select is((select count(*)::integer from public.transactions where source='csv_customers'),0,
 'import never fabricates transactions from declared visits');

select is((select status from public.customer_consents cc
 join public.customer_identities ci on ci.customer_id=cc.customer_id
 where ci.lookup_hash=extensions.digest(convert_to('+77015550001','utf8'),'sha256') and cc.scope='marketing'
 order by cc.created_at desc limit 1),'denied','declared refusal is stored as a denied consent, not omitted');

select is((select count(*)::integer from public.data_import_errors die
 join public.data_imports di on di.id=die.data_import_id where di.idempotency_key='prompt3c-import-key-1'),
 1,'per-row validation errors are persisted for download');

select is((select rows_total::integer from public.data_imports where idempotency_key='prompt3c-import-key-1'),3,
 'the import run records how many rows were submitted');

-- Viewer cannot import
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000103',true);
select throws_ok($$select public.import_customers('10000000-0000-4000-8000-000000000001','[]'::jsonb,'skip','prompt3c-viewer-key-1')$$,
 '42501','forbidden','viewer cannot import customers');

-- ---------------------------------------------------------------------------
-- QR rotation
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000101',true);
select lives_ok($$select public.create_loyalty_program(
 '10000000-0000-4000-8000-000000000001','Prompt3c rotation','stamps','{"joinStamps":1}',
 '[{"nameRu":"Награда","nameKk":"Сыйлық","costStamps":1}]',
 '12000000-0000-4000-8000-000000000001','prompt3c-rotation-token-abcdefghijklmnopqrst',now()+interval '30 days','prompt3c-create-program-1')$$,
 'rotation fixture program created');

set local role postgres;
create temporary table prompt3c_qr as
 select qc.id, qc.loyalty_program_id from public.qr_codes qc
 where qc.token_hash=extensions.digest(convert_to('prompt3c-rotation-token-abcdefghijklmnopqrst','utf8'),'sha256');
grant select on prompt3c_qr to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000101',true);
select lives_ok($$select public.rotate_qr_code('10000000-0000-4000-8000-000000000001',
 (select loyalty_program_id from prompt3c_qr),(select id from prompt3c_qr),
 'prompt3c-rotated-token-zyxwvutsrqponmlkjihg',now()+interval '30 days','prompt3c-rotate-key-1')$$,
 'owner rotates the program QR');

select throws_ok($$select public.rotate_qr_code('10000000-0000-4000-8000-000000000001',
 (select loyalty_program_id from prompt3c_qr),(select id from prompt3c_qr),
 'short-token',now()+interval '30 days','prompt3c-rotate-key-2')$$,
 '22023','QR token must be at least 32 characters','a weak QR token is refused');

set local role postgres;
select is((select status from public.qr_codes where id=(select id from prompt3c_qr)),'rotated',
 'the previous token stops being active after rotation');

rollback;
