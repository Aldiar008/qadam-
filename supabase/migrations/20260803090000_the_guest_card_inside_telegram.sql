begin;

-- Everything the guest's own card needs, in one read.
--
-- The product knew a guest's balance, their reward target and the venue's menu,
-- and showed a guest none of it: `/q/<token>` renders a join form and a query
-- string, and the bot replies with one number. The Mini App is the first
-- surface where a person sees their own card, so this is the first function
-- that assembles one.
--
-- Reads only. Nothing here changes a balance; redemption is a separate call
-- with its own idempotency, because "look at my card" and "spend my stamps"
-- must never be the same request.

create or replace function private.loyalty_card(p_business_id uuid, p_customer_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare
  v_business record;
  v_account record;
  v_reward record;
  v_program uuid;
  v_visits jsonb;
  v_menu jsonb;
  v_offers jsonb;
  v_marketing boolean;
begin
  select b.id, b.name, b.mode = 'demo' as is_demo, b.currency into v_business
  from public.businesses b where b.id = p_business_id and b.status = 'active';
  if v_business.id is null then
    raise exception 'business not found or not active' using errcode='23503';
  end if;

  select la.id, la.loyalty_program_id, la.points_balance, la.stamps_balance
  into v_account
  from public.loyalty_accounts la
  where la.business_id = p_business_id and la.customer_id = p_customer_id
  order by la.created_at limit 1;
  v_program := v_account.loyalty_program_id;

  -- The nearest reward the guest is working towards: the cheapest active one
  -- they have not already earned outright.
  select r.id, r.name_ru, r.name_kk, coalesce(r.cost_stamps, 0) as cost_stamps, coalesce(r.cost_points, 0) as cost_points
  into v_reward
  from public.rewards r
  where r.business_id = p_business_id and r.status = 'active'
    and (v_program is null or r.loyalty_program_id = v_program)
  order by coalesce(r.cost_stamps, 2147483647), coalesce(r.cost_points, 9223372036854775807)
  limit 1;

  select coalesce(jsonb_agg(jsonb_build_object('occurredAt', t.occurred_at, 'amountMinor', t.net_minor) order by t.occurred_at desc), '[]'::jsonb)
  into v_visits
  from (
    select occurred_at, net_minor from public.transactions
    where business_id = p_business_id and customer_id = p_customer_id
    order by occurred_at desc limit 10
  ) t;

  select coalesce(jsonb_agg(jsonb_build_object('name', ci.name_ru, 'nameKk', ci.name_kk, 'priceMinor', ci.price_minor) order by ci.price_minor), '[]'::jsonb)
  into v_menu
  from (
    select name_ru, name_kk, price_minor from public.catalog_items
    where business_id = p_business_id and is_active order by price_minor limit 30
  ) ci;

  select coalesce(jsonb_agg(jsonb_build_object('slug', o.public_slug, 'title', o.title_ru, 'summary', o.description_ru) order by o.published_at desc), '[]'::jsonb)
  into v_offers
  from (
    select public_slug, title_ru, description_ru, published_at from public.nearby_offers
    where business_id = p_business_id and status = 'published'
      and (expires_at is null or expires_at > now())
    order by published_at desc nulls last limit 5
  ) o;

  v_marketing := private.resolve_effective_consent(p_business_id, p_customer_id, 'marketing.telegram');

  return jsonb_build_object(
    'business', jsonb_build_object('name', v_business.name, 'isDemo', v_business.is_demo, 'currency', v_business.currency),
    'card', case when v_account.id is null then null else jsonb_build_object(
      'stamps', v_account.stamps_balance,
      'points', v_account.points_balance,
      'reward', case when v_reward.id is null then null else jsonb_build_object(
        'id', v_reward.id, 'nameRu', v_reward.name_ru, 'nameKk', v_reward.name_kk,
        'costStamps', v_reward.cost_stamps, 'costPoints', v_reward.cost_points,
        -- The one number a loyalty card exists to answer: how much further.
        'remainingStamps', greatest(0, v_reward.cost_stamps - v_account.stamps_balance),
        'reachable', v_account.stamps_balance >= v_reward.cost_stamps
                     and v_account.points_balance >= v_reward.cost_points) end) end,
    'visits', v_visits,
    'menu', v_menu,
    'offers', v_offers,
    'marketingConsent', v_marketing);
end $$;

revoke all on function private.loyalty_card(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function private.loyalty_card(uuid, uuid) to service_role;

create or replace function public.loyalty_card(p_business_id uuid, p_customer_id uuid)
returns jsonb language sql stable security invoker set search_path=''
as $$ select private.loyalty_card(p_business_id, p_customer_id) $$;
revoke all on function public.loyalty_card(uuid, uuid) from public, anon, authenticated;
grant execute on function public.loyalty_card(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Redeeming without a QR code in hand
-- ---------------------------------------------------------------------------
--
-- `process_loyalty_redeem` is built around a scanned token and refuses any
-- identity that is not an email or a phone. Inside the Mini App the guest has
-- neither: they arrived from a chat that is already tied to a customer. The
-- checks that matter — balance, inventory, idempotency, locking the account —
-- are the same ones, kept the same.
create or replace function private.redeem_reward_for_customer(
  p_business_id uuid, p_customer_id uuid, p_reward_id uuid, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_mock boolean;
  v_account public.loyalty_accounts%rowtype;
  v_reward public.rewards%rowtype;
  v_ledger_id uuid;
  v_redemption_id uuid;
  v_result jsonb;
  v_receipt jsonb;
  v_used integer;
begin
  if char_length(coalesce(p_idempotency_key, '')) not between 8 and 200 then
    raise exception 'invalid idempotency key' using errcode='22023';
  end if;

  select b.mode = 'demo' into v_mock
  from public.businesses b
  join public.customers c on c.business_id = b.id
  where b.id = p_business_id and c.id = p_customer_id and b.status = 'active';
  if v_mock is null then
    raise exception 'customer does not belong to this business' using errcode='42501';
  end if;

  select result into v_receipt from private.domain_command_receipts
  where business_id = p_business_id and idempotency_key = p_idempotency_key;
  if v_receipt is not null then return v_receipt || jsonb_build_object('duplicate', true); end if;

  select * into v_reward from public.rewards
  where id = p_reward_id and business_id = p_business_id and status = 'active';
  if v_reward.id is null then raise exception 'reward not found' using errcode='23503'; end if;

  select * into v_account from public.loyalty_accounts
  where business_id = p_business_id and customer_id = p_customer_id
    and loyalty_program_id = v_reward.loyalty_program_id
  for update;
  if v_account.id is null then raise exception 'loyalty account not found' using errcode='23503'; end if;

  if v_account.points_balance < coalesce(v_reward.cost_points, 0)
     or v_account.stamps_balance < coalesce(v_reward.cost_stamps, 0) then
    raise exception 'insufficient loyalty balance' using errcode='23514';
  end if;

  if v_reward.inventory_limit is not null then
    select count(*) into v_used from public.reward_redemptions
    where reward_id = v_reward.id and status in ('issued', 'redeemed');
    if v_used >= v_reward.inventory_limit then
      raise exception 'reward inventory exhausted' using errcode='23514';
    end if;
  end if;

  insert into public.loyalty_ledger(business_id, loyalty_account_id, entry_type, points_delta, stamps_delta, source_type, source_id, idempotency_key, metadata, is_mock)
  values (p_business_id, v_account.id, 'redeem', -coalesce(v_reward.cost_points, 0), -coalesce(v_reward.cost_stamps, 0),
          'reward', v_reward.id, 'redeem:' || p_idempotency_key,
          jsonb_build_object('reward_id', v_reward.id, 'surface', 'telegram_mini_app'), v_mock)
  returning id into v_ledger_id;

  update public.loyalty_accounts
  set points_balance = points_balance - coalesce(v_reward.cost_points, 0),
      stamps_balance = stamps_balance - coalesce(v_reward.cost_stamps, 0),
      optimistic_version = optimistic_version + 1
  where id = v_account.id returning * into v_account;

  insert into public.reward_redemptions(business_id, reward_id, customer_id, loyalty_ledger_id, status, idempotency_key, is_mock)
  values (p_business_id, v_reward.id, p_customer_id, v_ledger_id, 'redeemed', p_idempotency_key, v_mock)
  returning id into v_redemption_id;

  v_result := jsonb_build_object(
    'redemption_id', v_redemption_id, 'customer_id', p_customer_id, 'loyalty_account_id', v_account.id,
    'reward_ru', v_reward.name_ru,
    'points_balance', v_account.points_balance, 'stamps_balance', v_account.stamps_balance,
    'duplicate', false, 'is_demo', v_mock, 'surface', 'telegram_mini_app');

  insert into private.domain_command_receipts
  values (p_business_id, p_idempotency_key, 'loyalty.redeem', 'reward_redemption', v_redemption_id, v_result, now());

  insert into public.activity_logs(business_id, action, resource_type, resource_id, metadata, is_mock)
  values (p_business_id, 'loyalty.redeemed', 'reward_redemption', v_redemption_id, v_result, v_mock);

  return v_result;
end $$;

revoke all on function private.redeem_reward_for_customer(uuid, uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function private.redeem_reward_for_customer(uuid, uuid, uuid, text) to service_role;

create or replace function public.redeem_reward_for_customer(p_business_id uuid, p_customer_id uuid, p_reward_id uuid, p_idempotency_key text)
returns jsonb language sql security invoker set search_path=''
as $$ select private.redeem_reward_for_customer(p_business_id, p_customer_id, p_reward_id, p_idempotency_key) $$;
revoke all on function public.redeem_reward_for_customer(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.redeem_reward_for_customer(uuid, uuid, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Which venue this chat belongs to
-- ---------------------------------------------------------------------------
--
-- `customer_for_channel_address` answers with `limit 1` and no business filter,
-- so a guest enrolled at two venues resolved to whichever row came back first.
-- Inside a Mini App opened from one venue's bot that is not a detail: it is the
-- wrong card. This returns every pairing and lets the caller pick.
create or replace function private.customer_channels_for_address(p_channel text, p_address text)
returns table(business_id uuid, customer_id uuid, business_name text) language sql stable security definer set search_path=''
as $$
  select ca.business_id, ca.customer_id, b.name
  from private.channel_addresses ca
  join public.businesses b on b.id = ca.business_id and b.status = 'active'
  where ca.channel = p_channel and ca.address = p_address and ca.customer_id is not null
  order by ca.updated_at desc
$$;

revoke all on function private.customer_channels_for_address(text, text) from public, anon, authenticated, service_role;
grant execute on function private.customer_channels_for_address(text, text) to service_role;

create or replace function public.customer_channels_for_address(p_channel text, p_address text)
returns table(business_id uuid, customer_id uuid, business_name text) language sql stable security invoker set search_path=''
as $$ select * from private.customer_channels_for_address(p_channel, p_address) $$;
revoke all on function public.customer_channels_for_address(text, text) from public, anon, authenticated;
grant execute on function public.customer_channels_for_address(text, text) to service_role;

-- Which venues this chat may act as owner for, so the Mini App can offer the
-- owner view only to someone the linkage already trusts.
create or replace function private.owner_businesses_for_chat(p_chat_id text)
returns table(business_id uuid, business_name text) language sql stable security definer set search_path=''
as $$
  select ca.business_id, b.name
  from private.channel_addresses ca
  join public.businesses b on b.id = ca.business_id and b.status = 'active'
  where ca.channel = 'telegram' and ca.address = p_chat_id and ca.owner_user_id is not null
    and private.has_business_role_for(ca.business_id, ca.owner_user_id, array['owner','manager','marketer'])
  order by ca.updated_at desc
$$;

revoke all on function private.owner_businesses_for_chat(text) from public, anon, authenticated, service_role;
grant execute on function private.owner_businesses_for_chat(text) to service_role;

create or replace function public.owner_businesses_for_chat(p_chat_id text)
returns table(business_id uuid, business_name text) language sql stable security invoker set search_path=''
as $$ select * from private.owner_businesses_for_chat(p_chat_id) $$;
revoke all on function public.owner_businesses_for_chat(text) from public, anon, authenticated;
grant execute on function public.owner_businesses_for_chat(text) to service_role;

comment on function public.loyalty_card(uuid, uuid) is
 'Everything one guest sees about their own card: balance, distance to the next reward, recent visits, the venue menu and its published offers. Read-only.';

commit;
