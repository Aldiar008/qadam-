begin;
do $$
begin
 if coalesce(current_setting('app.settings.jwt_secret',true),'') <> 'super-secret-jwt-token-with-at-least-32-characters-long' then
  raise exception 'QADAM demo seed is local/dev-only. Refusing non-local database.';
 end if;
end $$;

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,confirmation_token,recovery_token,email_change_token_new,email_change,phone_change,phone_change_token,email_change_token_current,reauthentication_token,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select '00000000-0000-0000-0000-000000000000',u.id,'authenticated','authenticated',u.email,
 extensions.crypt(u.password,extensions.gen_salt('bf')),now(),'','','','','','','','',
 jsonb_build_object('provider','email','providers',array['email']::text[])||u.app_meta,
 jsonb_build_object('display_name',u.name,'locale','ru','timezone','Asia/Almaty','is_demo',true),now(),now()
from (values
 ('00000000-0000-4000-8000-000000000101'::uuid,'owner@qadam.local','QadamLocal!2026','TAMYR Owner','{}'::jsonb),
 ('00000000-0000-4000-8000-000000000102'::uuid,'marketer@qadam.local','QadamLocal!2026','TAMYR Marketer','{}'::jsonb),
 ('00000000-0000-4000-8000-000000000103'::uuid,'viewer@qadam.local','QadamLocal!2026','TAMYR Viewer','{}'::jsonb),
 ('00000000-0000-4000-8000-000000000201'::uuid,'tenant-b@qadam.local','QadamLocal!2026','Tenant B Owner','{}'::jsonb),
 ('00000000-0000-4000-8000-000000000301'::uuid,'nomember@qadam.local','QadamLocal!2026','No Membership','{}'::jsonb),
 ('00000000-0000-4000-8000-000000000901'::uuid,'admin@qadam.local','QadamLocal!2026','Platform Admin','{"platform_role":"platform_admin"}'::jsonb)
) u(id,email,password,name,app_meta)
on conflict(id) do update set email=excluded.email,encrypted_password=excluded.encrypted_password,email_confirmed_at=excluded.email_confirmed_at,
 confirmation_token='',recovery_token='',email_change_token_new='',email_change='',phone_change='',phone_change_token='',email_change_token_current='',reauthentication_token='',
 raw_app_meta_data=excluded.raw_app_meta_data,raw_user_meta_data=excluded.raw_user_meta_data,updated_at=now();

