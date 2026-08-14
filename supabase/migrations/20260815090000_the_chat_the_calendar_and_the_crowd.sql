begin;

-- Три тонкие части, каждая про доверие.
--
-- Чат: флорист считает розы вручную и пишет в переписку — продукт встраивается
-- в эту привычку, но не смеет менять остаток по сообщению. Сначала разбор,
-- потом глаза человека, только потом событие.
--
-- Календарь: восьмое марта не выводится из истории за 28 дней. Коэффициент
-- приходит из отраслевого шаблона, то есть это предположение о будущем — и
-- пока владелец его не одобрил, прогноз не двигается.
--
-- Общий рейтинг: новый магазин не знает, кто срывает сроки перед сезоном.
-- Обезличенная статистика по всем магазинам даёт этот сигнал, но публикуется
-- только после порога выборки и без единого идентификатора чужого заведения.

-- ---------------------------------------------------------------------------
-- Одобрение события владельцем
-- ---------------------------------------------------------------------------

alter table public.demand_events
  add column if not exists approved boolean not null default false,
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists approved_at timestamptz,
  -- Что случилось на самом деле: заполняется после события и превращает
  -- гипотезу в измеренный факт.
  add column if not exists actual_lift_ppm integer
    check (actual_lift_ppm is null or actual_lift_ppm >= 0);

comment on column public.demand_events.approved is
 'Одобрен ли лифт владельцем. Без одобрения событие видно в календаре, но прогноз не двигает.';
comment on column public.demand_events.actual_lift_ppm is
 'Измеренный после события коэффициент. Пока пуст — лифт остаётся гипотезой.';

create index if not exists demand_events_approved_by_fk_idx on public.demand_events(approved_by);

-- ---------------------------------------------------------------------------
-- Сообщения из чата
-- ---------------------------------------------------------------------------
--
-- Строка живёт дольше, чем сообщение в чате: она хранит исходный текст, разбор,
-- уверенность и то, чем всё кончилось. Без исходника разбор нельзя перепроверить,
-- а «система списала не то» превращается в спор без доказательств.

create table if not exists public.stock_messages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid references public.business_locations(id) on delete set null,

  /** Откуда пришло. Живые коннекторы пока не подключены — см. `is_simulated`. */
  channel text not null default 'simulator'
    check (channel in ('simulator', 'telegram', 'whatsapp', 'voice', 'photo')),
  /** Идентификатор сообщения в канале: по нему ловится повторная доставка. */
  external_id text not null,
  author text not null,
  body text not null check (char_length(body) between 1 and 2000),
  received_at timestamptz not null default now(),

  /** Что удалось разобрать. Пусто, если позиция не опознана. */
  parsed_item_id uuid references public.supply_items(id) on delete set null,
  parsed_quantity_milli bigint,
  parsed_unit text,
  /** Уверенность разбора, миллионные. Ниже порога — спрашиваем, а не гадаем. */
  confidence_ppm integer not null default 0 check (confidence_ppm between 0 and 1000000),
  /** Кандидаты, если название подошло нескольким позициям. */
  candidates jsonb not null default '[]'::jsonb check (jsonb_typeof(candidates) = 'array'),

  status text not null default 'proposed'
    check (status in ('proposed', 'needs_clarification', 'confirmed', 'rejected')),
  /** Событие остатка, которым закончилось подтверждение. */
  inventory_event_id uuid references public.inventory_events(id) on delete set null,
  confirmed_by uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz,
  /**
   * Пришло ли сообщение из настоящего канала или из встроенного тренажёра.
   * Живой Telegram, WhatsApp, голос и фото не подключены — и продукт обязан
   * говорить об этом прямо, а не намекать интерфейсом.
   */
  is_simulated boolean not null default true,
  is_mock boolean not null default false,
  created_at timestamptz not null default now(),
  unique (business_id, channel, external_id)
);

comment on table public.stock_messages is
 'Сообщения флориста об остатке: исходный текст, разбор, уверенность и итог. Остаток меняется только после подтверждения человеком.';

-- ---------------------------------------------------------------------------
-- Общий рейтинг поставщиков
-- ---------------------------------------------------------------------------
--
-- Агрегат по всем магазинам без единого идентификатора чужого заведения. Здесь
-- нет `business_id` намеренно: строка не принадлежит никому и не должна давать
-- возможности восстановить, чей это был заказ.

