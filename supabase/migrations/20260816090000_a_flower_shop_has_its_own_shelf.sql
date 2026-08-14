begin;

-- Платформа перестаёт быть справочником вообще и становится справочником для
-- цветочного магазина.
--
-- До этой миграции всё, что администратор мог настроить, было маркетинговым:
-- категории инструментов, шаблоны кампаний, типы заведений «кофейня, салон,
-- магазин». Цветочному магазину нужно другое: какие бывают категории цветов,
-- сколько дней стоит каждая, при каком запасе пора заказывать и какой набор
-- инструментов включается новому магазину в первый день.
--
-- Всё это платформенные справочники, а не данные заведения: они одинаковы для
-- всех магазинов и меняются администратором. Поэтому здесь нет business_id, и
-- по той же причине здесь нет RLS по арендатору — вместо неё чтение открыто
-- опубликованным строкам, а запись закрыта на роль платформы.

-- ---------------------------------------------------------------------------
-- Категории цветов
-- ---------------------------------------------------------------------------

-- Заведение называет позицию своими словами: у одного «пионы», у другого
-- «сезонные». Платформенная категория группирует эти слова, чтобы политика
-- хранения и правило автозаказа находили позицию независимо от того, как её
-- назвал владелец. Отсюда `aliases`: без них справочник пришлось бы навязывать
-- заведению переименованием его собственного ассортимента.
create table public.flower_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_]{1,63}$'),
  name_ru text not null,
  name_kk text not null,
  aliases text[] not null default '{}',
  sort_order integer not null default 0,
  status text not null default 'published' check (status in ('draft','published','archived')),
  is_mock boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.flower_categories is
 'Платформенный список категорий цветов. Заведение выбирает из него при регистрации.';
comment on column public.flower_categories.aliases is
 'Как заведения называют эту категорию у себя: «пионы» попадает в «сезонные цветы».';

-- ---------------------------------------------------------------------------
-- Шаблоны товарной политики
-- ---------------------------------------------------------------------------

-- Роза стоит пять дней, пион три, а упаковочная бумага не портится вовсе. Одна
-- и та же ошибка закупки стоит по-разному именно из-за этой разницы, поэтому
-- сроки — не украшение карточки, а вход в расчёт риска списания.
--
-- Шаблон даёт новому магазину отраслевое предположение вместо пустого поля.
-- Значение помечено как отраслевое до тех пор, пока у заведения не накопится
-- собственная история: подставленное число и измеренное — не одно и то же.
create table public.product_policy_templates (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.flower_categories(id) on delete cascade,
  shelf_life_days integer check (shelf_life_days is null or shelf_life_days between 1 and 365),
  pack_size_milli bigint not null default 1000 check (pack_size_milli > 0),
  moq_milli bigint not null default 0 check (moq_milli >= 0),
  lead_time_p80_hours integer not null default 48 check (lead_time_p80_hours between 1 and 720),
  criticality text not null default 'normal' check (criticality in ('critical','normal','optional')),
  spoilage_tolerance_bps integer not null default 500 check (spoilage_tolerance_bps between 0 and 10000),
  unit text not null default 'стебель',
  status text not null default 'published' check (status in ('draft','published','archived')),
  is_mock boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category_id)
);

comment on table public.product_policy_templates is
 'Отраслевые значения по умолчанию: срок свежести, кратность, минимальная партия и допустимая доля списания.';
comment on column public.product_policy_templates.shelf_life_days is
 'Пусто означает «не портится» — упаковка и лента, а не «неизвестно».';

-- ---------------------------------------------------------------------------
-- Шаблоны правил автозаказа
-- ---------------------------------------------------------------------------

-- Правило платформы не отправляет заказ. Оно решает, когда позиция попадает в
-- очередь решений и на сколько дней покрытия считать объём. Отправляет заказ
-- владелец — и это разделение здесь выражено тем, что у правила нет и не может
-- быть поля «отправить».
create table public.auto_order_rule_templates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_]{1,63}$'),
  name_ru text not null,
  description_ru text not null,
  business_type_codes text[] not null default '{}',
  category_code text,
  trigger text not null check (trigger in ('time_to_stockout','reorder_point','holiday_lift','spoilage_risk')),
  threshold_hours integer check (threshold_hours is null or threshold_hours between 1 and 720),
  cover_days integer not null default 3 check (cover_days between 1 and 60),
  round_to_pack boolean not null default true,
  status text not null default 'published' check (status in ('draft','published','archived')),
  is_mock boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.auto_order_rule_templates is
 'Когда позиция попадает в очередь решений и на сколько дней считать покрытие. Заказ всё равно подтверждает владелец.';

