begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

-- Остаток здесь — не поле, а сумма журнала. Эти проверки о том, что журнал
-- нельзя обойти: ни повтором, ни правкой задним числом, ни списанием того,
-- чего нет, ни чтением чужого заведения.

\set biz '10000000-0000-4000-8000-000000000001'
\set other '10000000-0000-4000-8000-000000000002'

-- ---------------------------------------------------------------------------
-- Seed привёл остатки в известное состояние
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::bigint from public.inventory_balances where business_id = :'biz'),
  8::bigint, 'у каждой позиции цветочного магазина есть остаток');

select is(
  (select on_hand_milli from public.inventory_balances
   where business_id = :'biz' and supply_item_id = private.deterministic_uuid('supply-rose_red')),
  147848::bigint, 'остаток роз ровно тот, который заложен в seed');

-- Баланс обязан совпадать с суммой журнала: расхождение здесь означает, что
-- где-то остаток записали в обход функции.
select is(
  (select b.on_hand_milli from public.inventory_balances b
   where b.business_id = :'biz' and b.supply_item_id = private.deterministic_uuid('supply-tulip')),
  (select coalesce(sum(e.quantity_delta_milli), 0)::bigint from public.inventory_events e
   where e.business_id = :'biz' and e.supply_item_id = private.deterministic_uuid('supply-tulip')),
  'остаток сходится с суммой журнала');

select is(
  (select count(*)::bigint from public.inventory_events
   where business_id = :'biz' and event_type = 'consume'),
  224::bigint, '28 дней истории продаж по восьми позициям');

-- ---------------------------------------------------------------------------
-- Идемпотентность
-- ---------------------------------------------------------------------------

select private.record_inventory_event(
  :'biz', private.deterministic_uuid('supply-chrysanthemum'), null,
  'receive', 5000, 'seed', 'pgtap-idem-001');

select is(
  (select on_hand_milli from public.inventory_balances
   where business_id = :'biz' and supply_item_id = private.deterministic_uuid('supply-chrysanthemum')),
  187357::bigint, 'поставка увеличила остаток');

select private.record_inventory_event(
  :'biz', private.deterministic_uuid('supply-chrysanthemum'), null,
  'receive', 5000, 'seed', 'pgtap-idem-001');

select is(
  (select on_hand_milli from public.inventory_balances
   where business_id = :'biz' and supply_item_id = private.deterministic_uuid('supply-chrysanthemum')),
  187357::bigint, 'повтор того же ключа не применился второй раз');

select is(
  (select count(*)::bigint from public.inventory_events
   where business_id = :'biz' and idempotency_key = 'pgtap-idem-001'),
  1::bigint, 'и не создал вторую строку в журнале');

-- ---------------------------------------------------------------------------
-- Отрицательный остаток
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select private.record_inventory_event(
       '10000000-0000-4000-8000-000000000001',
       private.deterministic_uuid('supply-chrysanthemum'), null,
       'consume', -999000, 'manual', 'pgtap-overdraw') $$,
  '23514',
  null,
  'списать больше остатка нельзя');

select lives_ok(
  $$ select private.record_inventory_event(
       '10000000-0000-4000-8000-000000000001',
       private.deterministic_uuid('supply-chrysanthemum'), null,
       'adjust', -999000, 'manual', 'pgtap-adjust', now(), 'инвентаризация', true) $$,
  'явная корректировка вправе увести остаток в минус');

-- ---------------------------------------------------------------------------
-- Журнал только дополняется
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ update public.inventory_events set note = 'tampered' where idempotency_key = 'pgtap-idem-001' $$,
  '42501',
  null,
  'запись журнала нельзя изменить задним числом');

select throws_ok(
  $$ delete from public.inventory_events where idempotency_key = 'pgtap-idem-001' $$,
  '42501',
  null,
  'и нельзя удалить');

-- ---------------------------------------------------------------------------
-- Чужое заведение
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select private.record_inventory_event(
       '10000000-0000-4000-8000-000000000002',
       private.deterministic_uuid('supply-rose_red'), null,
       'receive', 1000, 'manual', 'pgtap-cross-tenant') $$,
  '23503',
  null,
  'позицию чужого заведения нельзя двигать даже зная её идентификатор');

-- ---------------------------------------------------------------------------
-- Дневной ряд расхода
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::bigint from private.daily_demand(
     :'biz', private.deterministic_uuid('supply-rose_red'), null, 28)),
  28::bigint, 'ряд расхода возвращает ровно окно, включая дни без движения');

select ok(
  (select bool_and(quantity_milli >= 0) from private.daily_demand(
     :'biz', private.deterministic_uuid('supply-rose_red'), null, 28)),
  'расход в ряду неотрицателен: знак снят при агрегации');

-- Приёмка не должна попадать в спрос: иначе прогноз выучит собственные заказы.
select is(
  (select sum(quantity_milli)::bigint from private.daily_demand(
     :'biz', private.deterministic_uuid('supply-rose_red'), null, 28)),
  (select coalesce(sum(-quantity_delta_milli), 0)::bigint from public.inventory_events
   where business_id = :'biz' and supply_item_id = private.deterministic_uuid('supply-rose_red')
     and event_type = 'consume'
     and (occurred_at at time zone 'Asia/Almaty')::date
         > (now() at time zone 'Asia/Almaty')::date - 28),
  'в ряд попадает только расход, приёмка и корректировка — нет');

select * from finish();
rollback;