insert into auth.identities(id,user_id,provider_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
select id,id,id::text,jsonb_build_object('sub',id::text,'email',email),'email',now(),now(),now()
from auth.users where id::text like '00000000-0000-4000-8000-000000000%'
on conflict(provider_id,provider) do update set identity_data=excluded.identity_data,updated_at=now();

update public.profiles set is_mock=true where id::text like '00000000-0000-4000-8000-000000000%';

insert into public.business_types(id,code,name_ru,name_kk,status,is_public,is_mock) values
 ('01000000-0000-4000-8000-000000000001','cafe','Кофейня','Кофехана','published',true,true),
 ('01000000-0000-4000-8000-000000000002','beauty','Салон красоты','Сұлулық салоны','published',true,true),
 ('01000000-0000-4000-8000-000000000003','retail','Магазин','Дүкен','published',true,true),
 ('01000000-0000-4000-8000-000000000004','service','Сервисная точка','Сервис орны','published',true,true)
on conflict(id) do update set name_ru=excluded.name_ru,name_kk=excluded.name_kk,status=excluded.status,is_mock=true;

insert into public.plans(id,code,name,status,price_minor,currency,billing_period,is_public,is_mock)
values('02000000-0000-4000-8000-000000000001','demo','Demo','active',0,'KZT','month',false,true)
on conflict(id) do update set status='active',is_mock=true;

insert into public.businesses(id,created_by,business_type_id,name,currency,timezone,mode,status,is_mock) values
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000101','01000000-0000-4000-8000-000000000001','TAMYR Coffee','KZT','Asia/Almaty','demo','active',true),
 ('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000201','01000000-0000-4000-8000-000000000001','Tenant B Test Cafe','KZT','Asia/Almaty','demo','active',true)
on conflict(id) do update set name=excluded.name,mode='demo',is_mock=true;

insert into public.business_members(id,business_id,user_id,role,status,is_mock) values
 ('11000000-0000-4000-8000-000000000101','10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000101','owner','active',true),
 ('11000000-0000-4000-8000-000000000102','10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000102','marketer','active',true),
 ('11000000-0000-4000-8000-000000000103','10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000103','viewer','active',true),
 ('21000000-0000-4000-8000-000000000201','20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000201','owner','active',true)
on conflict(business_id,user_id) do update set role=excluded.role,status='active',is_mock=true;

insert into private.platform_admin_assignments(id,user_id,role,active,assigned_by)
values('90000000-0000-4000-8000-000000000901','00000000-0000-4000-8000-000000000901','platform_admin',true,'00000000-0000-4000-8000-000000000901')
on conflict(user_id) do update set role='platform_admin',active=true;

insert into public.business_locations(id,business_id,name,city,district,timezone,capacity,is_active,is_mock) values
 ('12000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','TAMYR Coffee · Бостандык','Алматы','Бостандыкский','Asia/Almaty',38,true,true),
 ('22000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Tenant B Location','Алматы','Медеуский','Asia/Almaty',20,true,true)
on conflict(id) do update set capacity=excluded.capacity,is_mock=true;

update public.businesses set mode='production', is_mock=false where id='20000000-0000-4000-8000-000000000001';
update public.business_members set is_mock=false where business_id='20000000-0000-4000-8000-000000000001';
update public.business_locations set is_mock=false where business_id='20000000-0000-4000-8000-000000000001';

insert into public.business_profiles(id,business_id,average_check_minor,currency,margin_floor_bps,monthly_marketing_budget_minor,profile_confidence,source_evidence,is_mock)
values('13000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',3450,'KZT',4200,120000,95,'{"source":"qadam_demo_seed","version":1}',true)
on conflict(business_id) do update set average_check_minor=3450,margin_floor_bps=4200,is_mock=true;

insert into public.business_profiles(id,business_id,average_check_minor,currency,margin_floor_bps,monthly_marketing_budget_minor,profile_confidence,source_evidence,is_mock)
values('23000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',3000,'KZT',4000,60000,80,'{"source":"production_fixture_for_mode_separation"}',false)
on conflict(business_id) do update set average_check_minor=3000,margin_floor_bps=4000,is_mock=false;

insert into public.business_limits(id,business_id,monthly_budget_minor,currency,max_campaigns_per_month,max_contacts_per_month,approval_threshold_minor,is_mock)
values('14000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',120000,'KZT',20,1000,25000,true)
on conflict(business_id) do update set monthly_budget_minor=120000,is_mock=true;

insert into public.business_limits(id,business_id,monthly_budget_minor,currency,max_campaigns_per_month,max_contacts_per_month,approval_threshold_minor,is_mock)
values('24000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',60000,'KZT',5,250,15000,false)
on conflict(business_id) do update set monthly_budget_minor=60000,is_mock=false;

-- The rule is the segment. It used to be `{"seed_rule": 2}` — a placeholder that
-- the cabinet printed verbatim, so the screen showed a number nobody could
-- check against anything. These are written in the shape
-- `public.preview_segment_audience` executes, and the memberships below are
-- derived from the same conditions, so the card and the list agree.
-- Меню заведения с ценой и себестоимостью.
--
-- Без него Margin Shield считал вклад-маржу от одного среднего чека, в промпт AI
-- уходил пустой каталог, генератор рекомендаций честно отвечал «не хватает
-- себестоимости позиций», а в Telegram-приложении гостю нечего было показать.
insert into public.catalog_items(id,business_id,location_id,sku,item_kind,name_ru,name_kk,price_minor,cost_minor,currency,is_active,is_mock)
select private.deterministic_uuid('catalog-'||t.sku),'10000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001',
 t.sku,'product',t.name_ru,t.name_kk,t.price,t.cost,'KZT',true,true
from (values
 ('espresso','Эспрессо','Эспрессо',700,210),
 ('americano','Американо','Американо',900,250),
 ('cappuccino','Капучино','Капучино',1400,500),
 ('latte','Латте','Латте',1500,540),
 ('raf','Раф','Раф',1800,650),
 ('flat_white','Флэт-уайт','Флэт-уайт',1600,570),
 ('tea','Чай','Шай',800,180),
 ('croissant','Круассан','Круассан',900,600),
 ('almond_croissant','Круассан с миндалём','Бадаммен круассан',1200,760),
 ('cheesecake','Чизкейк','Чизкейк',1900,900),
 ('cinnamon_roll','Синнабон','Синнабон',1400,700),
 ('sandwich','Сэндвич','Сэндвич',2200,1250),
 ('porridge','Овсяная каша','Сұлы ботқасы',1500,620),
 ('lemonade','Лимонад','Лимонад',1300,430)
) as t(sku,name_ru,name_kk,price,cost)
on conflict(business_id,sku) do update set price_minor=excluded.price_minor,cost_minor=excluded.cost_minor,is_active=true,is_mock=true;

-- Часы работы: без них сигнал «свободные окна» и автоматизация «тихие часы»
-- всегда находили ноль, потому что таблица была пуста.
insert into public.operating_hours(id,business_id,location_id,day_of_week,opens_at,closes_at,is_closed,is_mock)
select private.deterministic_uuid('hours-'||d),'10000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001',
 d, case when d in (0,6) then time '09:00' else time '08:00' end,
 case when d in (0,6) then time '21:00' else time '22:00' end, false, true
from generate_series(0,6) d
on conflict(location_id,day_of_week) do update set opens_at=excluded.opens_at,closes_at=excluded.closes_at,is_mock=true;

-- Загрузка по часам за последние две недели: будни 15–18 заметно свободнее.
insert into public.capacity_slots(id,business_id,location_id,starts_at,ends_at,capacity,booked,is_mock)
select private.deterministic_uuid('slot-'||d||'-'||h),'10000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001',
 date_trunc('hour', now()) - ((d||' days')::interval) - (((24 - h)||' hours')::interval),
 date_trunc('hour', now()) - ((d||' days')::interval) - (((23 - h)||' hours')::interval),
 38,
 case
   when extract(isodow from (now() - (d||' days')::interval)) >= 6 then 20 + (d + h) % 8
   when h between 15 and 17 then 6 + (d + h) % 4
   when h between 8 and 10 then 24 + (d + h) % 6
   else 16 + (d + h) % 7
 end,
 true
from generate_series(1,14) d cross join generate_series(8,21) h
on conflict(location_id,starts_at) do nothing;

insert into public.customer_segments(id,business_id,code,name_ru,name_kk,definition,is_dynamic,status,is_mock,last_evaluated_at)
select private.deterministic_uuid('segment-'||g),'10000000-0000-4000-8000-000000000001',
 (array['inactive_30','eligible_winback','new','loyal','vip'])[g],
 (array['Спящие 30+ дней','Готовы к возврату','Новые','Постоянные','VIP'])[g],
 (array['30+ күн белсенді емес','Қайтаруға дайын','Жаңа','Тұрақты','VIP'])[g],
 (array[
   '{"stage":"inactive","daysInactive":30}',
   '{"stage":"inactive","daysInactive":30,"consentFilter":"marketing_required","channel":"telegram"}',
   '{"stage":"new"}',
   '{"stage":"loyal","minVisits":5}',
   '{"stage":"vip","minVisits":5}'
 ])[g]::jsonb,true,'active',true,
 -- The memberships below are written in the same transaction, so this is when
 -- the rule was last run — the cabinet says «ещё не пересчитывался» otherwise.
 now() from generate_series(1,5) g
on conflict(business_id,code) do update set name_ru=excluded.name_ru,name_kk=excluded.name_kk,definition=excluded.definition,is_mock=true,last_evaluated_at=excluded.last_evaluated_at;

insert into public.customers(id,business_id,display_name,preferred_locale,lifecycle_stage,first_seen_at,last_seen_at,is_mock)
select private.deterministic_uuid('customer-'||g),'10000000-0000-4000-8000-000000000001','Demo Guest '||lpad(g::text,3,'0'),
 case when g%3=0 then 'kk' else 'ru' end,
 -- Five lifecycle stages instead of three: «Новые» and «Постоянные» were shown
 -- in the cabinet as segments with nobody in them, because no seeded customer
 -- ever had those stages.
 case when g<=64 then 'inactive' when g<=100 then 'new' when g<=145 then 'active' when g<=165 then 'loyal' else 'vip' end,
 -- Anchored to now(), like the sales history: a demonstration where «спящие»
 -- silently become «ушедшие» after a fortnight is a demonstration that expires.
 now()-((120-(g%30))||' days')::interval,
 case when g<=64 then now()-((44+(g%20))||' days')::interval else now()-((g%14)||' days')::interval end,true
from generate_series(1,180) g
on conflict(id) do update set lifecycle_stage=excluded.lifecycle_stage,last_seen_at=excluded.last_seen_at,is_mock=true;

insert into public.customer_identities(id,business_id,customer_id,identity_type,lookup_hash,masked_value,is_primary,is_mock)
select private.deterministic_uuid('identity-'||g),'10000000-0000-4000-8000-000000000001',private.deterministic_uuid('customer-'||g),
 'phone',extensions.digest('qadam-demo-phone-'||g,'sha256'),'+7 700 *** '||lpad(g::text,4,'0'),true,true
from generate_series(1,180) g on conflict(business_id,identity_type,lookup_hash) do nothing;

insert into public.customer_consents(id,business_id,customer_id,scope,status,source,evidence,granted_at,is_mock)
select private.deterministic_uuid('consent-'||g),'10000000-0000-4000-8000-000000000001',private.deterministic_uuid('customer-'||g),
 'marketing.telegram',case when g<=18 then 'granted' else 'denied' end,'demo_qr','{"synthetic":true}',
 case when g<=18 then '2026-05-01 00:00:00+00'::timestamptz else null end,true
from generate_series(1,180) g on conflict(id) do nothing;

-- Membership is selected by the segment's own rule rather than by a hardcoded
-- range of ids, so «правило» on the card and «состав» in the list cannot drift
-- apart as the rest of the seed changes.
insert into public.segment_memberships(id,business_id,segment_id,customer_id,evaluated_at,reason,is_mock)
select private.deterministic_uuid('inactive-membership-'||c.id::text),'10000000-0000-4000-8000-000000000001',
 private.deterministic_uuid('segment-1'),c.id,now(),
 jsonb_build_object('rule','stage=inactive & daysInactive>=30','days',floor(extract(epoch from now()-c.last_seen_at)/86400)),true
from public.customers c
where c.business_id='10000000-0000-4000-8000-000000000001' and c.lifecycle_stage='inactive'
on conflict(segment_id,customer_id) do nothing;

insert into public.segment_memberships(id,business_id,segment_id,customer_id,evaluated_at,reason,is_mock)
select private.deterministic_uuid('eligible-membership-'||c.id::text),'10000000-0000-4000-8000-000000000001',
 private.deterministic_uuid('segment-2'),c.id,now(),
 jsonb_build_object('rule','stage=inactive & consent=marketing.telegram','consent','granted'),true
from public.customers c
where c.business_id='10000000-0000-4000-8000-000000000001' and c.lifecycle_stage='inactive'
 and private.resolve_effective_consent(c.business_id,c.id,'marketing.telegram')
on conflict(segment_id,customer_id) do nothing;

-- New, loyal and VIP were declared segments with no members at all: three of
-- five cards in the cabinet read «0 клиентов».
insert into public.segment_memberships(id,business_id,segment_id,customer_id,evaluated_at,reason,is_mock)
select private.deterministic_uuid(s.code||'-membership-'||c.id::text),'10000000-0000-4000-8000-000000000001',
 private.deterministic_uuid('segment-'||s.g),c.id,now(),
 jsonb_build_object('rule','stage='||s.stage),true
from (values (3,'new','new'),(4,'loyal','loyal'),(5,'vip','vip')) as s(g,code,stage)
join public.customers c
 on c.business_id='10000000-0000-4000-8000-000000000001' and c.lifecycle_stage=s.stage
on conflict(segment_id,customer_id) do nothing;

insert into public.transactions(id,business_id,location_id,customer_id,external_ref,occurred_at,gross_minor,discount_minor,net_minor,cost_minor,currency,source,is_mock)
select private.deterministic_uuid('transaction-'||g),'10000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001',
 private.deterministic_uuid('customer-'||(((g-1)%180)+1)),'demo-tx-'||g,
 t.occurred_at, t.amount, 0, t.amount, round(t.amount*0.38), 'KZT','demo_seed',true
from generate_series(1,1129) g
cross join lateral (
 select ts.occurred_at,
  case
   when ((g-1)%84) < 7
    and extract(isodow from ts.local_day) between 1 and 5
    and (9 + ((g-1)/84)) between 15 and 17
   then 2519
   else 3450
  end as amount
 from (
  select
   (date_trunc('day', now() at time zone 'Asia/Almaty') - (((g-1)%84)||' days')::interval) as local_day,
   ((date_trunc('day', now() at time zone 'Asia/Almaty')
     - (((g-1)%84)||' days')::interval
     + ((9 + ((g-1)/84))||' hours')::interval) at time zone 'Asia/Almaty') as occurred_at
 ) ts
) t
on conflict(id) do nothing;
insert into public.transaction_items(id,business_id,transaction_id,item_name,quantity,unit_price_minor,unit_cost_minor,total_minor,currency,is_mock)
select private.deterministic_uuid('transaction-item-'||g),'10000000-0000-4000-8000-000000000001',private.deterministic_uuid('transaction-'||g),
 'Demo coffee order',1,3450,1311,3450,'KZT',true from generate_series(1,1129) g on conflict(id) do nothing;

insert into public.signals(id,business_id,location_id,signal_type,metric_key,period_start,period_end,comparison_start,comparison_end,change_bps,growth_opportunity_score,confidence,status,evidence,detected_at,is_mock)
values('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001',
 'quiet_hours','weekday_revenue_afternoon_15_18',now()-interval '7 days',now(),now()-interval '14 days',now()-interval '7 days',
 -2700,87,82,'open','{"source":"synthetic_transactions","comparison":"comparable_weekdays"}',now(),true)
on conflict(id) do update set change_bps=-2700,growth_opportunity_score=87,is_mock=true;

insert into public.recommendations(id,business_id,signal_id,title_ru,title_kk,explanation,confidence,status,is_mock)
select private.deterministic_uuid('recommendation-'||g),'10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
 (array['Подарок при пороге','Тихие часы','Купон на возврат'])[g],
 (array['Шекке сыйлық','Тыныш сағаттар','Қайтару купоны'])[g],
 jsonb_build_object('hypothesis','synthetic demo; not causal','rank',g),80-g,'open',true from generate_series(1,3) g
on conflict(id) do nothing;

insert into public.growth_contracts(id,business_id,signal_id,recommendation_id,schema_version,version,status,accepted_snapshot,content_hash,created_by,approved_by,approved_at,is_mock,consent_summary,simulator_result,margin_decision,attribution_plan,owner_limits_snapshot,compiled_at)
select private.deterministic_uuid('contract-'||g),'10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
 private.deterministic_uuid('recommendation-'||g),1,1,case when g=1 then 'approved' else 'draft' end,
 jsonb_build_object('signal',jsonb_build_object('change_bps',-2700,'period','2026-07-15/2026-07-29'),'goal','reactivate',
 'audience',jsonb_build_object('inclusion','inactive_30','exclusion','no_consent','eligible',18),
 'consent','required','offer',case when g=1 then 'croissant_at_3500' else 'alternative_'||g end,
 'scenarios',jsonb_build_object('pessimistic',6,'base',9,'optimistic',12),'margin_floor_bps',4200,'cannibalization_risk_bps',900,
 'stop_rule',jsonb_build_object('max_redemptions',15,'max_cost_minor',7000),'locales',array['ru','kk'],'actions',array['edit','snooze','reject','approve','launch','pause']),
 md5('contract-'||g),'00000000-0000-4000-8000-000000000101',
 case when g=1 then '00000000-0000-4000-8000-000000000101'::uuid else null end,
 case when g=1 then '2026-07-22 06:00+00'::timestamptz else null end,true,
 '{"scope":"marketing.telegram","granted":18,"excluded":46,"checkedAt":"2026-07-22T00:00:00Z"}',
 '{"formulaVersion":"simulator.v1","scenarios":{"pessimistic":{"orders":6},"base":{"orders":9,"campaignCostMinor":6800},"optimistic":{"orders":12}}}',
 '{"status":"allowed","reasons":[],"formulaVersion":"margin-shield.v1"}',
 '{"trackingCode":"TAMYR3500","method":"exposed_vs_baseline"}',
 '{"budgetMinor":120000,"marginFloor":0.42,"approvalThresholdMinor":25000}',
 '2026-07-22 05:55+00'::timestamptz from generate_series(1,3) g
on conflict(id) do nothing;

insert into public.campaigns(id,business_id,growth_contract_id,name,status,channel,budget_minor,currency,starts_at,ends_at,stop_rule,created_by,approved_by,is_mock)
select private.deterministic_uuid('campaign-'||g),'10000000-0000-4000-8000-000000000001',private.deterministic_uuid('contract-'||g),
 (array['Круассан при чеке 3 500 ₸','Happy hours','Return coupon'])[g],
 (array['completed','draft','draft'])[g],'telegram',6800,'KZT','2026-07-22 09:00+00','2026-07-29 12:00+00',
 '{"max_redemptions":15,"max_cost_minor":7000}','00000000-0000-4000-8000-000000000101',
 case when g=1 then '00000000-0000-4000-8000-000000000101'::uuid else null end,true
from generate_series(1,3) g on conflict(id) do nothing;

insert into public.content_items(id,business_id,campaign_id,content_kind,channel,locale,body,alt_text,cta,status,version,is_mock)
select private.deterministic_uuid('content-'||g),'10000000-0000-4000-8000-000000000001',private.deterministic_uuid('campaign-1'),
 (array['direct_message','post','story'])[g],(array['telegram','instagram','instagram'])[g],case when g=3 then 'kk' else 'ru' end,
 (array['Круассан в подарок при чеке от 3 500 ₸','Тихие часы в TAMYR Coffee','3 500 ₸ чектен круассан сыйлық'])[g],
 'Synthetic TAMYR Coffee promotion','Открыть предложение','approved',1,true from generate_series(1,3) g on conflict(id) do nothing;

insert into public.automations(id,business_id,name,automation_type,trigger_rules,action_rules,guardrails,status,created_by,is_mock)
select private.deterministic_uuid('automation-'||g),'10000000-0000-4000-8000-000000000001',
 (array['Welcome','Reactivation 30d','Weekly review'])[g],(array['welcome','reactivation','weekly_review'])[g],
 jsonb_build_object('seed_trigger',g),jsonb_build_object('seed_action',g),'{"consent_required":true,"approval_required":true}',
 case when g=1 then 'active' else 'draft' end,'00000000-0000-4000-8000-000000000101',true
from generate_series(1,3) g on conflict(id) do nothing;

insert into public.daily_analytics(id,business_id,location_id,metric_date,gross_revenue_minor,transactions_count,new_customers_count,repeat_customers_count,currency,source,is_mock)
select private.deterministic_uuid('daily-'||g),'10000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001',
 (now() at time zone 'Asia/Almaty')::date-(g-1),(300000+g*1000),8+(g%5),g%3,5+(g%4),'KZT','demo_seed',true
from generate_series(1,120) g on conflict(business_id,location_id,metric_date) do nothing;

insert into public.activity_logs(id,business_id,actor_id,action,resource_type,resource_id,metadata,occurred_at,is_mock)
select private.deterministic_uuid('activity-'||g),'10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000101',
 'demo.action.'||g,'seed',null,jsonb_build_object('sequence',g),'2026-07-29 06:00+00'::timestamptz-((20-g)||' hours')::interval,true
from generate_series(1,20) g on conflict(id) do nothing;

insert into public.tool_categories(id,code,name_ru,name_kk,status,sort_order,is_mock)
select private.deterministic_uuid('tool-category-'||g),(array['marketing','sales','retention','analytics','automation'])[g],
 (array['Маркетинг','Продажи','Удержание','Аналитика','Автоматизация'])[g],
 (array['Маркетинг','Сату','Ұстап қалу','Аналитика','Автоматтандыру'])[g],'published',g,true
from generate_series(1,5) g on conflict(code) do update set status='published',is_mock=true;

-- Twelve real instruments instead of «QADAM Tool 1..12 · Synthetic demo tool N»,
-- and every `route` leads to the screen that does the thing. Before this, all
-- twelve pointed at `/app/tools`, so «Использовать» reloaded the catalogue.
insert into public.tools(id,category_id,code,name_ru,name_kk,description_ru,description_kk,route,status,version,is_public,is_mock)
select private.deterministic_uuid('tool-'||g),private.deterministic_uuid('tool-category-'||t.category),t.code,
 t.name_ru,t.name_kk,t.description_ru,t.description_kk,t.route,'published',1,true,true
from generate_series(1,12) g
join (values
 (1,1,'signal_today','Сигнал дня','Күн сигналы','Одна проблема или возможность на сегодня, с источником и периодом сравнения.','Бүгінге бір мәселе немесе мүмкіндік — дереккөзімен және салыстыру кезеңімен.','/app/today'),
 (2,1,'campaign_studio','Студия кампаний','Кампания студиясы','Семь шагов от цели до Growth Contract: аудитория, механика, симулятор, тексты.','Мақсаттан Growth Contract-қа дейін жеті қадам.','/app/campaigns/studio'),
 (3,1,'content_studio','Контент-студия','Контент студиясы','Посты, сторис, сценарий видео и сообщение — на русском и казахском.','Пост, сторис, бейне сценарийі және хабарлама — орысша және қазақша.','/app/content'),
 (4,2,'margin_shield','Margin Shield','Margin Shield','Запрещает акцию, которая опускает вклад-маржу ниже вашего порога.','Үлес маржасын шегіңізден төмендететін акцияны тыйым салады.','/app/campaigns/studio?step=5'),
 (5,2,'simulator','Симулятор сценариев','Сценарий симуляторы','Осторожный, базовый и оптимистичный прогноз до запуска, а не после.','Іске қосқанға дейінгі үш болжам.','/app/campaigns/studio?step=5'),
 (6,3,'qr_loyalty','QR-лояльность','QR адалдық','Карта гостя по QR-коду: штампы, награды, раздельные согласия.','QR арқылы қонақ картасы: мөрлер, сыйлықтар, бөлек келісімдер.','/app/loyalty'),
 (7,3,'segments','Сегменты клиентов','Клиент сегменттері','Правило вместо списка: кто попадёт в рассылку и скольким можно писать.','Тізім емес, ереже: кімге жазуға болады.','/app/segments'),
 (8,3,'winback','Возврат спящих','Ұйқыдағыларды қайтару','Кто не приходил дольше 30 дней и у кого есть действующее согласие.','30 күннен астам келмегендер және келісімі барлар.','/app/customers?segment=inactive'),
 (9,4,'impact_ledger','Impact Ledger','Impact Ledger','Прогноз, влияние и прирост — тремя разными строками, а не одной цифрой.','Болжам, ықпал және өсім — үш бөлек жол.','/app/analytics'),
 (10,4,'customer_brief','AI-досье гостя','Қонақтың AI-досьесі','Что нужно знать об этом госте и что с ним делать дальше.','Осы қонақ туралы не білу керек және әрі қарай не істеу керек.','/app/customers'),
 (11,5,'automations','Автоматизации','Автоматтандыру','Правила, которые работают сами, с аварийной остановкой и подтверждением владельца.','Өздігінен жұмыс істейтін ережелер.','/app/automations'),
 (12,5,'telegram_bot','Telegram-бот','Telegram бот','Сводка дня владельцу, вступление гостя по QR и подтверждение запуска кнопкой.','Иесіне күндік қорытынды, қонақтың QR арқылы қосылуы.','/app/automations')
) as t(ord,category,code,name_ru,name_kk,description_ru,description_kk,route) on t.ord = g
on conflict(code) do update set category_id=excluded.category_id,name_ru=excluded.name_ru,name_kk=excluded.name_kk,
 description_ru=excluded.description_ru,description_kk=excluded.description_kk,route=excluded.route,
 status='published',is_public=true,is_mock=true;

insert into public.templates(id,code,name,status,current_version,is_mock)
select private.deterministic_uuid('template-'||g),'template_'||g,(array['Win-back threshold gift','Quiet hours','First to second visit'])[g],
 'published',1,true from generate_series(1,3) g on conflict(code) do update set status='published',is_mock=true;
insert into public.template_versions(id,template_id,version,schema_version,content,status,published_at,created_by,is_mock)
select private.deterministic_uuid('template-version-'||g),private.deterministic_uuid('template-'||g),1,1,jsonb_build_object('template',g,'locales',array['ru','kk']),
 'published','2026-07-20 00:00+00','00000000-0000-4000-8000-000000000901',true from generate_series(1,3) g
on conflict(template_id,version) do nothing;

insert into public.impact_measurements(id,business_id,campaign_id,growth_contract_id,metric_key,kind,value_minor,unit,currency,period_start,period_end,source,method_version,confidence,evidence,is_mock) values
 (private.deterministic_uuid('impact-influenced'),'10000000-0000-4000-8000-000000000001',private.deterministic_uuid('campaign-1'),private.deterministic_uuid('contract-1'),'influenced_revenue','influenced',103500,'money','KZT','2026-07-22 00:00+00','2026-07-30 00:00+00','demo_transactions','v1',100,'{"synthetic":true}',true),
 (private.deterministic_uuid('impact-incremental'),'10000000-0000-4000-8000-000000000001',private.deterministic_uuid('campaign-1'),private.deterministic_uuid('contract-1'),'incremental_revenue','incremental_estimate',48700,'money','KZT','2026-07-22 00:00+00','2026-07-30 00:00+00','demo_holdout_estimate','v1',65,'{"synthetic":true}',true),
 (private.deterministic_uuid('impact-contribution'),'10000000-0000-4000-8000-000000000001',private.deterministic_uuid('campaign-1'),private.deterministic_uuid('contract-1'),'incremental_contribution','mock_actual',18200,'money','KZT','2026-07-22 00:00+00','2026-07-30 00:00+00','demo_simulation','v1',65,'{"synthetic":true}',true),
 (private.deterministic_uuid('impact-roi'),'10000000-0000-4000-8000-000000000001',private.deterministic_uuid('campaign-1'),private.deterministic_uuid('contract-1'),'roi_bps','mock_actual',16800,'basis_points',null,'2026-07-22 00:00+00','2026-07-30 00:00+00','demo_simulation','v1',65,'{"campaign_cost_minor":6800}',true),
 (private.deterministic_uuid('impact-time'),'10000000-0000-4000-8000-000000000001',private.deterministic_uuid('campaign-1'),private.deterministic_uuid('contract-1'),'owner_time_saved','mock_actual',145,'minutes',null,'2026-07-22 00:00+00','2026-07-30 00:00+00','demo_simulation','v1',60,'{"synthetic":true}',true)
on conflict(id) do nothing;

insert into public.campaign_audiences(id,business_id,campaign_id,customer_id,segment_id,inclusion_status,consent_scope,consent_status,rules_evidence,is_mock)
select private.deterministic_uuid('audience-'||g),'10000000-0000-4000-8000-000000000001',private.deterministic_uuid('campaign-1'),private.deterministic_uuid('customer-'||g),
 private.deterministic_uuid('segment-2'),'included','marketing.telegram','granted','{"eligible":true}',true from generate_series(1,18) g
on conflict(campaign_id,customer_id) do nothing;
insert into public.campaign_deliveries(id,business_id,campaign_id,customer_id,content_item_id,idempotency_key,status,queued_at,sent_at,delivered_at,is_mock)
select private.deterministic_uuid('delivery-'||g),'10000000-0000-4000-8000-000000000001',private.deterministic_uuid('campaign-1'),private.deterministic_uuid('customer-'||g),
 private.deterministic_uuid('content-1'),'demo-delivery-'||g,'delivered','2026-07-22 08:00+00','2026-07-22 08:01+00','2026-07-22 08:02+00',true
from generate_series(1,18) g on conflict(business_id,idempotency_key) do nothing;
insert into public.campaign_events(id,business_id,campaign_id,delivery_id,customer_id,event_type,occurred_at,source,external_event_ref,metadata,is_mock)
select private.deterministic_uuid('event-delivered-'||g),'10000000-0000-4000-8000-000000000001',private.deterministic_uuid('campaign-1'),private.deterministic_uuid('delivery-'||g),
 private.deterministic_uuid('customer-'||g),'delivered','2026-07-22 08:02+00','demo','delivered-'||g,'{}',true from generate_series(1,18) g
on conflict(id) do nothing;
insert into public.campaign_events(id,business_id,campaign_id,delivery_id,customer_id,event_type,occurred_at,source,external_event_ref,metadata,is_mock)
select private.deterministic_uuid('event-opened-'||g),'10000000-0000-4000-8000-000000000001',private.deterministic_uuid('campaign-1'),private.deterministic_uuid('delivery-'||g),
 private.deterministic_uuid('customer-'||g),'opened','2026-07-22 09:00+00','demo','opened-'||g,'{}',true from generate_series(1,15) g
on conflict(id) do nothing;
insert into public.campaign_events(id,business_id,campaign_id,delivery_id,customer_id,event_type,occurred_at,source,external_event_ref,metadata,is_mock)
select private.deterministic_uuid('event-redeemed-'||g),'10000000-0000-4000-8000-000000000001',private.deterministic_uuid('campaign-1'),private.deterministic_uuid('delivery-'||g),
 private.deterministic_uuid('customer-'||g),'redeemed','2026-07-25 09:00+00','demo','redeemed-'||g,'{}',true from generate_series(1,9) g
on conflict(id) do nothing;


-- ---------------------------------------------------------------------------
-- QR-лояльность: программа, коды, награды, счета и история сканов.
--
-- Модуль полностью реализован в коде и полностью отсутствовал в демо-данных,
-- поэтому показать его было нечем. Токены кодов известны заранее и не
-- случайны: страница /q/<token> должна открываться на демонстрации, а в базе,
-- как и для настоящего кода, лежит только sha256 от него.
-- ---------------------------------------------------------------------------
insert into public.loyalty_programs(id,business_id,name,program_type,rules,status,is_mock) values
 ('15000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','TAMYR Кофе-карта','stamps',
  '{"joinStamps":1,"stampsPerVisit":1,"joinPoints":0,"pointsPerVisit":0}'::jsonb,'active',true)
on conflict(id) do update set rules=excluded.rules,status='active',is_mock=true;

insert into public.rewards(id,business_id,loyalty_program_id,name_ru,name_kk,cost_points,cost_stamps,inventory_limit,status,is_mock) values
 ('16000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','15000000-0000-4000-8000-000000000001',
  'Круассан в подарок','Сыйлыққа круассан',null,5,200,'active',true),
 ('16000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','15000000-0000-4000-8000-000000000001',
  'Капучино в подарок','Сыйлыққа капучино',null,8,120,'active',true)
on conflict(id) do update set cost_stamps=excluded.cost_stamps,status='active',is_mock=true;

insert into public.qr_codes(id,business_id,location_id,loyalty_program_id,token_hash,purpose,status,public_context,is_mock) values
 ('17000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001',
  '15000000-0000-4000-8000-000000000001',extensions.digest('tamyr-kassa-demo','sha256'),'loyalty_join','active',
  '{"placement":"kassa","label":"Карта TAMYR на кассе"}'::jsonb,true),
 ('17000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001',
  '15000000-0000-4000-8000-000000000001',extensions.digest('tamyr-stol-demo','sha256'),'loyalty_join','active',
  '{"placement":"stol","label":"Карта TAMYR на столе"}'::jsonb,true),
 ('17000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001',
  '15000000-0000-4000-8000-000000000001',extensions.digest('tamyr-chek-demo','sha256'),'loyalty_join','active',
  '{"placement":"chek","label":"Карта TAMYR на чеке"}'::jsonb,true)
on conflict(id) do update set status='active',public_context=excluded.public_context,is_mock=true;

-- Счета первых 60 гостей: карта заведена, штампы накоплены неравномерно.
insert into public.loyalty_accounts(id,business_id,loyalty_program_id,customer_id,points_balance,stamps_balance,is_mock)
select private.deterministic_uuid('loyalty-account-'||g),'10000000-0000-4000-8000-000000000001',
 '15000000-0000-4000-8000-000000000001',private.deterministic_uuid('customer-'||g),0,(g%9)+1,true
from generate_series(1,60) g
on conflict(id) do update set stamps_balance=excluded.stamps_balance,is_mock=true;

insert into public.loyalty_ledger(id,business_id,loyalty_account_id,entry_type,points_delta,stamps_delta,source_type,idempotency_key,occurred_at,metadata,is_mock)
select private.deterministic_uuid('ledger-join-'||g),'10000000-0000-4000-8000-000000000001',
 private.deterministic_uuid('loyalty-account-'||g),'earn',0,1,'qr_join','seed:join:'||g,
 '2026-05-04 10:00+00'::timestamptz + (g||' hours')::interval,'{"source":"qadam_demo_seed"}'::jsonb,true
from generate_series(1,60) g
on conflict(id) do nothing;

insert into public.loyalty_ledger(id,business_id,loyalty_account_id,entry_type,points_delta,stamps_delta,source_type,idempotency_key,occurred_at,metadata,is_mock)
select private.deterministic_uuid('ledger-visit-'||g),'10000000-0000-4000-8000-000000000001',
 private.deterministic_uuid('loyalty-account-'||g),'earn',0,(g%9),'qr_scan','seed:visit:'||g,
 '2026-06-10 12:00+00'::timestamptz + (g||' hours')::interval,'{"source":"qadam_demo_seed"}'::jsonb,true
from generate_series(1,60) g
on conflict(id) do nothing;

insert into public.qr_scans(id,business_id,qr_code_id,customer_id,scanned_at,scan_kind,request_key,is_mock)
select private.deterministic_uuid('qr-scan-'||g),'10000000-0000-4000-8000-000000000001',
 (array['17000000-0000-4000-8000-000000000001','17000000-0000-4000-8000-000000000002','17000000-0000-4000-8000-000000000003'])[(g%3)+1]::uuid,
 private.deterministic_uuid('customer-'||g),'2026-05-04 10:00+00'::timestamptz + (g||' hours')::interval,
 case when g%5=0 then 'redeem' else case when g<=60 then 'join' else 'scan' end end,'seed:scan:'||g,true
from generate_series(1,84) g
on conflict(id) do nothing;

-- Двенадцать гостей уже забрали награду: это и есть замкнутая петля лояльности.
insert into public.loyalty_ledger(id,business_id,loyalty_account_id,entry_type,points_delta,stamps_delta,source_type,idempotency_key,occurred_at,metadata,is_mock)
select private.deterministic_uuid('ledger-redeem-'||g),'10000000-0000-4000-8000-000000000001',
 private.deterministic_uuid('loyalty-account-'||g),'redeem',0,-5,'reward','seed:redeem:'||g,
 '2026-07-14 15:00+00'::timestamptz + (g||' hours')::interval,'{"source":"qadam_demo_seed"}'::jsonb,true
from generate_series(1,12) g
on conflict(id) do nothing;

insert into public.reward_redemptions(id,business_id,reward_id,customer_id,loyalty_ledger_id,status,issued_at,redeemed_at,idempotency_key,is_mock)
select private.deterministic_uuid('redemption-'||g),'10000000-0000-4000-8000-000000000001',
 '16000000-0000-4000-8000-000000000001',private.deterministic_uuid('customer-'||g),
 private.deterministic_uuid('ledger-redeem-'||g),'redeemed',
 '2026-07-14 15:00+00'::timestamptz + (g||' hours')::interval,
 '2026-07-14 16:00+00'::timestamptz + (g||' hours')::interval,'seed:redemption:'||g,true
from generate_series(1,12) g
on conflict(id) do nothing;

-- ---------------------------------------------------------------------------
-- «Скидки рядом»: витрина района. Код был, предложений не было ни одного.
-- ---------------------------------------------------------------------------
insert into public.nearby_offers(id,business_id,location_id,title_ru,title_kk,description_ru,description_kk,
 district,category,public_slug,terms_ru,terms_kk,status,published_at,expires_at,is_mock) values
 ('18000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001',
  'Круассан в подарок при чеке от 3 500 ₸','3 500 ₸ чектен круассан сыйлық',
  'Будни с 15:00 до 18:00 — тихие часы в TAMYR Coffee.','Жұмыс күндері 15:00–18:00 — TAMYR Coffee тыныш сағаттары.',
  'Бостандыкский','cafe','tamyr-quiet-hours','Один подарок на гостя в день.','Күніне бір қонаққа бір сыйлық.',
  'published','2026-07-20 09:00+00','2026-09-30 21:00+00',true),
 ('18000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001',
  'Второй капучино за полцены','Екінші капучино жарты бағамен',
  'Утро понедельника и вторника, до 11:00.','Дүйсенбі мен сейсенбі таңы, 11:00-ге дейін.',
  'Бостандыкский','cafe','tamyr-second-cup','Не суммируется с другими акциями.','Басқа акциялармен қосылмайды.',
  'published','2026-07-22 08:00+00','2026-09-15 11:00+00',true),
 ('18000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001',
  'Кофе с собой за 990 ₸','Сыртқа кофе 990 ₸',
  'Каждый будний день до 09:00 — для тех, кто спешит.','Әр жұмыс күні 09:00-ге дейін — асығатындарға.',
  'Бостандыкский','cafe','tamyr-morning-990','Только напитки объёмом 250 мл.','Тек 250 мл сусындар.',
  'published','2026-07-25 07:00+00','2026-10-31 09:00+00',true),
 ('18000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001',
  'Пятничный сет: кофе и десерт','Жұма сеті: кофе мен десерт',
  'Пятница, весь день. Скидка 15% на сет.','Жұма, күні бойы. Сетке 15% жеңілдік.',
  'Бостандыкский','cafe','tamyr-friday-set','Действует при заказе сета целиком.','Сет толық тапсырыс берілгенде жарамды.',
  'published','2026-07-26 10:00+00','2026-09-27 22:00+00',true)
on conflict(id) do update set status='published',expires_at=excluded.expires_at,is_mock=true;

commit;
