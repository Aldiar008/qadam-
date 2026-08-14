begin;

-- Цветы не ждут.
--
-- Обычный складской учёт отвечает на один вопрос: сколько осталось. Для
-- цветочного магазина этого мало ровно наполовину. Стакан пролежит месяц, роза
-- — пять дней, и ошибка в обе стороны стоит одинаково: не хватило перед
-- восьмым марта — потеряли заказ и клиента; закупили с запасом — выбросили
-- ведро роз и деньги вместе с ними.
--
-- Поэтому остаток здесь перестаёт быть числом и становится набором партий, у
-- каждой из которых своя дата прихода и свой срок. Расход идёт с той, что
-- вянет раньше — так же, как продавец разбирает ведро. А списание отделено от
-- продажи: если их смешать, прогноз выучит выброшенное как проданное и будет
-- уверенно советовать закупать столько же.

-- ---------------------------------------------------------------------------
-- Списание как отдельный вид движения
-- ---------------------------------------------------------------------------

alter table public.inventory_events
  drop constraint if exists inventory_events_event_type_check;

alter table public.inventory_events
  add constraint inventory_events_event_type_check
  check (event_type in ('receive', 'consume', 'adjust', 'waste', 'transfer_in', 'transfer_out'));

alter table public.inventory_events
  add column if not exists waste_reason text
    check (waste_reason is null or waste_reason in ('withered', 'damaged', 'unsold', 'other')),
  -- Заполняется у приёмки: срок, до которого партия остаётся товаром.
  add column if not exists expires_at timestamptz;

comment on column public.inventory_events.waste_reason is
 'Почему списали: увяло, повредили, не продали. Списание не идёт в спрос — иначе прогноз выучит его как продажу.';

-- ---------------------------------------------------------------------------
-- Партии
-- ---------------------------------------------------------------------------

create table if not exists public.inventory_lots (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid references public.business_locations(id) on delete set null,
  supply_item_id uuid not null references public.supply_items(id) on delete cascade,
  /** Событие приёмки, которым партия появилась. */
  received_event_id uuid references public.inventory_events(id) on delete set null,
  received_at timestamptz not null default now(),
  /** Когда партия перестаёт быть товаром. Null — у того, что не портится. */
  expires_at timestamptz,
  quantity_milli bigint not null check (quantity_milli > 0),
  /** Что от партии осталось: расход и списание уменьшают именно это. */
  remaining_milli bigint not null check (remaining_milli >= 0),
  /** Себестоимость единицы — по ней считается замороженная в списании сумма. */
  unit_cost_minor bigint check (unit_cost_minor is null or unit_cost_minor >= 0),
  is_mock boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (remaining_milli <= quantity_milli)
);

comment on table public.inventory_lots is
 'Партия цветов: когда пришла, когда завянет, сколько осталось. Расход списывается с той, что вянет раньше.';

-- ---------------------------------------------------------------------------
-- Политика: критичность и допустимое списание
-- ---------------------------------------------------------------------------

alter table public.supply_items
  -- Насколько больно остаться без этой позиции. У роз перед праздником цена
  -- дефицита несопоставима с ценой лишнего ведра; у лент — наоборот.
  add column if not exists criticality text not null default 'normal'
    check (criticality in ('critical', 'normal', 'optional')),
  -- Какую долю списания владелец считает нормальной. У зелени это десять
  -- процентов и это жизнь; у упаковки — ноль.
  add column if not exists spoilage_tolerance_bps integer not null default 500
    check (spoilage_tolerance_bps between 0 and 10000);

comment on column public.supply_items.criticality is
 'Цена дефицита относительно цены излишка. Поднимает страховой запас там, где пустая витрина дороже списания.';
comment on column public.supply_items.spoilage_tolerance_bps is
 'Допустимая доля списания в базисных пунктах. Превышение — это риск, само наличие списания — нет.';

-- ---------------------------------------------------------------------------
-- Календарь спроса
-- ---------------------------------------------------------------------------
--
-- Восьмое марта не выводится из истории продаж за 28 дней — прошлогоднее в неё
-- не попадает. Поэтому события лежат отдельно, и у каждого написано, откуда
-- взят коэффициент и проверен ли он фактом. Пока не проверен, он остаётся
-- гипотезой и на экране подписан именно так.
create table if not exists public.demand_events (
  id uuid primary key default gen_random_uuid(),
  /** Null — общий календарь платформы; иначе событие конкретного магазина. */
  business_id uuid references public.businesses(id) on delete cascade,
  code text not null,
  name_ru text not null,
  event_date date not null,
  /** За сколько дней до даты начинается всплеск: розы разбирают заранее. */
  lead_days smallint not null default 3 check (lead_days between 0 and 60),
  /** Во сколько раз поднимает спрос: 2 500 000 — это ×2,5. */
  lift_ppm integer not null check (lift_ppm between 100000 and 10000000),
  /** Категории, которых касается. Пустой массив — касается всего. */
  categories text[] not null default '{}',
  source text not null default 'template',
  /** Проверен ли коэффициент фактом прошлого года. */
  verified boolean not null default false,
  is_mock boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, code, event_date)
);

