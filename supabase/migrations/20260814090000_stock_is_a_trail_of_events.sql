begin;

-- Остаток как след событий, прогноз как проверяемый расчёт, риск как снимок.
--
-- Складская программа, где остаток можно переписать руками, отвечает только на
-- вопрос «сколько сейчас». Кто изменил, когда и почему разошлось с приёмкой —
-- на это ответить уже нельзя, и именно в этом месте у малого бизнеса ломается
-- доверие к собственным цифрам.
--
-- Поэтому остатка как редактируемого поля здесь нет. Есть журнал движений, в
-- котором каждая строка помнит автора, время, источник и ключ идемпотентности,
-- и есть материализованная сумма этого журнала, которую пишет только функция.
-- Прогноз и риск лежат снимками рядом: у каждого есть версия формулы и
-- измеренная ошибка, так что любое число на экране можно пересчитать руками.
--
-- Количества — в тысячных долях единицы (`_milli`), по той же причине, по
-- которой деньги хранятся в минорных единицах: 0.1 + 0.2 не должно давать
-- 0.30000000000000004 после трёхсот событий за месяц.

-- ---------------------------------------------------------------------------
-- Политика пополнения на существующей позиции
-- ---------------------------------------------------------------------------
--
-- `supply_items` уже описывает, что заведение покупает и почём. Не хватало
-- ровно того, из чего считается заказ: единицы измерения были, а упаковки,
-- минимальной партии, срока годности и точки перезаказа — нет.

alter table public.supply_items
  add column if not exists category text,
  add column if not exists pack_size_milli bigint not null default 1000
    check (pack_size_milli > 0),
  add column if not exists moq_milli bigint not null default 0
    check (moq_milli >= 0),
  add column if not exists shelf_life_days integer
    check (shelf_life_days is null or shelf_life_days > 0),
  -- Минимум, заданный владельцем вручную. Ноль означает «не задан»: тогда
  -- страховой запас считается из разброса расхода, а не берётся с потолка.
  add column if not exists min_stock_milli bigint not null default 0
    check (min_stock_milli >= 0),
  -- Срок, который поставщик выдерживает в 80% случаев. До первых поставок это
  -- предположение владельца, после — измеряется из истории приёмок.
  add column if not exists lead_time_p80_hours integer not null default 48
    check (lead_time_p80_hours between 0 and 8760),
  -- Уровень сервиса в тысячных: 1645 — это z = 1,645, то есть 95%. Настройка
  -- политики, а не измеренный факт, и на экране подписана именно так.
  add column if not exists service_level_z_milli integer not null default 1645
    check (service_level_z_milli between 0 and 4000);

comment on column public.supply_items.pack_size_milli is
 'Кратность заказа в тысячных единицы: заказать 2,3 коробки нельзя.';
comment on column public.supply_items.lead_time_p80_hours is
 'Срок поставки, который поставщик выдерживает в 80% случаев. Сравнивается со временем до дефицита.';
comment on column public.supply_items.service_level_z_milli is
 'Коэффициент уровня сервиса × 1000. Настройка политики, не измерение.';

-- ---------------------------------------------------------------------------
-- Журнал движений
-- ---------------------------------------------------------------------------

create table if not exists public.inventory_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid references public.business_locations(id) on delete set null,
  supply_item_id uuid not null references public.supply_items(id) on delete cascade,
  event_type text not null check (event_type in ('receive', 'consume', 'adjust', 'transfer_in', 'transfer_out')),
  -- Знаковая дельта: направление уже применено. Для `adjust` знак приходит от
  -- человека, для остальных типов — из самого типа.
  quantity_delta_milli bigint not null check (quantity_delta_milli <> 0),
  unit text not null default 'шт' check (char_length(unit) between 1 and 20),
  -- Откуда пришло движение. `messenger` отделён от `manual` намеренно: у
  -- сообщения из чата другой путь проверки и другая ответственность.
  source text not null default 'manual'
    check (source in ('manual', 'messenger', 'receiving', 'transfer', 'seed', 'import')),
  actor_id uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now(),
  note text,
  /**
   * Ключ, по которому повтор распознаётся и не применяется дважды. Повторная
   * отправка формы, ретрай вебхука и двойной клик дают один и тот же ключ.
   */
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 200),
  is_mock boolean not null default false,
  created_at timestamptz not null default now(),
  unique (business_id, idempotency_key)
);

