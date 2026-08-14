begin;

-- Решение, которое доживает до приёмки.
--
-- Совет, сказанный один раз, проверить нельзя. Через неделю владелец спросит
-- «почему ты велел заказать сто шестьдесят роз», и ответить будет нечем: цифры
-- пересчитались, витрина другая, а слов никто не записал.
--
-- Поэтому решение здесь — строка, а не сообщение. Она хранит риск, количество,
-- план по поставщикам, отвергнутую альтернативу, доказательства и версию
-- расчёта. Из неё рождаются заказы, заказы доживают до приёмки, а приёмка
-- возвращает факт обратно в рейтинг поставщика. Круг замыкается, и каждое звено
-- можно предъявить.

-- ---------------------------------------------------------------------------
-- Поставщики как сущность, а не строка в прайсе
-- ---------------------------------------------------------------------------
--
-- До сих пор поставщик жил текстом внутри предложения. Для сравнения по цене
-- этого хватало; для надёжности — нет: OTIF нельзя посчитать по строке, которую
-- каждый раз пишут чуть иначе.

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 200),
  /** Оптовая база, ферма или локальный поставщик — у них разная логистика. */
  kind text not null default 'wholesale' check (kind in ('wholesale', 'farm', 'local')),
  contact text,
  /** Отсрочка платежа в днях. Ноль — по предоплате. */
  payment_terms_days smallint not null default 0 check (payment_terms_days between 0 and 120),
  is_active boolean not null default true,
  is_mock boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, name)
);

comment on table public.suppliers is
 'Оптовые базы, фермы и локальные поставщики. Надёжность считается по ним, а не по строке в прайсе.';

-- Что конкретный поставщик может дать по конкретной позиции.
create table if not exists public.supplier_offers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  supply_item_id uuid not null references public.supply_items(id) on delete cascade,
  unit_price_minor bigint not null check (unit_price_minor >= 0),
  pack_size_milli bigint not null default 1000 check (pack_size_milli > 0),
  moq_milli bigint not null default 0 check (moq_milli >= 0),
  available_milli bigint not null default 0 check (available_milli >= 0),
  lead_time_p80_hours integer not null default 48 check (lead_time_p80_hours between 0 and 8760),
  /** Сколько дней свежести останется у цветка на приёмке. */
  freshness_on_arrival_days smallint check (freshness_on_arrival_days is null or freshness_on_arrival_days >= 0),
  /** Есть ли нужный сорт, цвет и длина стебля. */
  matches_variety boolean not null default true,
  variety_note text,
  is_mock boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, supplier_id, supply_item_id)
);

comment on table public.supplier_offers is
 'Условия поставщика по позиции: цена, срок, свежесть на приёмке, минимальная партия и наличие сорта.';

-- ---------------------------------------------------------------------------
-- Надёжность поставщика — считается, а не заявляется
-- ---------------------------------------------------------------------------

create table if not exists public.supplier_performance (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  /** Завершённых поставок в выборке. Без него проценты ничего не значат. */
  orders_total integer not null default 0 check (orders_total >= 0),
  orders_on_time_in_full integer not null default 0 check (orders_on_time_in_full >= 0),
  /** Доля недовезённого объёма, миллионные. */
  shortfall_rate_ppm integer not null default 0 check (shortfall_rate_ppm between 0 and 1000000),
  /** Средняя и худшая задержка в часах — вторая честнее для планирования. */
  avg_delay_hours integer not null default 0,
  p80_delay_hours integer not null default 0,
  /** Средняя фактическая свежесть на приёмке. */
  avg_freshness_days numeric(4,1),
  last_delivery_at timestamptz,
  is_mock boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (business_id, supplier_id)
);

comment on table public.supplier_performance is
 'Личная надёжность поставщика внутри магазина: вовремя и полностью, недовоз, задержка, свежесть на приёмке.';

-- ---------------------------------------------------------------------------
-- Решение
-- ---------------------------------------------------------------------------
--
-- На связку «магазин + точка + позиция» может быть открыто ровно одно решение.
-- Пересчёт поднимает версию той же строки, а не плодит вторую: две карточки про
-- одни и те же розы — это не выбор, а неразбериха.

