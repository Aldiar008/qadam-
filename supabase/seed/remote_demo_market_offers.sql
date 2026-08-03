-- Настоящие цены с Kaspi, собранные scripts/fetch-market-offers.mjs.
--
-- Не выдумка и не заглушка: тот же запрос, тот же разбор и та же сортировка
-- за единицу, что и у кнопки «Найти дешевле», просто выполненные с машины,
-- которой площадка отвечает. Каждая строка приходит verified = false — цену
-- по-прежнему подтверждает человек, открыв ссылку.

begin;

-- Найденное автоматически заменяется целиком: прайсы, внесённые руками,
-- остаются (у них нет external_id), а прошлый улов не должен пережить смену
-- поискового запроса и остаться под позицией, к которой он не относится.
delete from public.supply_offers where business_id = '10000000-0000-4000-8000-000000000001' and source = 'web';

-- Стаканы 400 мл с крышкой · запрос «стаканы бумажные 400 мл» · ok
update public.supply_items set search_query = 'стаканы бумажные 400 мл'
  where business_id = '10000000-0000-4000-8000-000000000001' and name_ru = 'Стаканы 400 мл с крышкой';
insert into public.supply_offers(business_id, supply_item_id, supplier, title, price_minor, pack_size, url, external_id, source, verified, is_mock)
  select '10000000-0000-4000-8000-000000000001', i.id, 'Kaspi.kz', 'Крышка для стакана KP90BL черный 50 шт', 699, 50, 'https://kaspi.kz/p/kryshka-dlja-stakana-kp90bl-chernyi-50-sht-108764446/?c=750000000', '108764446', 'web', false, true
  from public.supply_items i where i.business_id = '10000000-0000-4000-8000-000000000001' and i.name_ru = 'Стаканы 400 мл с крышкой'
  on conflict (supply_item_id, source, external_id) where external_id is not null do update
  set title = excluded.title, price_minor = excluded.price_minor, pack_size = excluded.pack_size, url = excluded.url, found_at = now();
insert into public.supply_offers(business_id, supply_item_id, supplier, title, price_minor, pack_size, url, external_id, source, verified, is_mock)
  select '10000000-0000-4000-8000-000000000001', i.id, 'Kaspi.kz', 'Стакан бумажный однослойный, черный, 400 мл, 1000 шт', 22499, 1000, 'https://kaspi.kz/p/stakan-bumazhnyi-odnosloinyi-chernyi-400-ml-1000-sht-135570355/?c=750000000', '135570355', 'web', false, true
  from public.supply_items i where i.business_id = '10000000-0000-4000-8000-000000000001' and i.name_ru = 'Стаканы 400 мл с крышкой'
  on conflict (supply_item_id, source, external_id) where external_id is not null do update
  set title = excluded.title, price_minor = excluded.price_minor, pack_size = excluded.pack_size, url = excluded.url, found_at = now();
insert into public.supply_offers(business_id, supply_item_id, supplier, title, price_minor, pack_size, url, external_id, source, verified, is_mock)
  select '10000000-0000-4000-8000-000000000001', i.id, 'Kaspi.kz', 'Стакан бумажный однослойный, белый, 400 мл, 1000 шт', 26700, 1000, 'https://kaspi.kz/p/stakan-bumazhnyi-odnosloinyi-belyi-400-ml-1000-sht-134636060/?c=750000000', '134636060', 'web', false, true
  from public.supply_items i where i.business_id = '10000000-0000-4000-8000-000000000001' and i.name_ru = 'Стаканы 400 мл с крышкой'
  on conflict (supply_item_id, source, external_id) where external_id is not null do update
  set title = excluded.title, price_minor = excluded.price_minor, pack_size = excluded.pack_size, url = excluded.url, found_at = now();
insert into public.supply_offers(business_id, supply_item_id, supplier, title, price_minor, pack_size, url, external_id, source, verified, is_mock)
  select '10000000-0000-4000-8000-000000000001', i.id, 'Kaspi.kz', 'Стакан бумажный однослойный БЕЛЫЙ 400 мл (100 шт)', 3000, 100, 'https://kaspi.kz/p/stakan-bumazhnyi-odnosloinyi-belyi-400-ml-100-sht--145398798/?c=750000000', '145398798', 'web', false, true
  from public.supply_items i where i.business_id = '10000000-0000-4000-8000-000000000001' and i.name_ru = 'Стаканы 400 мл с крышкой'
  on conflict (supply_item_id, source, external_id) where external_id is not null do update
  set title = excluded.title, price_minor = excluded.price_minor, pack_size = excluded.pack_size, url = excluded.url, found_at = now();
