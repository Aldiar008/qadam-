begin;

-- Let a linked owner confirm a launch from Telegram.
--
-- `launch_growth_contract` reads `auth.uid()`, and the bot has no session — it
-- has a chat. So the bot needs a way to act as the person whose chat it is,
-- without that becoming a way to act as anybody.
--
-- The chain of evidence is what makes this safe, and it is worth stating:
--
--   1. the code that linked the chat was issued to a signed-in owner or
--      manager, against a specific business, and was valid for one hour;
--   2. it was single-use, so the chat that claimed it is the chat of the person
--      who was holding the code;
--   3. that pairing is stored in `private.channel_addresses`, which no
--      application role can read or write.
--
-- This function therefore takes a chat id, not a user id: the caller cannot
-- name whom to act as, it can only present a chat and let the database say who
-- that is. The role check then runs exactly as it does for a web request.
-- The same membership rule as `has_business_role`, asked about a named person
-- instead of the current session. It exists because the bot has no session; it
-- deliberately takes the user id rather than deriving one, so every caller has
-- to have obtained that id from somewhere trustworthy — here, from the linked
-- chat, which no application role can write.
create or replace function private.has_business_role_for(
  target_business_id uuid, target_user_id uuid, allowed_roles text[] default null)
returns boolean language sql stable security definer set search_path=''
as $$
 select target_user_id is not null and exists (
  select 1 from public.business_members bm
  where bm.business_id = target_business_id and bm.user_id = target_user_id and bm.status = 'active'
    and (allowed_roles is null or bm.role = any(allowed_roles))
 )
$$;
revoke all on function private.has_business_role_for(uuid,uuid,text[]) from public, anon, authenticated, service_role;
grant execute on function private.has_business_role_for(uuid,uuid,text[]) to service_role;

