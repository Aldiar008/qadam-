begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- Три тонкие части, и у каждой одно обещание: сообщение не меняет витрину до
-- подтверждения, неодобренный праздник не двигает прогноз, общий рейтинг ниже
-- порога не публикуется и никого не выдаёт.

\set biz '10000000-0000-4000-8000-000000000001'
\set rose 'private.deterministic_uuid(''supply-rose_red'')'

-- ---------------------------------------------------------------------------
-- Чат флориста
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::bigint from public.stock_messages where business_id = :'biz'),
  3::bigint, 'три сообщения на стенде: предложение, уточнение и подтверждённое');

select ok(
  (select bool_and(is_simulated) from public.stock_messages where business_id = :'biz'),
  'все сообщения помечены как из тренажёра, а не из живого мессенджера');

-- Главное обещание: разбор сам по себе витрину не трогает.
select is(
  (select count(*)::bigint from public.inventory_events e
   join public.stock_messages m on m.inventory_event_id = e.id
   where m.business_id = :'biz' and m.status <> 'confirmed'),
  0::bigint, 'у неподтверждённых сообщений нет событий остатка');

select ok(
  (select inventory_event_id is null from public.stock_messages
   where business_id = :'biz' and status = 'needs_clarification' limit 1),
  'сообщение, требующее уточнения, ничего не записало');

-- Подтверждение превращает сообщение в событие — и только оно.
select lives_ok(
  $$ select private.confirm_stock_message(
       private.deterministic_uuid('msg-1'),
       private.deterministic_uuid('supply-rose_red'),
       70000, 'adjust') $$,
  'подтверждение проходит');

select ok(
  (select inventory_event_id is not null from public.stock_messages
   where id = private.deterministic_uuid('msg-1')),
  'после подтверждения сообщение связано с событием остатка');

select is(
  (select e.source from public.inventory_events e
   join public.stock_messages m on m.inventory_event_id = e.id
   where m.id = private.deterministic_uuid('msg-1')),
  'messenger', 'событие помечено источником «чат»');

select throws_ok(
  $$ select private.confirm_stock_message(
       private.deterministic_uuid('msg-1'),
       private.deterministic_uuid('supply-rose_red'),
       70000, 'adjust') $$,
  '23505',
  null,
  'повторное подтверждение отклоняется: остаток не меняется дважды');

select throws_ok(
  $$ insert into public.stock_messages(business_id, channel, external_id, author, body, is_mock)
     values ('10000000-0000-4000-8000-000000000001', 'simulator', 'sim-0001', 'Дубль', 'повтор', true) $$,
  '23505',
  null,
  'повторная доставка того же сообщения не создаёт вторую строку');

-- Единица сверяется с учётной: «две коробки» и «два стебля» — сообщения
-- одинаковой длины и совсем разной цены.
select throws_ok(
  $$ select private.confirm_stock_message(
       private.deterministic_uuid('msg-2'),
       private.deterministic_uuid('supply-rose_red'),
       12000, 'waste', 'коробка') $$,
  '23514',
  null,
  'единица, не совпадающая с учётной, отклоняется');

select lives_ok(
  $$ select private.confirm_stock_message(
       private.deterministic_uuid('msg-2'),
       private.deterministic_uuid('supply-rose_red'),
       12000, 'waste', 'стебель') $$,
  'та же операция с учётной единицей проходит');

-- ---------------------------------------------------------------------------
-- Календарь
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::bigint from public.demand_events where approved),
  1::bigint, 'одобрен ровно один повод — локальное событие магазина');

select ok(
  (select bool_and(not approved) from public.demand_events where business_id is null),
  'шаблонные праздники платформы остаются предложениями, пока их не приняли');

select ok(
  (select bool_and(not verified) from public.demand_events where business_id is null),
  'и помечены гипотезой: коэффициент не подтверждён фактом прошлого года');

-- ---------------------------------------------------------------------------
-- Общий рейтинг
-- ---------------------------------------------------------------------------

-- В таблице агрегата нет и не может быть ссылки на заведение: строка не
-- принадлежит никому, иначе по ней восстановили бы, чей это был заказ.
select is(
  (select count(*)::bigint from information_schema.columns
   where table_schema = 'public' and table_name = 'community_supplier_metrics'
     and column_name in ('business_id', 'tenant_id', 'order_id')),
  0::bigint, 'в общем рейтинге нет ни одного идентификатора заведения или заказа');

select ok(
  (select count(*) from public.community_supplier_metrics
   where n_orders < 20 or n_tenants < 10) > 0,
  'на стенде есть поставщик ниже порога — чтобы было видно, как выглядит скрытый рейтинг');

select * from finish();
rollback;