comment on table public.inventory_events is
 'Append-only журнал движений товара. Остаток нигде не редактируется — он есть сумма этих строк.';

-- ---------------------------------------------------------------------------
-- Материализованный остаток
-- ---------------------------------------------------------------------------
--
-- Считать сумму журнала на каждый экран — значит с ростом истории замедлять
-- главный экран продукта. Поэтому сумма лежит рядом, но пишет её только
-- функция записи события, в той же транзакции.

create table if not exists public.inventory_balances (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid references public.business_locations(id) on delete cascade,
  supply_item_id uuid not null references public.supply_items(id) on delete cascade,
  on_hand_milli bigint not null default 0,
  /** Сколько уже заказано и едет. Уменьшает риск, но не остаток. */
  inbound_milli bigint not null default 0 check (inbound_milli >= 0),
  last_event_at timestamptz,
  /**
   * `location_id` бывает пустым у заведения без разделения по точкам, а
   * уникальность по nullable-колонке в SQL не работает: два NULL считаются
   * разными и пропустили бы дубликат остатка. Вычисляемый ключ подставляет
   * нулевой uuid вместо пустоты и делает уникальность настоящей — а заодно
   * позволяет обновлять остаток одним `on conflict`, без гонки между чтением
   * и записью.
   */
  location_key uuid generated always as (coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid)) stored,
  is_mock boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, supply_item_id, location_key)
);

comment on table public.inventory_balances is
 'Сумма журнала движений по позиции и точке. Пишется только функцией записи события.';

-- ---------------------------------------------------------------------------
-- Снимок прогноза
-- ---------------------------------------------------------------------------

create table if not exists public.demand_forecasts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid references public.business_locations(id) on delete cascade,
  supply_item_id uuid not null references public.supply_items(id) on delete cascade,
  computed_at timestamptz not null default now(),
  /** Дата, на которую построен прогноз. День недели берётся из неё. */
  target_date date not null,
  daily_forecast_milli bigint not null check (daily_forecast_milli >= 0),
  baseline_milli bigint not null check (baseline_milli >= 0),
  weekday_factor_ppm integer not null check (weekday_factor_ppm between 0 and 5000000),
  /** Ошибка на скользящем бэктесте. Null означает «ряд короче восьми дней». */
  wape_ppm integer check (wape_ppm is null or wape_ppm >= 0),
  confidence_ppm integer not null check (confidence_ppm between 0 and 1000000),
  sigma_daily_milli bigint not null default 0 check (sigma_daily_milli >= 0),
  sample_days smallint not null check (sample_days between 0 and 366),
  days_with_demand smallint not null check (days_with_demand >= 0),
  /** Версия формулы. Меняется вместе с расчётом — иначе старые снимки лгут. */
  model_version text not null,
  assumptions jsonb not null default '[]'::jsonb check (jsonb_typeof(assumptions) = 'array'),
  is_mock boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.demand_forecasts is
 'Снимок прогноза расхода с версией формулы, измеренной ошибкой и допущениями. Пересчитывается, а не правится.';

-- ---------------------------------------------------------------------------
-- Снимок риска
-- ---------------------------------------------------------------------------

