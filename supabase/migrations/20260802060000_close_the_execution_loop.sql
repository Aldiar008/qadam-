begin;

-- Close the loop between "the owner confirmed" and "something was sent".
--
-- The product's whole claim is one cycle: data → signal → recommendation →
-- economics → campaign → owner confirmation → launch → measurement. Until now
-- that cycle was cut in the middle, silently.
--
-- `private.launch_growth_contract` creates the campaign and emits
-- `campaign.launch_requested` into the outbox. The worker only ever handled
-- `delivery.requested` and marked everything else `ignored_event_type`. And
-- `private.enqueue_delivery` — the one function that creates a delivery — was
-- called from nowhere in the application, only from a database test. So a
-- confirmed campaign produced a row in `campaigns`, an event that was thrown
-- away, and not one delivery. Nothing was ever sent, and nothing said so.
--
-- The missing step is the expansion: turning an approved campaign into the
-- audience it was approved for, and that audience into deliveries. It belongs
-- in the worker rather than inside the launch call, because expansion is
-- unbounded work — eighteen recipients here, thousands for a real tenant — and
-- the outbox exists precisely so the owner's click does not wait for it.
create or replace function private.expand_campaign_audience(p_campaign_id uuid, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_campaign public.campaigns%rowtype;
  v_contract public.growth_contracts%rowtype;
  v_segment_code text;
  v_segment_id uuid;
  v_content_id uuid;
  v_member record;
  v_enqueued jsonb;
  v_considered integer := 0;
  v_queued integer := 0;
  v_suppressed integer := 0;
  v_mock boolean;
  v_result jsonb;
begin
  select * into v_campaign from public.campaigns where id = p_campaign_id;
  if v_campaign.id is null then
    return jsonb_build_object('expanded', false, 'reason', 'campaign_not_found');
  end if;
  if v_campaign.status not in ('approved', 'scheduled', 'running') then
    return jsonb_build_object('expanded', false, 'reason', 'campaign_not_launchable', 'status', v_campaign.status);
  end if;

  select mode = 'demo' into v_mock from public.businesses where id = v_campaign.business_id;

  -- The audience is not re-derived here. It is read from the snapshot the owner
  -- actually approved, so that what goes out is what was confirmed — not what
  -- the segment happens to contain at dispatch time.
  select * into v_contract from public.growth_contracts where id = v_campaign.growth_contract_id;
  if v_contract.id is null then
    return jsonb_build_object('expanded', false, 'reason', 'contract_missing');
  end if;
  v_segment_code := v_contract.accepted_snapshot #>> '{audience,inclusion}';
  if coalesce(v_segment_code, '') = '' then
    return jsonb_build_object('expanded', false, 'reason', 'audience_not_declared');
  end if;

  select id into v_segment_id from public.customer_segments
  where business_id = v_campaign.business_id and code = v_segment_code and status = 'active';
  if v_segment_id is null then
    return jsonb_build_object('expanded', false, 'reason', 'segment_missing', 'segment', v_segment_code);
  end if;

  -- Copy is never composed here; an approved message for this channel must
  -- already exist, or there is nothing honest to send.
  select id into v_content_id from public.content_items
  where business_id = v_campaign.business_id and campaign_id = v_campaign.id
    and content_kind = 'message' and status = 'approved'
    and (channel = v_campaign.channel or channel is null)
  order by case when locale = 'ru' then 0 else 1 end, created_at
  limit 1;
  if v_content_id is null then
    return jsonb_build_object('expanded', false, 'reason', 'no_approved_content', 'channel', v_campaign.channel);
  end if;

  for v_member in
    select sm.customer_id
    from public.segment_memberships sm
    join public.customers c on c.id = sm.customer_id
    where sm.business_id = v_campaign.business_id
      and sm.segment_id = v_segment_id
      and c.lifecycle_stage <> 'anonymized'
    order by sm.customer_id
  loop
    v_considered := v_considered + 1;

    -- The delivery key is derived, not random: expanding the same campaign
    -- twice must produce the same deliveries, and `enqueue_delivery` already
    -- treats a repeat as the original.
    v_enqueued := private.enqueue_delivery(
      v_campaign.business_id, v_campaign.id, v_member.customer_id, v_content_id,
      v_campaign.channel, 'campaign:' || v_campaign.id::text || ':' || v_member.customer_id::text);

    if v_enqueued->>'status' = 'suppressed' then
      v_suppressed := v_suppressed + 1;
    elsif (v_enqueued->>'delivery_id') is not null then
      v_queued := v_queued + 1;
    end if;

    -- The audience row records the decision either way. A person excluded for
    -- lack of consent is evidence, not an absence.
    insert into public.campaign_audiences(
      business_id, campaign_id, customer_id, segment_id, inclusion_status, exclusion_reason,
      evaluated_at, rules_evidence, is_mock)
    values (
      v_campaign.business_id, v_campaign.id, v_member.customer_id, v_segment_id,
      case when v_enqueued->>'status' = 'suppressed' then 'excluded' else 'included' end,
      nullif(v_enqueued->>'reason', ''),
      now(),
      jsonb_build_object('segment', v_segment_code, 'source', 'campaign_expansion'),
      v_mock)
    on conflict do nothing;
  end loop;

  if v_queued > 0 and v_campaign.status <> 'running' then
    update public.campaigns set status = 'running' where id = v_campaign.id;
  end if;

  v_result := jsonb_build_object(
    'expanded', true, 'campaign_id', v_campaign.id, 'segment', v_segment_code,
    'considered', v_considered, 'queued', v_queued, 'suppressed', v_suppressed);

  insert into public.activity_logs(business_id, actor_id, action, resource_type, resource_id, metadata, is_mock)
  values (v_campaign.business_id, null, 'campaign.audience_expanded', 'campaign', v_campaign.id, v_result, v_mock);

  return v_result;
end $$;

revoke all on function private.expand_campaign_audience(uuid, text) from public, anon, authenticated, service_role;
grant execute on function private.expand_campaign_audience(uuid, text) to service_role;

create or replace function public.expand_campaign_audience(p_campaign_id uuid, p_idempotency_key text)
returns jsonb language sql security invoker set search_path=''
as $$ select private.expand_campaign_audience(p_campaign_id, p_idempotency_key) $$;
revoke all on function public.expand_campaign_audience(uuid, text) from public, anon, authenticated;
grant execute on function public.expand_campaign_audience(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- The channel list the interface offers must be a list the database accepts.
-- ---------------------------------------------------------------------------

-- `/app/automations` renders a `webhook` row and `checkConnectorHealth` upserts
-- it, but the CHECK predates that screen and rejects the value — so the only
-- adapter in this build that can actually reach a provider could never be
-- configured. `in_app` is included for the same reason: it is a ChannelKind the
-- code already knows about.
alter table public.business_channels drop constraint if exists business_channels_channel_type_check;
alter table public.business_channels add constraint business_channels_channel_type_check
  check (channel_type in ('whatsapp','telegram','sms','email','instagram','push','pos','webhook','in_app'));

commit;
