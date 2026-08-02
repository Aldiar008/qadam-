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

insert into public.customer_segments(id,business_id,code,name_ru,name_kk,definition,is_dynamic,status,is_mock)
select private.deterministic_uuid('segment-'||g),'10000000-0000-4000-8000-000000000001',
 (array['inactive_30','eligible_winback','new','loyal','vip'])[g],
 (array['Спящие 30+ дней','Eligible win-back','Новые','Постоянные','VIP'])[g],
 (array['30+ күн белсенді емес','Eligible win-back','Жаңа','Тұрақты','VIP'])[g],
 jsonb_build_object('seed_rule',g),true,'active',true from generate_series(1,5) g
on conflict(business_id,code) do update set definition=excluded.definition,is_mock=true;

insert into public.customers(id,business_id,display_name,preferred_locale,lifecycle_stage,first_seen_at,last_seen_at,is_mock)
select private.deterministic_uuid('customer-'||g),'10000000-0000-4000-8000-000000000001','Demo Guest '||lpad(g::text,3,'0'),
 case when g%3=0 then 'kk' else 'ru' end,
 case when g<=64 then 'inactive' when g>165 then 'vip' else 'active' end,
 '2026-04-01 00:00:00+00'::timestamptz + ((g%30)||' days')::interval,
 case when g<=64 then '2026-06-20 00:00:00+00'::timestamptz-((g%20)||' days')::interval else '2026-07-29 00:00:00+00'::timestamptz-((g%14)||' days')::interval end,true
from generate_series(1,180) g
on conflict(id) do update set lifecycle_stage=excluded.lifecycle_stage,last_seen_at=excluded.last_seen_at,is_mock=true;

insert into public.customer_identities(id,business_id,customer_id,identity_type,lookup_hash,masked_value,is_primary,is_mock)
select private.deterministic_uuid('identity-'||g),'10000000-0000-4000-8000-000000000001',private.deterministic_uuid('customer-'||g),
 'phone',extensions.digest('qadam-demo-phone-'||g,'sha256'),'+7 700 *** '||lpad(g::text,4,'0'),true,true
from generate_series(1,180) g on conflict(business_id,identity_type,lookup_hash) do nothing;

insert into public.customer_consents(id,business_id,customer_id,scope,status,source,evidence,granted_at,is_mock)
select private.deterministic_uuid('consent-'||g),'10000000-0000-4000-8000-000000000001',private.deterministic_uuid('customer-'||g),
 'marketing.whatsapp',case when g<=18 then 'granted' else 'denied' end,'demo_qr','{"synthetic":true}',
 case when g<=18 then '2026-05-01 00:00:00+00'::timestamptz else null end,true
from generate_series(1,180) g on conflict(id) do nothing;

insert into public.segment_memberships(id,business_id,segment_id,customer_id,evaluated_at,reason,is_mock)
select private.deterministic_uuid('inactive-membership-'||g),'10000000-0000-4000-8000-000000000001',private.deterministic_uuid('segment-1'),private.deterministic_uuid('customer-'||g),
 '2026-07-29 00:00:00+00','{"inactive_days":30}',true from generate_series(1,64) g
on conflict(segment_id,customer_id) do nothing;
insert into public.segment_memberships(id,business_id,segment_id,customer_id,evaluated_at,reason,is_mock)
select private.deterministic_uuid('eligible-membership-'||g),'10000000-0000-4000-8000-000000000001',private.deterministic_uuid('segment-2'),private.deterministic_uuid('customer-'||g),
 '2026-07-29 00:00:00+00','{"consent":"granted","return_score":"high"}',true from generate_series(1,18) g
on conflict(segment_id,customer_id) do nothing;

insert into public.transactions(id,business_id,location_id,customer_id,external_ref,occurred_at,gross_minor,discount_minor,net_minor,cost_minor,currency,source,is_mock)
select private.deterministic_uuid('transaction-'||g),'10000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001',
 private.deterministic_uuid('customer-'||(((g-1)%180)+1)),'demo-tx-'||g,
 '2026-07-29 06:00:00+00'::timestamptz-(((g-1)%120)||' days')::interval+((g%10)||' hours')::interval,
 3450,0,3450,1311,'KZT','demo_seed',true from generate_series(1,1129) g
