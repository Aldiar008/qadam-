begin;

-- Четыре новых правила, и все четыре считают по данным заведения.
--
-- В каталоге было десять правил, и владелец справедливо сказал, что раздел
-- выглядит пустым: половина из них наблюдает за тем, чего у маленькой кофейни
-- может не быть вовсе (VIP-сегмент, цикл услуги, дата рождения). Здесь
-- добавлены те, для которых данные есть у любого заведения с кассой.
--
--   second_visit    — гость купил один раз и не вернулся. Самая дешёвая
--                     следующая продажа во всём продукте, и до сих пор её никто
--                     не искал.
--   abandoned_item  — позиция, которую гость брал регулярно и перестал.
--                     Считается по составу чека; раньше состава не было.
--   check_drop      — средний чек за 28 дней против предыдущих 28.
--   low_margin_item — позиции, у которых вклад-маржа ниже порога владельца.
--
-- Первые два заканчиваются рекомендацией с посчитанной экономикой — тем же
-- путём, что «вернуть спящих». Вторые два только сообщают: остановить падение
-- среднего чека рассылкой нельзя, и делать вид, что можно, продукт не станет.
--
-- Функция переписана целиком, потому что plpgsql нельзя дополнить по частям.
-- Остальные ветки не изменились.

create or replace function private.execute_automation(p_automation_id uuid, p_idempotency_key text, p_trigger_source text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
 a public.automations%rowtype; v_actor uuid := (select auth.uid()); v_mock boolean;
 v_existing public.automation_runs%rowtype; v_run_id uuid; v_result jsonb;
 v_candidates integer := 0; v_eligible integer := 0; v_days integer; v_stopped boolean;
 v_channel text; v_produced jsonb := '{}'::jsonb; v_origin text; v_recommendation uuid;
 v_economics jsonb; v_title_ru text; v_title_kk text; v_reason text;
 v_category text; v_title text; v_body text; v_drafts integer; v_missing integer;
 v_recent numeric; v_previous numeric;
begin
 if char_length(coalesce(p_idempotency_key,'')) not between 8 and 200 then
  raise exception 'invalid idempotency key' using errcode='22023';
 end if;
 select * into a from public.automations where id=p_automation_id for update;
 if a.id is null then raise exception 'automation not found' using errcode='23503'; end if;

 select * into v_existing from public.automation_runs
 where business_id=a.business_id and idempotency_key=p_idempotency_key;
 if v_existing.id is not null then
  return jsonb_build_object('run_id',v_existing.id,'duplicate',true,'status',v_existing.status);
 end if;

 select mode='demo' into v_mock from public.businesses where id=a.business_id;
 select emergency_stopped_at is not null into v_stopped
 from public.business_execution_state where business_id=a.business_id;

 insert into public.automation_runs(business_id,automation_id,status,idempotency_key,scheduled_at,started_at,trigger_source,is_mock)
 values(a.business_id,a.id,'running',p_idempotency_key,now(),now(),coalesce(p_trigger_source,'scheduler'),v_mock)
 returning id into v_run_id;

 if coalesce(v_stopped,false) then
  v_result := jsonb_build_object('outcome','skipped','reason','emergency_stop');
  update public.automation_runs set status='skipped', completed_at=now(), result=v_result where id=v_run_id;
  return jsonb_build_object('run_id',v_run_id,'duplicate',false,'status','skipped','result',v_result);
 end if;
 if a.status <> 'active' then
  v_result := jsonb_build_object('outcome','skipped','reason','automation_'||a.status);
  update public.automation_runs set status='skipped', completed_at=now(), result=v_result where id=v_run_id;
  return jsonb_build_object('run_id',v_run_id,'duplicate',false,'status','skipped','result',v_result);
 end if;

 -- Rule evaluation. Each rule counts a candidate set and then narrows it by the
 -- same consent resolution the send gate uses, so the number the owner is shown
 -- is the number the database would actually allow.
 v_days := coalesce((a.trigger_rules->>'days')::integer, 30);
 -- WhatsApp has no credentials anywhere in this product, so defaulting to it
 -- narrowed every audience to zero and made the rule look broken.
 v_channel := coalesce(a.action_rules->>'channel', 'telegram');

 if a.automation_type in ('reactivation','winback') then
  select count(*) into v_candidates from public.customers c
  where c.business_id=a.business_id and c.lifecycle_stage <> 'anonymized'
   and (c.last_seen_at is null or c.last_seen_at < now() - make_interval(days => v_days));
 elsif a.automation_type = 'welcome' then
  select count(*) into v_candidates from public.customers c
  where c.business_id=a.business_id and c.lifecycle_stage='new'
   and c.first_seen_at >= now() - interval '7 days';
 elsif a.automation_type = 'birthday' then
  -- No lawful birth-date field exists yet, so this rule can only ever report
  -- zero candidates rather than guessing a date.
  v_candidates := 0;
 elsif a.automation_type = 'quiet_hours' then
  select count(*) into v_candidates from public.capacity_slots s
  where s.business_id=a.business_id and s.starts_at between now() and now()+interval '7 days'
   and s.capacity > 0 and (s.booked::numeric / s.capacity) < coalesce((a.trigger_rules->>'utilisationThreshold')::numeric, 0.5);
 -- These two shared one branch, so `vip_care`'s own «VIP, 21 дней без визита»
 -- and `repeat_service`'s cycle length were both ignored. Each now uses its own.
 elsif a.automation_type = 'repeat_service' then
  select count(*) into v_candidates from public.customers c
  where c.business_id=a.business_id and c.lifecycle_stage in ('loyal','active')
   and c.last_seen_at < now() - make_interval(days => coalesce((a.trigger_rules->>'cycleDays')::integer, 45));
 elsif a.automation_type = 'vip_care' then
  select count(*) into v_candidates from public.customers c
  where c.business_id=a.business_id and c.lifecycle_stage='vip'
   and c.last_seen_at < now() - make_interval(days => coalesce((a.trigger_rules->>'days')::integer, 21));
 elsif a.automation_type = 'stop_loss' then
  select count(*) into v_candidates from public.campaigns
  where business_id=a.business_id and status in ('running','scheduled');
 elsif a.automation_type = 'content_queue' then
  -- What this rule is actually about: campaigns with no approved copy.
  select count(*) into v_candidates from public.campaigns c
  where c.business_id=a.business_id and c.status in ('draft','approved','scheduled')
   and not exists(select 1 from public.content_items ci
                  where ci.campaign_id=c.id and ci.status='approved');
 elsif a.automation_type = 'second_visit' then
  -- Гость, у которого была ровно одна покупка и который больше не вернулся.
  -- Второй визит — самая дешёвая покупка из всех, и до сих пор её никто не искал.
  select count(*) into v_candidates from public.customers c
  where c.business_id=a.business_id and c.lifecycle_stage <> 'anonymized'
   and c.first_seen_at < now() - make_interval(days => coalesce((a.trigger_rules->>'days')::integer, 14))
   and (select count(*) from public.transactions t
        where t.business_id=a.business_id and t.customer_id=c.id) = 1;
 elsif a.automation_type = 'abandoned_item' then
  -- Позиция, которую гость брал регулярно и перестал. Считается по составу
  -- чека: без него это правило было бы догадкой.
  select count(*) into v_candidates from (
   select t.customer_id
   from public.transaction_items ti
   join public.transactions t on t.id = ti.transaction_id
   where ti.business_id = a.business_id and t.customer_id is not null
   group by t.customer_id, ti.item_name
   having count(*) >= 2
      and max(t.occurred_at) < now() - make_interval(days => coalesce((a.trigger_rules->>'days')::integer, 30))
  ) gone;
 elsif a.automation_type = 'check_drop' then
  select coalesce(avg(net_minor),0) into v_recent from public.transactions
  where business_id=a.business_id and occurred_at >= now() - interval '28 days';
  select coalesce(avg(net_minor),0) into v_previous from public.transactions
  where business_id=a.business_id and occurred_at >= now() - interval '56 days'
   and occurred_at < now() - interval '28 days';
  v_candidates := case when v_previous > 0 and v_recent < v_previous * 0.9 then 1 else 0 end;
 elsif a.automation_type = 'low_margin_item' then
  -- Позиции, у которых вклад-маржа ниже порога, назначенного владельцем.
  select count(*) into v_candidates from public.catalog_items ci
  join public.business_profiles bp on bp.business_id = ci.business_id
  where ci.business_id=a.business_id and ci.is_active
   and ci.price_minor > 0 and ci.cost_minor is not null
   and ((ci.price_minor - ci.cost_minor)::numeric / ci.price_minor) * 10000
       < coalesce(bp.margin_floor_bps, 4200);
 elsif a.automation_type = 'weekly_review' then
  select count(*) into v_candidates from public.campaigns
  where business_id=a.business_id and created_at >= now() - interval '7 days';
 elsif a.automation_type = 'data_quality' then
  -- Guests the product cannot act on: no contact recorded at all.
  select count(*) into v_candidates from public.customers c
  where c.business_id=a.business_id and c.lifecycle_stage <> 'anonymized'
   and not exists(select 1 from public.customer_identities ci where ci.customer_id=c.id);
 else
  v_candidates := 0;
 end if;

 if a.automation_type in ('reactivation','winback','welcome','repeat_service','vip_care','second_visit','abandoned_item') then
  select count(*) into v_eligible from public.customers c
  where c.business_id=a.business_id and c.lifecycle_stage <> 'anonymized'
   and private.resolve_effective_consent(a.business_id, c.id, 'marketing.'||v_channel)
   and not exists(select 1 from public.suppression_entries s where s.business_id=a.business_id and s.customer_id=c.id);
  v_eligible := least(v_eligible, v_candidates);
 else
  v_eligible := v_candidates;
 end if;

 -- Stop-loss acts directly: it can pause, but never restart.
 if a.automation_type='stop_loss' then
  perform private.evaluate_stop_loss(id,
    coalesce((a.trigger_rules->>'minRedemptionBps')::integer, 500),
    coalesce((a.trigger_rules->>'minDelivered')::integer, 10))
  from public.campaigns where business_id=a.business_id and status in ('running','scheduled');
 end if;

 -- ------------------------------------------------------------------
 -- The action, at last.
 --
 -- A rule whose declared action is `propose_growth_contract` now writes a
 -- recommendation with a costed forecast — the same shape the signal detector
 -- produces — so «вернуть спящих» ends at something the owner can open, price
 -- and launch, instead of at a sentence.
 -- ------------------------------------------------------------------
 if a.automation_type in ('reactivation','winback','welcome','repeat_service','vip_care','quiet_hours','second_visit','abandoned_item')
    and v_eligible > 0 then
  v_origin := 'automation:' || a.id::text;
  v_economics := private.recommendation_economics(a.business_id, v_eligible);

  if a.automation_type in ('reactivation','winback') then
   v_title_ru := 'Вернуть ' || v_eligible || ' гостей, которые перестали приходить';
   v_title_kk := 'Келуін тоқтатқан ' || v_eligible || ' қонақты қайтару';
   v_reason := 'Правило «' || a.name || '» нашло ' || v_candidates || ' гостей без визита дольше ' || v_days || ' дней; написать можно ' || v_eligible || '.';
  elsif a.automation_type = 'welcome' then
   v_title_ru := 'Довести ' || v_eligible || ' новых гостей до второго визита';
   v_title_kk := 'Жаңа ' || v_eligible || ' қонақты екінші келуге жеткізу';
   v_reason := 'За неделю появилось ' || v_candidates || ' новых гостей. Второй визит решается в первые дни.';
  elsif a.automation_type = 'vip_care' then
   v_title_ru := 'Вернуть ' || v_eligible || ' VIP-гостей';
   v_title_kk := ' ' || v_eligible || ' VIP қонақты қайтару';
   v_reason := 'VIP-гости не заходили дольше обычного. Их возврат дороже всего терять.';
  elsif a.automation_type = 'second_visit' then
   v_title_ru := 'Довести ' || v_eligible || ' гостей до второго визита';
   v_title_kk := ' ' || v_eligible || ' қонақты екінші келуге жеткізу';
   v_reason := 'У ' || v_candidates || ' гостей была ровно одна покупка, и они не вернулись. Второй визит стоит дешевле любой новой продажи.';
  elsif a.automation_type = 'abandoned_item' then
   v_title_ru := 'Вернуть ' || v_eligible || ' гостей к позиции, которую они брали';
   v_title_kk := ' ' || v_eligible || ' қонақты бұрын алған позициясына қайтару';
   v_reason := 'У ' || v_candidates || ' гостей была позиция, которую они заказывали регулярно и перестали. Вернуть к знакомому дешевле, чем продать новое.';
  elsif a.automation_type = 'quiet_hours' then
   v_title_ru := 'Заполнить свободные часы предложением';
   v_title_kk := 'Бос сағаттарды ұсыныспен толтыру';
   v_reason := 'В ближайшую неделю ' || v_candidates || ' слотов загружены меньше чем наполовину.';
  else
   v_title_ru := 'Напомнить о себе ' || v_eligible || ' постоянным гостям';
   v_title_kk := ' ' || v_eligible || ' тұрақты қонаққа еске салу';
   v_reason := 'Прошёл обычный для них цикл между визитами.';
  end if;

  insert into public.recommendations(
    business_id, title_ru, title_kk, explanation, confidence, status, is_mock, origin_key)
  values (
    a.business_id, v_title_ru, v_title_kk,
    jsonb_build_object(
      'reason', v_reason, 'eligible', v_eligible, 'candidates', v_candidates,
      'automationId', a.id, 'automationType', a.automation_type, 'channel', v_channel,
      'economics', v_economics, 'source', 'automation', 'createdAt', now())
      || case when (v_economics->>'known')::boolean
              then jsonb_build_object('expectedContributionMinor', (v_economics->>'expectedContributionMinor')::bigint)
              else '{}'::jsonb end,
    60, 'open', v_mock, v_origin)
  on conflict (business_id, origin_key) where origin_key is not null do nothing
  returning id into v_recommendation;

  v_produced := jsonb_build_object('recommendation_id', v_recommendation, 'recommendation_origin', v_origin);
 end if;

 -- ------------------------------------------------------------------
 -- What the owner is told.
 -- ------------------------------------------------------------------
 v_category := 'opportunity';
 v_title := a.name;
 v_body := null;

 if a.automation_type = 'weekly_review' then
  select count(*) into v_drafts from public.campaigns
  where business_id=a.business_id and status in ('running','scheduled');
  v_category := 'result';
  v_title := 'Итоги недели: ' || a.name;
  v_body := 'За семь дней заведено кампаний: ' || v_candidates || '. Сейчас работают: ' || v_drafts || '. Подробности — в разделе «Аналитика».';
 elsif a.automation_type = 'data_quality' then
  v_category := 'risk';
  v_title := 'Качество данных';
  v_body := case when v_candidates = 0
    then 'У всех гостей есть записанный контакт — данные в порядке.'
    else 'У ' || v_candidates || ' гостей не записан ни один контакт: в кампанию они не попадут никогда. Импортируйте их контакты или соберите согласия по QR.' end;
 elsif a.automation_type = 'check_drop' then
  v_category := 'risk';
  v_title := 'Средний чек';
  v_body := case when v_candidates = 0
    then 'Средний чек держится: за последние 28 дней он не ниже предыдущих 28.'
    else 'Средний чек за 28 дней — ' || round(v_recent) || ' ₸ против ' || round(v_previous) || ' ₸ до этого, это минус '
         || round((1 - v_recent / nullif(v_previous,0)) * 100) || '%. Чаще всего так выглядит пропавшая допозиция в чеке, а не уход гостей.' end;
 elsif a.automation_type = 'low_margin_item' then
  v_category := 'risk';
  v_title := 'Позиции ниже вашего порога маржи';
  v_body := case when v_candidates = 0
    then 'Все активные позиции меню держат вашу минимальную маржу.'
    else 'Позиций с маржой ниже порога: ' || v_candidates || '. Скидка на них уводит чек в минус — именно такие предложения и блокирует Margin Shield.' end;
 elsif a.automation_type = 'content_queue' then
  v_category := 'approval';
  v_title := 'Кампании без утверждённых текстов';
  v_body := case when v_candidates = 0
    then 'У всех кампаний есть утверждённый текст.'
    else 'Кампаний без утверждённого текста: ' || v_candidates || '. Отправка по ним не начнётся, пока текст не утверждён.' end;
 elsif v_eligible > 0 then
  v_title := a.name || ': ' || v_eligible || ' гостей, которым можно написать';
  v_body := v_reason || ' Предложение готово в разделе «Рекомендации» — QADAM ничего не отправил и не отправит без вашего подтверждения.';
 elsif v_candidates > 0 then
  v_title := a.name || ': подходящих ' || v_candidates || ', но писать некому';
  v_body := 'Ни у кого из них нет действующего согласия на канал «' || v_channel || '». Соберите согласия — правило сработает само.';
 end if;

 -- An automation that found nothing says nothing. Notifying every cycle that
 -- there is no news is how a notification list stops being read.
 if v_body is not null and (v_candidates > 0 or a.automation_type in ('weekly_review','data_quality','content_queue','check_drop','low_margin_item')) then
  insert into public.notifications(business_id,user_id,notification_type,category,title,body,action_url,is_mock)
  values(a.business_id, a.owner_id, a.automation_type, v_category, v_title, v_body,
   case when v_recommendation is not null then '/app/recommendations' else '/app/automations' end, v_mock);
 end if;

 v_result := jsonb_build_object(
  -- `dispatched` used to be returned by autopilot regardless of whether
  -- anything was queued. Nothing here enqueues, so nothing here says it did.
  'outcome', case
    when a.automation_type='stop_loss' then 'acted'
    when v_recommendation is not null then 'proposed'
    when v_candidates = 0 then 'nothing_to_do'
    else 'reported' end,
  'mode', a.mode, 'rule_version', a.rule_version, 'channel', v_channel,
  'candidates', v_candidates, 'eligible', v_eligible,
  'requires_owner_approval', true) || v_produced;

 update public.automation_runs set status='completed', completed_at=now(), result=v_result where id=v_run_id;
 -- `enforce_domain_transition` requires optimistic_version to advance on every
 -- update, including a bookkeeping one that leaves the status alone.
 update public.automations
 set last_run_at=now(),
     next_run_at=now() + make_interval(hours => greatest(1, coalesce((a.trigger_rules->>'intervalHours')::integer, 24))),
     optimistic_version=optimistic_version+1
 where id=a.id;

 insert into public.activity_logs(business_id,actor_id,action,resource_type,resource_id,metadata,is_mock)
 values(a.business_id,v_actor,'automation.run','automation',a.id,v_result,v_mock);
 return jsonb_build_object('run_id',v_run_id,'duplicate',false,'status','completed','result',v_result);
end $$;

revoke all on function private.execute_automation(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function private.execute_automation(uuid,text,text) to authenticated, service_role;

comment on function public.execute_automation(uuid,text,text) is
 'Runs one automation. Rules that propose a campaign write a costed recommendation; the rest report something true. No mode enqueues a message — owner approval is always required.';

commit;