-- ---------------------------------------------------------------------------
-- Наборы инструментов
-- ---------------------------------------------------------------------------

-- Набор отвечает на вопрос первого дня: с чего начать. Без него новый магазин
-- получает каталог из девяти карточек и одинаковую растерянность перед каждой.
create table public.tool_bundles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_]{1,63}$'),
  name_ru text not null,
  description_ru text not null,
  business_type_id uuid references public.business_types(id) on delete set null,
  status text not null default 'published' check (status in ('draft','published','archived')),
  is_mock boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tool_bundle_items (
  id uuid primary key default gen_random_uuid(),
  bundle_id uuid not null references public.tool_bundles(id) on delete cascade,
  tool_id uuid not null references public.tools(id) on delete cascade,
  sort_order integer not null default 0,
  is_mock boolean not null default false,
  created_at timestamptz not null default now(),
  unique (bundle_id, tool_id)
);

comment on table public.tool_bundles is
 'Набор инструментов, который включается заведению выбранного типа в первый день.';

-- ---------------------------------------------------------------------------
-- Профиль цветочного магазина
-- ---------------------------------------------------------------------------

-- То, что владелец сказал о себе при регистрации. Хранится отдельно от черновика
-- онбординга: черновик — это незавершённая форма, которую можно бросить, а
-- профиль — действующая настройка, по которой подбираются инструменты, правила
-- и пороги. Смешивать их означало бы читать настройки продукта из брошенной
-- на середине анкеты.
create table public.business_flower_profiles (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses(id) on delete cascade,
  shop_kind text not null default 'single' check (shop_kind in ('single','chain')),
  city text not null default 'Алматы',
  district text,
  location_count integer not null default 1 check (location_count between 1 and 200),
  -- Коды из public.flower_categories. Массив, а не отдельная таблица связей:
  -- список короткий, меняется целиком одной формой и никогда не соединяется.
  category_codes text[] not null default '{}',
  holiday_codes text[] not null default '{}',
  supplier_names text[] not null default '{}',
  -- Сколько владелец готов списывать. Ниже этой доли риск не поднимает тревогу:
  -- цветочный магазин без списаний вовсе — это магазин с пустой витриной.
  spoilage_tolerance_bps integer not null default 800 check (spoilage_tolerance_bps between 0 and 10000),
  is_mock boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.business_flower_profiles is
 'Что владелец сказал о своём магазине при регистрации: категории, праздники, поставщики и допустимая доля списаний.';
comment on column public.business_flower_profiles.spoilage_tolerance_bps is
 'Допустимая доля списаний. Ноль недостижим: магазин без списаний — это магазин с пустой витриной.';

alter table public.business_flower_profiles enable row level security;

create policy business_flower_profiles_member_select on public.business_flower_profiles for select to authenticated
 using ((select private.has_business_role(business_id, array['owner','manager','marketer','analyst','viewer'])));
create policy business_flower_profiles_member_insert on public.business_flower_profiles for insert to authenticated
 with check ((select private.has_business_role(business_id, array['owner','manager'])));
create policy business_flower_profiles_member_update on public.business_flower_profiles for update to authenticated
 using ((select private.has_business_role(business_id, array['owner','manager'])))
 with check ((select private.has_business_role(business_id, array['owner','manager'])));

grant select, insert, update on public.business_flower_profiles to authenticated;

create index business_flower_profiles_business_idx on public.business_flower_profiles(business_id);

-- business_id is immutable: смена арендатора у существующей строки — это не
-- правка, а перенос чужих настроек, и он должен выглядеть как новая строка.
create trigger business_flower_profiles_mock_tenant_guard
  before insert or update on public.business_flower_profiles
  for each row execute function private.enforce_mock_tenant();
create trigger business_flower_profiles_immutable_business
  before update on public.business_flower_profiles
  for each row execute function private.prevent_business_id_change();

-- Внешние ключи без индекса — это отложенная блокировка при удалении родителя
-- и последовательное сканирование при каждом соединении.
create index flower_categories_status_idx on public.flower_categories(status, sort_order);
create index product_policy_templates_category_idx on public.product_policy_templates(category_id);
create index auto_order_rule_templates_status_idx on public.auto_order_rule_templates(status, trigger);
create index tool_bundles_business_type_idx on public.tool_bundles(business_type_id);
create index tool_bundle_items_bundle_idx on public.tool_bundle_items(bundle_id);
create index tool_bundle_items_tool_idx on public.tool_bundle_items(tool_id);

-- ---------------------------------------------------------------------------
-- Доступ
-- ---------------------------------------------------------------------------

alter table public.flower_categories enable row level security;
alter table public.product_policy_templates enable row level security;
alter table public.auto_order_rule_templates enable row level security;
alter table public.tool_bundles enable row level security;
alter table public.tool_bundle_items enable row level security;

-- Опубликованное видно всем, черновики — только администратору платформы.
-- Тот же порядок, что у tool_categories и tools: справочник читают в том числе
-- с публичных страниц, поэтому anon тоже получает опубликованные строки.
do $$
declare t text;
begin
  foreach t in array array['flower_categories','product_policy_templates','auto_order_rule_templates','tool_bundles'] loop
    execute format(
      'create policy %I on public.%I for select to anon using (status = ''published'')',
      t || '_anon_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (status = ''published'' or (select private.is_platform_admin(array[''platform_admin'',''platform_editor'',''platform_analyst''])))',
      t || '_authenticated_select', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select private.is_platform_admin(array[''platform_admin'',''platform_editor''])))',
      t || '_platform_admin_insert', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select private.is_platform_admin(array[''platform_admin'',''platform_editor'']))) with check ((select private.is_platform_admin(array[''platform_admin'',''platform_editor''])))',
      t || '_platform_admin_update', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select private.is_platform_admin(array[''platform_admin'',''platform_editor''])))',
      t || '_platform_admin_delete', t);
  end loop;