create table if not exists public.community_supplier_metrics (
  id uuid primary key default gen_random_uuid(),
  /** Каноническое имя поставщика: разные написания сводятся к одному. */
  canonical_supplier text not null,
  region text not null default 'Алматы',
  /** roses, tulips, greenery, packaging — рейтинг по категории, а не вообще. */
  category text not null,
  window_days smallint not null default 90 check (window_days > 0),

  n_orders integer not null default 0 check (n_orders >= 0),
  /** Сколько независимых магазинов дали эти заказы. */
  n_tenants integer not null default 0 check (n_tenants >= 0),
  delivery_reliability_ppm integer not null default 0 check (delivery_reliability_ppm between 0 and 1000000),
  fill_rate_ppm integer not null default 0 check (fill_rate_ppm between 0 and 1000000),
  freshness_score_ppm integer not null default 0 check (freshness_score_ppm between 0 and 1000000),

  /** Откуда взялся агрегат и на чём считался. */
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  computed_at timestamptz not null default now(),
  /** В демонстрации агрегат считается по синтетическим магазинам. */
  is_mock boolean not null default true,
  unique (canonical_supplier, region, category, window_days)
);

comment on table public.community_supplier_metrics is
 'Обезличенный рейтинг поставщика по всем магазинам. Без идентификаторов заведений и заказов; публикуется только после порога выборки.';

-- ---------------------------------------------------------------------------
-- Доступ
-- ---------------------------------------------------------------------------

alter table public.stock_messages enable row level security;
alter table public.community_supplier_metrics enable row level security;

create policy stock_messages_member_all on public.stock_messages
  for all to authenticated
  using (exists (select 1 from public.business_members bm where bm.business_id = stock_messages.business_id
                 and bm.user_id = (select auth.uid()) and bm.status = 'active'))
  with check (exists (select 1 from public.business_members bm where bm.business_id = stock_messages.business_id
                      and bm.user_id = (select auth.uid()) and bm.status = 'active'
                      and bm.role in ('owner', 'manager', 'marketer')));

-- Общий рейтинг читают все участники любого магазина: в нём нет ничего, что
-- принадлежало бы конкретному заведению.
create policy community_metrics_read on public.community_supplier_metrics
  for select to authenticated using (true);

grant select, insert, update on table public.stock_messages to authenticated;
grant select, insert, update, delete on table public.stock_messages to service_role;
grant select on table public.community_supplier_metrics to authenticated;
grant select, insert, update, delete on table public.community_supplier_metrics to service_role;

create trigger stock_messages_business_id_immutable
  before update on public.stock_messages
  for each row execute function private.prevent_business_id_change();
create trigger stock_messages_mock_tenant_guard
  before insert or update on public.stock_messages
  for each row execute function private.enforce_mock_tenant();

create index if not exists stock_messages_business_status_idx
  on public.stock_messages(business_id, status, received_at desc);
create index if not exists stock_messages_item_fk_idx on public.stock_messages(parsed_item_id);
create index if not exists stock_messages_location_fk_idx on public.stock_messages(location_id);
create index if not exists stock_messages_event_fk_idx on public.stock_messages(inventory_event_id);
create index if not exists stock_messages_confirmed_by_fk_idx on public.stock_messages(confirmed_by);
create index if not exists community_metrics_lookup_idx
  on public.community_supplier_metrics(canonical_supplier, category);

-- ---------------------------------------------------------------------------
-- Подтверждение сообщения
-- ---------------------------------------------------------------------------
--
-- Здесь сообщение превращается в остаток — и только здесь. Человек может
-- поправить позицию, количество и единицу: разбор ошибается, и цена ошибки
-- ложится на витрину, а не на модель.
--
-- Повторное подтверждение того же сообщения невозможно: событие остатка несёт
-- ключ идемпотентности от идентификатора сообщения, и второй вызов вернёт уже
-- записанное событие вместо нового списания.
create or replace function private.confirm_stock_message(
  p_message_id uuid,
  p_item_id uuid,
  p_quantity_milli bigint,
  p_event_type text default 'adjust',
  p_unit text default null)
returns public.stock_messages language plpgsql security definer set search_path=''
as $$
declare
  v_message public.stock_messages%rowtype;
  v_event public.inventory_events%rowtype;
  v_balance bigint;
  v_delta bigint;
  v_unit text;
