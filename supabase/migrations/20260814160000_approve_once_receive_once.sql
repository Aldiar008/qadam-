begin;

-- Подтвердить один раз, принять один раз.
--
-- Два места, где расхождение стоит дороже всего. Подтверждение решения создаёт
-- сразу несколько заказов — если один запишется, а другой нет, магазин получит
-- половину плана и не узнает об этом. Приёмка одновременно меняет остаток,
-- закрывает заказ, фиксирует расхождение и пересчитывает надёжность
-- поставщика — разъедься это по разным запросам, и рейтинг начнёт врать.
--
-- Поэтому обе операции — по одной функции с транзакцией внутри, а не цепочка
-- вызовов из приложения.

-- ---------------------------------------------------------------------------
-- Подтверждение решения
-- ---------------------------------------------------------------------------
--
-- Версия проверяется явно: пока владелец читал карточку, остаток мог измениться
-- и решение пересчитаться. Подтверждать то, чего он не видел, нельзя — поэтому
-- устаревшее подтверждение отклоняется с понятной ошибкой, а не тихо создаёт
-- заказ на старое количество.
create or replace function private.approve_decision(
  p_decision_id uuid,
  p_expected_version integer,
  p_override_reason text default null)
returns setof public.purchase_orders language plpgsql security definer set search_path=''
as $$
declare
  v_decision public.decision_contracts%rowtype;
  v_line jsonb;
  v_supplier uuid;
  v_order public.purchase_orders%rowtype;
  v_mock boolean;
  v_key text;
  v_status text;
begin
  select * into v_decision from public.decision_contracts where id = p_decision_id for update;
  if not found then
    raise exception 'decision not found' using errcode='23503';
  end if;

  if v_decision.status <> 'open' then
    raise exception 'decision is already %', v_decision.status using errcode='23514';
  end if;

  if v_decision.version <> p_expected_version then
    raise exception 'decision changed while you were reading it: version % is now %',
      p_expected_version, v_decision.version using errcode='40001';
  end if;

  if jsonb_array_length(v_decision.plan) = 0 then
    raise exception 'decision has no supplier plan to approve' using errcode='23514';
  end if;

  v_status := case when p_override_reason is null then 'approved' else 'overridden' end;
  if p_override_reason is not null and char_length(trim(p_override_reason)) < 3 then
    raise exception 'an override must say why' using errcode='23514';
  end if;

  select mode = 'demo' into v_mock from public.businesses where id = v_decision.business_id;

  -- Заказы создаются черновиками: подтверждение решения не отправляет ничего
  -- поставщику. Отправка — отдельное действие, потому что это уже деньги и
  -- обязательство.
  for v_line in select * from jsonb_array_elements(v_decision.plan)
  loop
    v_supplier := (v_line->>'supplierId')::uuid;
    v_key := 'decision:' || v_decision.id || ':v' || v_decision.version || ':' || v_supplier;

    insert into public.purchase_orders(
      business_id, location_id, supplier_id, decision_id, status, is_urgent,
      expected_at, total_cost_minor, idempotency_key, is_mock)
    values (
      v_decision.business_id, v_decision.location_id, v_supplier, v_decision.id, 'draft',
      coalesce((v_line->>'urgent')::boolean, false),
      now() + ((coalesce((v_line->>'leadTimeP80Hours')::int, 48)) || ' hours')::interval,
      coalesce((v_line->>'costMinor')::bigint, 0),
      v_key, coalesce(v_mock, false))
    on conflict (business_id, idempotency_key) do nothing
    returning * into v_order;

    -- Повторное подтверждение той же версии возвращает уже созданный заказ,
    -- а не второй такой же.
    if v_order.id is null then
      select * into v_order from public.purchase_orders
      where business_id = v_decision.business_id and idempotency_key = v_key;
    else
      insert into public.purchase_order_items(
        business_id, purchase_order_id, supply_item_id, quantity_milli, unit_price_minor, cost_minor, is_mock)
      values (
        v_decision.business_id, v_order.id, v_decision.supply_item_id,
        (v_line->>'quantityMilli')::bigint,
        coalesce((v_line->>'unitPriceMinor')::bigint, 0),
        coalesce((v_line->>'costMinor')::bigint, 0),
        coalesce(v_mock, false));
    end if;

    return next v_order;
  end loop;

  update public.decision_contracts
  set status = v_status,
      decided_by = auth.uid(),
      decided_at = now(),
      override_reason = p_override_reason,
      updated_at = now()
  where id = p_decision_id;

  return;