create table if not exists public.decision_contracts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid references public.business_locations(id) on delete set null,
  supply_item_id uuid not null references public.supply_items(id) on delete cascade,
  risk_id uuid references public.supply_risks(id) on delete set null,
  forecast_id uuid references public.demand_forecasts(id) on delete set null,

  /** Версия растёт при каждом пересчёте: по ней ловится устаревшее подтверждение. */
  version integer not null default 1 check (version > 0),
  status text not null default 'open'
    check (status in ('open', 'approved', 'overridden', 'snoozed', 'rejected', 'expired', 'superseded')),

  risk_type text not null default 'stockout' check (risk_type in ('stockout', 'expiry')),
  headline text not null,
  /** Что будет, если ничего не делать — цена бездействия словами. */
  consequence text not null,

  on_hand_milli bigint not null,
  daily_forecast_milli bigint not null check (daily_forecast_milli >= 0),
  time_to_stockout_hours integer,
  shelf_life_days smallint,
  recommended_quantity_milli bigint not null check (recommended_quantity_milli >= 0),
  urgent_quantity_milli bigint not null default 0 check (urgent_quantity_milli >= 0),
  expected_cost_minor bigint not null default 0 check (expected_cost_minor >= 0),
  /** Отвергнутая альтернатива и её цена — прогноз, а не факт экономии. */
  counterfactual jsonb not null default '{}'::jsonb check (jsonb_typeof(counterfactual) = 'object'),
  spoilage_at_risk_milli bigint not null default 0 check (spoilage_at_risk_milli >= 0),
  confidence_ppm integer not null check (confidence_ppm between 0 and 1000000),

  /** План закупки: строки с поставщиком, количеством, ценой и срочностью. */
  plan jsonb not null default '[]'::jsonb check (jsonb_typeof(plan) = 'array'),
  /** Отклонённые поставщики с причиной: владелец должен видеть, кого не взяли. */
  rejected_offers jsonb not null default '[]'::jsonb check (jsonb_typeof(rejected_offers) = 'array'),
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  model_version text not null,

  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  /** Причина ручного изменения — обязательна, иначе смысл override теряется. */
  override_reason text,
  snoozed_until timestamptz,

  location_key uuid generated always as (coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid)) stored,
  is_mock boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Решённое обязано знать своё время; изменение — ещё и причину.
  --
  -- Автор не требуется схемой намеренно: решение может закрыть и фоновый цикл,
  -- у которого нет пользователя. Требование «назови человека» стоит уровнем
  -- выше — в обёртке, доступной из интерфейса, — и там оно проверяется ролью.
  check (status not in ('approved', 'overridden', 'rejected') or decided_at is not null),
  check (status <> 'overridden' or (override_reason is not null and char_length(override_reason) >= 3))
);

-- Одно открытое решение на позицию и точку.
create unique index if not exists decision_contracts_open_idx
  on public.decision_contracts(business_id, supply_item_id, location_key)
  where status = 'open';

comment on table public.decision_contracts is
 'Решение по закупке: риск, количество, план по поставщикам, отвергнутая альтернатива и доказательства. Одно открытое на позицию.';

-- ---------------------------------------------------------------------------
-- Заказы
-- ---------------------------------------------------------------------------

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid references public.business_locations(id) on delete set null,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  decision_id uuid references public.decision_contracts(id) on delete set null,

  /**
   * Жизненный цикл заказа. Переходы стережёт триггер: принять заказ, минуя
   * отправку, нельзя — иначе приёмка появлялась бы у того, чего не заказывали.
   */
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'confirmed', 'in_transit', 'delivered', 'failed', 'cancelled')),
  /** Срочная часть плана или плановая — на приёмке это разные ожидания. */
  is_urgent boolean not null default false,
  expected_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  total_cost_minor bigint not null default 0 check (total_cost_minor >= 0),
  note text,
  /** Ключ идемпотентности: подтверждение решения не должно создать два заказа. */
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 200),
  is_mock boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, idempotency_key)
);

