begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

-- Платформа знает про цветы: справочники категорий, товарной политики, правил
-- автозаказа и наборов инструментов. У каждого одно обещание — что подставлено
-- новому магазину, помечено как подставленное, а не выдано за измеренное.

\set biz '10000000-0000-4000-8000-000000000001'

-- ---------------------------------------------------------------------------
-- Категории и политика
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::bigint from public.flower_categories where status = 'published'),
  7::bigint, 'семь категорий цветов опубликовано: от роз до аксессуаров');

select ok(
  (select bool_and(array_length(aliases, 1) is not null) from public.flower_categories),
  'у каждой категории есть псевдонимы: магазин называет позицию своими словами');

-- «Пионы» в ассортименте магазина попадают в платформенную категорию через
-- псевдоним, а не через переименование его товара.
select ok(
  exists (select 1 from public.flower_categories where code = 'seasonal' and 'пионы' = any(aliases)),
  'пионы попадают в «сезонные цветы» без переименования ассортимента');

select is(
  (select count(*)::bigint from public.product_policy_templates),
  7::bigint, 'у каждой категории есть шаблон товарной политики');

-- Срок жизни — вход в расчёт риска, а не украшение карточки: если бы он был
-- одинаковым, одна и та же ошибка закупки стоила бы одинаково.
select ok(
  (select count(distinct shelf_life_days) from public.product_policy_templates
   where shelf_life_days is not null) >= 4,
  'сроки у категорий разные: пион три дня, роза пять, хризантема неделя');

select ok(
  (select shelf_life_days is null from public.product_policy_templates p
   join public.flower_categories c on c.id = p.category_id where c.code = 'packaging'),
  'у упаковки срока нет вовсе — это «не портится», а не «неизвестно»');

select is(
  (select criticality from public.product_policy_templates p
   join public.flower_categories c on c.id = p.category_id where c.code = 'roses'),
  'critical', 'роза критична: пустая витрина по ней стоит дороже лишнего ведра');

select ok(
  (select bool_and(spoilage_tolerance_bps between 0 and 10000) from public.product_policy_templates),
  'допустимая доля списаний остаётся долей, а не превращается в проценты дважды');

-- ---------------------------------------------------------------------------
-- Правила автозаказа
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::bigint from public.auto_order_rule_templates where status = 'published'),
  4::bigint, 'четыре правила автозаказа действуют');

select ok(
  (select bool_and(char_length(description_ru) > 40) from public.auto_order_rule_templates),
  'у каждого правила есть объяснение: правило без него нельзя проверить');

-- Главное обещание раздела: правило не отправляет заказ. Проверяется структурой,
-- а не комментарием — у таблицы нет и не может быть поля «отправить».
select is(
  (select count(*)::bigint from information_schema.columns
   where table_schema = 'public' and table_name = 'auto_order_rule_templates'
     and column_name in ('sends_order', 'auto_send', 'supplier_id')),
  0::bigint, 'у правила нет способа отправить заказ: это делает владелец');

select throws_ok(
  $$ insert into public.auto_order_rule_templates(code, name_ru, description_ru, trigger)
     values ('bad_rule', 'Плохое', 'Описание правила достаточной длины для проверки', 'telepathy') $$,
  '23514',
  null,
  'выдуманный триггер отклоняется: список условий закрыт');

-- ---------------------------------------------------------------------------
-- Наборы инструментов
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::bigint from public.tool_bundles where status = 'published'),
  2::bigint, 'два набора: магазину и сети');

select is(
  (select count(*)::bigint from public.tool_bundle_items i
   join public.tool_bundles b on b.id = i.bundle_id where b.code = 'flower_start'),
  7::bigint, 'в наборе первого дня семь инструментов');

select ok(
  (select bool_and(t.status = 'published') from public.tool_bundle_items i
   join public.tools t on t.id = i.tool_id),
  'набор не выдаёт снятый с публикации инструмент');

-- Порядок в наборе — это порядок, в котором владелец пройдёт продукт.
select is(
  (select t.code from public.tool_bundle_items i
   join public.tools t on t.id = i.tool_id
   join public.tool_bundles b on b.id = i.bundle_id
   where b.code = 'flower_start' order by i.sort_order limit 1),
  'freshness_inventory', 'первым шагом идёт остаток на витрине, а не выбор поставщика');

select throws_ok(
  $$ insert into public.tool_bundle_items(bundle_id, tool_id)
     select b.id, t.id from public.tool_bundles b, public.tools t
     where b.code = 'flower_start' and t.code = 'freshness_inventory' $$,
  '23505',
  null,
  'один инструмент не попадает в набор дважды');

-- ---------------------------------------------------------------------------
-- Каталог владельца
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::bigint from public.tools where status = 'published' and is_public),
  9::bigint, 'владелец видит девять цветочных инструментов');

-- Маркетинговые инструменты не удалены: на них ссылаются записи активаций и
-- избранного, и эта история — свидетельство, а не мусор.
select ok(
  (select count(*) from public.tools where status = 'archived') >= 12,
  'двенадцать маркетинговых инструментов ушли в архив, а не исчезли');

select is(
  (select count(*)::bigint from public.business_tools
   where business_id = :'biz' and status = 'active'),
  4::bigint, 'на «Сегодня» закреплены четыре инструмента демо-магазина');

-- ---------------------------------------------------------------------------
-- Профиль магазина
-- ---------------------------------------------------------------------------

select ok(
  (select 'roses' = any(category_codes) and 'march_8' = any(holiday_codes)
   from public.business_flower_profiles where business_id = :'biz'),
  'профиль демо-магазина знает и что он продаёт, и к какому празднику готовится');

-- Себестоимость партии и справочная цена позиции живут в одной шкале. Пока их
-- было две, «может уйти в мусор» на главном экране превышало стоимость всей
-- витрины — и число выглядело убедительно ровно потому, что было неверным.
select ok(
  (select bool_and(l.unit_cost_minor between si.current_price_minor / 2 and si.current_price_minor * 3)
   from public.inventory_lots l
   join public.supply_items si on si.id = l.supply_item_id
   where l.unit_cost_minor is not null and si.current_price_minor is not null),
  'себестоимость партии соизмерима с ценой позиции: одна денежная шкала на весь продукт');

select * from finish();
rollback;