create table if not exists public.supply_risks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid references public.business_locations(id) on delete cascade,
  supply_item_id uuid not null references public.supply_items(id) on delete cascade,
  forecast_id uuid references public.demand_forecasts(id) on delete set null,
  risk_type text not null default 'stockout' check (risk_type in ('stockout', 'excess', 'expiry')),
  level text not null check (level in ('critical', 'warning', 'watch')),
  detected_at timestamptz not null default now(),
  on_hand_milli bigint not null,
  inbound_milli bigint not null default 0,
  daily_forecast_milli bigint not null check (daily_forecast_milli >= 0),
  /** Часы до нуля. Null означает «нет достаточного расхода», а не бесконечность. */
  time_to_stockout_hours integer check (time_to_stockout_hours is null or time_to_stockout_hours >= 0),
  lead_time_p80_hours integer not null check (lead_time_p80_hours >= 0),
  coverage_gap_hours integer,
  safety_stock_milli bigint not null default 0 check (safety_stock_milli >= 0),
  reorder_point_milli bigint not null default 0 check (reorder_point_milli >= 0),
  shortfall_milli bigint not null default 0 check (shortfall_milli >= 0),
  confidence_ppm integer not null check (confidence_ppm between 0 and 1000000),
  reason text not null,
  model_version text not null,
  /** Источники, свежесть и допущения — то, что раскрывается по клику на число. */
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolved_at timestamptz,
  /** Тот же приём, что и у остатка: пустая точка не должна плодить дубликаты. */
  location_key uuid generated always as (coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid)) stored,
  is_mock boolean not null default false,
  created_at timestamptz not null default now()
);

-- Один открытый риск на позицию и точку: пересчёт обновляет его, а не плодит
-- новую строку каждую минуту. Закрытые риски остаются историей.
create unique index if not exists supply_risks_open_idx
  on public.supply_risks(business_id, supply_item_id, location_key, risk_type)
  where status = 'open';

comment on table public.supply_risks is
 'Открытый риск по позиции: время до нуля против срока поставки, с доказательствами и версией формулы.';

-- ---------------------------------------------------------------------------
-- Изоляция арендаторов
-- ---------------------------------------------------------------------------

alter table public.inventory_events enable row level security;
alter table public.inventory_balances enable row level security;
alter table public.demand_forecasts enable row level security;
alter table public.supply_risks enable row level security;

-- Читают все участники заведения, пишут те, кто отвечает за закупку.
create policy inventory_events_member_read on public.inventory_events
  for select to authenticated
  using (exists (select 1 from public.business_members bm where bm.business_id = inventory_events.business_id
                 and bm.user_id = (select auth.uid()) and bm.status = 'active'));
create policy inventory_events_member_write on public.inventory_events
  for insert to authenticated
  with check (exists (select 1 from public.business_members bm where bm.business_id = inventory_events.business_id
                      and bm.user_id = (select auth.uid()) and bm.status = 'active'
                      and bm.role in ('owner', 'manager', 'marketer')));

create policy inventory_balances_member_read on public.inventory_balances
  for select to authenticated
  using (exists (select 1 from public.business_members bm where bm.business_id = inventory_balances.business_id
                 and bm.user_id = (select auth.uid()) and bm.status = 'active'));

create policy demand_forecasts_member_read on public.demand_forecasts
  for select to authenticated
  using (exists (select 1 from public.business_members bm where bm.business_id = demand_forecasts.business_id
                 and bm.user_id = (select auth.uid()) and bm.status = 'active'));

create policy supply_risks_member_read on public.supply_risks
  for select to authenticated
  using (exists (select 1 from public.business_members bm where bm.business_id = supply_risks.business_id
                 and bm.user_id = (select auth.uid()) and bm.status = 'active'));

-- Баланс, прогноз и риск клиенту писать нечем: их считает сервер и пишут
-- функции. Права на запись выданы только служебной роли.
grant select, insert on table public.inventory_events to authenticated;
grant select on table public.inventory_balances to authenticated;
grant select on table public.demand_forecasts to authenticated;
grant select on table public.supply_risks to authenticated;

grant select, insert, update, delete on table public.inventory_events to service_role;
grant select, insert, update, delete on table public.inventory_balances to service_role;
grant select, insert, update, delete on table public.demand_forecasts to service_role;
grant select, insert, update, delete on table public.supply_risks to service_role;