create table if not exists public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  supply_item_id uuid not null references public.supply_items(id) on delete restrict,
  quantity_milli bigint not null check (quantity_milli > 0),
  unit_price_minor bigint not null check (unit_price_minor >= 0),
  cost_minor bigint not null check (cost_minor >= 0),
  is_mock boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.purchase_orders is
 'Заказ поставщику. Создаётся из решения, живёт по конечному автомату, заканчивается приёмкой.';

-- ---------------------------------------------------------------------------
-- Приёмка и расхождения
-- ---------------------------------------------------------------------------

create table if not exists public.order_receipts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  purchase_order_item_id uuid not null references public.purchase_order_items(id) on delete cascade,
  supply_item_id uuid not null references public.supply_items(id) on delete restrict,

  expected_milli bigint not null check (expected_milli > 0),
  received_milli bigint not null check (received_milli >= 0),
  /** Сколько из привезённого сразу негодно: помятые бутоны, сломанные стебли. */
  damaged_milli bigint not null default 0 check (damaged_milli >= 0),
  /** Сколько дней свежести реально осталось — обещание проверяется здесь. */
  freshness_days smallint check (freshness_days is null or freshness_days >= 0),
  delay_hours integer not null default 0,
  reason text,
  received_by uuid references auth.users(id) on delete set null,
  received_at timestamptz not null default now(),
  /** Событие остатка, которым приёмка вошла в журнал. */
  inventory_event_id uuid references public.inventory_events(id) on delete set null,
  is_mock boolean not null default false,
  created_at timestamptz not null default now(),
  check (damaged_milli <= received_milli),
  -- Одна позиция заказа принимается один раз: вторая приёмка удвоила бы остаток.
  unique (purchase_order_item_id)
);

