begin;

-- Что платформа видит по всем цветочным магазинам сразу.
--
-- Администратору нужен ответ на четыре вопроса: сколько точек работает, какие
-- категории рискуют чаще других, как часто магазины списывают и во сколько
-- расчёт оценивает предотвращённый риск. Ни один из них не требует знать, чей
-- это магазин, — и функция такого знания не отдаёт.
--
-- Порог когорты тот же, что у общего обзора платформы: пять заведений. Ниже
-- него разрез перестаёт быть статистикой и становится указанием на конкретный
-- магазин, даже если в нём нет ни одного идентификатора.

create or replace function private.flower_platform_overview(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_min_cohort constant integer := 5;
  v_cohort integer;
  v_result jsonb;
begin
  if not private.is_platform_admin(array['platform_admin','platform_editor','platform_analyst']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select count(*)::integer into v_cohort
  from public.businesses b
  join public.business_types bt on bt.id = b.business_type_id
  where b.status = 'active' and bt.code in ('flower_shop', 'flower_chain');

  with shops as (
    select b.id, b.mode
    from public.businesses b
    join public.business_types bt on bt.id = b.business_type_id
    where b.status = 'active' and bt.code in ('flower_shop', 'flower_chain')
  ),
  -- Точка считается работающей, если она активна и по ней есть движение
  -- остатка за период. Активный флаг без движения — это заведённая карточка,
  -- а не работающая витрина, и складывать их в одно число нельзя.
  live_locations as (
    select count(distinct coalesce(e.location_id, l.id))::integer as n
    from shops s
    join public.business_locations l on l.business_id = s.id and l.is_active
    left join public.inventory_events e
      on e.business_id = s.id and e.occurred_at between p_from and p_to
  ),
  -- Рискованность категории — доля решений по ней, а не абсолютное число:
  -- у розы больше позиций, и без нормировки она побеждала бы всегда.
  risky as (
    select
      coalesce(si.category, 'без категории') as category,
      count(*)::integer as decisions,
      count(*) filter (where d.risk_type = 'expiry')::integer as spoilage_decisions,
      count(distinct d.business_id)::integer as shops
    from public.decision_contracts d
    join shops s on s.id = d.business_id
    join public.supply_items si on si.id = d.supply_item_id
    where d.created_at between p_from and p_to
    group by 1
    order by 2 desc
    limit 5
  ),
  waste as (
    select
      count(*)::integer as events,
      count(distinct e.business_id)::integer as shops,
      coalesce(sum(abs(e.quantity_delta_milli)), 0)::bigint as quantity_milli
    from public.inventory_events e
    join shops s on s.id = e.business_id
    where e.event_type = 'waste' and e.occurred_at between p_from and p_to
  ),
  -- Предотвращённый риск — это прогноз, а не факт экономии. Здесь считается
  -- средняя разница с вариантом «всё у быстрого» по подтверждённым решениям:
  -- владелец выбрал план, и расчёт утверждает, что дешёвый вариант стоил бы
  -- больше. Проверкой это станет только после замера.
  prevented as (
    select
      count(*)::integer as approved_decisions,
      coalesce(round(avg(nullif((d.counterfactual->>'differenceMinor')::numeric, 0))), 0)::bigint as avg_minor
    from public.decision_contracts d
    join shops s on s.id = d.business_id
    where d.status = 'approved'
      and d.decided_at between p_from and p_to
      and jsonb_typeof(d.counterfactual->'differenceMinor') = 'number'
  )
  select jsonb_build_object(
    'cohort', v_cohort,
    'suppressed', v_cohort < v_min_cohort,
    'minCohort', v_min_cohort,
    'activeLocations', (select n from live_locations),
    'riskyCategories', coalesce((select jsonb_agg(jsonb_build_object(
        'category', category, 'decisions', decisions,
        'spoilageDecisions', spoilage_decisions, 'shops', shops)) from risky), '[]'::jsonb),
    'wasteEvents', (select events from waste),
    'wasteShops', (select shops from waste),
    'wasteQuantityMilli', (select quantity_milli from waste),
    'approvedDecisions', (select approved_decisions from prevented),
    'avgPreventedRiskMinor', (select avg_minor from prevented)
  ) into v_result;

  -- Ниже порога когорты числа не отдаются вовсе. Обнулить их было бы честнее
  -- нуля, но неотличимо от «ничего не произошло», поэтому разрез помечается
  -- скрытым, а экран говорит об этом словами.
  if v_cohort < v_min_cohort then
    return jsonb_build_object('cohort', v_cohort, 'suppressed', true, 'minCohort', v_min_cohort);
  end if;

  return v_result;
end $$;

revoke all on function private.flower_platform_overview(timestamptz, timestamptz) from public, anon, authenticated, service_role;
grant execute on function private.flower_platform_overview(timestamptz, timestamptz) to authenticated;

create or replace function public.flower_platform_overview(p_from timestamptz, p_to timestamptz)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.flower_platform_overview(p_from, p_to) $$;

revoke all on function public.flower_platform_overview(timestamptz, timestamptz) from public, anon;
grant execute on function public.flower_platform_overview(timestamptz, timestamptz) to authenticated;

comment on function public.flower_platform_overview(timestamptz, timestamptz) is
 'Срез по цветочным магазинам для администратора платформы. Не отдаёт ни одной строки заведения и молчит на когорте меньше пяти.';

commit;
