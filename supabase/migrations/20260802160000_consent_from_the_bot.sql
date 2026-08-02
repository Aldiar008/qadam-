begin;

-- A guest changes their mind about marketing, in the channel they are in.
--
-- Joining the loyalty programme grants `loyalty` and nothing else: the bot
-- records `marketing=denied` on join and asks separately, because a scan is
-- consent to a card, not to being written to. Saying yes afterwards has to be
-- recordable, and so does taking it back — a channel that can only collect
-- consent and never release it is not consent, it is a trap.
--
-- Consent is append-only by design: a new decision is a new row, and the most
-- recent one wins. This function follows that rather than editing history,
-- so "when did they agree, and where" stays answerable.
create or replace function private.record_channel_consent(
  p_business_id uuid,
  p_customer_id uuid,
  p_scope text,
  p_granted boolean,
  p_source text,
  p_evidence jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_mock boolean;
begin
  if p_scope not in ('marketing', 'marketing.telegram', 'marketing.whatsapp', 'marketing.email', 'loyalty') then
    raise exception 'unsupported consent scope %', p_scope using errcode='22023';
  end if;

  select b.mode = 'demo' into v_mock
  from public.businesses b
  join public.customers c on c.business_id = b.id
  where b.id = p_business_id and c.id = p_customer_id and b.status = 'active';
  if v_mock is null then
    raise exception 'customer does not belong to this business' using errcode='42501';
  end if;

  insert into public.customer_consents(business_id, customer_id, scope, status, source, evidence, granted_at, revoked_at, is_mock)
  values (p_business_id, p_customer_id, p_scope,
          case when p_granted then 'granted' else 'revoked' end,
          p_source,
          p_evidence || jsonb_build_object('recorded_at', now()),
          case when p_granted then now() else null end,
          case when p_granted then null else now() end,
          v_mock);

  -- Withdrawing consent also stops anything already queued. Leaving a queued
  -- message to go out after someone said stop is precisely the failure the
  -- suppression list exists to prevent.
  if not p_granted then
    insert into public.suppression_entries(business_id, customer_id, channel, reason, is_mock)
    values (p_business_id, p_customer_id,
            nullif(split_part(p_scope, '.', 2), ''), 'unsubscribed', v_mock)
    on conflict do nothing;
  end if;

  insert into public.activity_logs(business_id, actor_id, action, resource_type, resource_id, metadata, is_mock)
  values (p_business_id, null,
          case when p_granted then 'consent.granted' else 'consent.revoked' end,
          'customer', p_customer_id,
          jsonb_build_object('scope', p_scope, 'source', p_source), v_mock);

  return jsonb_build_object('scope', p_scope, 'granted', p_granted, 'is_mock', v_mock);
end $$;
revoke all on function private.record_channel_consent(uuid,uuid,text,boolean,text,jsonb) from public, anon, authenticated, service_role;
grant execute on function private.record_channel_consent(uuid,uuid,text,boolean,text,jsonb) to service_role;

create or replace function public.record_channel_consent(
  p_business_id uuid, p_customer_id uuid, p_scope text, p_granted boolean,
  p_source text, p_evidence jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path=''
as $$ select private.record_channel_consent(p_business_id,p_customer_id,p_scope,p_granted,p_source,p_evidence) $$;
revoke all on function public.record_channel_consent(uuid,uuid,text,boolean,text,jsonb) from public, anon, authenticated;
grant execute on function public.record_channel_consent(uuid,uuid,text,boolean,text,jsonb) to service_role;

-- Finds the guest behind a chat, so the bot can act on "да" without the caller
-- ever handling a raw contact.
create or replace function private.customer_for_channel_address(p_channel text, p_address text)
returns table(business_id uuid, customer_id uuid) language sql stable security definer set search_path=''
as $$
  select business_id, customer_id from private.channel_addresses
  where channel = p_channel and address = p_address and customer_id is not null
  limit 1
$$;
revoke all on function private.customer_for_channel_address(text,text) from public, anon, authenticated, service_role;
grant execute on function private.customer_for_channel_address(text,text) to service_role;

create or replace function public.customer_for_channel_address(p_channel text, p_address text)
returns table(business_id uuid, customer_id uuid) language sql stable security invoker set search_path=''
as $$ select * from private.customer_for_channel_address(p_channel, p_address) $$;
revoke all on function public.customer_for_channel_address(text,text) from public, anon, authenticated;
grant execute on function public.customer_for_channel_address(text,text) to service_role;

commit;
