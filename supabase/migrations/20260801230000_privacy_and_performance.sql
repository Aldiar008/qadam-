begin;

-- ===========================================================================
-- Privacy lifecycle and the performance foundation.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Data inventory: which column holds what, and why we are allowed to hold it.
-- Generated from a declared list rather than inferred, so a reviewer can read
-- it and a test can assert that no new PII column appeared unannounced.
-- ---------------------------------------------------------------------------
create table public.data_inventory (
 table_name text not null,
 column_name text not null,
 classification text not null check (classification in ('identifier','quasi_identifier','contact','behavioural','financial','operational','secret_reference')),
 contains_pii boolean not null,
 storage_form text not null check (storage_form in ('plaintext','masked','hashed','rounded','derived','absent')),
 lawful_basis text not null,
 notes text,
 primary key (table_name, column_name)
);
alter table public.data_inventory enable row level security;
create policy data_inventory_read on public.data_inventory for select to anon, authenticated using (true);
revoke all on public.data_inventory from anon, authenticated;
grant select on public.data_inventory to anon, authenticated;
grant all on public.data_inventory to service_role;

insert into public.data_inventory(table_name,column_name,classification,contains_pii,storage_form,lawful_basis,notes) values
 ('customers','display_name','identifier',true,'plaintext','consent','Имя, которое клиент назвал сам при вступлении.'),
 ('customers','lifecycle_stage','behavioural',false,'derived','legitimate_interest','Вычисляется из транзакций.'),
 ('customer_identities','lookup_hash','contact',true,'hashed','consent','SHA-256 от email/телефона. Обратное преобразование невозможно.'),
 ('customer_identities','masked_value','contact',true,'masked','consent','Показывается владельцу, чтобы узнать клиента, без полного контакта.'),
 ('customer_consents','evidence','operational',false,'derived','legal_obligation','Доказательство согласия: источник, время, область.'),
 ('transactions','net_minor','financial',false,'plaintext','contract','Финансовая запись, хранится 7 лет.'),
 ('qr_scans','ip_hash','quasi_identifier',false,'hashed','legitimate_interest','Только для антифрода и лимитов частоты.'),
 ('nearby_offers','latitude_rounded','quasi_identifier',false,'rounded','legitimate_interest','Координаты заведения, округлены. Координат клиента нет нигде.'),
 ('nearby_offer_events','request_key','quasi_identifier',false,'hashed','legitimate_interest','Солёный хэш для дедупликации просмотра, не идентифицирует человека.'),
 ('ai_generation_runs','input_hash','operational',false,'hashed','legitimate_interest','Хэш уже отредактированного ввода; сырого текста нет.'),
 ('team_invitations','email_hash','contact',true,'hashed','contract','Приглашение в команду.'),
 ('team_invitations','masked_email','contact',true,'masked','contract','Показывается администратору бизнеса.'),
 ('business_channels','settings','secret_reference',false,'derived','contract','Только ссылка на эндпоинт; секреты живут в окружении сервера.');

comment on table public.data_inventory is
 'Declared PII inventory. A new column holding personal data must be added here, which is asserted by the database test suite.';

-- ---------------------------------------------------------------------------
-- Privacy exports: a signed, expiring artefact rather than an open link.
-- ---------------------------------------------------------------------------
alter table public.privacy_requests add column export_token_hash bytea;
alter table public.privacy_requests add column export_expires_at timestamptz;
alter table public.privacy_requests add column export_downloaded_at timestamptz;
create unique index privacy_requests_export_token_uidx
 on public.privacy_requests(export_token_hash) where export_token_hash is not null;

/**
 * Anonymises a customer while preserving legally required financial history.
 *
 * Identity rows are deleted outright; the customer row is stripped and marked
 * anonymized; transactions and redemptions keep their amounts but lose the
 * link. This is the behaviour the retention policy promises, implemented rather
 * than described.
 */