create trigger inventory_events_business_id_immutable
  before update on public.inventory_events
  for each row execute function private.prevent_business_id_change();
create trigger inventory_events_mock_tenant_guard
  before insert or update on public.inventory_events
  for each row execute function private.enforce_mock_tenant();
-- Журнал движений исправляют новой строкой, а не правкой старой: иначе остаток
-- перестаёт быть воспроизводимым, а расхождение с полкой — объяснимым.
create trigger inventory_events_append_only
  before update or delete on public.inventory_events
  for each row execute function private.reject_append_only_change();

create trigger inventory_balances_business_id_immutable
  before update on public.inventory_balances
  for each row execute function private.prevent_business_id_change();
create trigger inventory_balances_mock_tenant_guard
  before insert or update on public.inventory_balances
  for each row execute function private.enforce_mock_tenant();

create trigger demand_forecasts_business_id_immutable
  before update on public.demand_forecasts
  for each row execute function private.prevent_business_id_change();
create trigger demand_forecasts_mock_tenant_guard
  before insert or update on public.demand_forecasts
  for each row execute function private.enforce_mock_tenant();

create trigger supply_risks_business_id_immutable
  before update on public.supply_risks
  for each row execute function private.prevent_business_id_change();
create trigger supply_risks_mock_tenant_guard
  before insert or update on public.supply_risks
  for each row execute function private.enforce_mock_tenant();

create index if not exists inventory_events_item_time_idx
  on public.inventory_events(business_id, supply_item_id, occurred_at desc);
create index if not exists inventory_events_demand_idx
  on public.inventory_events(business_id, supply_item_id, event_type, occurred_at)
  where event_type = 'consume';
create index if not exists inventory_balances_business_idx
  on public.inventory_balances(business_id, supply_item_id);
create index if not exists demand_forecasts_latest_idx
  on public.demand_forecasts(business_id, supply_item_id, computed_at desc);
create index if not exists supply_risks_queue_idx
  on public.supply_risks(business_id, status, level, time_to_stockout_hours);

-- Отдельный индекс на каждый внешний ключ. Составной индекс, где колонка стоит
-- не первой, планировщику для проверки ссылочной целостности не годится: без
-- этих индексов удаление позиции или точки заставляет базу читать всю таблицу
-- событий. Это же требование проверяет `001_schema_security`.
create index if not exists inventory_events_item_fk_idx on public.inventory_events(supply_item_id);
create index if not exists inventory_events_location_fk_idx on public.inventory_events(location_id);
create index if not exists inventory_events_actor_fk_idx on public.inventory_events(actor_id);
create index if not exists inventory_balances_item_fk_idx on public.inventory_balances(supply_item_id);
create index if not exists inventory_balances_location_fk_idx on public.inventory_balances(location_id);
create index if not exists demand_forecasts_item_fk_idx on public.demand_forecasts(supply_item_id);
create index if not exists demand_forecasts_location_fk_idx on public.demand_forecasts(location_id);
create index if not exists supply_risks_item_fk_idx on public.supply_risks(supply_item_id);
create index if not exists supply_risks_location_fk_idx on public.supply_risks(location_id);
create index if not exists supply_risks_forecast_fk_idx on public.supply_risks(forecast_id);

-- ---------------------------------------------------------------------------
-- Запись движения: идемпотентно и без отрицательного остатка
-- ---------------------------------------------------------------------------
--
-- Три вещи должны произойти вместе или не произойти вовсе: строка журнала,
-- обновлённый остаток и отказ, если остаток ушёл бы ниже нуля. Разнесённые по
-- разным запросам, они рано или поздно разъедутся — приложение упадёт между
-- ними, и остаток перестанет соответствовать журналу.
--
-- Повтор ключа не ошибка: функция возвращает уже записанное событие и молча
-- ничего не меняет. Это делает безопасными двойной клик, ретрай вебхука и
-- повторную отправку одного и того же сообщения из чата.
create or replace function private.record_inventory_event(
  p_business_id uuid,
  p_supply_item_id uuid,
  p_location_id uuid,
  p_event_type text,
  p_quantity_delta_milli bigint,
  p_source text,
  p_idempotency_key text,
  p_occurred_at timestamptz default now(),
  p_note text default null,
  p_allow_negative boolean default false)
