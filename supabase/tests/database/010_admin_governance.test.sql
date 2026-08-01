begin;
create extension if not exists pgtap with schema extensions;
select plan(43);

-- 901 is the seeded platform_admin; 101 is a tenant owner and NOT a platform admin.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000101',true);

-- ---------------------------------------------------------------------------
-- Admin access is a database fact, not a hidden link
-- ---------------------------------------------------------------------------
select is(private.is_platform_admin(array['platform_admin','platform_editor','platform_analyst']), false,
 'a tenant owner is not a platform admin');
select is(private.current_platform_role(), null, 'a tenant owner has no platform role');
select throws_ok($$select public.admin_audit('tool.created','tool',null,'x',null,null,'проверка')$$,
 '42501','forbidden: not a platform admin','a non-admin cannot write an admin audit entry');
select throws_ok($$select public.publish_template_version(
 (select id from public.template_versions limit 1),'проверка')$$,
 '42501','forbidden','a non-admin cannot publish a template version');
select is((select count(*)::integer from public.admin_audit_log), 0,
 'a non-admin cannot even read the admin audit log');

-- The role must come from the private assignment table, never from user metadata.
set local role postgres;
select is((select count(*)::integer from information_schema.columns
 where table_schema='private' and table_name='platform_admin_assignments' and column_name='role'),
 1,'the platform role lives in a private assignment table');
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='private' and p.proname='is_platform_admin'
  and pg_get_functiondef(p.oid) like '%platform_admin_assignments%'),
 1,'is_platform_admin reads the assignment table');
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='private' and p.proname='is_platform_admin'
  and pg_get_functiondef(p.oid) like '%user_metadata%'),
 0,'is_platform_admin never consults user metadata');

-- ---------------------------------------------------------------------------
-- Admin audit
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000901',true);

select throws_ok($$select public.admin_audit('tool.created','tool',null,'x',null,null,'ab')$$,
 '22023','a reason is required for every admin action','a too-short reason is refused');

select lives_ok($$select public.admin_audit('tool.created','tool',null,'test_tool',
 '{"status":"none"}'::jsonb,'{"status":"draft"}'::jsonb,'Создание тестового инструмента')$$,
 'an admin action with a reason is recorded');
select is((select actor_role from public.admin_audit_log where resource_code='test_tool'),'platform_admin',
 'the audit entry records which platform role acted');
select is((select before_state->>'status' from public.admin_audit_log where resource_code='test_tool'),'none',
 'the before state is preserved');
select is((select after_state->>'status' from public.admin_audit_log where resource_code='test_tool'),'draft',
 'the after state is preserved');

set local role postgres;
select throws_ok($$update public.admin_audit_log set reason='изменено'$$,
 '42501','admin audit entries are append-only','an audit entry cannot be edited');
select throws_ok($$delete from public.admin_audit_log$$,
 '42501','admin audit entries are append-only','an audit entry cannot be deleted');

-- ---------------------------------------------------------------------------
-- Sensitive operations need a fresh credential check
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000901',true);
select is(private.has_fresh_reauth(interval '15 minutes'), false,
 'no re-auth has happened yet');
select throws_ok($$select public.admin_audit('tool.archived','tool',null,'x',null,null,'Архивирование',true)$$,
 '42501','this operation requires a fresh credential check',
 'a sensitive action is refused without a fresh credential check');
select lives_ok($$select public.mark_admin_reauth()$$,'the admin can confirm their identity');
select is(private.has_fresh_reauth(interval '15 minutes'), true,'the confirmation is recorded');
select lives_ok($$select public.admin_audit('tool.archived','tool',null,'x',null,null,'Архивирование',true)$$,
 'the sensitive action proceeds once identity is fresh');
select isnt((select reauth_verified_at from public.admin_audit_log where action='tool.archived'), null,
 'the audit entry records when identity was verified');

-- ---------------------------------------------------------------------------
-- Catalogue lifecycle: archive, never hard delete
-- ---------------------------------------------------------------------------
set local role postgres;
select throws_ok($$delete from public.tool_categories where id=(select category_id from public.tools limit 1)$$,
 '23503',null,'a category holding tools cannot be deleted');
select throws_ok($$delete from public.business_types
 where id=(select business_type_id from public.businesses where business_type_id is not null limit 1)$$,
 '23503',null,'a business type in use cannot be deleted');
