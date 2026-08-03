begin;

-- Владелец заходит в приложение по ключу, который меняется каждый час.
--
-- Linking a chat by one-time code is right for a phone the owner keeps. It is
-- wrong for the case they actually asked for: opening the console from whatever
-- device is to hand, with a key they read off the cabinet. A key that never
-- expires is a password written on a whiteboard, so this one is derived from
-- the current hour and stops working when the hour does.
--
-- Derived, not stored: the key is an HMAC of (business, hour) under a secret
-- only the database holds, so there is nothing to leak from a table and nothing
-- to clean up. Two hours are accepted — the current one and the one before —
-- because a key read at 10:59 must still work at 11:00.

create table if not exists private.admin_key_secret (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  secret text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  created_at timestamptz not null default now()
);
alter table private.admin_key_secret enable row level security;
revoke all on private.admin_key_secret from public, anon, authenticated, service_role;

comment on table private.admin_key_secret is
 'Per-tenant secret the hourly admin key is derived from. No role may read it; only the security-definer functions below touch it.';

create or replace function private.admin_key_for(p_business_id uuid, p_hour timestamptz)
returns text language plpgsql security definer set search_path=''
as $$
declare v_secret text; v_digest bytea;
begin
  select secret into v_secret from private.admin_key_secret where business_id = p_business_id;
  if v_secret is null then
    insert into private.admin_key_secret(business_id) values (p_business_id)
    on conflict (business_id) do nothing;
    select secret into v_secret from private.admin_key_secret where business_id = p_business_id;
  end if;

  v_digest := extensions.hmac(
    p_business_id::text || ':' || to_char(date_trunc('hour', p_hour) at time zone 'UTC', 'YYYY-MM-DD"T"HH24'),
    v_secret, 'sha256');

  -- Eight characters from an unambiguous alphabet: no O/0, no I/1/l. This gets
  -- read aloud and typed on a phone.
  return (
    select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (get_byte(v_digest, i) % 32) + 1, 1), '')
    from generate_series(0, 7) i);
end $$;

revoke all on function private.admin_key_for(uuid, timestamptz) from public, anon, authenticated, service_role;

/** The key the cabinet shows, for the business the caller belongs to. */
create or replace function public.my_admin_key()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_business uuid; v_name text;
begin
  select bm.business_id, b.name into v_business, v_name
  from public.business_members bm
  join public.businesses b on b.id = bm.business_id
  where bm.user_id = (select auth.uid()) and bm.status = 'active'
    and bm.role in ('owner', 'manager')
  limit 1;
  if v_business is null then
    raise exception 'only an owner or a manager has an admin key' using errcode='42501';
  end if;

  return jsonb_build_object(
    'key', private.admin_key_for(v_business, now()),
    'businessName', v_name,
    -- When this one stops working, so the screen can count down rather than
    -- leave the owner guessing.
    'validUntil', date_trunc('hour', now()) + interval '1 hour');
end $$;

revoke all on function public.my_admin_key() from public, anon;
grant execute on function public.my_admin_key() to authenticated;

/**
 * Проверка ключа из приложения.
 *
 * Returns the business the key belongs to, or null. Deliberately not «which key
 * is right for this business» — the caller has no business id to offer, and a
 * function that took one would let somebody probe a key against every tenant.
 */
create or replace function private.business_for_admin_key(p_key text)
returns table(business_id uuid, business_name text) language plpgsql security definer set search_path=''
as $$
declare v_key text := upper(trim(coalesce(p_key, '')));
begin
  if v_key !~ '^[A-Z2-9]{8}$' then return; end if;
  return query
    select b.id, b.name
    from public.businesses b
    where b.status = 'active'
      and (private.admin_key_for(b.id, now()) = v_key
           or private.admin_key_for(b.id, now() - interval '1 hour') = v_key)
    limit 1;
end $$;

revoke all on function private.business_for_admin_key(text) from public, anon, authenticated, service_role;
grant execute on function private.business_for_admin_key(text) to service_role;

create or replace function public.business_for_admin_key(p_key text)
returns table(business_id uuid, business_name text) language sql security invoker set search_path=''
as $$ select * from private.business_for_admin_key(p_key) $$;
revoke all on function public.business_for_admin_key(text) from public, anon, authenticated;
grant execute on function public.business_for_admin_key(text) to service_role;

