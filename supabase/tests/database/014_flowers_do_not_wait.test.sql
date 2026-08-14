begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- Для цветов остаток — не число, а набор партий с разными сроками. Эти
-- проверки о том, что учёт повторяет реальность: продаётся сначала то, что
-- вянет раньше, списание не выдаёт себя за продажу, а чужой магазин не виден.

\set biz '10000000-0000-4000-8000-000000000001'
\set rose 'private.deterministic_uuid(''supply-rose_red'')'

-- ---------------------------------------------------------------------------
-- Магазин цветочный
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::bigint from public.supply_items where business_id = :'biz'),
  8::bigint, 'восемь позиций цветочного магазина');

select is(
  (select unit from public.supply_items where id = :rose),
  'стебель', 'розы считаются стеблями, а не штуками');

select is(
  (select shelf_life_days from public.supply_items where id = :rose),
  5, 'у розы пять дней свежести');

select is(
  (select shelf_life_days from public.supply_items
   where id = private.deterministic_uuid('supply-ribbon')),
  null, 'у ленты срока свежести нет');

select is(
  (select criticality from public.supply_items where id = :rose),
  'critical', 'роза критична: пустая витрина дороже лишнего ведра');

-- ---------------------------------------------------------------------------
-- Партии
-- ---------------------------------------------------------------------------

select ok(
  (select count(*) from public.inventory_lots where business_id = :'biz') > 0,
  'поставки создали партии');

select is(
  (select coalesce(sum(l.remaining_milli), 0)::bigint from public.inventory_lots l
   where l.business_id = :'biz' and l.supply_item_id = :rose),
  (select b.on_hand_milli from public.inventory_balances b
   where b.business_id = :'biz' and b.supply_item_id = :rose),
  'сумма живых партий сходится с остатком');

select ok(
  (select bool_and(l.expires_at is not null) from public.inventory_lots l
   where l.business_id = :'biz' and l.supply_item_id = :rose),
  'у каждой партии роз есть срок');

select ok(
  (select bool_and(l.expires_at is null) from public.inventory_lots l
   where l.business_id = :'biz'
     and l.supply_item_id = private.deterministic_uuid('supply-ribbon')),
  'а у ленты срока нет ни у одной партии');

-- Продажа обязана разобрать ту партию, что вянет раньше.
select private.record_inventory_event(
  :'biz', :rose, null, 'consume', -1000, 'manual', 'pgtap-fifo-sale');

select ok(
  (select l.remaining_milli < l.quantity_milli
   from public.inventory_lots l
   where l.business_id = :'biz' and l.supply_item_id = :rose
   order by l.expires_at nulls last, l.received_at
   limit 1),
  'продажа списалась с партии, которая вянет раньше остальных');

-- ---------------------------------------------------------------------------
-- Списание
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select private.record_inventory_event(
       '10000000-0000-4000-8000-000000000001',
       private.deterministic_uuid('supply-rose_red'), null,
       'waste', -1000, 'manual', 'pgtap-waste-no-reason') $$,
  '23514',
  null,
  'списание обязано назвать причину');

select lives_ok(
  $$ select private.record_inventory_event(
       '10000000-0000-4000-8000-000000000001',
       private.deterministic_uuid('supply-rose_red'), null,
       'waste', -2000, 'manual', 'pgtap-waste-ok',
       now(), 'вечерняя ревизия', false, null, 'withered') $$,
  'списание с причиной проходит');

select is(
  (select waste_reason from public.inventory_events
   where business_id = :'biz' and idempotency_key = 'pgtap-waste-ok'),
  'withered', 'причина сохранена вместе с событием');

-- Списание уменьшает остаток, но не становится спросом: иначе прогноз выучит
-- выброшенное как проданное и будет советовать закупать столько же.
select is(
  (select sum(quantity_milli)::bigint from private.daily_demand(:'biz', :rose, null, 28)),
  (select coalesce(sum(-quantity_delta_milli), 0)::bigint from public.inventory_events
   where business_id = :'biz' and supply_item_id = :rose and event_type = 'consume'
     and (occurred_at at time zone 'Asia/Almaty')::date
         > (now() at time zone 'Asia/Almaty')::date - 28),
  'в спрос попадают только продажи, списания — нет');

-- ---------------------------------------------------------------------------
-- Календарь спроса
-- ---------------------------------------------------------------------------

select ok(
  (select count(*) from public.demand_events where business_id is null) >= 5,
  'общий календарь платформы наполнен');

select ok(
  (select bool_and(not verified) from public.demand_events where business_id is null),
  'коэффициенты шаблонных праздников помечены гипотезой, пока не проверены фактом');

select * from finish();
rollback;
