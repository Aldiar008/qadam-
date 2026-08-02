begin;

-- The frequency cap counted the delivery it was gating, so every campaign
-- silenced itself.
--
-- `send_gate` is deliberately evaluated twice: once when a delivery is queued,
-- and again immediately before dispatch, so consent revoked in between is
-- honoured. The second evaluation was self-defeating. The cap counts deliveries
-- to this customer in the last 24 hours with status `queued`, `sent` or
-- `delivered` — and by dispatch time the delivery being dispatched is itself
-- `queued`. Count reaches one, the gate answers `frequency_cap`, and the
-- message is suppressed. Every single one, every time.
--
-- Nothing about this was visible: a suppressed delivery is a normal, expected
-- outcome, so the queue drained cleanly and the report said eighteen
-- suppressed. It reads exactly like a working guard doing its job.
--
-- The fix is to let the caller name the delivery under consideration and
-- exclude it. The old four-argument signature stays and delegates, so every
-- existing caller keeps its behaviour: at enqueue time there is no delivery yet
-- to exclude, and passing null there is correct rather than lenient.
create or replace function private.send_gate(
  p_business_id uuid, p_customer_id uuid, p_channel text,
  p_at timestamptz, p_exclude_delivery_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare
 v_state public.business_execution_state%rowtype;
 v_local time; v_tz text; v_sent_today integer; v_cap integer;
 v_freq integer; v_window_start timestamptz;
begin
 select * into v_state from public.business_execution_state where business_id=p_business_id;
 v_tz := coalesce(v_state.timezone,'Asia/Almaty');
 v_cap := coalesce(v_state.daily_send_cap,500);

 if v_state.emergency_stopped_at is not null then
  return jsonb_build_object('allowed',false,'reason','emergency_stop');
 end if;
 if not exists(select 1 from public.businesses where id=p_business_id and status='active') then
  return jsonb_build_object('allowed',false,'reason','business_inactive');
 end if;
 if exists(select 1 from public.suppression_entries s
   where s.business_id=p_business_id and s.customer_id=p_customer_id
    and (s.channel is null or s.channel=p_channel)) then
  return jsonb_build_object('allowed',false,'reason','suppressed');
 end if;
 if not private.resolve_effective_consent(p_business_id,p_customer_id,'marketing.'||p_channel) then
  return jsonb_build_object('allowed',false,'reason','no_effective_consent');
 end if;

 -- Quiet hours are evaluated in the business timezone, and the window may wrap midnight.
 v_local := (p_at at time zone v_tz)::time;
 if v_state.business_id is not null then
  if (v_state.quiet_hours_start < v_state.quiet_hours_end
       and v_local >= v_state.quiet_hours_start and v_local < v_state.quiet_hours_end)
   or (v_state.quiet_hours_start > v_state.quiet_hours_end
       and (v_local >= v_state.quiet_hours_start or v_local < v_state.quiet_hours_end)) then
   return jsonb_build_object('allowed',false,'reason','quiet_hours','local_time',v_local::text);
  end if;
 end if;

 -- The daily cap counts what actually went out, so a queued row cannot inflate it.
 select count(*) into v_sent_today from public.campaign_deliveries d
 where d.business_id=p_business_id and d.status in ('sent','delivered')
  and d.queued_at >= date_trunc('day', p_at at time zone v_tz) at time zone v_tz;
 if v_sent_today >= v_cap then
  return jsonb_build_object('allowed',false,'reason','daily_cap','sent',v_sent_today);
 end if;

 -- Frequency cap: at most one message to this customer per rolling 24h,
 -- not counting the one being decided about.
 v_window_start := p_at - interval '24 hours';
 select count(*) into v_freq from public.campaign_deliveries d
 where d.business_id=p_business_id and d.customer_id=p_customer_id
  and d.status in ('queued','sent','delivered') and d.queued_at >= v_window_start
  and (p_exclude_delivery_id is null or d.id <> p_exclude_delivery_id);
 if v_freq >= 1 then
  return jsonb_build_object('allowed',false,'reason','frequency_cap','recent',v_freq);
 end if;

 return jsonb_build_object('allowed',true,'reason','ok');
end $$;
revoke all on function private.send_gate(uuid,uuid,text,timestamptz,uuid) from public,anon,authenticated,service_role;
grant execute on function private.send_gate(uuid,uuid,text,timestamptz,uuid) to authenticated, service_role;

create or replace function private.send_gate(p_business_id uuid, p_customer_id uuid, p_channel text, p_at timestamptz default now())
returns jsonb language sql stable security definer set search_path=''
as $$ select private.send_gate(p_business_id,p_customer_id,p_channel,p_at,null::uuid) $$;

create or replace function public.send_gate(
  p_business_id uuid, p_customer_id uuid, p_channel text,
  p_at timestamptz default now(), p_exclude_delivery_id uuid default null)
returns jsonb language sql stable security invoker set search_path=''
as $$ select private.send_gate(p_business_id,p_customer_id,p_channel,p_at,p_exclude_delivery_id) $$;
revoke all on function public.send_gate(uuid,uuid,text,timestamptz,uuid) from public,anon;
grant execute on function public.send_gate(uuid,uuid,text,timestamptz,uuid) to authenticated, service_role;

commit;
