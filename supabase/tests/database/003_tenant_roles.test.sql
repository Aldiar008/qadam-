begin;
create extension if not exists pgtap with schema extensions;
select plan(10);
grant execute on function private.deterministic_uuid(text) to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000101',true);
select is((select count(*)::bigint from public.customers),180::bigint,'tenant A owner sees tenant A');
select is((select count(*)::bigint from public.businesses where id='20000000-0000-4000-8000-000000000001'),0::bigint,'tenant A cannot read tenant B');
select throws_ok($$update public.customers set business_id='20000000-0000-4000-8000-000000000001' where id=private.deterministic_uuid('customer-1')$$,'42501',null,'client cannot move record to another business');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000103',true);
select throws_ok($$insert into public.campaigns(business_id,growth_contract_id,name,status,channel,budget_minor,currency,stop_rule,created_by,is_mock) values
 ('10000000-0000-4000-8000-000000000001',private.deterministic_uuid('contract-2'),'Viewer campaign','draft','whatsapp',0,'KZT','{}','00000000-0000-4000-8000-000000000103',true)$$,'42501',null,'viewer cannot create campaign');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000102',true);
select lives_ok($$insert into public.campaigns(id,business_id,growth_contract_id,name,status,channel,budget_minor,currency,stop_rule,created_by,is_mock) values
 ('39999999-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',private.deterministic_uuid('contract-2'),'Marketer draft','draft','whatsapp',0,'KZT','{}','00000000-0000-4000-8000-000000000102',true)$$,'marketer creates draft campaign');
select lives_ok($$update public.business_limits set monthly_budget_minor=1$$,'marketer update is safely filtered by RLS');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000101',true);
select is((select monthly_budget_minor from public.business_limits where business_id='10000000-0000-4000-8000-000000000001'),120000::bigint,'marketer cannot change business limits');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
select is((select count(*)::integer from public.customers),0,'authenticated user without membership sees no tenant data');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000101',true);
select lives_ok($$insert into public.business_members(id,business_id,user_id,role,status,is_mock) values
 ('11999999-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000301','analyst','active',true)$$,'owner manages team');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000101',true);
select throws_ok($$insert into public.tools(category_id,code,name_ru,name_kk,description_ru,description_kk,route,status,is_public,is_mock)
 values(private.deterministic_uuid('tool-category-1'),'unauthorized_admin','x','x','x','x','/x','draft',false,true)$$,'42501',null,'ordinary user cannot perform admin CRUD');
select * from finish();
rollback;