create or replace function private.anonymize_customer(p_business_id uuid, p_customer_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_actor uuid := (select auth.uid()); v_mock boolean; v_tx integer; v_kept jsonb;
begin
 if v_actor is null or not private.has_business_role(p_business_id, array['owner','manager']) then
  raise exception 'forbidden' using errcode='42501';
 end if;
 if not exists(select 1 from public.customers where id=p_customer_id and business_id=p_business_id) then
  raise exception 'customer not found in this business' using errcode='23503';
 end if;
 select mode='demo' into v_mock from public.businesses where id=p_business_id;

 select count(*) into v_tx from public.transactions where customer_id=p_customer_id and business_id=p_business_id;

 delete from public.customer_identities where customer_id=p_customer_id and business_id=p_business_id;
 delete from public.customer_notes where customer_id=p_customer_id and business_id=p_business_id;

 -- Consent proof is retained without identity, because it is the evidence that
 -- contacting the person was lawful in the first place.
 update public.customer_consents
 set status='revoked', revoked_at=coalesce(revoked_at, now()),
     evidence = (evidence - 'contact') || jsonb_build_object('anonymized', true)
 where customer_id=p_customer_id and business_id=p_business_id;

 -- Financial rows keep their amounts but lose the person.
 update public.transactions set customer_id=null where customer_id=p_customer_id and business_id=p_business_id;
 update public.redemptions set customer_id=null where customer_id=p_customer_id and business_id=p_business_id;
 update public.campaign_events set customer_id=null where customer_id=p_customer_id and business_id=p_business_id;

 update public.customers
 set display_name=null, preferred_locale=null, lifecycle_stage='anonymized', anonymized_at=now()
 where id=p_customer_id and business_id=p_business_id;

 insert into public.suppression_entries(business_id,customer_id,reason,is_mock)
 values(p_business_id,p_customer_id,'privacy_delete',v_mock);

 v_kept := jsonb_build_object('transactions_retained',v_tx,
  'basis','Финансовые записи сохранены в обезличенном виде по требованию закона.');
 insert into public.activity_logs(business_id,actor_id,action,resource_type,resource_id,metadata,is_mock)
 values(p_business_id,v_actor,'privacy.customer_anonymized','customer',p_customer_id,
  v_kept || jsonb_build_object('reason',p_reason),v_mock);
 return jsonb_build_object('customer_id',p_customer_id,'anonymized',true) || v_kept;
end $$;
revoke all on function private.anonymize_customer(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.anonymize_customer(uuid,uuid,text) to authenticated;

create or replace function public.anonymize_customer(p_business_id uuid, p_customer_id uuid, p_reason text)
returns jsonb language sql security invoker set search_path=''
as $$ select private.anonymize_customer(p_business_id,p_customer_id,p_reason) $$;
revoke all on function public.anonymize_customer(uuid,uuid,text) from public,anon;
grant execute on function public.anonymize_customer(uuid,uuid,text) to authenticated;

-- ---------------------------------------------------------------------------
-- Platform analytics that never expose a tenant's customers.
--
-- Aggregates only, and a cohort smaller than the threshold is withheld rather
-- than rounded, because a count of one is an identification.
-- ---------------------------------------------------------------------------
create or replace function private.platform_overview(p_from timestamptz, p_to timestamptz, p_business_type text, p_city text)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_min_cohort constant integer := 5; v_result jsonb;
begin
 if not private.is_platform_admin(array['platform_admin','platform_editor','platform_analyst']) then
  raise exception 'forbidden' using errcode='42501';
 end if;

 with scoped as (
  select b.id, b.status, b.created_at, bt.code as type_code, bl.city
  from public.businesses b
  left join public.business_types bt on bt.id = b.business_type_id
  left join lateral (
   select city from public.business_locations
   where business_id=b.id and is_active order by created_at limit 1
  ) bl on true
  where (p_business_type is null or bt.code = p_business_type)
    and (p_city is null or bl.city = p_city)
 )
 select jsonb_build_object(
  'active_businesses', (select count(*) from scoped where status='active'),
  'new_businesses', (select count(*) from scoped where created_at between p_from and p_to),
  'onboarding_completed', (select count(*) from public.onboarding_sessions o
    join scoped s on s.id=o.business_id where o.status='completed'),
  'onboarding_started', (select count(*) from public.onboarding_sessions o join scoped s on s.id=o.business_id),
  'active_campaigns', (select count(*) from public.campaigns c join scoped s on s.id=c.business_id
    where c.status in ('approved','scheduled','running','paused')),
  'tool_activations', (select count(*) from public.business_tools t join scoped s on s.id=t.business_id
    where t.status='active'),
  'popular_tools', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
    select tl.code, tl.name_ru, count(*) as activations
    from public.business_tools bt2 join scoped s on s.id=bt2.business_id
    join public.tools tl on tl.id=bt2.tool_id
    where bt2.status='active' group by tl.code, tl.name_ru order by count(*) desc limit 5) x),
  'template_adoption', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
    select t.code, t.current_version, count(distinct tv.id) as published_versions
    from public.templates t left join public.template_versions tv
      on tv.template_id=t.id and tv.status='published'
    group by t.code, t.current_version order by t.code) x),
  'ai_runs', (select count(*) from public.ai_generation_runs a join scoped s on s.id=a.business_id
    where a.created_at between p_from and p_to),
  'ai_fallback_runs', (select count(*) from public.ai_generation_runs a join scoped s on s.id=a.business_id
    where a.created_at between p_from and p_to and a.source='deterministic_fallback'),
  'ai_error_runs', (select count(*) from public.ai_generation_runs a join scoped s on s.id=a.business_id
    where a.created_at between p_from and p_to and a.status in ('failed','blocked')),
  'automation_runs', (select count(*) from public.automation_runs r join scoped s on s.id=r.business_id
    where r.scheduled_at between p_from and p_to),
  'automation_failures', (select count(*) from public.automation_runs r join scoped s on s.id=r.business_id
    where r.scheduled_at between p_from and p_to and r.status in ('failed','dead_letter')),
  'outbox_dead_letters', (select count(*) from public.outbox_events o join scoped s on s.id=o.business_id
    where o.status='dead_letter'),
  'platform_events', (select count(*) from public.platform_events where occurred_at between p_from and p_to),
  'cohort_size', (select count(*) from scoped),
  'min_cohort', v_min_cohort
 ) into v_result;

 -- Below the cohort threshold, per-segment figures are withheld entirely.
 if (v_result->>'cohort_size')::integer < v_min_cohort and (p_business_type is not null or p_city is not null) then
  return jsonb_build_object('suppressed', true, 'min_cohort', v_min_cohort,
   'cohort_size', (v_result->>'cohort_size')::integer,
   'message', 'Слишком маленькая выборка: показ агрегатов по этому срезу скрыт, чтобы нельзя было опознать конкретный бизнес.');
 end if;
 return v_result || jsonb_build_object('suppressed', false);