comment on table public.demand_events is
 'Праздники и поводы, поднимающие спрос. Коэффициент помечен гипотезой, пока не проверен фактом прошлого года.';

-- ---------------------------------------------------------------------------
-- Риск списания рядом с риском дефицита
-- ---------------------------------------------------------------------------

alter table public.supply_risks
  add column if not exists at_risk_milli bigint not null default 0 check (at_risk_milli >= 0),
  add column if not exists at_risk_cost_minor bigint check (at_risk_cost_minor is null or at_risk_cost_minor >= 0),
  add column if not exists nearest_expiry_hours integer,
  add column if not exists at_risk_share_ppm integer check (at_risk_share_ppm is null or at_risk_share_ppm >= 0);

-- ---------------------------------------------------------------------------
-- Изоляция арендаторов
-- ---------------------------------------------------------------------------

alter table public.inventory_lots enable row level security;
alter table public.demand_events enable row level security;

create policy inventory_lots_member_read on public.inventory_lots
  for select to authenticated
  using (exists (select 1 from public.business_members bm where bm.business_id = inventory_lots.business_id
                 and bm.user_id = (select auth.uid()) and bm.status = 'active'));

-- Общий календарь читают все участники любого заведения; свой — только своё.
create policy demand_events_read on public.demand_events
  for select to authenticated
  using (business_id is null
         or exists (select 1 from public.business_members bm where bm.business_id = demand_events.business_id
                    and bm.user_id = (select auth.uid()) and bm.status = 'active'));

create policy demand_events_member_write on public.demand_events
  for all to authenticated
  using (business_id is not null
         and exists (select 1 from public.business_members bm where bm.business_id = demand_events.business_id
                     and bm.user_id = (select auth.uid()) and bm.status = 'active'))
  with check (business_id is not null
              and exists (select 1 from public.business_members bm where bm.business_id = demand_events.business_id
                          and bm.user_id = (select auth.uid()) and bm.status = 'active'
                          and bm.role in ('owner', 'manager', 'marketer')));

grant select on table public.inventory_lots to authenticated;
grant select, insert, update, delete on table public.inventory_lots to service_role;
grant select, insert, update, delete on table public.demand_events to authenticated;
grant select, insert, update, delete on table public.demand_events to service_role;

create trigger inventory_lots_business_id_immutable
  before update on public.inventory_lots
  for each row execute function private.prevent_business_id_change();
create trigger inventory_lots_mock_tenant_guard
  before insert or update on public.inventory_lots
  for each row execute function private.enforce_mock_tenant();

-- У общего календаря нет заведения, поэтому страж режима к нему неприменим:
-- он читает `businesses` по `business_id`, а тот здесь пустой.
create trigger demand_events_mock_tenant_guard
  before insert or update on public.demand_events
  for each row when (new.business_id is not null)
  execute function private.enforce_mock_tenant();

create index if not exists inventory_lots_fifo_idx
  on public.inventory_lots(business_id, supply_item_id, expires_at nulls last, received_at)
  where remaining_milli > 0;
create index if not exists inventory_lots_item_fk_idx on public.inventory_lots(supply_item_id);
create index if not exists inventory_lots_location_fk_idx on public.inventory_lots(location_id);
create index if not exists inventory_lots_event_fk_idx on public.inventory_lots(received_event_id);
create index if not exists demand_events_business_fk_idx on public.demand_events(business_id);
create index if not exists demand_events_calendar_idx on public.demand_events(event_date, code);

-- ---------------------------------------------------------------------------
-- Запись движения с партиями
-- ---------------------------------------------------------------------------
--
-- К прежним обязанностям функции добавились две. Приёмка создаёт партию со
-- своим сроком; расход, списание и отрицательная корректировка разбирают партии
-- в порядке истечения — сначала то, что вянет раньше.
--
-- Порядок разбора не косметика: если списывать с самой свежей партии, учёт
-- покажет запас, которого в ведре уже нет, а старые цветы будут стоять до
-- полной потери вида.
--
-- Прежняя сигнатура удаляется, а не остаётся рядом: `create or replace` не
-- меняет список параметров, поэтому две версии сосуществовали бы, и любой
-- вызов с неполным набором аргументов падал бы с «function is not unique».
drop function if exists private.record_inventory_event(
  uuid, uuid, uuid, text, bigint, text, text, timestamptz, text, boolean);

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
  p_allow_negative boolean default false,
  p_expires_at timestamptz default null,
  p_waste_reason text default null,
  p_unit_cost_minor bigint default null)