end $$;

-- У позиции набора нет собственного статуса: она видна ровно тогда, когда виден
-- сам набор. Дублировать статус означало бы завести вторую правду о том,
-- опубликован набор или нет.
create policy tool_bundle_items_anon_select on public.tool_bundle_items for select to anon
 using (exists (select 1 from public.tool_bundles b where b.id = bundle_id and b.status = 'published'));
create policy tool_bundle_items_authenticated_select on public.tool_bundle_items for select to authenticated
 using (
   exists (select 1 from public.tool_bundles b where b.id = bundle_id and b.status = 'published')
   or (select private.is_platform_admin(array['platform_admin','platform_editor','platform_analyst']))
 );
create policy tool_bundle_items_platform_admin_insert on public.tool_bundle_items for insert to authenticated
 with check ((select private.is_platform_admin(array['platform_admin','platform_editor'])));
create policy tool_bundle_items_platform_admin_update on public.tool_bundle_items for update to authenticated
 using ((select private.is_platform_admin(array['platform_admin','platform_editor'])))
 with check ((select private.is_platform_admin(array['platform_admin','platform_editor'])));
create policy tool_bundle_items_platform_admin_delete on public.tool_bundle_items for delete to authenticated
 using ((select private.is_platform_admin(array['platform_admin','platform_editor'])));

-- Те же права, что у остальных таблиц схемы: строки решает политика, а не грант.
grant select, insert, update, delete on public.flower_categories to authenticated;
grant select, insert, update, delete on public.product_policy_templates to authenticated;
grant select, insert, update, delete on public.auto_order_rule_templates to authenticated;
grant select, insert, update, delete on public.tool_bundles to authenticated;
grant select, insert, update, delete on public.tool_bundle_items to authenticated;
grant select on public.flower_categories to anon;
grant select on public.product_policy_templates to anon;
grant select on public.auto_order_rule_templates to anon;
grant select on public.tool_bundles to anon;
grant select on public.tool_bundle_items to anon;

revoke truncate, trigger, references on all tables in schema public from anon, authenticated;

-- Метка времени обновления должна ставиться базой. Значение, которое пишет
-- приложение, врёт при любой правке в обход приложения — а именно такие правки
-- и интересно потом искать.
do $$
declare t text;
begin
  foreach t in array array[
    'flower_categories','product_policy_templates','auto_order_rule_templates',
    'tool_bundles','business_flower_profiles'
  ] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function private.set_updated_at()',
      t || '_set_updated_at', t);
  end loop;
end $$;

commit;