on conflict(id) do nothing;
insert into public.transaction_items(id,business_id,transaction_id,item_name,quantity,unit_price_minor,unit_cost_minor,total_minor,currency,is_mock)
select private.deterministic_uuid('transaction-item-'||g),'10000000-0000-4000-8000-000000000001',private.deterministic_uuid('transaction-'||g),
 'Demo coffee order',1,3450,1311,3450,'KZT',true from generate_series(1,1129) g on conflict(id) do nothing;

insert into public.signals(id,business_id,location_id,signal_type,metric_key,period_start,period_end,comparison_start,comparison_end,change_bps,growth_opportunity_score,confidence,status,evidence,detected_at,is_mock)
values('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001',
 'quiet_hours_drop','weekday_revenue_15_18','2026-07-15 09:00+00','2026-07-29 12:00+00','2026-07-01 09:00+00','2026-07-15 12:00+00',
 -2700,87,82,'open','{"source":"synthetic_transactions","comparison":"comparable_weekdays"}','2026-07-29 04:15+00',true)
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
 '{"scope":"marketing.whatsapp","granted":18,"excluded":46,"checkedAt":"2026-07-22T00:00:00Z"}',
 '{"formulaVersion":"simulator.v1","scenarios":{"pessimistic":{"orders":6},"base":{"orders":9,"campaignCostMinor":6800},"optimistic":{"orders":12}}}',
 '{"status":"allowed","reasons":[],"formulaVersion":"margin-shield.v1"}',
 '{"trackingCode":"TAMYR3500","method":"exposed_vs_baseline"}',
 '{"budgetMinor":120000,"marginFloor":0.42,"approvalThresholdMinor":25000}',
 '2026-07-22 05:55+00'::timestamptz from generate_series(1,3) g
on conflict(id) do nothing;

insert into public.campaigns(id,business_id,growth_contract_id,name,status,channel,budget_minor,currency,starts_at,ends_at,stop_rule,created_by,approved_by,is_mock)
select private.deterministic_uuid('campaign-'||g),'10000000-0000-4000-8000-000000000001',private.deterministic_uuid('contract-'||g),
 (array['Круассан при чеке 3 500 ₸','Happy hours','Return coupon'])[g],
 (array['completed','draft','draft'])[g],'whatsapp',6800,'KZT','2026-07-22 09:00+00','2026-07-29 12:00+00',
 '{"max_redemptions":15,"max_cost_minor":7000}','00000000-0000-4000-8000-000000000101',
 case when g=1 then '00000000-0000-4000-8000-000000000101'::uuid else null end,true
from generate_series(1,3) g on conflict(id) do nothing;

insert into public.content_items(id,business_id,campaign_id,content_kind,channel,locale,body,alt_text,cta,status,version,is_mock)
select private.deterministic_uuid('content-'||g),'10000000-0000-4000-8000-000000000001',private.deterministic_uuid('campaign-1'),
 (array['message','post','story'])[g],(array['whatsapp','instagram','instagram'])[g],case when g=3 then 'kk' else 'ru' end,
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
 date '2026-07-29'-(g-1),(300000+g*1000),8+(g%5),g%3,5+(g%4),'KZT','demo_seed',true
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

insert into public.tools(id,category_id,code,name_ru,name_kk,description_ru,description_kk,route,status,version,is_public,is_mock)
select private.deterministic_uuid('tool-'||g),private.deterministic_uuid('tool-category-'||(((g-1)%5)+1)),'tool_'||lpad(g::text,2,'0'),
 'QADAM Tool '||g,'QADAM құралы '||g,'Synthetic demo tool '||g,'Синтетикалық demo құрал '||g,
 '/app/tools','published',1,true,true from generate_series(1,12) g
on conflict(code) do update set status='published',is_public=true,is_mock=true;

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
 private.deterministic_uuid('segment-2'),'included','marketing.whatsapp','granted','{"eligible":true}',true from generate_series(1,18) g
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

commit;
