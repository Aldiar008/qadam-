begin;

-- The audience preview was a guess dressed up as a measurement.
--
-- The segment editor printed «Расчёт в реальном времени с учётом RLS и фильтра
-- согласий» above numbers produced by a function in the browser that had never
-- seen the database: a VIP rule was 12 people because 12 was written in the
-- code, and «ровно N дали активное маркетинговое согласие» came from
-- multiplying by 0.28125. For a product whose entire argument is that a number
-- on screen is derived rather than asserted, that was the worst possible place
-- to invent one.
--
-- The rule is counted here instead, in the same shape it is stored in
-- `customer_segments.definition`, so the JSON on the card is the JSON that was
-- executed. Security invoker on purpose: the count must be over the rows the
-- caller may see, not over the table.
create or replace function private.preview_segment_audience(p_business_id uuid, p_rule jsonb)
returns jsonb language sql stable security invoker set search_path=''
as $$
with rule as (
  select
    nullif(p_rule->>'stage', '') as stage,
    greatest(coalesce((p_rule->>'daysInactive')::int, 0), 0) as days,
    greatest(coalesce((p_rule->>'minVisits')::int, 0), 0) as visits,
    greatest(coalesce((p_rule->>'minAovMinor')::bigint, 0), 0) as aov,
    -- Consent is resolved by scope, and the channel is part of the scope: a
    -- person who agreed to email has not agreed to Telegram.
    case coalesce(nullif(p_rule->>'consentFilter', ''), 'any')
      when 'marketing_required' then 'marketing.' || coalesce(nullif(p_rule->>'channel', ''), 'telegram')
      when 'loyalty_only' then 'loyalty'
      else null
    end as scope
),
matched as (
  select c.id
  from rule r
  cross join public.customers c
  left join lateral (
    select count(*)::int as visits, coalesce(round(avg(t.net_minor)), 0)::bigint as aov
    from public.transactions t
    where t.business_id = c.business_id and t.customer_id = c.id
  ) m on true
  where c.business_id = p_business_id
    -- An anonymised person is a financial record, not an audience.
    and c.lifecycle_stage <> 'anonymized'
    and (r.stage is null or r.stage = 'all' or c.lifecycle_stage = r.stage)
    and (r.days = 0 or coalesce(c.last_seen_at, c.first_seen_at) <= now() - make_interval(days => r.days))
    and (r.visits = 0 or m.visits >= r.visits)
    and (r.aov = 0 or m.aov >= r.aov)
)
select jsonb_build_object(
  'matched', (select count(*) from matched),
  'eligible', (
    select count(*) from matched mm cross join rule r
    where r.scope is null or private.resolve_effective_consent(p_business_id, mm.id, r.scope)),
  'scope', (select coalesce(r.scope, '') from rule r),
  'appliedRule', p_rule)
$$;

create or replace function public.preview_segment_audience(p_business_id uuid, p_rule jsonb)
returns jsonb language sql stable security invoker set search_path=''
as $$ select private.preview_segment_audience(p_business_id, p_rule) $$;

revoke all on function private.preview_segment_audience(uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.preview_segment_audience(uuid, jsonb) from public, anon;
grant execute on function private.preview_segment_audience(uuid, jsonb) to authenticated;
grant execute on function public.preview_segment_audience(uuid, jsonb) to authenticated;

comment on function public.preview_segment_audience(uuid, jsonb) is
 'Counts a segment rule against the caller''s own rows: how many people match, and how many of those may lawfully be contacted under the rule''s consent filter.';

commit;
