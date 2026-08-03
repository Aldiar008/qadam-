begin;

-- Что гость сделал и о чём спросил.
--
-- Everything a guest did in the bot — joined, gave or withdrew consent, took a
-- reward, asked a question — happened and left no trace the owner could read.
-- The customer card showed purchases from the till and nothing else, so the
-- half of the relationship that now runs through Telegram was invisible in the
-- product built to manage that relationship.
--
-- One append-only table. It is not a chat log for its own sake: it is the
-- history the owner reads on the guest's card, and the same history the
-- assistant is allowed to look at before answering.
create table if not exists public.customer_interactions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete cascade,
  channel text not null check (channel in ('telegram', 'web', 'qr', 'email', 'whatsapp', 'in_app')),
  direction text not null check (direction in ('inbound', 'outbound')),
  kind text not null check (kind in ('question', 'answer', 'join', 'consent', 'redeem', 'order', 'visit', 'notice')),
  body text not null check (char_length(body) between 1 and 4000),
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  is_mock boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.customer_interactions enable row level security;

-- Same rule as every other tenant table: a member of the business reads its
-- own rows and nobody else's.
create policy customer_interactions_member_read on public.customer_interactions
  for select to authenticated
  using (exists (
    select 1 from public.business_members bm
    where bm.business_id = customer_interactions.business_id
      and bm.user_id = (select auth.uid()) and bm.status = 'active'));

grant select on public.customer_interactions to authenticated;
grant select, insert, update, delete on public.customer_interactions to service_role;

create index if not exists customer_interactions_customer_idx
  on public.customer_interactions(business_id, customer_id, occurred_at desc);
create index if not exists customer_interactions_business_idx
  on public.customer_interactions(business_id, occurred_at desc);

comment on table public.customer_interactions is
 'Append-only history of what a guest did and asked outside the till: joins, consent decisions, redemptions and questions with the answers given.';

/**
 * Writes one interaction.
 *
 * Everything that reaches this table comes from a channel the server already
 * authenticated — a verified Telegram chat, a QR token, a signed webhook — so
 * the function checks that the customer belongs to the business and nothing
 * else. The demo/production flag follows the tenant, as everywhere.
 */
