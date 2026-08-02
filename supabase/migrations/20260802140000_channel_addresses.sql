begin;

-- Where a real delivery address lives.
--
-- Public tables store contacts as a hash and a mask on purpose:
-- `customer_identities.lookup_hash` finds a person without holding their phone
-- number, and `masked_value` shows the owner enough to recognise them. That
-- design is right and stays. But a hash cannot be sent to — Telegram needs the
-- chat id it gave us — and `PreparedMessage.recipientRef` is documented as a
-- masked reference the adapter resolves "from its own store". This table is
-- that store.
--
-- It lives in `private` with no Data API grants, so no member, no anonymous
-- visitor and no PostgREST request can read it. Only the security-definer
-- functions below can, and only the worker may call them.
create table if not exists private.channel_addresses (
  business_id  uuid not null references public.businesses(id) on delete cascade,
  customer_id  uuid references public.customers(id) on delete cascade,
  channel      text not null check (channel in ('telegram', 'whatsapp', 'sms', 'email')),
  -- The owner's own chat, for the assistant bot. Exactly one of customer_id or
  -- owner_user_id is set; a row belongs to a guest or to a member, never both.
  owner_user_id uuid references auth.users(id) on delete cascade,
  address      text not null check (length(address) between 1 and 200),
  verified_at  timestamptz not null default now(),
  is_mock      boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint channel_addresses_one_subject check (num_nonnulls(customer_id, owner_user_id) = 1)
);

create unique index if not exists channel_addresses_customer_idx
  on private.channel_addresses(business_id, channel, customer_id) where customer_id is not null;
create unique index if not exists channel_addresses_owner_idx
  on private.channel_addresses(business_id, channel, owner_user_id) where owner_user_id is not null;
-- One chat belongs to one subject per business, so a forwarded deep link cannot
-- quietly attach somebody else's chat to a customer that is not theirs.
create unique index if not exists channel_addresses_address_idx
  on private.channel_addresses(business_id, channel, address);

alter table private.channel_addresses enable row level security;
revoke all on table private.channel_addresses from public, anon, authenticated, service_role;

comment on table private.channel_addresses is
  'Real delivery addresses (Telegram chat ids and the like). Never exposed through the Data API; read only by security-definer functions.';

-- ---------------------------------------------------------------------------

create or replace function private.remember_channel_address(
  p_business_id uuid, p_channel text, p_address text,
  p_customer_id uuid default null, p_owner_user_id uuid default null)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_mock boolean;
begin
  select mode = 'demo' into v_mock from public.businesses where id = p_business_id and status = 'active';
  if v_mock is null then
    raise exception 'business not found or not active' using errcode='23503';
  end if;

  insert into private.channel_addresses(business_id, channel, address, customer_id, owner_user_id, is_mock)
  values (p_business_id, p_channel, p_address, p_customer_id, p_owner_user_id, v_mock)
  on conflict (business_id, channel, address) do update
    set customer_id = excluded.customer_id,
        owner_user_id = excluded.owner_user_id,
        verified_at = now(),
        updated_at = now();

  return jsonb_build_object('remembered', true, 'channel', p_channel, 'is_mock', v_mock);
end $$;
revoke all on function private.remember_channel_address(uuid,text,text,uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function private.remember_channel_address(uuid,text,text,uuid,uuid) to service_role;

create or replace function public.remember_channel_address(
  p_business_id uuid, p_channel text, p_address text,
  p_customer_id uuid default null, p_owner_user_id uuid default null)
returns jsonb language sql security invoker set search_path=''
as $$ select private.remember_channel_address(p_business_id,p_channel,p_address,p_customer_id,p_owner_user_id) $$;
revoke all on function public.remember_channel_address(uuid,text,text,uuid,uuid) from public, anon, authenticated;
grant execute on function public.remember_channel_address(uuid,text,text,uuid,uuid) to service_role;

-- ---------------------------------------------------------------------------

-- Resolves one recipient. Returns null rather than raising when there is no
-- address: a guest who never opened the bot is a normal state, and the caller
-- records that as an undeliverable message instead of an error.
create or replace function private.resolve_channel_address(
  p_business_id uuid, p_channel text, p_customer_id uuid)
returns text language sql stable security definer set search_path=''
as $$
  select address from private.channel_addresses
  where business_id = p_business_id and channel = p_channel and customer_id = p_customer_id
  limit 1
$$;
revoke all on function private.resolve_channel_address(uuid,text,uuid) from public, anon, authenticated, service_role;
grant execute on function private.resolve_channel_address(uuid,text,uuid) to service_role;

create or replace function public.resolve_channel_address(
  p_business_id uuid, p_channel text, p_customer_id uuid)
returns text language sql stable security invoker set search_path=''
as $$ select private.resolve_channel_address(p_business_id,p_channel,p_customer_id) $$;
revoke all on function public.resolve_channel_address(uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.resolve_channel_address(uuid,text,uuid) to service_role;

commit;
