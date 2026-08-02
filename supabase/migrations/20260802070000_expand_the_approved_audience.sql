begin;

-- Send to the audience that was approved, not to a segment re-derived later.
--
-- The first version of this function read `segment_memberships` and rebuilt the
-- recipient list at dispatch time. That is subtly wrong: `launchStudioCampaign`
-- already materialises `campaign_audiences` at launch, resolving consent per
-- person and recording who was included and who was left out and why. Rebuilding
-- from the segment could therefore send to somebody the owner never approved —
-- a customer who joined the segment in the minutes between confirmation and
-- dispatch — and would silently disagree with the audience shown on screen.
--
-- So the approved audience is the source of truth, and the segment is only a
-- fallback for a campaign that arrived without one (an automation, or a launch
-- path that predates this).
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
  v_source text := 'approved_audience';
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

  if not exists (
    select 1 from public.campaign_audiences
    where campaign_id = v_campaign.id and inclusion_status = 'included'
  ) then
    -- Fallback: no approved audience was recorded, so read the segment the
    -- contract named. Anything that reaches here is a campaign nobody reviewed
    -- recipient by recipient, and that is worth being able to see afterwards.
    v_source := 'contract_segment';
    select * into v_contract from public.growth_contracts where id = v_campaign.growth_contract_id;
    v_segment_code := v_contract.accepted_snapshot #>> '{audience,inclusion}';
    if coalesce(v_segment_code, '') = '' then
      return jsonb_build_object('expanded', false, 'reason', 'audience_not_declared');
    end if;
    select id into v_segment_id from public.customer_segments
    where business_id = v_campaign.business_id and code = v_segment_code and status = 'active';
    if v_segment_id is null then
      return jsonb_build_object('expanded', false, 'reason', 'segment_missing', 'segment', v_segment_code);
    end if;

    insert into public.campaign_audiences(
      business_id, campaign_id, customer_id, segment_id, inclusion_status,
      evaluated_at, rules_evidence, is_mock)
    select v_campaign.business_id, v_campaign.id, sm.customer_id, v_segment_id, 'included',
           now(), jsonb_build_object('segment', v_segment_code, 'source', 'contract_segment'), v_mock
    from public.segment_memberships sm
    join public.customers c on c.id = sm.customer_id
    where sm.business_id = v_campaign.business_id and sm.segment_id = v_segment_id
      and c.lifecycle_stage <> 'anonymized'
    on conflict (campaign_id, customer_id) do nothing;
  end if;

  for v_member in
    select a.customer_id
    from public.campaign_audiences a
    join public.customers c on c.id = a.customer_id
    where a.campaign_id = v_campaign.id and a.inclusion_status = 'included'
      and c.lifecycle_stage <> 'anonymized'
    order by a.customer_id
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
      -- The gate's verdict is written back where the owner reads the audience.
      -- Without this, a person the gate refused still shows as "included" and
      -- the screen disagrees with what happened.
      update public.campaign_audiences
      set inclusion_status = 'excluded',
          exclusion_reason = coalesce(v_enqueued->>'reason', 'gate_denied'),
          evaluated_at = now()
      where campaign_id = v_campaign.id and customer_id = v_member.customer_id;
    elsif (v_enqueued->>'delivery_id') is not null then
      v_queued := v_queued + 1;
    end if;
  end loop;

  if v_queued > 0 and v_campaign.status <> 'running' then
    update public.campaigns set status = 'running' where id = v_campaign.id;
  end if;

  v_result := jsonb_build_object(
    'expanded', true, 'campaign_id', v_campaign.id, 'source', v_source,
    'considered', v_considered, 'queued', v_queued, 'suppressed', v_suppressed);

  insert into public.activity_logs(business_id, actor_id, action, resource_type, resource_id, metadata, is_mock)
  values (v_campaign.business_id, null, 'campaign.audience_expanded', 'campaign', v_campaign.id, v_result, v_mock);

  return v_result;
end $$;

commit;
