begin;

-- Материалы обновляются сами, раз в полдня.
--
-- A content library the owner has to remember to regenerate is a library that
-- goes stale, and stale scripts are worse than none: they name last month's
-- offer. Twice a day is the right cadence for a café — often enough that
-- «сегодняшнее» means today, rare enough that nobody watches it happen.
--
-- The schedule lives in the database rather than in a cron expression so the
-- screen can show the owner when the next one is due. A timer that counts down
-- to a moment nothing is actually scheduled for is decoration.

create table if not exists public.content_refresh_state (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  last_refreshed_at timestamptz,
  next_refresh_at timestamptz not null default now(),
  /** Every-N-hours. Twelve by default; the owner may widen it, never to zero. */
  interval_hours integer not null default 12 check (interval_hours between 1 and 168),
  last_source text check (last_source in ('provider', 'deterministic_fallback')),
  last_asset_count integer not null default 0 check (last_asset_count >= 0),
  is_mock boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.content_refresh_state enable row level security;

create policy content_refresh_member_read on public.content_refresh_state
  for select to authenticated
  using (exists (select 1 from public.business_members bm
                 where bm.business_id = content_refresh_state.business_id
                   and bm.user_id = (select auth.uid()) and bm.status = 'active'));

create policy content_refresh_manager_write on public.content_refresh_state
  for update to authenticated
  using (exists (select 1 from public.business_members bm
                 where bm.business_id = content_refresh_state.business_id
                   and bm.user_id = (select auth.uid()) and bm.status = 'active'
                   and bm.role in ('owner','manager','marketer')))
  with check (true);

grant select, update on public.content_refresh_state to authenticated;
grant select, insert, update, delete on public.content_refresh_state to service_role;

comment on table public.content_refresh_state is
 'When each tenant''s social pack was last rebuilt and when the next rebuild is due. Read by the cabinet to show a countdown, written by the execution cycle.';

/** Заведения, которым пора обновить материалы. */
create or replace function private.businesses_due_for_content(p_limit integer default 20)
returns table(business_id uuid) language sql stable security definer set search_path=''
as $$
  select b.id
  from public.businesses b
  left join public.content_refresh_state s on s.business_id = b.id
  where b.status = 'active'
    -- A venue with no menu has nothing to write about, and a pack built from an
    -- empty catalogue is the generic filler this product refuses to produce.
    and exists (select 1 from public.catalog_items c where c.business_id = b.id and c.is_active)
    and (s.business_id is null or s.next_refresh_at <= now())
  order by coalesce(s.next_refresh_at, to_timestamp(0))
  limit greatest(1, coalesce(p_limit, 20))
$$;

revoke all on function private.businesses_due_for_content(integer) from public, anon, authenticated, service_role;
grant execute on function private.businesses_due_for_content(integer) to service_role;

create or replace function public.businesses_due_for_content(p_limit integer default 20)
returns table(business_id uuid) language sql stable security invoker set search_path=''
as $$ select * from private.businesses_due_for_content(p_limit) $$;
revoke all on function public.businesses_due_for_content(integer) from public, anon, authenticated;
grant execute on function public.businesses_due_for_content(integer) to service_role;

/** Записывает, что материалы обновлены, и когда ждать следующего раза. */
create or replace function private.mark_content_refreshed(
  p_business_id uuid, p_source text, p_asset_count integer)
returns timestamptz language plpgsql security definer set search_path=''
as $$
declare v_interval integer; v_next timestamptz; v_mock boolean;
begin
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
grant execute on function private.mark_content_refreshed(uuid, text, integer) to service_role;

create or replace function public.mark_content_refreshed(p_business_id uuid, p_source text, p_asset_count integer)
returns timestamptz language sql security invoker set search_path=''
as $$ select private.mark_content_refreshed(p_business_id, p_source, p_asset_count) $$;
revoke all on function public.mark_content_refreshed(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.mark_content_refreshed(uuid, text, integer) to service_role;

-- Существующие заведения с меню получают расписание сразу, иначе первый цикл
-- обновит их все разом и это будет выглядеть как сбой.
insert into public.content_refresh_state(business_id, next_refresh_at, is_mock)
select b.id, now() + (random() * interval '6 hours'), b.mode = 'demo'
from public.businesses b
where b.status = 'active'
  and exists (select 1 from public.catalog_items c where c.business_id = b.id and c.is_active)
on conflict (business_id) do nothing;

commit;
