begin;

-- Saying yes again has to actually work.
--
-- Withdrawing marketing consent adds a suppression entry, which is right: a
-- message already queued must not go out after someone says stop. But
-- `send_gate` checks suppression before it checks consent, so the entry
-- outlived the decision — a guest who said "нет" and then "да" was recorded as
-- consenting and still silently blocked. The screen and the truth disagreed,
-- which is the one thing this product is built not to do.
--
-- Only the person's own unsubscribe is lifted. A bounce, a complaint or an
-- owner block are somebody else's judgement about this address, and a guest
-- saying yes cannot overturn them.
create or replace function private.record_channel_consent(
  p_business_id uuid,
  p_customer_id uuid,
  p_scope text,
  p_granted boolean,
  p_source text,
  p_evidence jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_mock boolean; v_channel text;
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

  v_channel := nullif(split_part(p_scope, '.', 2), '');

  insert into public.customer_consents(business_id, customer_id, scope, status, source, evidence, granted_at, revoked_at, is_mock)
  values (p_business_id, p_customer_id, p_scope,
          case when p_granted then 'granted' else 'revoked' end,
          p_source,
          p_evidence || jsonb_build_object('recorded_at', now()),
          case when p_granted then now() else null end,
          case when p_granted then null else now() end,
          v_mock);

  if p_granted then
    delete from public.suppression_entries
    where business_id = p_business_id and customer_id = p_customer_id
      and reason = 'unsubscribed'
      and (channel is not distinct from v_channel);
  else
    -- Leaving a queued message to go out after someone said stop is precisely
    -- the failure the suppression list exists to prevent.
    insert into public.suppression_entries(business_id, customer_id, channel, reason, is_mock)
    values (p_business_id, p_customer_id, v_channel, 'unsubscribed', v_mock)
    on conflict do nothing;
  end if;

  insert into public.activity_logs(business_id, actor_id, action, resource_type, resource_id, metadata, is_mock)
  values (p_business_id, null,
          case when p_granted then 'consent.granted' else 'consent.revoked' end,
          'customer', p_customer_id,
          jsonb_build_object('scope', p_scope, 'source', p_source), v_mock);

  return jsonb_build_object(
    'scope', p_scope, 'granted', p_granted, 'is_mock', v_mock,
    -- Reported back so a caller can see the decision took effect rather than
    -- assuming it did.
    'deliverable', private.resolve_effective_consent(p_business_id, p_customer_id, p_scope)
      and not exists (select 1 from public.suppression_entries s
                      where s.business_id = p_business_id and s.customer_id = p_customer_id
                        and (s.channel is null or s.channel = v_channel)));
end $$;

commit;