select throws_ok($$delete from public.templates where id=(select template_id from public.template_versions limit 1)$$,
 '23503',null,'a template with versions cannot be deleted');

-- ---------------------------------------------------------------------------
-- Template versioning
-- ---------------------------------------------------------------------------
create temporary table admin_tpl as select id, code, current_version from public.templates limit 1;

insert into public.template_versions(template_id, version, schema_version, content, status, locales, created_by, is_mock)
select id, 900, 1, '{"mechanics":[{"kind":"gift_with_threshold"}]}'::jsonb, 'draft', array['ru','kk'],
 '00000000-0000-4000-8000-000000000901', true
from admin_tpl;

grant select on admin_tpl to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000901',true);

select lives_ok($$select public.publish_template_version(
 (select id from public.template_versions where version=900),'Публикация тестовой версии')$$,
 'a valid draft can be published');
select is((select status from public.template_versions where version=900),'published',
 'the version is now published');
select is((select current_version from public.templates where id=(select id from admin_tpl)),900,
 'the template points at the newly published version');

set local role postgres;
select throws_ok($$update public.template_versions set content='{"mechanics":[]}'::jsonb where version=900$$,
 '42501','a published template version is immutable; create a new version',
 'a published version cannot be edited');
select throws_ok($$delete from public.template_versions where version=900$$,
 '42501','a published template version cannot be deleted; archive it',
 'a published version cannot be deleted');

-- A draft missing a locale must never reach publication.
insert into public.template_versions(template_id, version, schema_version, content, status, locales, created_by, is_mock)
select id, 901, 1, '{"mechanics":[]}'::jsonb, 'draft', array['ru'],
 '00000000-0000-4000-8000-000000000901', true from admin_tpl;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000901',true);
select throws_ok($$select public.publish_template_version(
 (select id from public.template_versions where version=901),'Публикация без казахского')$$,
 '22023','a published template must provide both ru and kk',
 'a version without both languages cannot be published');

-- Rollback keeps newer versions published, so history stays readable.
select lives_ok($$select public.mark_admin_reauth()$$,'identity refreshed for the rollback');
select lives_ok($$select public.rollback_template((select id from admin_tpl), 1, 'Откат на первую версию')$$,
 'a platform admin can roll back to an earlier published version');
select is((select current_version from public.templates where id=(select id from admin_tpl)),1,
 'the template now points at the earlier version');
select is((select status from public.template_versions where version=900),'published',
 'the newer version stays published in the history');

-- ---------------------------------------------------------------------------
-- Entitlements
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000101',true);

select is(private.entitlement_value('10000000-0000-4000-8000-000000000001','growth_contracts_month'),'2',
 'a business without a subscription resolves against Free');
select is(private.entitlement_value('10000000-0000-4000-8000-000000000001','made_up_key'), null,
 'an unknown entitlement key resolves to null, which callers treat as not permitted');

select is((public.consume_entitlement('10000000-0000-4000-8000-000000000001','growth_contracts_month',1,'ent-test-1')->>'allowed')::boolean,
 true,'the first consumption is allowed');
select is((public.consume_entitlement('10000000-0000-4000-8000-000000000001','growth_contracts_month',1,'ent-test-1')->>'duplicate')::boolean,
 true,'the same request key never consumes twice');
select is((select used::integer from public.usage_counters
 where business_id='10000000-0000-4000-8000-000000000001' and entitlement_key='growth_contracts_month'),
 1,'a replayed request leaves the counter at one');

select is((public.consume_entitlement('10000000-0000-4000-8000-000000000001','growth_contracts_month',1,'ent-test-2')->>'allowed')::boolean,
 true,'the second consumption reaches the Free limit');
select is((public.consume_entitlement('10000000-0000-4000-8000-000000000001','growth_contracts_month',1,'ent-test-3')->>'reason'),
 'limit_reached','the third consumption is refused by the limit');

-- ---------------------------------------------------------------------------
-- Last owner and cross-tenant leakage
-- ---------------------------------------------------------------------------
set local role postgres;
select throws_ok($$update public.business_members set role='manager'
 where business_id='10000000-0000-4000-8000-000000000001' and role='owner' and status='active'$$,
 '23514','the last owner cannot be removed or demoted; transfer ownership first',
 'the last owner cannot be demoted');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000201',true);
select is((select count(*)::integer from public.team_invitations
 where business_id='10000000-0000-4000-8000-000000000001'),0,
 'a member of another business sees no invitations from this one');

rollback;