insert into public.supply_offers(business_id, supply_item_id, supplier, title, price_minor, pack_size, url, external_id, source, verified, is_mock)
  select '10000000-0000-4000-8000-000000000001', i.id, 'Kaspi.kz', 'Стакан бумажный однослойный БЕЛЫЙ 400 мл (50 шт)', 1606, 50, 'https://kaspi.kz/p/stakan-bumazhnyi-odnosloinyi-belyi-400-ml-50-sht--164103479/?c=750000000', '164103479', 'web', false, true
  from public.supply_items i where i.business_id = '10000000-0000-4000-8000-000000000001' and i.name_ru = 'Стаканы 400 мл с крышкой'
  on conflict (supply_item_id, source, external_id) where external_id is not null do update
  set title = excluded.title, price_minor = excluded.price_minor, pack_size = excluded.pack_size, url = excluded.url, found_at = now();
insert into public.supply_search_runs(business_id, supply_item_id, source, query, status, http_status, offers_found, is_mock)
  select '10000000-0000-4000-8000-000000000001', i.id, 'kaspi', 'стаканы бумажные 400 мл', 'ok', 200, 5, true
  from public.supply_items i where i.business_id = '10000000-0000-4000-8000-000000000001' and i.name_ru = 'Стаканы 400 мл с крышкой';

-- Зерно арабика 1 кг · запрос «кофе в зернах арабика 1 кг» · ok
update public.supply_items set search_query = 'кофе в зернах арабика 1 кг'
  where business_id = '10000000-0000-4000-8000-000000000001' and name_ru = 'Зерно арабика 1 кг';
insert into public.supply_offers(business_id, supply_item_id, supplier, title, price_minor, pack_size, url, external_id, source, verified, is_mock)
  select '10000000-0000-4000-8000-000000000001', i.id, 'Kaspi.kz', 'Кофе Compass Бразилия бленд (арабика 100%) зерновой 1000 г', 11600, 1, 'https://kaspi.kz/p/kofe-compass-brazilija-blend-arabika-100-zernovoi-1000-g-110146304/?c=750000000', '110146304', 'web', false, true
  from public.supply_items i where i.business_id = '10000000-0000-4000-8000-000000000001' and i.name_ru = 'Зерно арабика 1 кг'
  on conflict (supply_item_id, source, external_id) where external_id is not null do update
  set title = excluded.title, price_minor = excluded.price_minor, pack_size = excluded.pack_size, url = excluded.url, found_at = now();
insert into public.supply_offers(business_id, supply_item_id, supplier, title, price_minor, pack_size, url, external_id, source, verified, is_mock)
  select '10000000-0000-4000-8000-000000000001', i.id, 'Kaspi.kz', 'Кофе Fresco Arabica Blend зерновой в пакете 1 кг', 11650, 1, 'https://kaspi.kz/p/kofe-fresco-arabica-blend-zernovoi-v-pakete-1-kg-101783964/?c=750000000', '101783964', 'web', false, true
  from public.supply_items i where i.business_id = '10000000-0000-4000-8000-000000000001' and i.name_ru = 'Зерно арабика 1 кг'
  on conflict (supply_item_id, source, external_id) where external_id is not null do update
  set title = excluded.title, price_minor = excluded.price_minor, pack_size = excluded.pack_size, url = excluded.url, found_at = now();
insert into public.supply_offers(business_id, supply_item_id, supplier, title, price_minor, pack_size, url, external_id, source, verified, is_mock)
  select '10000000-0000-4000-8000-000000000001', i.id, 'Kaspi.kz', 'Кофе Compass Caribbean Blend (арабика 100%) зерновой 1000 г', 11900, 1, 'https://kaspi.kz/p/kofe-compass-caribbean-blend-arabika-100-zernovoi-1000-g-117382525/?c=750000000', '117382525', 'web', false, true
  from public.supply_items i where i.business_id = '10000000-0000-4000-8000-000000000001' and i.name_ru = 'Зерно арабика 1 кг'
  on conflict (supply_item_id, source, external_id) where external_id is not null do update
  set title = excluded.title, price_minor = excluded.price_minor, pack_size = excluded.pack_size, url = excluded.url, found_at = now();