end $$;

revoke all on function private.approve_decision(uuid, integer, text) from public, anon, authenticated, service_role;
grant execute on function private.approve_decision(uuid, integer, text) to authenticated, service_role;

create or replace function public.approve_decision(
  p_decision_id uuid,
  p_expected_version integer,
  p_override_reason text default null)
returns setof public.purchase_orders language plpgsql security invoker set search_path=''
as $$
declare v_role text; v_business uuid;
begin
  select business_id into v_business from public.decision_contracts where id = p_decision_id;
  if v_business is null then
    raise exception 'decision not found' using errcode='23503';
  end if;

  select bm.role into v_role from public.business_members bm
  where bm.business_id = v_business and bm.user_id = (select auth.uid()) and bm.status = 'active';

  if v_role is null or v_role not in ('owner', 'manager') then
    raise exception 'only an owner or a manager may approve a purchase' using errcode='42501';
  end if;

  return query select * from private.approve_decision(p_decision_id, p_expected_version, p_override_reason);
end $$;

revoke all on function public.approve_decision(uuid, integer, text) from public, anon;
grant execute on function public.approve_decision(uuid, integer, text) to authenticated, service_role;

comment on function public.approve_decision(uuid, integer, text) is
 'Подтверждает решение и создаёт черновики заказов одной транзакцией. Устаревшая версия отклоняется, повтор не дублирует заказ.';

