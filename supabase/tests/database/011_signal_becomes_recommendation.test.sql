begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- The arrow that was missing from the product's own loop: a measured signal has
-- to become something the owner can act on, exactly once, with an economy
-- attached — and a suggestion they refused must stay refused.

-- Start from a known state: the seed's onboarding-era rows are left alone, only
-- signal-derived ones are in question here.
delete from public.recommendations
where business_id = '10000000-0000-4000-8000-000000000001' and origin_key like 'signal:%';

select is(
  (select count(*)::bigint from public.signals
   where business_id = '10000000-0000-4000-8000-000000000001' and status = 'open'),
  1::bigint, 'the demo tenant carries one open signal to work from');

select lives_ok(
  $$select private.recommend_from_signals('10000000-0000-4000-8000-000000000001')$$,
  'the generator runs against a real tenant');

select is(
  (select count(*)::bigint from public.recommendations
   where business_id = '10000000-0000-4000-8000-000000000001' and origin_key like 'signal:%'),
  1::bigint, 'one open signal produces exactly one recommendation');

-- Running the cycle again must refresh, not duplicate.
select private.recommend_from_signals('10000000-0000-4000-8000-000000000001');
select private.recommend_from_signals('10000000-0000-4000-8000-000000000001');

select is(
  (select count(*)::bigint from public.recommendations
   where business_id = '10000000-0000-4000-8000-000000000001' and origin_key like 'signal:%'),
  1::bigint, 'running the cycle again refreshes rather than duplicates');

-- «GOS N/A» and «Нужен forecast» were on screen because nobody ever wrote these.
select ok(
  (select (explanation ? 'gos') and (explanation ? 'eligible') and (explanation ? 'economics')
   from public.recommendations
   where business_id = '10000000-0000-4000-8000-000000000001' and origin_key like 'signal:%' limit 1),
  'a generated recommendation carries a score, an audience and an economy');

select ok(
  (select (explanation->'economics'->>'known')::boolean
   from public.recommendations
   where business_id = '10000000-0000-4000-8000-000000000001' and origin_key like 'signal:%' limit 1),
  'with a priced catalogue the forecast is computable rather than "нужен forecast"');

-- A rejected suggestion stays rejected.
update public.recommendations
set status = 'rejected', optimistic_version = optimistic_version + 1
where business_id = '10000000-0000-4000-8000-000000000001' and origin_key like 'signal:%';

select private.recommend_from_signals('10000000-0000-4000-8000-000000000001');

select is(
  (select count(*)::bigint from public.recommendations
   where business_id = '10000000-0000-4000-8000-000000000001'
     and origin_key like 'signal:%' and status = 'open'),
  0::bigint, 'a suggestion the owner refused is not proposed again');

-- The owner-facing wrapper resolves the business from membership, so it cannot
-- be pointed at somebody else's tenant, and anonymous callers get nothing.
select throws_ok(
  $$set local role anon; select public.refresh_my_recommendations()$$,
  '42501', null,
  'an anonymous caller cannot regenerate anybody''s recommendations');

select * from finish();
rollback;