insert into public.supply_offers(business_id, supply_item_id, supplier, title, price_minor, pack_size, url, external_id, source, verified, is_mock)
  select '10000000-0000-4000-8000-000000000001', i.id, 'Kaspi.kz', 'Кофе Московская йня на паяхъ Арабика в зёрнах 1000 г', 16150, 1, 'https://kaspi.kz/p/kofe-moskovskaja-inja-na-pajah-arabika-v-zjornah-1000-g-102713890/?c=750000000', '102713890', 'web', false, true
  from public.supply_items i where i.business_id = '10000000-0000-4000-8000-000000000001' and i.name_ru = 'Зерно арабика 1 кг'
  on conflict (supply_item_id, source, external_id) where external_id is not null do update
  set title = excluded.title, price_minor = excluded.price_minor, pack_size = excluded.pack_size, url = excluded.url, found_at = now();
insert into public.supply_offers(business_id, supply_item_id, supplier, title, price_minor, pack_size, url, external_id, source, verified, is_mock)
  select '10000000-0000-4000-8000-000000000001', i.id, 'Kaspi.kz', 'Кофе Guten berg Баунти зерновой ароматизированный в пакете 1 кг', 19275, 1, 'https://kaspi.kz/p/kofe-guten-berg-baunti-zernovoi-aromatizirovannyi-v-pakete-1-kg-102935565/?c=750000000', '102935565', 'web', false, true
  from public.supply_items i where i.business_id = '10000000-0000-4000-8000-000000000001' and i.name_ru = 'Зерно арабика 1 кг'
  on conflict (supply_item_id, source, external_id) where external_id is not null do update
  set title = excluded.title, price_minor = excluded.price_minor, pack_size = excluded.pack_size, url = excluded.url, found_at = now();
insert into public.supply_search_runs(business_id, supply_item_id, source, query, status, http_status, offers_found, is_mock)
  select '10000000-0000-4000-8000-000000000001', i.id, 'kaspi', 'кофе в зернах арабика 1 кг', 'ok', 200, 5, true
  from public.supply_items i where i.business_id = '10000000-0000-4000-8000-000000000001' and i.name_ru = 'Зерно арабика 1 кг';

-- Молоко 3,2% 1 л · запрос «молоко 3.2 1 литр» · ok
update public.supply_items set search_query = 'молоко 3.2 1 литр'
  where business_id = '10000000-0000-4000-8000-000000000001' and name_ru = 'Молоко 3,2% 1 л';
insert into public.supply_offers(business_id, supply_item_id, supplier, title, price_minor, pack_size, url, external_id, source, verified, is_mock)
  select '10000000-0000-4000-8000-000000000001', i.id, 'Kaspi.kz', 'Adal молоко 2.5% 925 мл', 700, 1, 'https://kaspi.kz/p/adal-moloko-2-5-925-ml-100223089/?c=750000000', '100223089', 'web', false, true
  from public.supply_items i where i.business_id = '10000000-0000-4000-8000-000000000001' and i.name_ru = 'Молоко 3,2% 1 л'
  on conflict (supply_item_id, source, external_id) where external_id is not null do update
  set title = excluded.title, price_minor = excluded.price_minor, pack_size = excluded.pack_size, url = excluded.url, found_at = now();
insert into public.supply_offers(business_id, supply_item_id, supplier, title, price_minor, pack_size, url, external_id, source, verified, is_mock)
  select '10000000-0000-4000-8000-000000000001', i.id, 'Kaspi.kz', 'Глубокое молоко 8.6% 300 г', 720, 1, 'https://kaspi.kz/p/glubokoe-moloko-8-6-300-g-104829981/?c=750000000', '104829981', 'web', false, true
  from public.supply_items i where i.business_id = '10000000-0000-4000-8000-000000000001' and i.name_ru = 'Молоко 3,2% 1 л'
  on conflict (supply_item_id, source, external_id) where external_id is not null do update
  set title = excluded.title, price_minor = excluded.price_minor, pack_size = excluded.pack_size, url = excluded.url, found_at = now();