returns public.inventory_events language plpgsql security definer set search_path=''
as $$
declare
  v_existing public.inventory_events%rowtype;
  v_event public.inventory_events%rowtype;
  v_item public.supply_items%rowtype;
  v_mock boolean;
  v_current bigint;
  v_next bigint;
  v_expires timestamptz;
  v_left bigint;
  v_take bigint;
  v_lot record;
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
  if p_event_type in ('consume', 'transfer_out', 'waste') and p_quantity_delta_milli > 0 then
    raise exception '% must reduce the balance', p_event_type using errcode='23514';
  end if;
  if p_event_type = 'waste' and p_waste_reason is null then
    raise exception 'a write-off must say why: withered, damaged or unsold' using errcode='23514';
  end if;

  select mode = 'demo' into v_mock from public.businesses where id = p_business_id;

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

  -- Срок партии: сказанный при приёмке или посчитанный из срока жизни позиции.
  v_expires := coalesce(
    p_expires_at,
    case when v_item.shelf_life_days is null then null
         else p_occurred_at + (v_item.shelf_life_days || ' days')::interval end);

  insert into public.inventory_events(
    business_id, location_id, supply_item_id, event_type, quantity_delta_milli,
    unit, source, actor_id, occurred_at, note, idempotency_key, is_mock,
    waste_reason, expires_at)
  values (
    p_business_id, p_location_id, p_supply_item_id, p_event_type, p_quantity_delta_milli,
    v_item.unit, p_source, auth.uid(), p_occurred_at, p_note, p_idempotency_key, coalesce(v_mock, false),
    p_waste_reason,
    case when p_quantity_delta_milli > 0 then v_expires else null end)
  returning * into v_event;

  -- Приход создаёт партию.
  if p_quantity_delta_milli > 0 then
    insert into public.inventory_lots(
      business_id, location_id, supply_item_id, received_event_id,
      received_at, expires_at, quantity_milli, remaining_milli, unit_cost_minor, is_mock)
    values (
      p_business_id, p_location_id, p_supply_item_id, v_event.id,
      p_occurred_at, v_expires, p_quantity_delta_milli, p_quantity_delta_milli,
      coalesce(p_unit_cost_minor, v_item.current_price_minor), coalesce(v_mock, false));
  else
    -- Расход разбирает партии в порядке истечения.
    v_left := -p_quantity_delta_milli;
    for v_lot in
      select id, remaining_milli
      from public.inventory_lots
      where business_id = p_business_id and supply_item_id = p_supply_item_id
        and location_id is not distinct from p_location_id
        and remaining_milli > 0
      order by expires_at nulls last, received_at
      for update
    loop
      exit when v_left <= 0;
      v_take := least(v_lot.remaining_milli, v_left);
      update public.inventory_lots
      set remaining_milli = remaining_milli - v_take, updated_at = now()
      where id = v_lot.id;
      v_left := v_left - v_take;
    end loop;
    -- Остаток может не покрываться партиями: так бывает после явной
    -- корректировки в минус. Это не ошибка — партии просто заканчиваются
    -- раньше, а баланс остаётся источником правды по количеству.
  end if;

  update public.inventory_balances
  set on_hand_milli = v_next,
      last_event_at = greatest(coalesce(last_event_at, p_occurred_at), p_occurred_at),
      updated_at = now()
  where business_id = p_business_id and supply_item_id = p_supply_item_id
    and location_key = coalesce(p_location_id, '00000000-0000-0000-0000-000000000000'::uuid);

  return v_event;
end $$;

revoke all on function private.record_inventory_event(uuid, uuid, uuid, text, bigint, text, text, timestamptz, text, boolean, timestamptz, text, bigint)
  from public, anon, authenticated, service_role;
grant execute on function private.record_inventory_event(uuid, uuid, uuid, text, bigint, text, text, timestamptz, text, boolean, timestamptz, text, bigint)
  to authenticated, service_role;

-- Прежняя сигнатура остаётся рабочей: её зовёт seed и уже написанный код.
drop function if exists public.record_inventory_event(uuid, uuid, uuid, text, bigint, text, text, timestamptz, text, boolean);

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
  p_allow_negative boolean default false,
  p_expires_at timestamptz default null,
  p_waste_reason text default null,
  p_unit_cost_minor bigint default null)
returns public.inventory_events language plpgsql security invoker set search_path=''
as $$
declare v_role text;
begin
  select bm.role into v_role
  from public.business_members bm
  where bm.business_id = p_business_id and bm.user_id = (select auth.uid()) and bm.status = 'active';

  if v_role is null or v_role not in ('owner', 'manager', 'marketer') then
    raise exception 'not allowed to record inventory movements' using errcode='42501';
  end if;

  return private.record_inventory_event(
    p_business_id, p_supply_item_id, p_location_id, p_event_type, p_quantity_delta_milli,
    p_source, p_idempotency_key, p_occurred_at, p_note, p_allow_negative,
    p_expires_at, p_waste_reason, p_unit_cost_minor);
end $$;

revoke all on function public.record_inventory_event(uuid, uuid, uuid, text, bigint, text, text, timestamptz, text, boolean, timestamptz, text, bigint)
  from public, anon;
grant execute on function public.record_inventory_event(uuid, uuid, uuid, text, bigint, text, text, timestamptz, text, boolean, timestamptz, text, bigint)
  to authenticated, service_role;

comment on function public.record_inventory_event(uuid, uuid, uuid, text, bigint, text, text, timestamptz, text, boolean, timestamptz, text, bigint) is
 'Записывает движение, остаток и партию одной транзакцией. Приход создаёт партию, расход разбирает их в порядке истечения.';

commit;