-- ---------------------------------------------------------------------------
-- Всё, что видит владелец в приложении, одним чтением
-- ---------------------------------------------------------------------------
create or replace function private.owner_console(p_business_id uuid)
returns jsonb language sql stable security definer set search_path=''
as $$
  select jsonb_build_object(
    'business', (select jsonb_build_object('name', b.name, 'isDemo', b.mode = 'demo', 'currency', b.currency)
                 from public.businesses b where b.id = p_business_id),
    'kpi', jsonb_build_object(
      'customers', (select count(*) from public.customers c where c.business_id = p_business_id and c.lifecycle_stage <> 'anonymized'),
      'sleeping', (select count(*) from public.customers c where c.business_id = p_business_id and c.lifecycle_stage = 'inactive'),
      'reachable', (select count(*) from public.customers c where c.business_id = p_business_id
                     and c.lifecycle_stage = 'inactive'
                     and private.resolve_effective_consent(p_business_id, c.id, 'marketing.telegram')),
      'activeCampaigns', (select count(*) from public.campaigns where business_id = p_business_id and status in ('approved','scheduled','running')),
      'revenue30', (select coalesce(sum(net_minor), 0) from public.transactions
                    where business_id = p_business_id and occurred_at >= now() - interval '30 days'),
      'unread', (select count(*) from public.notifications where business_id = p_business_id and read_at is null and dismissed_at is null)),
    'signal', (select jsonb_build_object('metricKey', s.metric_key, 'changeBps', s.change_bps,
                                         'confidence', s.confidence, 'gos', s.growth_opportunity_score)
               from public.signals s where s.business_id = p_business_id and s.status = 'open'
               order by s.growth_opportunity_score desc limit 1),
    'recommendations', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'title', r.title_ru, 'confidence', r.confidence,
        'reason', r.explanation->>'reason',
        'eligible', (r.explanation->>'eligible')::int,
        'contributionMinor', (r.explanation->>'expectedContributionMinor')::bigint) order by r.confidence desc)
      from (select * from public.recommendations
            where business_id = p_business_id and status = 'open'
            order by confidence desc limit 5) r), '[]'::jsonb),
    'contract', (select jsonb_build_object('id', gc.id, 'status', gc.status,
                                           'audience', (gc.consent_summary->>'granted')::int)
                 from public.growth_contracts gc
                 where gc.business_id = p_business_id and gc.status = 'approved'
                   and not exists (select 1 from public.campaigns c where c.growth_contract_id = gc.id)
                 order by gc.created_at desc limit 1),
    'questions', coalesce((select jsonb_agg(jsonb_build_object(
        'id', q.id, 'customerId', q.customer_id, 'name', q.name,
        'body', q.body, 'occurredAt', q.occurred_at, 'answered', q.answered) order by q.occurred_at desc)
      from (
        select ci.id, ci.customer_id, coalesce(c.display_name, 'Гость') as name, ci.body, ci.occurred_at,
               exists (select 1 from public.customer_interactions a
                       where a.customer_id = ci.customer_id and a.direction = 'outbound'
                         and a.kind = 'answer' and a.occurred_at > ci.occurred_at) as answered
        from public.customer_interactions ci
        left join public.customers c on c.id = ci.customer_id
        where ci.business_id = p_business_id and ci.direction = 'inbound' and ci.kind = 'question'
        order by ci.occurred_at desc limit 10) q), '[]'::jsonb),
    'notifications', coalesce((select jsonb_agg(jsonb_build_object(
        'id', n.id, 'title', n.title, 'body', n.body, 'category', n.category) order by n.created_at desc)
      from (select * from public.notifications where business_id = p_business_id
            and read_at is null and dismissed_at is null
            order by created_at desc limit 5) n), '[]'::jsonb),
    'supply', coalesce((select jsonb_agg(v) from jsonb_array_elements(private.supply_savings(p_business_id)) v
                        where (v->>'needed')::boolean), '[]'::jsonb))
$$;

revoke all on function private.owner_console(uuid) from public, anon, authenticated, service_role;
grant execute on function private.owner_console(uuid) to service_role;

create or replace function public.owner_console(p_business_id uuid)
returns jsonb language sql stable security invoker set search_path=''
as $$ select private.owner_console(p_business_id) $$;
revoke all on function public.owner_console(uuid) from public, anon, authenticated;
grant execute on function public.owner_console(uuid) to service_role;

comment on function public.owner_console(uuid) is
 'Everything the owner sees inside Telegram in one read: figures, the open signal, live recommendations, guest questions waiting for a human, notifications and what has run out.';

commit;