insert into public.supply_offers(business_id, supply_item_id, supplier, title, price_minor, pack_size, url, external_id, source, verified, is_mock)
  select '10000000-0000-4000-8000-000000000001', i.id, 'Kaspi.kz', 'AROY-D кокосовое молоко 19% 250 мл', 1000, 1, 'https://kaspi.kz/p/aroy-d-kokosovoe-moloko-19-250-ml-100939950/?c=750000000', '100939950', 'web', false, true
  from public.supply_items i where i.business_id = '10000000-0000-4000-8000-000000000001' and i.name_ru = 'Молоко 3,2% 1 л'
  on conflict (supply_item_id, source, external_id) where external_id is not null do update
  set title = excluded.title, price_minor = excluded.price_minor, pack_size = excluded.pack_size, url = excluded.url, found_at = now();
insert into public.supply_offers(business_id, supply_item_id, supplier, title, price_minor, pack_size, url, external_id, source, verified, is_mock)
  select '10000000-0000-4000-8000-000000000001', i.id, 'Kaspi.kz', 'Молочный Мир молоко 3.2% 925 мл', 1081, 1, 'https://kaspi.kz/p/molochnyi-mir-moloko-3-2-925-ml-172036691/?c=750000000', '172036691', 'web', false, true
  from public.supply_items i where i.business_id = '10000000-0000-4000-8000-000000000001' and i.name_ru = 'Молоко 3,2% 1 л'
  on conflict (supply_item_id, source, external_id) where external_id is not null do update
  set title = excluded.title, price_minor = excluded.price_minor, pack_size = excluded.pack_size, url = excluded.url, found_at = now();
insert into public.supply_offers(business_id, supply_item_id, supplier, title, price_minor, pack_size, url, external_id, source, verified, is_mock)
  select '10000000-0000-4000-8000-000000000001', i.id, 'Kaspi.kz', 'AROY-D Кокосовое молоко 400 мл', 1450, 1, 'https://kaspi.kz/p/aroy-d-kokosovoe-moloko-400-ml-101227143/?c=750000000', '101227143', 'web', false, true
  from public.supply_items i where i.business_id = '10000000-0000-4000-8000-000000000001' and i.name_ru = 'Молоко 3,2% 1 л'
  on conflict (supply_item_id, source, external_id) where external_id is not null do update
  set title = excluded.title, price_minor = excluded.price_minor, pack_size = excluded.pack_size, url = excluded.url, found_at = now();
insert into public.supply_search_runs(business_id, supply_item_id, source, query, status, http_status, offers_found, is_mock)
  select '10000000-0000-4000-8000-000000000001', i.id, 'kaspi', 'молоко 3.2 1 литр', 'ok', 200, 5, true
  from public.supply_items i where i.business_id = '10000000-0000-4000-8000-000000000001' and i.name_ru = 'Молоко 3,2% 1 л';

-- Сироп карамель 1 л · запрос «сироп карамель 1 л для кофе» · ok
update public.supply_items set search_query = 'сироп карамель 1 л для кофе'
  where business_id = '10000000-0000-4000-8000-000000000001' and name_ru = 'Сироп карамель 1 л';
insert into public.supply_offers(business_id, supply_item_id, supplier, title, price_minor, pack_size, url, external_id, source, verified, is_mock)
  select '10000000-0000-4000-8000-000000000001', i.id, 'Kaspi.kz', 'Bar Bar сироп соленая карамель 1000 мл', 1800, 1, 'https://kaspi.kz/p/bar-bar-sirop-solenaja-karamel-1000-ml-117903033/?c=750000000', '117903033', 'web', false, true
  from public.supply_items i where i.business_id = '10000000-0000-4000-8000-000000000001' and i.name_ru = 'Сироп карамель 1 л'
  on conflict (supply_item_id, source, external_id) where external_id is not null do update
  set title = excluded.title, price_minor = excluded.price_minor, pack_size = excluded.pack_size, url = excluded.url, found_at = now();
