begin;

-- Increment the version when the expansion moves a campaign to `running`.
--
-- `private.enforce_campaign_state_and_economics` requires every update to a
-- campaign to advance `optimistic_version` by exactly one — the same guard that
-- stops two people editing a campaign from silently overwriting each other. The
-- expansion updated the status without it, so the trigger raised 40001 and the
-- whole expansion rolled back: no deliveries, and an error visible only in the
-- cycle report. Found by running the loop end to end rather than by reading it.

create or replace function private.pick_campaign_message(p_business_id uuid, p_campaign_id uuid, p_channel text)
returns uuid language sql stable security definer set search_path=''
as $$
  select id from public.content_items
  where business_id = p_business_id and campaign_id = p_campaign_id
    and content_kind in ('direct_message', 'message')
    and status = 'approved'
    and (channel = p_channel or channel is null)
  order by case when locale = 'ru' then 0 else 1 end, created_at
  limit 1
$$;
revoke all on function private.pick_campaign_message(uuid, uuid, text) from public, anon, authenticated, service_role;

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
  v_note text;
begin
  select * into v_campaign from public.campaigns where id = p_campaign_id;
  if v_campaign.id is null then
    return jsonb_build_object('expanded', false, 'reason', 'campaign_not_found');
  end if;
  if v_campaign.status not in ('approved', 'scheduled', 'running') then
    return jsonb_build_object('expanded', false, 'reason', 'campaign_not_launchable', 'status', v_campaign.status);
  end if;

  select mode = 'demo' into v_mock from public.businesses where id = v_campaign.business_id;
  v_content_id := private.pick_campaign_message(v_campaign.business_id, v_campaign.id, v_campaign.channel);

  if v_content_id is null then
    v_note := format(
      'Кампания «%s» подтверждена, но отправлять нечего: для канала %s нет утверждённого сообщения. Соберите пакет в Контент-студии и нажмите «Утвердить» на сообщении в мессенджер.',
      v_campaign.name, v_campaign.channel);
    insert into public.notifications(business_id, notification_type, category, title, body, action_url, is_mock)
    values (v_campaign.business_id, 'campaign_blocked', 'risk',
            'Кампания не может быть отправлена', v_note,
            '/app/content?campaign=' || v_campaign.id::text, v_mock);
    insert into public.activity_logs(business_id, actor_id, action, resource_type, resource_id, metadata, is_mock)
    values (v_campaign.business_id, null, 'campaign.expansion_refused', 'campaign', v_campaign.id,
            jsonb_build_object('reason', 'no_approved_content', 'channel', v_campaign.channel), v_mock);
    return jsonb_build_object('expanded', false, 'reason', 'no_approved_content', 'channel', v_campaign.channel);
  end if;

  if not exists (
    select 1 from public.campaign_audiences
    where campaign_id = v_campaign.id and inclusion_status = 'included'
  ) then
    v_source := 'contract_segment';
    select * into v_contract from public.growth_contracts where id = v_campaign.growth_contract_id;
    v_segment_code := v_contract.accepted_snapshot #>> '{audience,inclusion}';
    if coalesce(v_segment_code, '') = '' then
      insert into public.notifications(business_id, notification_type, category, title, body, action_url, is_mock)
      values (v_campaign.business_id, 'campaign_blocked', 'risk',
              'Кампания не может быть отправлена',
              format('Кампания «%s» не имеет утверждённой аудитории.', v_campaign.name),
              '/app/campaigns/' || v_campaign.id::text, v_mock);
      return jsonb_build_object('expanded', false, 'reason', 'audience_not_declared');
    end if;
    select id into v_segment_id from public.customer_segments
    where business_id = v_campaign.business_id and code = v_segment_code and status = 'active';
    if v_segment_id is null then
      insert into public.notifications(business_id, notification_type, category, title, body, action_url, is_mock)
      values (v_campaign.business_id, 'campaign_blocked', 'risk',
              'Кампания не может быть отправлена',
              format('Сегмент «%s» больше не существует, поэтому получателей у кампании «%s» нет.', v_segment_code, v_campaign.name),
              '/app/segments', v_mock);
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
    v_enqueued := private.enqueue_delivery(
      v_campaign.business_id, v_campaign.id, v_member.customer_id, v_content_id,
      v_campaign.channel, 'campaign:' || v_campaign.id::text || ':' || v_member.customer_id::text);

    if v_enqueued->>'status' = 'suppressed' then
      v_suppressed := v_suppressed + 1;
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
    update public.campaigns set status = 'running', optimistic_version = v_campaign.optimistic_version + 1
    where id = v_campaign.id and optimistic_version = v_campaign.optimistic_version;
  end if;

  if v_queued = 0 and v_considered > 0 then
    insert into public.notifications(business_id, notification_type, category, title, body, action_url, is_mock)
    values (v_campaign.business_id, 'campaign_blocked', 'risk',
            'Кампания никого не достигла',
            format('Все %s получателей кампании «%s» отклонены проверками перед отправкой: согласие, тихие часы, частота или дневной лимит. Причина по каждому — в аудитории кампании.',
                   v_considered, v_campaign.name),
            '/app/campaigns/' || v_campaign.id::text, v_mock);
  end if;

  v_result := jsonb_build_object(
    'expanded', true, 'campaign_id', v_campaign.id, 'source', v_source,
    'considered', v_considered, 'queued', v_queued, 'suppressed', v_suppressed);

  insert into public.activity_logs(business_id, actor_id, action, resource_type, resource_id, metadata, is_mock)
  values (v_campaign.business_id, null, 'campaign.audience_expanded', 'campaign', v_campaign.id, v_result, v_mock);

  return v_result;
end $$;

commit;