create or replace function private.record_customer_interaction(
  p_business_id uuid,
  p_customer_id uuid,
  p_channel text,
  p_direction text,
  p_kind text,
  p_body text,
  p_metadata jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_mock boolean; v_id uuid;
begin
  select b.mode = 'demo' into v_mock from public.businesses b where b.id = p_business_id and b.status = 'active';
  if v_mock is null then
    raise exception 'business not found or not active' using errcode='23503';
  end if;
  if p_customer_id is not null and not exists (
    select 1 from public.customers c where c.id = p_customer_id and c.business_id = p_business_id) then
    raise exception 'customer does not belong to this business' using errcode='42501';
  end if;

  insert into public.customer_interactions(business_id, customer_id, channel, direction, kind, body, metadata, is_mock)
  values (p_business_id, p_customer_id, p_channel, p_direction, p_kind, left(p_body, 4000), coalesce(p_metadata, '{}'::jsonb), v_mock)
  returning id into v_id;

  -- The card shows «был здесь», and a question in the chat is contact just as
  -- much as a purchase is. Only forward: a guest writing today cannot make
  -- their last visit older.
  if p_customer_id is not null and p_direction = 'inbound' then
    update public.customers
    set last_seen_at = greatest(coalesce(last_seen_at, now()), now())
    where id = p_customer_id and (last_seen_at is null or last_seen_at < now());
  end if;

  return v_id;
end $$;

revoke all on function private.record_customer_interaction(uuid, uuid, text, text, text, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function private.record_customer_interaction(uuid, uuid, text, text, text, text, jsonb) to service_role;

create or replace function public.record_customer_interaction(
  p_business_id uuid, p_customer_id uuid, p_channel text, p_direction text, p_kind text, p_body text, p_metadata jsonb default '{}'::jsonb)
returns uuid language sql security invoker set search_path=''
as $$ select private.record_customer_interaction(p_business_id, p_customer_id, p_channel, p_direction, p_kind, p_body, p_metadata) $$;
revoke all on function public.record_customer_interaction(uuid, uuid, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.record_customer_interaction(uuid, uuid, text, text, text, text, jsonb) to service_role;

/**
 * Everything the assistant is allowed to know before answering a guest.
 *
 * Assembled here rather than in the application so the boundary is one place:
 * the menu, the loyalty rules, the opening hours, the published offers, and —
 * only when the chat is already tied to a customer — that guest's own balance
 * and recent history. No other guest's data can be reached through it.
 */
create or replace function private.assistant_context(p_business_id uuid, p_customer_id uuid default null)
returns jsonb language sql stable security definer set search_path=''
as $$
  select jsonb_build_object(
    'business', (select jsonb_build_object('name', b.name, 'currency', b.currency, 'isDemo', b.mode = 'demo')
                 from public.businesses b where b.id = p_business_id),
    'location', (select jsonb_build_object('city', l.city, 'district', l.district, 'address', l.address_text)
                 from public.business_locations l where l.business_id = p_business_id and l.is_active
                 order by l.created_at limit 1),
    'hours', coalesce((select jsonb_agg(jsonb_build_object('day', h.day_of_week, 'opens', h.opens_at, 'closes', h.closes_at, 'closed', h.is_closed) order by h.day_of_week)
                       from public.operating_hours h where h.business_id = p_business_id), '[]'::jsonb),
    'menu', coalesce((select jsonb_agg(jsonb_build_object('name', c.name_ru, 'priceMinor', c.price_minor) order by c.price_minor)
                      from (select name_ru, price_minor from public.catalog_items
                            where business_id = p_business_id and is_active order by price_minor limit 30) c), '[]'::jsonb),
    'loyalty', (select jsonb_build_object('program', p.name, 'type', p.program_type, 'rules', p.rules)
                from public.loyalty_programs p where p.business_id = p_business_id and p.status = 'active' limit 1),
    'rewards', coalesce((select jsonb_agg(jsonb_build_object('name', r.name_ru, 'costStamps', r.cost_stamps, 'costPoints', r.cost_points) order by r.cost_stamps)
                         from public.rewards r where r.business_id = p_business_id and r.status = 'active'), '[]'::jsonb),
    'offers', coalesce((select jsonb_agg(jsonb_build_object('title', o.title_ru, 'details', o.description_ru) order by o.published_at desc)
                        from (select title_ru, description_ru, published_at from public.nearby_offers
                              where business_id = p_business_id and status = 'published'
                                and (expires_at is null or expires_at > now())
                              order by published_at desc nulls last limit 5) o), '[]'::jsonb),
    'guest', case when p_customer_id is null then null else (
      select jsonb_build_object(
        'name', c.display_name,
        'stage', c.lifecycle_stage,
        'stamps', coalesce((select la.stamps_balance from public.loyalty_accounts la
                            where la.business_id = p_business_id and la.customer_id = c.id limit 1), 0),
        'points', coalesce((select la.points_balance from public.loyalty_accounts la
                            where la.business_id = p_business_id and la.customer_id = c.id limit 1), 0),
        'visits', (select count(*) from public.transactions t where t.business_id = p_business_id and t.customer_id = c.id),
        'lastVisitDays', case when c.last_seen_at is null then null
                              else floor(extract(epoch from now() - c.last_seen_at) / 86400)::int end,
        'marketingConsent', private.resolve_effective_consent(p_business_id, c.id, 'marketing.telegram'))
      from public.customers c where c.id = p_customer_id and c.business_id = p_business_id) end)
$$;

revoke all on function private.assistant_context(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function private.assistant_context(uuid, uuid) to service_role;

create or replace function public.assistant_context(p_business_id uuid, p_customer_id uuid default null)
returns jsonb language sql stable security invoker set search_path=''
as $$ select private.assistant_context(p_business_id, p_customer_id) $$;
revoke all on function public.assistant_context(uuid, uuid) from public, anon, authenticated;
grant execute on function public.assistant_context(uuid, uuid) to service_role;

commit;
