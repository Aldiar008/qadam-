begin;

-- The middle of the product's own loop was missing.
--
-- «Данные → сигнал → рекомендация → кампания» is the sentence this product is
-- arranged around, and the third arrow did not exist. The only writer of
-- `public.recommendations` was `complete_onboarding`, which puts three fixed
-- rows there once and never again (`20260730075801:225-230`). The detector
-- wrote signals and stopped. So a real business saw three generic suggestions,
-- «GOS N/A» and «Нужен forecast» — because nothing ever wrote `gos` or
-- `expectedContributionMinor` — and Campaign Studio, which refuses to compile
-- without an open recommendation, became permanently unusable once all three
-- had been rejected.
--
-- This turns each open signal into one recommendation with an economy attached.
-- The arithmetic is deliberately plain and every assumption behind it is stored
-- next to the number, because the forecast is a claim the owner is entitled to
-- argue with. Where the ingredients are missing — no catalogue cost, no
-- consenting audience — it says which ones rather than guessing them.

create or replace function private.recommendation_economics(p_business_id uuid, p_eligible integer)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare
  v_aov bigint;
  v_margin numeric;
  v_catalog_items integer;
  v_orders numeric;
  v_revenue bigint;
  v_contribution bigint;
  v_missing text[] := '{}';
begin
  select average_check_minor into v_aov from public.business_profiles where business_id = p_business_id;

  -- Contribution margin comes from the catalogue's own prices and costs. Without
  -- it every figure downstream would be a guess dressed as a forecast.
  select count(*), case when sum(price_minor) > 0 then (sum(price_minor) - sum(coalesce(cost_minor, 0)))::numeric / sum(price_minor) else null end
  into v_catalog_items, v_margin
  from public.catalog_items
  where business_id = p_business_id and is_active and price_minor > 0;

  if coalesce(v_aov, 0) <= 0 then v_missing := array_append(v_missing, 'средний чек в настройках'); end if;
  if coalesce(v_catalog_items, 0) = 0 or v_margin is null then v_missing := array_append(v_missing, 'себестоимость позиций каталога'); end if;
  if coalesce(p_eligible, 0) = 0 then v_missing := array_append(v_missing, 'клиенты с действующим согласием'); end if;

  if array_length(v_missing, 1) is not null then
    return jsonb_build_object('known', false, 'missing', to_jsonb(v_missing));
  end if;

  -- One conservative scenario, stated as such. The Simulator produces the full
  -- three when the owner opens the studio; this is only enough to rank.
  v_orders := p_eligible * 0.09;
  v_revenue := round(v_orders * v_aov);
  v_contribution := round(v_revenue * v_margin);

  return jsonb_build_object(
    'known', true,
    'expectedOrders', round(v_orders, 1),
    'expectedRevenueMinor', v_revenue,
    'expectedContributionMinor', v_contribution,
    'contributionMarginBps', round(v_margin * 10000),
    'averageCheckMinor', v_aov,
    'assumptions', jsonb_build_array(
      'Отклик 9% — базовый сценарий, не обещание',
      'Вклад-маржа взята из цен и себестоимости каталога',
      'Считаются только клиенты с действующим согласием'));
end $$;

revoke all on function private.recommendation_economics(uuid, integer) from public, anon, authenticated, service_role;
grant execute on function private.recommendation_economics(uuid, integer) to service_role;

/**
 * Turns every open signal into a recommendation with an economy behind it.
 *
 * Idempotent by `origin_key = 'signal:<id>'`: re-running the cycle refreshes the
 * numbers on the recommendation that already exists instead of stacking
 * duplicates. A recommendation the owner has already rejected is left alone —
 * re-proposing something a person said no to is not a product being helpful.
 */
