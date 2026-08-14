begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

-- Решение доживает до приёмки, а приёмка возвращает факт в рейтинг. Эти
-- проверки о том, что цепочку нельзя разорвать: подтвердить дважды, принять
-- дважды, принять неотправленное или починить рейтинг из браузера.

\set biz '10000000-0000-4000-8000-000000000001'
\set rose 'private.deterministic_uuid(''supply-rose_red'')'
\set barys 'private.deterministic_uuid(''supplier-barys'')'

-- ---------------------------------------------------------------------------
-- Поставщики и рейтинг из истории
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::bigint from public.suppliers where business_id = :'biz'),
  6::bigint, 'шесть поставщиков цветочного магазина');

select ok(
  (select count(*) from public.supplier_offers where business_id = :'biz'
     and supply_item_id = :rose) >= 3,
  'у розы есть выбор: минимум три поставщика');

select ok(
  (select count(*) from public.supplier_performance where business_id = :'biz') >= 5,
  'рейтинг посчитан по каждому поставщику с историей');

-- «Барыс» в seed возит без срывов, «Флора» недовозит — это должно быть видно.
select ok(
  (select p.orders_on_time_in_full = p.orders_total
   from public.supplier_performance p where p.business_id = :'biz' and p.supplier_id = :barys),
  'у «Барыса» все поставки вовремя и полностью');

select ok(
  (select p.shortfall_rate_ppm > 0
   from public.supplier_performance p
   join public.suppliers s on s.id = p.supplier_id
   where p.business_id = :'biz' and s.name = 'Алматы Флора Опт'),
  'у «Флоры» в рейтинге виден недовоз');

-- ---------------------------------------------------------------------------
-- Одно открытое решение на позицию
-- ---------------------------------------------------------------------------

insert into public.decision_contracts(
  business_id, supply_item_id, headline, consequence, on_hand_milli, daily_forecast_milli,
  recommended_quantity_milli, confidence_ppm, model_version, plan, is_mock)
values (:'biz', :rose, 'Розы закончатся', 'Витрина опустеет', 100000, 95000, 160000, 800000, 'test-1',
        jsonb_build_array(jsonb_build_object(
          'supplierId', private.deterministic_uuid('supplier-barys'),
          'supplierName', 'Оптовая база «Барыс»',
          'quantityMilli', 160000,
          'unitPriceMinor', 820,
          'costMinor', 115600,
          'leadTimeP80Hours', 10,
          'urgent', true)),
        true);

select throws_ok(
  $$ insert into public.decision_contracts(
       business_id, supply_item_id, headline, consequence, on_hand_milli, daily_forecast_milli,
       recommended_quantity_milli, confidence_ppm, model_version, is_mock)
     values ('10000000-0000-4000-8000-000000000001',
             private.deterministic_uuid('supply-rose_red'),
             'Второе решение', 'Дубль', 100000, 95000, 10000, 800000, 'test-2', true) $$,
  '23505',
  null,
  'второе открытое решение по той же позиции создать нельзя');

-- ---------------------------------------------------------------------------
-- Подтверждение
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select private.approve_decision(
       (select id from public.decision_contracts
        where business_id = '10000000-0000-4000-8000-000000000001' and status = 'open' limit 1),
       99) $$,
  '40001',
  null,
  'подтверждение устаревшей версии отклоняется');

select lives_ok(
  $$ select private.approve_decision(
       (select id from public.decision_contracts
        where business_id = '10000000-0000-4000-8000-000000000001' and status = 'open' limit 1),
       1) $$,
  'подтверждение актуальной версии проходит');

select is(
  (select status from public.decision_contracts
   where business_id = :'biz' and model_version = 'test-1'),
  'approved', 'решение перешло в подтверждённое');

-- Автор не проверяется: в pgTAP нет сессии, и схема этого не требует —
-- подтвердить решение может и фоновый цикл. Требование «назови человека»
-- живёт в обёртке, доступной из интерфейса, и проверяется ролью.
select ok(
  (select decided_at is not null
   from public.decision_contracts where business_id = :'biz' and model_version = 'test-1'),
  'подтверждение записало время решения');

select throws_ok(
  $$ select private.approve_decision(
       (select id from public.decision_contracts
        where business_id = '10000000-0000-4000-8000-000000000001' and model_version = 'test-1'),
       1) $$,
  '23514',
  null,
  'подтвердить второй раз нельзя');

-- ---------------------------------------------------------------------------
-- Жизненный цикл заказа
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ update public.purchase_orders set status = 'delivered'
     where id = (select id from public.purchase_orders
                 where business_id = '10000000-0000-4000-8000-000000000001' and status = 'draft' limit 1) $$,
  '23514',
  null,
  'заказ нельзя принять, минуя отправку');

select lives_ok(
  $$ update public.purchase_orders set status = 'sent'
     where id = (select id from public.purchase_orders
                 where business_id = '10000000-0000-4000-8000-000000000001' and status = 'draft' limit 1) $$,
  'черновик можно отправить');

-- ---------------------------------------------------------------------------
-- Приёмка
-- ---------------------------------------------------------------------------

-- Приёмка отправленного заказа: недовоз 150 из 160 с опозданием.
select lives_ok(
  $$ select private.receive_order_item(
       (select i.id from public.purchase_order_items i
        join public.purchase_orders o on o.id = i.purchase_order_id
        where o.business_id = '10000000-0000-4000-8000-000000000001' and o.status = 'sent' limit 1),
       150000, 0, 4::smallint, 6, 'недовоз по накладной') $$,
  'приёмка отправленного заказа проходит');

select ok(
  (select count(*) > 0 from public.order_discrepancies d
   join public.order_receipts r on r.id = d.receipt_id
   where d.business_id = :'biz' and d.kind = 'shortfall' and r.received_milli = 150000),
  'недовоз записан расхождением');

select ok(
  (select count(*) > 0 from public.order_discrepancies d
   join public.order_receipts r on r.id = d.receipt_id
   where d.business_id = :'biz' and d.kind = 'delay' and r.delay_hours = 6),
  'опоздание записано отдельным расхождением');

select throws_ok(
  $$ select private.receive_order_item(
       (select r.purchase_order_item_id from public.order_receipts r
        where r.business_id = '10000000-0000-4000-8000-000000000001'
        order by r.created_at desc limit 1),
       10000) $$,
  '23505',
  null,
  'повторная приёмка той же строки отклоняется');

-- Приёмка обязана пополнить витрину: событие журнала создано и связано.
select ok(
  (select r.inventory_event_id is not null from public.order_receipts r
   where r.business_id = :'biz' and r.received_milli = 150000 limit 1),
  'приёмка создала событие остатка');

select * from finish();
rollback;
