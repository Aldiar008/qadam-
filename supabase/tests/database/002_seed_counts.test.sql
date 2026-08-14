begin;
create extension if not exists pgtap with schema extensions;
select plan(16);
select is((select count(*)::bigint from public.customers where business_id='10000000-0000-4000-8000-000000000001'),180::bigint,'180 TAMYR customers');
select is((select count(*)::bigint from public.transactions where business_id='10000000-0000-4000-8000-000000000001'),1129::bigint,'1129 TAMYR transactions');
select is((select count(*)::bigint from public.customer_segments where business_id='10000000-0000-4000-8000-000000000001'),5::bigint,'5 segments');
select is((select count(*)::bigint from public.campaigns where business_id='10000000-0000-4000-8000-000000000001'),3::bigint,'3 campaigns');
select is((select count(*)::bigint from public.content_items where business_id='10000000-0000-4000-8000-000000000001'),3::bigint,'3 content items');
select is((select count(*)::bigint from public.recommendations where business_id='10000000-0000-4000-8000-000000000001'),3::bigint,'3 recommendations');
select is((select count(*)::bigint from public.automations where business_id='10000000-0000-4000-8000-000000000001'),6::bigint,'6 automations');

-- Their rules were `{"seed_trigger": 1}`, so `execute_automation` read nothing
-- out of them and silently used defaults for everything.
select is(
 (select count(*)::bigint from public.automations
  where business_id='10000000-0000-4000-8000-000000000001' and trigger_rules ? 'seed_trigger'),
 0::bigint,'no automation ships a placeholder rule');
-- Двенадцать маркетинговых инструментов остались строками и ушли в архив, к ним
-- добавились девять цветочных. Владелец видит только вторые; первые сохранены,
-- потому что на них ссылаются записи активаций и избранного.
select is((select count(*)::bigint from public.tools),21::bigint,'21 tool row: 12 archived marketing + 9 published flower');
select is((select count(*)::bigint from public.tools where status='published' and is_public),9::bigint,'9 tools visible to an owner');
select is((select count(*)::bigint from public.templates),3::bigint,'3 templates');
select is((select count(*)::bigint from public.daily_analytics where business_id='10000000-0000-4000-8000-000000000001'),120::bigint,'120 daily analytics rows');
select is((select count(*)::bigint from public.activity_logs where business_id='10000000-0000-4000-8000-000000000001' and resource_type='seed' and metadata ? 'sequence'),20::bigint,'20 seed activity rows');

-- A segment is its rule. These three keep the card, the counter and the list
-- from drifting apart — the failure the placeholder `{"seed_rule": 2}` hid.
select is(
 (select count(*)::bigint from public.customer_segments
  where business_id='10000000-0000-4000-8000-000000000001' and definition ? 'seed_rule'),
 0::bigint,'no segment ships a placeholder rule');

select is(
 (select count(*)::bigint from public.customer_segments s
  where s.business_id='10000000-0000-4000-8000-000000000001'
    and (private.preview_segment_audience(s.business_id,s.definition)->>'eligible')::int
        <> (select count(*) from public.segment_memberships m where m.segment_id=s.id)),
 0::bigint,'every stored rule counts to exactly its own membership');

select is(
 (select count(*)::bigint from public.customer_segments s
  where s.business_id='10000000-0000-4000-8000-000000000001'
    and not exists (select 1 from public.segment_memberships m where m.segment_id=s.id)),
 0::bigint,'no segment is shown with nobody in it');

select * from finish();
rollback;
