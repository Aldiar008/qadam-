begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000101',true);
select lives_ok($$insert into storage.objects(bucket_id,name,owner_id,metadata) values
 ('business-assets','10000000-0000-4000-8000-000000000001/test.png','00000000-0000-4000-8000-000000000101','{"mimetype":"image/png","size":12}')$$,'owner uploads within tenant path');
select lives_ok($$update storage.objects set metadata='{"mimetype":"image/png","size":13}' where bucket_id='business-assets' and name='10000000-0000-4000-8000-000000000001/test.png'$$,'storage upsert UPDATE path is allowed');
select throws_ok($$insert into storage.objects(bucket_id,name,owner_id,metadata) values
 ('business-assets','20000000-0000-4000-8000-000000000001/cross.png','00000000-0000-4000-8000-000000000101','{"mimetype":"image/png","size":12}')$$,'42501',null,'cross-tenant storage path is denied');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000201',true);
select is((select count(*)::integer from storage.objects where bucket_id='business-assets' and name like '10000000-0000-4000-8000-000000000001/%'),0,'tenant B cannot read tenant A objects');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000901',true);
select ok(public.is_current_platform_admin(),'admin is rechecked in private DB table');
select lives_ok($$insert into public.tools(id,category_id,code,name_ru,name_kk,description_ru,description_kk,route,status,is_public,is_mock)
 select '99000000-0000-4000-8000-000000000001',id,'admin_test','Admin','Admin','Admin','Admin','/admin-test','draft',false,true
 from public.tool_categories where code='marketing'$$,'platform admin performs tool CRUD');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000101',true);
select ok(not public.is_current_platform_admin(),'ordinary owner is not platform admin');
select * from finish();
rollback;