end $$;
revoke all on function private.platform_overview(timestamptz,timestamptz,text,text) from public,anon,authenticated,service_role;
grant execute on function private.platform_overview(timestamptz,timestamptz,text,text) to authenticated;

create or replace function public.platform_overview(p_from timestamptz, p_to timestamptz, p_business_type text, p_city text)
returns jsonb language sql stable security invoker set search_path=''
as $$ select private.platform_overview(p_from,p_to,p_business_type,p_city) $$;
revoke all on function public.platform_overview(timestamptz,timestamptz,text,text) from public,anon;
grant execute on function public.platform_overview(timestamptz,timestamptz,text,text) to authenticated;

-- ---------------------------------------------------------------------------
-- Performance indexes.
--
-- Composite and partial indexes chosen from the exact predicates the hot pages
-- use. Partial indexes keep them small: an index over every historical row is
-- wasted when the screen only ever asks about open or active ones.
-- ---------------------------------------------------------------------------

-- Today: recent transactions per business.
create index if not exists transactions_business_recent_idx
 on public.transactions(business_id, occurred_at desc, customer_id);

-- Today: the single highest-scoring open signal.
create index if not exists signals_open_score_idx
 on public.signals(business_id, growth_opportunity_score desc)
 where status = 'open';

-- Today and Recommendations: the open queue only.
create index if not exists recommendations_open_idx
 on public.recommendations(business_id, confidence desc)
 where status in ('open','snoozed');

-- Today: campaigns that are actually live.
create index if not exists campaigns_active_idx
 on public.campaigns(business_id, created_at desc)
 where status in ('approved','scheduled','running','paused');

-- Customers list: cursor pagination ordering.
create index if not exists customers_cursor_idx
 on public.customers(business_id, created_at desc, id desc)
 where lifecycle_stage <> 'anonymized';

-- Customers list: lifecycle segment filter.
create index if not exists customers_segment_idx
 on public.customers(business_id, lifecycle_stage, created_at desc);

-- Notifications inbox: unread first.
create index if not exists notifications_unread_idx
 on public.notifications(business_id, created_at desc)
 where read_at is null and dismissed_at is null;

-- Impact ledger: cursor pagination and per-campaign lookup.
create index if not exists impact_measurements_ledger_idx
 on public.impact_measurements(business_id, created_at desc, id desc);
create index if not exists impact_measurements_campaign_kind_idx
 on public.impact_measurements(campaign_id, kind, metric_key);

-- Campaign events: the aggregate every impact recompute performs.
create index if not exists campaign_events_campaign_type_idx
 on public.campaign_events(campaign_id, event_type);

-- Consent resolution runs per customer on every audience build and every send.
create index if not exists customer_consents_lookup_idx
 on public.customer_consents(business_id, customer_id, scope, created_at desc);

-- Admin analytics scans these by period.
create index if not exists ai_generation_runs_period_idx
 on public.ai_generation_runs(created_at desc, source, status);
create index if not exists automation_runs_period_idx
 on public.automation_runs(scheduled_at desc, status);

commit;