returns public.inventory_events language plpgsql security definer set search_path=''
as $$
declare
  v_existing public.inventory_events%rowtype;
  v_event public.inventory_events%rowtype;
  v_item public.supply_items%rowtype;
  v_mock boolean;
  v_current bigint;
  v_next bigint;
begin
  select * into v_existing
  from public.inventory_events
  where business_id = p_business_id and idempotency_key = p_idempotency_key;
  if found then
    return v_existing;
  end if;

  select * into v_item from public.supply_items where id = p_supply_item_id and business_id = p_business_id;
  if not found then
    raise exception 'supply item does not belong to this business' using errcode='23503';
  end if;

  if p_quantity_delta_milli = 0 then
    raise exception 'a movement of zero changes nothing and hides its own reason' using errcode='23514';
  end if;
  if p_event_type in ('receive', 'transfer_in') and p_quantity_delta_milli < 0 then
    raise exception '% carries its direction in the type; quantity must be positive', p_event_type using errcode='23514';
  end if;
  if p_event_type in ('consume', 'transfer_out') and p_quantity_delta_milli > 0 then
    raise exception '% must reduce the balance', p_event_type using errcode='23514';
  end if;

  select mode = 'demo' into v_mock from public.businesses where id = p_business_id;

  -- Строка остатка создаётся до чтения, если её ещё нет, и блокируется, если
  -- есть. Без этого два одновременных списания прочитали бы один и тот же
  -- остаток и оба сочли бы, что товара хватает.
  insert into public.inventory_balances(
    business_id, location_id, supply_item_id, on_hand_milli, last_event_at, is_mock)
  values (p_business_id, p_location_id, p_supply_item_id, 0, null, coalesce(v_mock, false))
  on conflict (business_id, supply_item_id, location_key) do nothing;

  select on_hand_milli into v_current
  from public.inventory_balances
  where business_id = p_business_id and supply_item_id = p_supply_item_id
    and location_key = coalesce(p_location_id, '00000000-0000-0000-0000-000000000000'::uuid)
  for update;

  v_current := coalesce(v_current, 0);
  v_next := v_current + p_quantity_delta_milli;

  if v_next < 0 and not (p_event_type = 'adjust' and p_allow_negative) then
    raise exception 'movement would leave % milli units on hand; only an explicit adjustment may do that', v_next
      using errcode='23514';
  end if;

  insert into public.inventory_events(
    business_id, location_id, supply_item_id, event_type, quantity_delta_milli,
    unit, source, actor_id, occurred_at, note, idempotency_key, is_mock)
  values (
    p_business_id, p_location_id, p_supply_item_id, p_event_type, p_quantity_delta_milli,
    v_item.unit, p_source, auth.uid(), p_occurred_at, p_note, p_idempotency_key, coalesce(v_mock, false))
  returning * into v_event;

  update public.inventory_balances
  set on_hand_milli = v_next,
      last_event_at = greatest(coalesce(last_event_at, p_occurred_at), p_occurred_at),
      updated_at = now()
  where business_id = p_business_id and supply_item_id = p_supply_item_id
    and location_key = coalesce(p_location_id, '00000000-0000-0000-0000-000000000000'::uuid);

  return v_event;
end $$;

revoke all on function private.record_inventory_event(uuid, uuid, uuid, text, bigint, text, text, timestamptz, text, boolean)
  from public, anon, authenticated, service_role;
grant execute on function private.record_inventory_event(uuid, uuid, uuid, text, bigint, text, text, timestamptz, text, boolean)
  to authenticated, service_role;

