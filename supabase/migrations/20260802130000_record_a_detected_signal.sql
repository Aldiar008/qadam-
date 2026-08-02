begin;

-- Record a signal the detector found in a tenant's own data.
--
-- Until now the only rows in `public.signals` came from the branch of
-- `complete_onboarding` that clones the demonstration tenant. A real business
-- therefore never had a signal, and «Сегодня» — the screen the product is
-- arranged around — had nothing to show it. The detector was written, tested
-- and called by nobody.
--
-- The caller passes what it measured; this function refuses anything that does
-- not hold together, because a signal is a claim about a business and a claim
-- has to be checkable:
--
--   * a demo business may only record mock signals, and a production business
--     may only record real ones — the same rule the rest of the schema keeps;
--   * the comparison window must precede the current window and both must be
--     non-empty, or "changed by −27%" is not a comparison of anything;
--   * evidence must carry its assumptions, so the owner can see what was held
--     equal when the number was produced.
--
-- Re-detection replaces the open signal of the same metric rather than piling
-- up duplicates: the newest measurement of the same thing is the answer, not an
-- addition to it.
create or replace function private.record_detected_signal(
  p_business_id uuid,
  p_signal_type text,
  p_metric_key text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_comparison_start timestamptz,
  p_comparison_end timestamptz,
  p_change_bps integer,
  p_confidence smallint,
  p_evidence jsonb,
  p_baseline jsonb,
  p_delta jsonb,
  p_assumptions jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_mock boolean;
  v_location uuid;
  v_gos smallint;
  v_id uuid;
begin
  select mode = 'demo' into v_mock from public.businesses where id = p_business_id and status = 'active';
  if v_mock is null then
    raise exception 'business not found or not active' using errcode='23503';
  end if;

  if p_period_end <= p_period_start or p_comparison_end <= p_comparison_start then
    raise exception 'each window must end after it starts' using errcode='22023';
  end if;
  if p_comparison_end > p_period_start then
    raise exception 'the comparison window must end before the current window begins' using errcode='22023';
  end if;
  if jsonb_typeof(coalesce(p_assumptions, 'null'::jsonb)) <> 'array' or jsonb_array_length(p_assumptions) = 0 then
    raise exception 'a signal must carry the assumptions it was measured under' using errcode='22023';
  end if;

  select id into v_location from public.business_locations
  where business_id = p_business_id and is_active order by created_at limit 1;

  -- Severity in one number the screen can rank by: a bigger move with more
  -- confidence behind it is more worth the owner's attention.
  v_gos := least(100, greatest(1, (abs(p_change_bps) / 100) * greatest(1, p_confidence) / 100 + 40))::smallint;

  -- The newest measurement of the same metric is the answer, not an addition
  -- to it. It updates the open signal in place rather than stacking duplicates,
  -- and rather than inventing a "superseded" status the schema does not allow —
  -- `resolved` would claim the problem went away, which nobody measured.
  update public.signals
  set period_start = p_period_start, period_end = p_period_end,
      comparison_start = p_comparison_start, comparison_end = p_comparison_end,
      change_bps = p_change_bps, confidence = p_confidence,
      evidence = p_evidence, baseline = p_baseline, delta = p_delta,
      assumptions = p_assumptions, detected_at = now(), updated_at = now(),
      growth_opportunity_score = least(100, greatest(1, (abs(p_change_bps) / 100) * greatest(1, p_confidence) / 100 + 40))::smallint
  where business_id = p_business_id and metric_key = p_metric_key and status = 'open'
  returning id into v_id;

  if v_id is not null then
    insert into public.activity_logs(business_id, actor_id, action, resource_type, resource_id, metadata, is_mock)
    values (p_business_id, null, 'signal.remeasured', 'signal', v_id,
            jsonb_build_object('metric_key', p_metric_key, 'change_bps', p_change_bps, 'confidence', p_confidence), v_mock);
    return jsonb_build_object('signal_id', v_id, 'metric_key', p_metric_key, 'change_bps', p_change_bps, 'is_mock', v_mock, 'updated', true);
  end if;

  insert into public.signals(
    business_id, location_id, signal_type, metric_key,
    period_start, period_end, comparison_start, comparison_end,
    change_bps, growth_opportunity_score, confidence, status,
    evidence, baseline, delta, assumptions, detected_at, is_mock)
  values (
    p_business_id, v_location, p_signal_type, p_metric_key,
    p_period_start, p_period_end, p_comparison_start, p_comparison_end,
    p_change_bps, v_gos, p_confidence, 'open',
    p_evidence, p_baseline, p_delta, p_assumptions, now(), v_mock)
  returning id into v_id;

  insert into public.activity_logs(business_id, actor_id, action, resource_type, resource_id, metadata, is_mock)
  values (p_business_id, null, 'signal.detected', 'signal', v_id,
          jsonb_build_object('metric_key', p_metric_key, 'change_bps', p_change_bps, 'confidence', p_confidence), v_mock);

  return jsonb_build_object('signal_id', v_id, 'metric_key', p_metric_key, 'change_bps', p_change_bps, 'is_mock', v_mock);
end $$;

revoke all on function private.record_detected_signal(uuid,text,text,timestamptz,timestamptz,timestamptz,timestamptz,integer,smallint,jsonb,jsonb,jsonb,jsonb) from public, anon, authenticated, service_role;
grant execute on function private.record_detected_signal(uuid,text,text,timestamptz,timestamptz,timestamptz,timestamptz,integer,smallint,jsonb,jsonb,jsonb,jsonb) to service_role;

create or replace function public.record_detected_signal(
  p_business_id uuid, p_signal_type text, p_metric_key text,
  p_period_start timestamptz, p_period_end timestamptz,
  p_comparison_start timestamptz, p_comparison_end timestamptz,
  p_change_bps integer, p_confidence smallint,
  p_evidence jsonb, p_baseline jsonb, p_delta jsonb, p_assumptions jsonb)
returns jsonb language sql security invoker set search_path=''
as $$ select private.record_detected_signal(p_business_id,p_signal_type,p_metric_key,p_period_start,p_period_end,
  p_comparison_start,p_comparison_end,p_change_bps,p_confidence,p_evidence,p_baseline,p_delta,p_assumptions) $$;
revoke all on function public.record_detected_signal(uuid,text,text,timestamptz,timestamptz,timestamptz,timestamptz,integer,smallint,jsonb,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.record_detected_signal(uuid,text,text,timestamptz,timestamptz,timestamptz,timestamptz,integer,smallint,jsonb,jsonb,jsonb,jsonb) to service_role;

commit;