create or replace function private.recommend_from_signals(p_business_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_mock boolean;
  v_signal record;
  v_eligible integer;
  v_economics jsonb;
  v_gos smallint;
  v_title_ru text;
  v_title_kk text;
  v_reason text;
  v_created integer := 0;
  v_updated integer := 0;
  v_origin text;
  v_existing record;
begin
  select mode = 'demo' into v_mock from public.businesses where id = p_business_id and status = 'active';
  if v_mock is null then
    raise exception 'business not found or not active' using errcode='23503';
  end if;

  for v_signal in
    select id, signal_type, metric_key, change_bps, confidence, growth_opportunity_score, evidence
    from public.signals
    where business_id = p_business_id and status = 'open'
    order by growth_opportunity_score desc
  loop
    v_origin := 'signal:' || v_signal.id::text;

    -- How many people this could lawfully reach today. Consent is resolved the
    -- same way the sender resolves it, so the number on the card is the number
    -- the campaign would actually get.
    select count(*) into v_eligible
    from public.customers c
    where c.business_id = p_business_id
      and c.lifecycle_stage <> 'anonymized'
      and (v_signal.signal_type <> 'dormant_customers' or c.lifecycle_stage = 'inactive')
      and private.resolve_effective_consent(p_business_id, c.id, 'marketing.telegram');

    v_economics := private.recommendation_economics(p_business_id, v_eligible);
    v_gos := v_signal.growth_opportunity_score;

    if v_signal.signal_type = 'quiet_hours' then
      v_title_ru := 'Заполнить провал в часы ' || coalesce(replace(replace(v_signal.metric_key, 'weekday_revenue_', ''), '_', '–'), 'спада');
      v_title_kk := 'Құлдырау сағаттарын толтыру';
      v_reason := 'В эти часы выручка ниже сопоставимого периода на ' || abs(v_signal.change_bps) / 100 || '%. Это наблюдение, а не установленная причина.';
    elsif v_signal.signal_type = 'dormant_customers' then
      v_title_ru := 'Вернуть гостей, которые перестали приходить';
      v_title_kk := 'Келуін тоқтатқан қонақтарды қайтару';
      v_reason := 'Доля спящих гостей выросла на ' || abs(v_signal.change_bps) / 100 || '%. Часть из них вернётся от одного напоминания.';
    elsif v_signal.signal_type = 'average_check_drop' then
      v_title_ru := 'Поднять средний чек предложением к заказу';
      v_title_kk := 'Тапсырысқа ұсыныспен орташа чекті көтеру';
      v_reason := 'Средний чек ниже предыдущего периода на ' || abs(v_signal.change_bps) / 100 || '%. Механика с порогом поднимает чек, не раздавая скидку всем.';
    else
      v_title_ru := 'Разобрать сигнал: ' || v_signal.metric_key;
      v_title_kk := 'Сигналды талдау: ' || v_signal.metric_key;
      v_reason := 'Показатель изменился на ' || abs(v_signal.change_bps) / 100 || '% за сопоставимый период.';
    end if;

    select id, status, optimistic_version into v_existing from public.recommendations
    where business_id = p_business_id and origin_key = v_origin;

    if v_existing.id is not null then
      -- A rejected suggestion stays rejected. Refreshing the numbers on one the
      -- owner is still considering is help; resurrecting one they refused is not.
      if v_existing.status in ('rejected', 'expired') then
        continue;
      end if;
      update public.recommendations
      set title_ru = v_title_ru, title_kk = v_title_kk, confidence = v_signal.confidence,
          explanation = jsonb_build_object(
            'reason', v_reason, 'gos', v_gos, 'eligible', v_eligible,
            'signalType', v_signal.signal_type, 'metricKey', v_signal.metric_key,
            'changeBps', v_signal.change_bps, 'economics', v_economics,
            'source', 'signal_detector', 'refreshedAt', now())
            || case when (v_economics->>'known')::boolean
                    then jsonb_build_object('expectedContributionMinor', (v_economics->>'expectedContributionMinor')::bigint)
                    else '{}'::jsonb end,
          -- Every write to this table must advance the version: the trigger that
          -- protects owners from two tabs overwriting each other refuses an
          -- update that leaves it alone, and it caught this on the second run.
          optimistic_version = v_existing.optimistic_version + 1,
          updated_at = now()
      where id = v_existing.id and optimistic_version = v_existing.optimistic_version;
      v_updated := v_updated + 1;
      continue;
    end if;

    insert into public.recommendations(
      business_id, signal_id, title_ru, title_kk, explanation, confidence, status, is_mock, origin_key)
    values (
      p_business_id, v_signal.id, v_title_ru, v_title_kk,
      jsonb_build_object(
        'reason', v_reason, 'gos', v_gos, 'eligible', v_eligible,
        'signalType', v_signal.signal_type, 'metricKey', v_signal.metric_key,
        'changeBps', v_signal.change_bps, 'economics', v_economics,
        'source', 'signal_detector', 'createdAt', now())
        || case when (v_economics->>'known')::boolean
                then jsonb_build_object('expectedContributionMinor', (v_economics->>'expectedContributionMinor')::bigint)
                else '{}'::jsonb end,
      v_signal.confidence, 'open', v_mock, v_origin)
    on conflict (business_id, origin_key) where origin_key is not null do nothing;

    v_created := v_created + 1;
  end loop;

  if v_created > 0 then
    insert into public.activity_logs(business_id, actor_id, action, resource_type, resource_id, metadata, is_mock)
    values (p_business_id, null, 'recommendation.generated', 'business', p_business_id,
            jsonb_build_object('created', v_created, 'updated', v_updated), v_mock);
  end if;

  return jsonb_build_object('created', v_created, 'refreshed', v_updated);
end $$;

revoke all on function private.recommend_from_signals(uuid) from public, anon, authenticated, service_role;
grant execute on function private.recommend_from_signals(uuid) to service_role;

create or replace function public.recommend_from_signals(p_business_id uuid)
returns jsonb language sql security invoker set search_path=''
as $$ select private.recommend_from_signals(p_business_id) $$;
revoke all on function public.recommend_from_signals(uuid) from public, anon, authenticated;
grant execute on function public.recommend_from_signals(uuid) to service_role;

comment on function public.recommend_from_signals(uuid) is
 'Turns every open signal into one recommendation carrying a GOS, an eligible audience and a forecast with its assumptions. Idempotent per signal; never revives a rejected suggestion.';

/**
 * The same generator, reachable by the owner for their own business.
 *
 * Campaign Studio refuses to compile without an open recommendation. With the
 * only writer being onboarding, rejecting all three left the owner permanently
 * unable to build a campaign and with no way back. This gives them the way
 * back, and it resolves the business from the caller's membership rather than
 * from a parameter, so it cannot be pointed at somebody else's tenant.
 */
create or replace function public.refresh_my_recommendations()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_business uuid;
begin
  select bm.business_id into v_business
  from public.business_members bm
  where bm.user_id = (select auth.uid()) and bm.status = 'active'
    and bm.role in ('owner', 'manager', 'marketer')
  limit 1;

  if v_business is null then
    raise exception 'no business membership that may refresh recommendations' using errcode='42501';
  end if;

  return private.recommend_from_signals(v_business);
end $$;

revoke all on function public.refresh_my_recommendations() from public, anon;
grant execute on function public.refresh_my_recommendations() to authenticated;

commit;