create table if not exists public.order_discrepancies (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  receipt_id uuid not null references public.order_receipts(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  kind text not null check (kind in ('shortfall', 'surplus', 'delay', 'freshness', 'damage')),
  expected_value text not null,
  actual_value text not null,
  note text,
  is_mock boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.order_receipts is
 'Что реально привезли: количество, свежесть, брак и опоздание. Отсюда пересчитывается надёжность поставщика.';
comment on table public.order_discrepancies is
 'Расхождение между заказом и поставкой. Создаётся автоматически, чтобы разговор с поставщиком опирался на строки.';

-- ---------------------------------------------------------------------------
-- Конечный автомат заказа
-- ---------------------------------------------------------------------------
--
-- Заказ нельзя принять, минуя отправку, и нельзя оживить после провала.
-- Проверка стоит в базе, а не в приложении: у заказа несколько путей внутрь
-- (интерфейс, приёмка, будущий коннектор), и правило должно быть одно.
create or replace function private.guard_purchase_order_status()
returns trigger language plpgsql set search_path=''
as $$
declare v_allowed text[];
begin
  if new.status = old.status then return new; end if;

  -- Из «отправлен» можно попасть сразу в «принят»: у цветочной базы заказ идёт
  -- по телефону, и машина приезжает через несколько часов без отдельного
  -- подтверждения. Требовать промежуточный статус значило бы заставлять
  -- кладовщика проставлять его задним числом ради формальности.
  v_allowed := case old.status
    when 'draft' then array['sent', 'cancelled']
    when 'sent' then array['confirmed', 'in_transit', 'delivered', 'failed', 'cancelled']
    when 'confirmed' then array['in_transit', 'delivered', 'failed']
    when 'in_transit' then array['delivered', 'failed']
    when 'delivered' then array[]::text[]
    when 'failed' then array[]::text[]
    when 'cancelled' then array[]::text[]
    else array[]::text[]
  end;

  if not (new.status = any(v_allowed)) then
    raise exception 'purchase order cannot go from % to %', old.status, new.status using errcode='23514';
  end if;

  return new;
end $$;

revoke all on function private.guard_purchase_order_status() from public, anon, authenticated, service_role;

create trigger purchase_orders_status_guard
  before update of status on public.purchase_orders
  for each row execute function private.guard_purchase_order_status();

-- ---------------------------------------------------------------------------
-- Изоляция арендаторов
-- ---------------------------------------------------------------------------

alter table public.suppliers enable row level security;
alter table public.supplier_offers enable row level security;
alter table public.supplier_performance enable row level security;
alter table public.decision_contracts enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.order_receipts enable row level security;
alter table public.order_discrepancies enable row level security;

create policy suppliers_member_all on public.suppliers
  for all to authenticated
  using (exists (select 1 from public.business_members bm where bm.business_id = suppliers.business_id
                 and bm.user_id = (select auth.uid()) and bm.status = 'active'))
  with check (exists (select 1 from public.business_members bm where bm.business_id = suppliers.business_id
                      and bm.user_id = (select auth.uid()) and bm.status = 'active'
                      and bm.role in ('owner', 'manager', 'marketer')));

create policy supplier_offers_member_all on public.supplier_offers
  for all to authenticated
  using (exists (select 1 from public.business_members bm where bm.business_id = supplier_offers.business_id
                 and bm.user_id = (select auth.uid()) and bm.status = 'active'))
  with check (exists (select 1 from public.business_members bm where bm.business_id = supplier_offers.business_id
                      and bm.user_id = (select auth.uid()) and bm.status = 'active'
                      and bm.role in ('owner', 'manager', 'marketer')));

-- Надёжность считает сервер: подправить свой OTIF из браузера нельзя.
create policy supplier_performance_member_read on public.supplier_performance
  for select to authenticated
  using (exists (select 1 from public.business_members bm where bm.business_id = supplier_performance.business_id
                 and bm.user_id = (select auth.uid()) and bm.status = 'active'));

create policy decision_contracts_member_read on public.decision_contracts
  for select to authenticated
  using (exists (select 1 from public.business_members bm where bm.business_id = decision_contracts.business_id
                 and bm.user_id = (select auth.uid()) and bm.status = 'active'));

-- Отложить и отклонить решение владелец вправе сам. Создаёт и пересчитывает
-- их сервер: вставки у пользователя нет, иначе можно было бы нарисовать себе
-- любое «решение» с любой уверенностью.
create policy decision_contracts_member_update on public.decision_contracts
  for update to authenticated
  using (exists (select 1 from public.business_members bm where bm.business_id = decision_contracts.business_id
                 and bm.user_id = (select auth.uid()) and bm.status = 'active'
                 and bm.role in ('owner', 'manager')))
  with check (exists (select 1 from public.business_members bm where bm.business_id = decision_contracts.business_id
                      and bm.user_id = (select auth.uid()) and bm.status = 'active'
                      and bm.role in ('owner', 'manager')));

create policy purchase_orders_member_read on public.purchase_orders
  for select to authenticated
  using (exists (select 1 from public.business_members bm where bm.business_id = purchase_orders.business_id
                 and bm.user_id = (select auth.uid()) and bm.status = 'active'));

-- Заказ создаёт функция подтверждения, но двигать его по жизни — работа
-- человека: отправил, поставщик подтвердил, машина выехала, поставка сорвалась.
-- Без этой политики обновление молча не находило строк: RLS отфильтровывал их
-- ещё до проверки статуса, и заказ навсегда оставался черновиком.
create policy purchase_orders_member_update on public.purchase_orders
  for update to authenticated
  using (exists (select 1 from public.business_members bm where bm.business_id = purchase_orders.business_id
                 and bm.user_id = (select auth.uid()) and bm.status = 'active'
                 and bm.role in ('owner', 'manager', 'marketer')))
  with check (exists (select 1 from public.business_members bm where bm.business_id = purchase_orders.business_id
                      and bm.user_id = (select auth.uid()) and bm.status = 'active'
                      and bm.role in ('owner', 'manager', 'marketer')));

create policy purchase_order_items_member_read on public.purchase_order_items
  for select to authenticated
  using (exists (select 1 from public.business_members bm where bm.business_id = purchase_order_items.business_id
                 and bm.user_id = (select auth.uid()) and bm.status = 'active'));

create policy order_receipts_member_read on public.order_receipts
  for select to authenticated
  using (exists (select 1 from public.business_members bm where bm.business_id = order_receipts.business_id
                 and bm.user_id = (select auth.uid()) and bm.status = 'active'));

create policy order_discrepancies_member_read on public.order_discrepancies
  for select to authenticated
  using (exists (select 1 from public.business_members bm where bm.business_id = order_discrepancies.business_id
                 and bm.user_id = (select auth.uid()) and bm.status = 'active'));

grant select, insert, update, delete on table public.suppliers to authenticated;
grant select, insert, update, delete on table public.supplier_offers to authenticated;
grant select on table public.supplier_performance to authenticated;
grant select, update on table public.decision_contracts to authenticated;
grant select, update on table public.purchase_orders to authenticated;
grant select on table public.purchase_order_items to authenticated;
grant select on table public.order_receipts to authenticated;
grant select on table public.order_discrepancies to authenticated;

grant select, insert, update, delete on table public.suppliers to service_role;
grant select, insert, update, delete on table public.supplier_offers to service_role;
grant select, insert, update, delete on table public.supplier_performance to service_role;
grant select, insert, update, delete on table public.decision_contracts to service_role;
grant select, insert, update, delete on table public.purchase_orders to service_role;
grant select, insert, update, delete on table public.purchase_order_items to service_role;
grant select, insert, update, delete on table public.order_receipts to service_role;
grant select, insert, update, delete on table public.order_discrepancies to service_role;

do $$
declare t text;
begin
  for t in select unnest(array['suppliers', 'supplier_offers', 'supplier_performance', 'decision_contracts',
                               'purchase_orders', 'purchase_order_items', 'order_receipts', 'order_discrepancies'])
  loop
    execute format('create trigger %I before update on public.%I for each row execute function private.prevent_business_id_change()', t || '_business_id_immutable', t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function private.enforce_mock_tenant()', t || '_mock_tenant_guard', t);
  end loop;
end $$;

-- Отдельный индекс на каждый внешний ключ: без них удаление поставщика читает
-- заказы целиком. То же требование проверяет `001_schema_security`.
create index if not exists suppliers_business_fk_idx on public.suppliers(business_id);
create index if not exists supplier_offers_supplier_fk_idx on public.supplier_offers(supplier_id);
create index if not exists supplier_offers_item_fk_idx on public.supplier_offers(supply_item_id);
create index if not exists supplier_offers_business_fk_idx on public.supplier_offers(business_id);
create index if not exists supplier_performance_supplier_fk_idx on public.supplier_performance(supplier_id);
create index if not exists supplier_performance_business_fk_idx on public.supplier_performance(business_id);
create index if not exists decision_contracts_item_fk_idx on public.decision_contracts(supply_item_id);
create index if not exists decision_contracts_location_fk_idx on public.decision_contracts(location_id);
create index if not exists decision_contracts_risk_fk_idx on public.decision_contracts(risk_id);
create index if not exists decision_contracts_forecast_fk_idx on public.decision_contracts(forecast_id);
create index if not exists decision_contracts_decided_by_fk_idx on public.decision_contracts(decided_by);
create index if not exists decision_contracts_business_fk_idx on public.decision_contracts(business_id);
create index if not exists purchase_orders_supplier_fk_idx on public.purchase_orders(supplier_id);
create index if not exists purchase_orders_decision_fk_idx on public.purchase_orders(decision_id);
create index if not exists purchase_orders_location_fk_idx on public.purchase_orders(location_id);
create index if not exists purchase_orders_business_status_idx on public.purchase_orders(business_id, status, expected_at);
create index if not exists purchase_order_items_order_fk_idx on public.purchase_order_items(purchase_order_id);
create index if not exists purchase_order_items_item_fk_idx on public.purchase_order_items(supply_item_id);
create index if not exists purchase_order_items_business_fk_idx on public.purchase_order_items(business_id);
create index if not exists order_receipts_order_fk_idx on public.order_receipts(purchase_order_id);
create index if not exists order_receipts_item_fk_idx on public.order_receipts(supply_item_id);
create index if not exists order_receipts_event_fk_idx on public.order_receipts(inventory_event_id);
create index if not exists order_receipts_business_fk_idx on public.order_receipts(business_id);
create index if not exists order_receipts_received_by_fk_idx on public.order_receipts(received_by);
create index if not exists order_discrepancies_receipt_fk_idx on public.order_discrepancies(receipt_id);
create index if not exists order_discrepancies_supplier_fk_idx on public.order_discrepancies(supplier_id);
create index if not exists order_discrepancies_business_fk_idx on public.order_discrepancies(business_id);

commit;