insert into public.supply_offers(business_id, supply_item_id, supplier, title, price_minor, pack_size, url, external_id, source, verified, is_mock)
  select '10000000-0000-4000-8000-000000000001', i.id, 'Kaspi.kz', 'Bar Bar сироп карамель 1000 мл', 1800, 1, 'https://kaspi.kz/p/bar-bar-sirop-karamel-1000-ml-117903122/?c=750000000', '117903122', 'web', false, true
  from public.supply_items i where i.business_id = '10000000-0000-4000-8000-000000000001' and i.name_ru = 'Сироп карамель 1 л'
  on conflict (supply_item_id, source, external_id) where external_id is not null do update
  set title = excluded.title, price_minor = excluded.price_minor, pack_size = excluded.pack_size, url = excluded.url, found_at = now();
insert into public.supply_offers(business_id, supply_item_id, supplier, title, price_minor, pack_size, url, external_id, source, verified, is_mock)
  select '10000000-0000-4000-8000-000000000001', i.id, 'Kaspi.kz', 'Barbados сироп соленая карамель 1000 мл', 2250, 1, 'https://kaspi.kz/p/barbados-sirop-solenaja-karamel-1000-ml-101363698/?c=750000000', '101363698', 'web', false, true
  from public.supply_items i where i.business_id = '10000000-0000-4000-8000-000000000001' and i.name_ru = 'Сироп карамель 1 л'
  on conflict (supply_item_id, source, external_id) where external_id is not null do update
  set title = excluded.title, price_minor = excluded.price_minor, pack_size = excluded.pack_size, url = excluded.url, found_at = now();
insert into public.supply_offers(business_id, supply_item_id, supplier, title, price_minor, pack_size, url, external_id, source, verified, is_mock)
  select '10000000-0000-4000-8000-000000000001', i.id, 'Kaspi.kz', 'Barbados сироп карамель 1000 мл', 2250, 1, 'https://kaspi.kz/p/barbados-sirop-karamel-1000-ml-101171270/?c=750000000', '101171270', 'web', false, true
  from public.supply_items i where i.business_id = '10000000-0000-4000-8000-000000000001' and i.name_ru = 'Сироп карамель 1 л'
  on conflict (supply_item_id, source, external_id) where external_id is not null do update
  set title = excluded.title, price_minor = excluded.price_minor, pack_size = excluded.pack_size, url = excluded.url, found_at = now();
insert into public.supply_offers(business_id, supply_item_id, supplier, title, price_minor, pack_size, url, external_id, source, verified, is_mock)
  select '10000000-0000-4000-8000-000000000001', i.id, 'Kaspi.kz', 'Master Coffee сироп соленая карамель 1000 мл', 2290, 1, 'https://kaspi.kz/p/master-coffee-sirop-solenaja-karamel-1000-ml-109758356/?c=750000000', '109758356', 'web', false, true
  from public.supply_items i where i.business_id = '10000000-0000-4000-8000-000000000001' and i.name_ru = 'Сироп карамель 1 л'
  on conflict (supply_item_id, source, external_id) where external_id is not null do update
  set title = excluded.title, price_minor = excluded.price_minor, pack_size = excluded.pack_size, url = excluded.url, found_at = now();
insert into public.supply_search_runs(business_id, supply_item_id, source, query, status, http_status, offers_found, is_mock)
  select '10000000-0000-4000-8000-000000000001', i.id, 'kaspi', 'сироп карамель 1 л для кофе', 'ok', 200, 5, true
  from public.supply_items i where i.business_id = '10000000-0000-4000-8000-000000000001' and i.name_ru = 'Сироп карамель 1 л';

-- Салфетки барные · запрос «салфетки бумажные диспенсерные» · ok
update public.supply_items set search_query = 'салфетки бумажные диспенсерные'
  where business_id = '10000000-0000-4000-8000-000000000001' and name_ru = 'Салфетки барные';
insert into public.supply_offers(business_id, supply_item_id, supplier, title, price_minor, pack_size, url, external_id, source, verified, is_mock)
  select '10000000-0000-4000-8000-000000000001', i.id, 'Kaspi.kz', 'Салфетки Chistodeloff Для диспенсера Z-укладка 200 шт', 474, 200, 'https://kaspi.kz/p/salfetki-chistodeloff-dlja-dispensera-z-ukladka-200-sht-101186170/?c=750000000', '101186170', 'web', false, true
  from public.supply_items i where i.business_id = '10000000-0000-4000-8000-000000000001' and i.name_ru = 'Салфетки барные'
  on conflict (supply_item_id, source, external_id) where external_id is not null do update
  set title = excluded.title, price_minor = excluded.price_minor, pack_size = excluded.pack_size, url = excluded.url, found_at = now();
