begin;

-- Кабинет не мог записать то, что сам же показывает.
--
-- Both of these were written for the execution cycle, which runs as
-- `service_role`, and then called from a page, which runs as the signed-in
-- owner. The grant was never widened, so the write failed silently and the
-- screen showed a stale schedule and an empty search log while claiming both
-- were current. Found by the acceptance suite, not by reading the code:
-- «кнопка сдвигает срок» came back «stuck».
--
-- Widening a grant is not enough on its own. `mark_content_refreshed` takes a
-- business id, so granting it to `authenticated` unguarded would let any
-- signed-in user move any tenant's schedule. The membership check goes inside.

create or replace function private.mark_content_refreshed(
  p_business_id uuid, p_source text, p_asset_count integer)
returns timestamptz language plpgsql security definer set search_path=''
as $$
declare v_interval integer; v_next timestamptz; v_mock boolean;
begin
  -- The scheduler has no `auth.uid()`; a person has no service role. Either is
  -- allowed, nothing else is — and the tenant is checked for the person.
  if not private.is_system_caller() then
    if not exists (
      select 1 from public.business_members bm
      where bm.business_id = p_business_id
        and bm.user_id = (select auth.uid())
        and bm.status = 'active'
        and bm.role in ('owner', 'manager', 'marketer')
    ) then
      raise exception 'not a member of this business' using errcode = '42501';
    end if;
  end if;

  select b.mode = 'demo' into v_mock from public.businesses b where b.id = p_business_id;
  if v_mock is null then raise exception 'business not found' using errcode='23503'; end if;

  select coalesce(interval_hours, 12) into v_interval from public.content_refresh_state where business_id = p_business_id;
  v_interval := coalesce(v_interval, 12);
  v_next := now() + make_interval(hours => v_interval);

  insert into public.content_refresh_state(business_id, last_refreshed_at, next_refresh_at, interval_hours, last_source, last_asset_count, is_mock)
  values (p_business_id, now(), v_next, v_interval, p_source, coalesce(p_asset_count, 0), v_mock)
  on conflict (business_id) do update
  set last_refreshed_at = now(), next_refresh_at = v_next,
      last_source = excluded.last_source, last_asset_count = excluded.last_asset_count,
      updated_at = now();

  return v_next;
end $$;

revoke all on function private.mark_content_refreshed(uuid, text, integer) from public, anon, authenticated, service_role;
grant execute on function private.mark_content_refreshed(uuid, text, integer) to authenticated, service_role;
grant execute on function public.mark_content_refreshed(uuid, text, integer) to authenticated;

-- Журнал поисков заполняется тем, кто нажал кнопку, а не только планировщиком.
-- Без этой политики отказ площадки не попадал в базу вовсе, и экран не мог
-- отличить «цены свежие» от «источник молчит третий день» — ровно то, ради
-- чего таблица и заведена.
create policy supply_search_runs_member_insert on public.supply_search_runs
  for insert to authenticated
  with check (exists (
    select 1 from public.business_members bm
    where bm.business_id = supply_search_runs.business_id
      and bm.user_id = (select auth.uid())
      and bm.status = 'active'
      and bm.role in ('owner', 'manager', 'marketer')
  ));

grant insert on public.supply_search_runs to authenticated;

-- То же самое для снимков зарплат: кнопку нажимает владелец, а писать могла
-- только служебная роль.
create policy market_salary_member_write on public.market_salary_snapshots
  for all to authenticated
  using (exists (
    select 1 from public.business_members bm
    where bm.business_id = market_salary_snapshots.business_id
      and bm.user_id = (select auth.uid()) and bm.status = 'active'))
  with check (exists (
    select 1 from public.business_members bm
    where bm.business_id = market_salary_snapshots.business_id
      and bm.user_id = (select auth.uid()) and bm.status = 'active'
      and bm.role in ('owner', 'manager', 'marketer')));

grant insert, update, delete on public.market_salary_snapshots to authenticated;

-- Проверка на месте: молчаливый отказ в правах — это ровно то, что здесь уже
-- дважды прошло незамеченным до приёмки.
do $$
begin
  if not has_function_privilege('authenticated', 'public.mark_content_refreshed(uuid, text, integer)', 'execute') then
    raise exception 'authenticated cannot execute public.mark_content_refreshed';
  end if;
  if not has_table_privilege('authenticated', 'public.supply_search_runs', 'insert') then
    raise exception 'authenticated cannot insert into public.supply_search_runs';
  end if;
  if not has_table_privilege('authenticated', 'public.market_salary_snapshots', 'insert') then
    raise exception 'authenticated cannot insert into public.market_salary_snapshots';
  end if;
end $$;

commit;
