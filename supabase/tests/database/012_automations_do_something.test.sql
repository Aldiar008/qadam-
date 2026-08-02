begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

-- Nine rules out of ten counted rows and posted a sentence. These assertions
-- are about the difference between counting and doing.

update public.automations
set status = 'active', optimistic_version = optimistic_version + 1
where business_id = '10000000-0000-4000-8000-000000000001' and status = 'draft';

-- A rule whose declared action is «предложить кампанию» must end at something
-- the owner can open, not at a notification.
select private.execute_automation(
  (select id from public.automations where business_id='10000000-0000-4000-8000-000000000001' and automation_type='reactivation'),
  'pgtap-reactivation-001', 'manual');

select is(
  (select count(*)::bigint from public.recommendations
   where business_id='10000000-0000-4000-8000-000000000001' and origin_key like 'automation:%'),
  1::bigint, 'a reactivation rule produces a recommendation, not just a notification');

select ok(
  (select (explanation ? 'economics') and (explanation->>'eligible')::int > 0
   from public.recommendations
   where business_id='10000000-0000-4000-8000-000000000001' and origin_key like 'automation:%' limit 1),
  'and it carries the audience and the economics behind it');

-- Running the same rule again must not stack duplicates.
select private.execute_automation(
  (select id from public.automations where business_id='10000000-0000-4000-8000-000000000001' and automation_type='reactivation'),
  'pgtap-reactivation-002', 'manual');

select is(
  (select count(*)::bigint from public.recommendations
   where business_id='10000000-0000-4000-8000-000000000001' and origin_key like 'automation:%'),
  1::bigint, 'running it again does not stack a second copy');

-- `weekly_review` used to emit category «opportunity» with the body
-- «найдено 1 подходящих клиентов», which is neither a summary nor an opportunity.
select private.execute_automation(
  (select id from public.automations where business_id='10000000-0000-4000-8000-000000000001' and automation_type='weekly_review'),
  'pgtap-weekly-001', 'manual');

select is(
  (select category from public.notifications
   where business_id='10000000-0000-4000-8000-000000000001' and notification_type='weekly_review'
   order by created_at desc limit 1),
  'result', 'a weekly review is filed as a result, not as an opportunity');

select ok(
  (select body not like '%найдено 1 подходящих клиентов%' from public.notifications
   where business_id='10000000-0000-4000-8000-000000000001' and notification_type='weekly_review'
   order by created_at desc limit 1),
  'and its body says something true about the week');

-- Autopilot claimed to dispatch while enqueueing nothing.
select is(
  (select count(*)::bigint from public.automation_runs
   where business_id='10000000-0000-4000-8000-000000000001' and result->>'outcome' = 'dispatched'),
  0::bigint, 'no run claims to have dispatched anything');

select ok(
  (select bool_and(result ? 'channel' and result->>'channel' <> 'whatsapp')
   from public.automation_runs
   where business_id='10000000-0000-4000-8000-000000000001' and status='completed'),
  'no rule narrows its audience with a channel that has no credentials');

select * from finish();
rollback;