-- ---------------------------------------------------------------------------
-- Пересчёт надёжности поставщика
-- ---------------------------------------------------------------------------
--
-- Считается из завершённых приёмок, а не из отзывов. «Вовремя и полностью» —
-- это привезли не меньше заказанного и не позже согласованного; всё остальное
-- попадает в недовоз и задержку.
create or replace function private.recompute_supplier_performance(
  p_business_id uuid,
  p_supplier_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare v_mock boolean;
begin
  select mode = 'demo' into v_mock from public.businesses where id = p_business_id;

  insert into public.supplier_performance(
    business_id, supplier_id, orders_total, orders_on_time_in_full,
    shortfall_rate_ppm, avg_delay_hours, p80_delay_hours, avg_freshness_days,
    last_delivery_at, is_mock, updated_at)
  select
    p_business_id,
    p_supplier_id,
    count(*)::int,
    count(*) filter (where r.received_milli >= r.expected_milli and r.delay_hours <= 0)::int,
    case when sum(r.expected_milli) > 0
         then greatest(0, least(1000000,
              (sum(greatest(0, r.expected_milli - r.received_milli)) * 1000000 / sum(r.expected_milli))::int))
         else 0 end,
    coalesce(avg(greatest(0, r.delay_hours))::int, 0),
    coalesce(percentile_disc(0.8) within group (order by greatest(0, r.delay_hours))::int, 0),
    round(avg(r.freshness_days)::numeric, 1),
    max(r.received_at),
    coalesce(v_mock, false),
    now()
  from public.order_receipts r
  join public.purchase_orders o on o.id = r.purchase_order_id
  where r.business_id = p_business_id and o.supplier_id = p_supplier_id
  on conflict (business_id, supplier_id) do update set
    orders_total = excluded.orders_total,
    orders_on_time_in_full = excluded.orders_on_time_in_full,
    shortfall_rate_ppm = excluded.shortfall_rate_ppm,
    avg_delay_hours = excluded.avg_delay_hours,
    p80_delay_hours = excluded.p80_delay_hours,
    avg_freshness_days = excluded.avg_freshness_days,
    last_delivery_at = excluded.last_delivery_at,
    updated_at = now();
end $$;

revoke all on function private.recompute_supplier_performance(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function private.recompute_supplier_performance(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Приёмка
-- ---------------------------------------------------------------------------
--
-- Здесь замыкается всё: остаток, заказ, расхождение и рейтинг поставщика. Одна
-- транзакция, потому что половина приёмки хуже, чем её отсутствие: остаток
-- вырос, а заказ остался в пути — и следующее решение построится на лжи.
create or replace function private.receive_order_item(
  p_order_item_id uuid,
  p_received_milli bigint,
  p_damaged_milli bigint default 0,
  p_freshness_days smallint default null,
  p_delay_hours integer default 0,
  p_reason text default null)
returns public.order_receipts language plpgsql security definer set search_path=''
as $$
declare
  v_item public.purchase_order_items%rowtype;
  v_order public.purchase_orders%rowtype;
  v_receipt public.order_receipts%rowtype;
  v_event public.inventory_events%rowtype;
  v_mock boolean;
  v_usable bigint;
  v_expires timestamptz;
  v_shelf smallint;
  v_remaining integer;
begin
  select * into v_item from public.purchase_order_items where id = p_order_item_id;
  if not found then
    raise exception 'order line not found' using errcode='23503';
  end if;

  select * into v_order from public.purchase_orders where id = v_item.purchase_order_id for update;

  if v_order.status in ('draft', 'cancelled') then
    raise exception 'cannot receive an order that was never sent (status %)', v_order.status using errcode='23514';
  end if;

  if exists (select 1 from public.order_receipts where purchase_order_item_id = p_order_item_id) then
    raise exception 'this order line has already been received' using errcode='23505';
  end if;

  if p_received_milli < 0 or p_damaged_milli < 0 or p_damaged_milli > p_received_milli then
    raise exception 'received and damaged quantities are inconsistent' using errcode='23514';
  end if;

  select mode = 'demo' into v_mock from public.businesses where id = v_order.business_id;
  select shelf_life_days into v_shelf from public.supply_items where id = v_item.supply_item_id;

  -- На витрину встаёт только годное: помятые бутоны не товар.
  v_usable := p_received_milli - p_damaged_milli;

  -- Срок партии считается от фактической свежести, а не от обещанной: если
  -- привезли цветок, простоявший два дня, он и завянет на два дня раньше.
  v_remaining := coalesce(p_freshness_days::integer, v_shelf::integer);
  v_expires := case when v_remaining is null then null else now() + (v_remaining || ' days')::interval end;

  if v_usable > 0 then
    v_event := private.record_inventory_event(
      v_order.business_id, v_item.supply_item_id, v_order.location_id,
      'receive', v_usable, 'receiving',
      'receipt:' || p_order_item_id,
      now(), 'приёмка заказа', false, v_expires, null, v_item.unit_price_minor);
  end if;

  insert into public.order_receipts(
    business_id, purchase_order_id, purchase_order_item_id, supply_item_id,
    expected_milli, received_milli, damaged_milli, freshness_days, delay_hours,
    reason, received_by, inventory_event_id, is_mock)
  values (
    v_order.business_id, v_order.id, p_order_item_id, v_item.supply_item_id,
    v_item.quantity_milli, p_received_milli, p_damaged_milli, p_freshness_days, p_delay_hours,
    p_reason, auth.uid(), v_event.id, coalesce(v_mock, false))
  returning * into v_receipt;

  -- Расхождения записываются строками, а не остаются в памяти кладовщика:
  -- разговор с поставщиком должен опираться на факты.
  if p_received_milli < v_item.quantity_milli then
    insert into public.order_discrepancies(business_id, receipt_id, supplier_id, kind, expected_value, actual_value, note, is_mock)
    values (v_order.business_id, v_receipt.id, v_order.supplier_id, 'shortfall',
            v_item.quantity_milli::text, p_received_milli::text, p_reason, coalesce(v_mock, false));
  elsif p_received_milli > v_item.quantity_milli then
    insert into public.order_discrepancies(business_id, receipt_id, supplier_id, kind, expected_value, actual_value, note, is_mock)
    values (v_order.business_id, v_receipt.id, v_order.supplier_id, 'surplus',
            v_item.quantity_milli::text, p_received_milli::text, p_reason, coalesce(v_mock, false));
  end if;

  if p_delay_hours > 0 then
    insert into public.order_discrepancies(business_id, receipt_id, supplier_id, kind, expected_value, actual_value, note, is_mock)
    values (v_order.business_id, v_receipt.id, v_order.supplier_id, 'delay',
            coalesce(v_order.expected_at::text, 'не задано'), p_delay_hours::text || ' ч позже', p_reason, coalesce(v_mock, false));
  end if;

  if p_damaged_milli > 0 then
    insert into public.order_discrepancies(business_id, receipt_id, supplier_id, kind, expected_value, actual_value, note, is_mock)
    values (v_order.business_id, v_receipt.id, v_order.supplier_id, 'damage',
            '0', p_damaged_milli::text, p_reason, coalesce(v_mock, false));
  end if;

  -- Свежесть ниже обещанной — тоже расхождение: цветок отработает меньше дней,
  -- и это прямой убыток, даже когда количество сошлось.
  if p_freshness_days is not null then
    if exists (
      select 1 from public.supplier_offers so
      where so.business_id = v_order.business_id and so.supplier_id = v_order.supplier_id
        and so.supply_item_id = v_item.supply_item_id
        and so.freshness_on_arrival_days is not null
        and so.freshness_on_arrival_days > p_freshness_days
    ) then
      insert into public.order_discrepancies(business_id, receipt_id, supplier_id, kind, expected_value, actual_value, note, is_mock)
      select v_order.business_id, v_receipt.id, v_order.supplier_id, 'freshness',
             so.freshness_on_arrival_days::text || ' дн.', p_freshness_days::text || ' дн.', p_reason, coalesce(v_mock, false)
      from public.supplier_offers so
      where so.business_id = v_order.business_id and so.supplier_id = v_order.supplier_id
        and so.supply_item_id = v_item.supply_item_id
      limit 1;
    end if;
  end if;

  -- Заказ закрывается, когда принята каждая его строка.
  if not exists (
    select 1 from public.purchase_order_items i
    left join public.order_receipts r on r.purchase_order_item_id = i.id
    where i.purchase_order_id = v_order.id and r.id is null
  ) then
    update public.purchase_orders
    set status = 'delivered', delivered_at = now(), updated_at = now()
    where id = v_order.id;
  end if;

  perform private.recompute_supplier_performance(v_order.business_id, v_order.supplier_id);

  return v_receipt;
end $$;

revoke all on function private.receive_order_item(uuid, bigint, bigint, smallint, integer, text)
  from public, anon, authenticated, service_role;
grant execute on function private.receive_order_item(uuid, bigint, bigint, smallint, integer, text)
  to authenticated, service_role;

create or replace function public.receive_order_item(
  p_order_item_id uuid,
  p_received_milli bigint,
  p_damaged_milli bigint default 0,
  p_freshness_days smallint default null,
  p_delay_hours integer default 0,
  p_reason text default null)
returns public.order_receipts language plpgsql security invoker set search_path=''
as $$
declare v_role text; v_business uuid;
begin
  select o.business_id into v_business
  from public.purchase_order_items i join public.purchase_orders o on o.id = i.purchase_order_id
  where i.id = p_order_item_id;

  if v_business is null then
    raise exception 'order line not found' using errcode='23503';
  end if;

  select bm.role into v_role from public.business_members bm
  where bm.business_id = v_business and bm.user_id = (select auth.uid()) and bm.status = 'active';

  if v_role is null or v_role not in ('owner', 'manager', 'marketer') then
    raise exception 'not allowed to receive deliveries' using errcode='42501';
  end if;

  return private.receive_order_item(
    p_order_item_id, p_received_milli, p_damaged_milli, p_freshness_days, p_delay_hours, p_reason);
end $$;

revoke all on function public.receive_order_item(uuid, bigint, bigint, smallint, integer, text) from public, anon;
grant execute on function public.receive_order_item(uuid, bigint, bigint, smallint, integer, text)
  to authenticated, service_role;

comment on function public.receive_order_item(uuid, bigint, bigint, smallint, integer, text) is
 'Принимает строку заказа: остаток, партия, расхождения и рейтинг поставщика — одной транзакцией. Повторная приёмка отклоняется.';

commit;
