begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select is(
 (select count(*)::integer from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and not c.relrowsecurity),
 0,'every public table has RLS enabled');

select is(
 (select count(*)::integer from pg_constraint c
  join pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey)
  where c.contype='f' and c.connamespace in ('public'::regnamespace,'private'::regnamespace)
   and not exists(select 1 from pg_index i where i.indrelid=c.conrelid and a.attnum=any(i.indkey))),
 0,'every foreign key column is indexed');

select ok(has_table_privilege('anon','public.tools','select'),'anon can select public tools');
select ok(has_table_privilege('anon','public.nearby_offers','select'),'anon can select nearby offers');
select ok(not has_table_privilege('anon','public.customers','select'),'anon has no customer table grant');
select ok(not has_table_privilege('anon','public.businesses','select'),'anon has no business table grant');
select ok((select relrowsecurity from pg_class where oid='private.platform_admin_assignments'::regclass),'private platform assignments use RLS defense-in-depth');
select ok(not has_function_privilege('public','private.has_business_role(uuid,text[])','execute'),'membership helper is not PUBLIC executable');

select * from finish();
rollback;