begin
  select * into v_message from public.stock_messages where id = p_message_id for update;
  if not found then
    raise exception 'message not found' using errcode='23503';
  end if;

  if v_message.status = 'confirmed' then
    raise exception 'this message has already been confirmed' using errcode='23505';
  end if;

  if p_item_id is null then
    raise exception 'confirmation needs a position: the parser may have guessed wrong' using errcode='23514';
  end if;

  -- Единица сверяется с учётной, а не принимается на веру. «Осталось две
  -- коробки» и «осталось два стебля» — сообщения одинаковой длины и совсем
  -- разной цены; записать двойку в стебли, когда флорист считал коробками,
  -- значит развести витрину с журналом молча.
  select unit into v_unit from public.supply_items
  where id = p_item_id and business_id = v_message.business_id;

  if v_unit is null then
    raise exception 'position does not belong to this shop' using errcode='23503';
  end if;

  if p_unit is not null and p_unit <> v_unit then
    raise exception 'position is measured in % but % was given; convert the quantity first', v_unit, p_unit
      using errcode='23514';
  end if;

  -- Сообщение «осталось 70 роз» называет остаток, а не движение. Поэтому по
  -- умолчанию пишется корректировка на разницу с учётным остатком: флорист
  -- пересчитал витрину, и учёт должен сойтись с тем, что он видит.
  select coalesce(on_hand_milli, 0) into v_balance
  from public.inventory_balances
  where business_id = v_message.business_id and supply_item_id = p_item_id
    and location_key = coalesce(v_message.location_id, '00000000-0000-0000-0000-000000000000'::uuid);

  v_delta := case p_event_type
    when 'adjust' then p_quantity_milli - coalesce(v_balance, 0)
    when 'receive' then p_quantity_milli
    when 'consume' then -p_quantity_milli
    when 'waste' then -p_quantity_milli
    else p_quantity_milli - coalesce(v_balance, 0)
  end;

  if v_delta <> 0 then
    v_event := private.record_inventory_event(
      v_message.business_id, p_item_id, v_message.location_id,
      p_event_type, v_delta, 'messenger',
      'message:' || p_message_id,
      v_message.received_at,
      'из чата: ' || left(v_message.body, 120),
      true,
      null,
      case when p_event_type = 'waste' then 'withered' else null end);
  end if;

  update public.stock_messages
  set status = 'confirmed',
      parsed_item_id = p_item_id,
      parsed_quantity_milli = p_quantity_milli,
      inventory_event_id = v_event.id,
      confirmed_by = auth.uid(),
      confirmed_at = now()
  where id = p_message_id
  returning * into v_message;

  return v_message;
end $$;

revoke all on function private.confirm_stock_message(uuid, uuid, bigint, text, text)
  from public, anon, authenticated, service_role;
grant execute on function private.confirm_stock_message(uuid, uuid, bigint, text, text) to authenticated, service_role;

create or replace function public.confirm_stock_message(
  p_message_id uuid,
  p_item_id uuid,
  p_quantity_milli bigint,
  p_event_type text default 'adjust',
  p_unit text default null)
returns public.stock_messages language plpgsql security invoker set search_path=''
as $$
declare v_role text; v_business uuid;
begin
  select business_id into v_business from public.stock_messages where id = p_message_id;
  if v_business is null then
    raise exception 'message not found' using errcode='23503';
  end if;

  select bm.role into v_role from public.business_members bm
  where bm.business_id = v_business and bm.user_id = (select auth.uid()) and bm.status = 'active';

  if v_role is null or v_role not in ('owner', 'manager', 'marketer') then
    raise exception 'not allowed to confirm stock messages' using errcode='42501';
  end if;

  return private.confirm_stock_message(p_message_id, p_item_id, p_quantity_milli, p_event_type, p_unit);
end $$;

revoke all on function public.confirm_stock_message(uuid, uuid, bigint, text, text) from public, anon;
grant execute on function public.confirm_stock_message(uuid, uuid, bigint, text, text) to authenticated, service_role;

comment on function public.confirm_stock_message(uuid, uuid, bigint, text, text) is
 'Превращает разобранное сообщение в событие остатка после подтверждения человеком. Повторное подтверждение отклоняется.';

commit;
