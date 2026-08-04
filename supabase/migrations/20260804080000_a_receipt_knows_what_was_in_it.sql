-- Позиция чека получает категорию, а чек — связь с меню.
--
-- Карточка клиента обещала «AI-досье», а показывала пересказ четырёх чисел,
-- которые и так стоят у гостя в шапке: визиты, сумма, средний чек, дата.
-- Причина не в модели: в `loadCustomerBriefInput` поле `favouriteItems` было
-- захардкожено пустым списком с честным комментарием «item-level history is not
-- modelled per customer yet». Модели просто нечего было сказать.
--
-- Чтобы сказать «берёт капучино и карамельный латте, а чизкейк перестал» нужны
-- две вещи, которых не было:
--   1) `transaction_items.catalog_item_id` — связь строки чека с позицией меню.
--      Колонка существовала и была NULL во всех 1129 строках демо-базы;
--   2) `catalog_items.category` — группа позиции. Без неё «какие категории
--      покупает регулярно» превращается в перечисление названий.
--
-- Категория намеренно свободный текст, а не перечисление: у кофейни это «кофе»
-- и «выпечка», у салона — «стрижки» и «уход», у стоматологии — «лечение» и
-- «профилактика». Продукт не должен решать за владельца, как называется то,
-- что он продаёт.

alter table public.catalog_items add column if not exists category text;

comment on column public.catalog_items.category is
  'Группа позиции глазами владельца: «кофе», «выпечка», «уход». Свободный текст: словарь категорий у каждого типа бизнеса свой. NULL означает «владелец не разложил меню по группам» — анализ тогда идёт по названиям позиций.';

create index if not exists catalog_items_business_category_idx
  on public.catalog_items (business_id, category) where category is not null;

-- Категории для демонстрационного меню TAMYR. Только для заведения-витрины и
-- только там, где позиция ещё не разложена: у настоящего заведения свои группы,
-- и переписывать их миграцией нельзя.
update public.catalog_items c set category = v.category
from (values
  ('espresso','кофе'), ('americano','кофе'), ('cappuccino','кофе'),
  ('latte','кофе'), ('raf','кофе'), ('flat_white','кофе'),
  ('tea','напитки'), ('lemonade','напитки'),
  ('croissant','выпечка'), ('almond_croissant','выпечка'), ('cinnamon_roll','выпечка'),
  ('cheesecake','десерты'),
  ('sandwich','еда'), ('porridge','еда')
) as v(sku, category)
where c.sku = v.sku and c.category is null
  and c.business_id = '10000000-0000-4000-8000-000000000001';

-- Строки чека, записанные до появления связи, привязываются к меню по названию.
-- Совпадение по имени — единственное, что у них есть; там, где имя не найдено,
-- строка остаётся без связи, и анализ честно опирается на текст названия.
update public.transaction_items ti set catalog_item_id = c.id
from public.catalog_items c
where ti.catalog_item_id is null
  and c.business_id = ti.business_id
  and c.name_ru = ti.item_name;