create or replace function public.record_inventory_event(
  p_business_id uuid,
  p_supply_item_id uuid,
  p_location_id uuid,
  p_event_type text,
  p_quantity_delta_milli bigint,
  p_source text,
  p_idempotency_key text,
  p_occurred_at timestamptz default now(),
  p_note text default null,
  p_allow_negative boolean default false)
returns public.inventory_events language plpgsql security invoker set search_path=''
as $$
declare v_role text;
begin
  -- Роль проверяется здесь, потому что дальше запись идёт с правами владельца
  -- функции: без этой проверки наблюдатель смог бы списать товар.
  select bm.role into v_role
  from public.business_members bm
  where bm.business_id = p_business_id and bm.user_id = (select auth.uid()) and bm.status = 'active';

  if v_role is null or v_role not in ('owner', 'manager', 'marketer') then
    raise exception 'not allowed to record inventory movements' using errcode='42501';
  end if;

  return private.record_inventory_event(
    p_business_id, p_supply_item_id, p_location_id, p_event_type, p_quantity_delta_milli,
    p_source, p_idempotency_key, p_occurred_at, p_note, p_allow_negative);
end $$;

revoke all on function public.record_inventory_event(uuid, uuid, uuid, text, bigint, text, text, timestamptz, text, boolean)
  from public, anon;
grant execute on function public.record_inventory_event(uuid, uuid, uuid, text, bigint, text, text, timestamptz, text, boolean)
  to authenticated, service_role;

comment on function public.record_inventory_event(uuid, uuid, uuid, text, bigint, text, text, timestamptz, text, boolean) is
 'Записывает движение и остаток одной транзакцией. Повтор ключа возвращает уже записанное событие и ничего не меняет.';

-- ---------------------------------------------------------------------------
-- Дневной ряд расхода — вход прогноза
-- ---------------------------------------------------------------------------
--
-- Спрос — это только `consume`. Приёмка и перемещение между точками спросом не
-- являются, а корректировка чаще исправляет учёт, чем отражает продажу. Дни без
-- расхода возвращаются нулями: пропущенный день выглядел бы как отсутствующее
-- наблюдение и завышал бы среднее.
create or replace function private.daily_demand(
  p_business_id uuid,
  p_supply_item_id uuid,
  p_location_id uuid,
  p_days integer default 28,
  p_timezone text default 'Asia/Almaty')
returns table(demand_date date, quantity_milli bigint)
language sql stable security definer set search_path=''
as $$
  select d.day::date as demand_date,
         coalesce(sum(-e.quantity_delta_milli), 0)::bigint as quantity_milli
  from generate_series(
         (now() at time zone p_timezone)::date - (p_days - 1),
         (now() at time zone p_timezone)::date,
         interval '1 day') as d(day)
  left join public.inventory_events e
    on e.business_id = p_business_id
   and e.supply_item_id = p_supply_item_id
   and e.location_id is not distinct from p_location_id
   and e.event_type = 'consume'
   and (e.occurred_at at time zone p_timezone)::date = d.day::date
  group by d.day
  order by d.day
$$;

revoke all on function private.daily_demand(uuid, uuid, uuid, integer, text) from public, anon, authenticated, service_role;
grant execute on function private.daily_demand(uuid, uuid, uuid, integer, text) to authenticated, service_role;

create or replace function public.daily_demand(
  p_business_id uuid,
  p_supply_item_id uuid,
  p_location_id uuid,
  p_days integer default 28,
  p_timezone text default 'Asia/Almaty')
returns table(demand_date date, quantity_milli bigint)
language sql stable security invoker set search_path=''
as $$ select * from private.daily_demand(p_business_id, p_supply_item_id, p_location_id, p_days, p_timezone) $$;

revoke all on function public.daily_demand(uuid, uuid, uuid, integer, text) from public, anon;
grant execute on function public.daily_demand(uuid, uuid, uuid, integer, text) to authenticated, service_role;

comment on function public.daily_demand(uuid, uuid, uuid, integer, text) is
 'Дневной ряд расхода за окно. Дни без движения возвращаются нулями, а не пропускаются.';

commit;