insert into public.supply_offers(business_id, supply_item_id, supplier, title, price_minor, pack_size, url, external_id, source, verified, is_mock)
  select '10000000-0000-4000-8000-000000000001', i.id, 'Kaspi.kz', 'Салфетки Chistodeloff Для диспенсера 200 шт', 501, 200, 'https://kaspi.kz/p/salfetki-chistodeloff-dlja-dispensera-200-sht-101186187/?c=750000000', '101186187', 'web', false, true
  from public.supply_items i where i.business_id = '10000000-0000-4000-8000-000000000001' and i.name_ru = 'Салфетки барные'
  on conflict (supply_item_id, source, external_id) where external_id is not null do update
  set title = excluded.title, price_minor = excluded.price_minor, pack_size = excluded.pack_size, url = excluded.url, found_at = now();
insert into public.supply_offers(business_id, supply_item_id, supplier, title, price_minor, pack_size, url, external_id, source, verified, is_mock)
  select '10000000-0000-4000-8000-000000000001', i.id, 'Kaspi.kz', 'Бумажные салфетки Салфетки бумажные двухслойные для диспенсера 1600 шт 1 шт', 19190, 1600, 'https://kaspi.kz/p/bumazhnye-salfetki-salfetki-bumazhnye-dvuhsloinye-dlja-dispensera-1600-sht-1-sht-172792628/?c=750000000', '172792628', 'web', false, true
  from public.supply_items i where i.business_id = '10000000-0000-4000-8000-000000000001' and i.name_ru = 'Салфетки барные'
  on conflict (supply_item_id, source, external_id) where external_id is not null do update
  set title = excluded.title, price_minor = excluded.price_minor, pack_size = excluded.pack_size, url = excluded.url, found_at = now();
insert into public.supply_offers(business_id, supply_item_id, supplier, title, price_minor, pack_size, url, external_id, source, verified, is_mock)
  select '10000000-0000-4000-8000-000000000001', i.id, 'Kaspi.kz', 'Бумажные салфетки Dala kent Диспенсерные салфетки 36200 200 шт', 7990, 200, 'https://kaspi.kz/p/bumazhnye-salfetki-dala-kent-dispensernye-salfetki-36200-200-sht-160585557/?c=750000000', '160585557', 'web', false, true
  from public.supply_items i where i.business_id = '10000000-0000-4000-8000-000000000001' and i.name_ru = 'Салфетки барные'
  on conflict (supply_item_id, source, external_id) where external_id is not null do update
  set title = excluded.title, price_minor = excluded.price_minor, pack_size = excluded.pack_size, url = excluded.url, found_at = now();
insert into public.supply_offers(business_id, supply_item_id, supplier, title, price_minor, pack_size, url, external_id, source, verified, is_mock)
  select '10000000-0000-4000-8000-000000000001', i.id, 'Kaspi.kz', 'Бумажные салфетки для диспенсера 200 шт (36 пачек/1 коробка)', 8186, 200, 'https://kaspi.kz/p/bumazhnye-salfetki-dlja-dispensera-200-sht-36-pachek-1-korobka--142220249/?c=750000000', '142220249', 'web', false, true
  from public.supply_items i where i.business_id = '10000000-0000-4000-8000-000000000001' and i.name_ru = 'Салфетки барные'
  on conflict (supply_item_id, source, external_id) where external_id is not null do update
  set title = excluded.title, price_minor = excluded.price_minor, pack_size = excluded.pack_size, url = excluded.url, found_at = now();
insert into public.supply_search_runs(business_id, supply_item_id, source, query, status, http_status, offers_found, is_mock)
  select '10000000-0000-4000-8000-000000000001', i.id, 'kaspi', 'салфетки бумажные диспенсерные', 'ok', 200, 5, true
  from public.supply_items i where i.business_id = '10000000-0000-4000-8000-000000000001' and i.name_ru = 'Салфетки барные';

commit;