create or replace function private.launch_contract_from_chat(
  p_chat_id text, p_contract_id uuid, p_name text, p_channel text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_user uuid;
  v_business uuid;
  v_contract public.growth_contracts%rowtype;
  v_campaign public.campaigns%rowtype;
  v_result jsonb;
begin
  select owner_user_id, business_id into v_user, v_business
  from private.channel_addresses
  where channel = 'telegram' and address = p_chat_id and owner_user_id is not null
  limit 1;
  if v_user is null then
    raise exception 'this chat is not linked to a business' using errcode='42501';
  end if;

  select * into v_contract from public.growth_contracts where id = p_contract_id for update;
  if v_contract.id is null or v_contract.business_id <> v_business then
    raise exception 'contract does not belong to the linked business' using errcode='42501';
  end if;
  if not private.has_business_role_for(v_business, v_user, array['owner','manager','marketer']) then
    raise exception 'forbidden' using errcode='42501';
  end if;
  if v_contract.status <> 'approved' then
    raise exception 'contract must be approved before launch' using errcode='40001';
  end if;

  -- One launch per contract, whichever surface asked for it: pressing the
  -- button twice, or pressing it after launching in the cabinet, must be the
  -- same launch rather than a second campaign.
  select * into v_campaign from public.campaigns
  where business_id = v_business and growth_contract_id = v_contract.id
  order by created_at limit 1;
  if v_campaign.id is not null then
    return jsonb_build_object('campaign_id', v_campaign.id, 'duplicate', true, 'status', v_campaign.status);
  end if;

  update public.growth_contracts
  set status = 'launching', optimistic_version = optimistic_version + 1,
      last_idempotency_key = 'telegram:' || p_contract_id::text
  where id = v_contract.id;

  insert into public.campaigns(business_id, growth_contract_id, name, status, channel, budget_minor, currency,
                               stop_rule, created_by, approved_by, is_mock, idempotency_key)
  values (v_business, v_contract.id, p_name, 'approved', p_channel,
          coalesce((v_contract.simulator_result #>> '{scenarios,base,campaignCostMinor}')::bigint, 0), 'KZT',
          v_contract.accepted_snapshot->'stopRule', v_user, v_user, v_contract.is_mock,
          'telegram:launch:' || p_contract_id::text)
  returning * into v_campaign;

  v_result := jsonb_build_object('campaign_id', v_campaign.id, 'contract_id', v_contract.id,
                                 'duplicate', false, 'status', v_campaign.status, 'surface', 'telegram');

  insert into public.outbox_events(business_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key, is_mock)
  values (v_business, 'campaign', v_campaign.id, 'campaign.launch_requested', v_result,
          'outbox:telegram:launch:' || p_contract_id::text, v_contract.is_mock);

  -- The surface is recorded because "who confirmed this, and where" is a
  -- question the owner is entitled to ask later.
  insert into public.activity_logs(business_id, actor_id, action, resource_type, resource_id, metadata, is_mock)
  values (v_business, v_user, 'campaign.launch_requested', 'campaign', v_campaign.id, v_result, v_contract.is_mock);

  return v_result;
end $$;
revoke all on function private.launch_contract_from_chat(text,uuid,text,text) from public, anon, authenticated, service_role;
grant execute on function private.launch_contract_from_chat(text,uuid,text,text) to service_role;

create or replace function public.launch_contract_from_chat(
  p_chat_id text, p_contract_id uuid, p_name text, p_channel text)
returns jsonb language sql security invoker set search_path=''
as $$ select private.launch_contract_from_chat(p_chat_id, p_contract_id, p_name, p_channel) $$;
revoke all on function public.launch_contract_from_chat(text,uuid,text,text) from public, anon, authenticated;
grant execute on function public.launch_contract_from_chat(text,uuid,text,text) to service_role;

-- ---------------------------------------------------------------------------
-- What the assistant has to say today, for one business.
--
-- Read-only and shaped for a chat: the open signal, the approved contract that
-- is still waiting, and enough of the economics to decide. It returns null
-- rather than an empty digest when there is nothing to report — silence is the
-- correct message on a day with no news.
create or replace function private.owner_digest(p_business_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_signal public.signals%rowtype; v_contract public.growth_contracts%rowtype; v_name text;
begin
  select name into v_name from public.businesses where id = p_business_id and status = 'active';
  if v_name is null then return null; end if;

  select * into v_signal from public.signals
  where business_id = p_business_id and status = 'open'
  order by growth_opportunity_score desc, detected_at desc limit 1;

  select * into v_contract from public.growth_contracts gc
  where gc.business_id = p_business_id and gc.status = 'approved'
    and not exists (select 1 from public.campaigns c where c.growth_contract_id = gc.id)
  order by gc.updated_at desc limit 1;

  if v_signal.id is null and v_contract.id is null then return null; end if;

  return jsonb_build_object(
    'business_name', v_name,
    'signal', case when v_signal.id is null then null else jsonb_build_object(
      'metric_key', v_signal.metric_key,
      'change_bps', v_signal.change_bps,
      'confidence', v_signal.confidence,
      'score', v_signal.growth_opportunity_score) end,
    'contract', case when v_contract.id is null then null else jsonb_build_object(
      'id', v_contract.id,
      'audience', v_contract.accepted_snapshot #>> '{audience,eligible}',
      'margin_allowed', coalesce(v_contract.margin_decision ->> 'decision', 'unknown'),
      'contribution_minor', v_contract.simulator_result #>> '{scenarios,base,contributionMarginMinor}') end);
end $$;
revoke all on function private.owner_digest(uuid) from public, anon, authenticated, service_role;
grant execute on function private.owner_digest(uuid) to service_role;

create or replace function public.owner_digest(p_business_id uuid)
returns jsonb language sql stable security invoker set search_path=''
as $$ select private.owner_digest(p_business_id) $$;
revoke all on function public.owner_digest(uuid) from public, anon, authenticated;
grant execute on function public.owner_digest(uuid) to service_role;

-- Which chats an assistant should write to for a business.
create or replace function private.owner_chats(p_business_id uuid)
returns table(chat_id text) language sql stable security definer set search_path=''
as $$
  select address from private.channel_addresses
  where business_id = p_business_id and channel = 'telegram' and owner_user_id is not null
$$;
revoke all on function private.owner_chats(uuid) from public, anon, authenticated, service_role;
grant execute on function private.owner_chats(uuid) to service_role;

create or replace function public.owner_chats(p_business_id uuid)
returns table(chat_id text) language sql stable security invoker set search_path=''
as $$ select * from private.owner_chats(p_business_id) $$;
revoke all on function public.owner_chats(uuid) from public, anon, authenticated;
grant execute on function public.owner_chats(uuid) to service_role;

commit;
