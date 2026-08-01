begin;

create table public.onboarding_sessions (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 current_step smallint not null default 1 check (current_step between 1 and 6),
 draft jsonb not null default '{}'::jsonb check (jsonb_typeof(draft)='object'),
 import_mode text check (import_mode is null or import_mode in ('demo','csv','manual')),
 status text not null default 'draft' check (status in ('draft','completed')),
 optimistic_version integer not null default 1 check (optimistic_version > 0),
 completed_at timestamptz,
 is_mock boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (business_id,user_id)
);

create table public.privacy_requests (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 customer_id uuid not null references public.customers(id) on delete restrict,
 request_type text not null check (request_type in ('export','delete')),
 status text not null default 'requested' check (status in ('requested','processing','completed','rejected')),
 requester_hash bytea not null,
 idempotency_key text not null check (char_length(idempotency_key) between 8 and 200),
 result_summary jsonb not null default '{}'::jsonb,
 requested_at timestamptz not null default now(),
 completed_at timestamptz,
 is_mock boolean not null default false,
 created_at timestamptz not null default now(),
 unique (business_id,idempotency_key)
);

create table private.qr_rate_limit_buckets (
 action text not null,
 scope_kind text not null check (scope_kind in ('ip','token','customer')),
 scope_hash bytea not null,
 window_start timestamptz not null,
 request_count integer not null default 1 check (request_count > 0),
 expires_at timestamptz not null,
 primary key(action,scope_kind,scope_hash,window_start)
);

revoke all on private.qr_rate_limit_buckets from public,anon,authenticated,service_role;
grant usage on schema private to service_role;

alter table public.qr_codes add column loyalty_program_id uuid references public.loyalty_programs(id) on delete cascade;
alter table public.qr_codes add column public_context jsonb not null default '{}'::jsonb check (jsonb_typeof(public_context)='object');
alter table public.qr_codes add column created_by uuid references auth.users(id) on delete set null;
alter table public.qr_codes add column revoked_at timestamptz;
alter table public.qr_scans add column request_key text;
alter table public.qr_scans add column ip_hash bytea;
alter table public.qr_scans add column scan_kind text not null default 'scan' check (scan_kind in ('scan','join','earn','redeem','privacy'));
alter table public.loyalty_accounts add column optimistic_version integer not null default 1 check (optimistic_version > 0);
alter table public.reward_redemptions add column idempotency_key text;
alter table public.recommendations add column feedback jsonb not null default '{}'::jsonb check (jsonb_typeof(feedback)='object');
alter table public.recommendations add column origin_key text;

create index onboarding_sessions_business_user_idx on public.onboarding_sessions(business_id,user_id,status);
create index onboarding_sessions_user_idx on public.onboarding_sessions(user_id,business_id);
create index privacy_requests_business_status_idx on public.privacy_requests(business_id,status,requested_at desc,id);
create index privacy_requests_customer_idx on public.privacy_requests(customer_id,requested_at desc,id);
create index qr_codes_program_idx on public.qr_codes(loyalty_program_id,status,expires_at,id);
create index qr_codes_created_by_idx on public.qr_codes(created_by,id);
create unique index qr_scans_request_uidx on public.qr_scans(business_id,request_key) where request_key is not null;
create unique index reward_redemptions_idempotency_uidx on public.reward_redemptions(business_id,idempotency_key) where idempotency_key is not null;
create unique index recommendations_origin_uidx on public.recommendations(business_id,origin_key) where origin_key is not null;
create unique index loyalty_join_once_uidx on public.loyalty_ledger(loyalty_account_id,source_type,source_id) where source_type='qr_join';
create unique index business_location_name_uidx on public.business_locations(business_id,name);

alter table public.onboarding_sessions enable row level security;
alter table public.privacy_requests enable row level security;

create policy onboarding_own_select on public.onboarding_sessions for select to authenticated
 using (user_id=(select auth.uid()) and (select private.has_business_role(business_id,array['owner'])));
create policy onboarding_own_insert on public.onboarding_sessions for insert to authenticated
 with check (user_id=(select auth.uid()) and (select private.has_business_role(business_id,array['owner'])));
create policy onboarding_own_update on public.onboarding_sessions for update to authenticated
 using (user_id=(select auth.uid()) and (select private.has_business_role(business_id,array['owner'])))
 with check (user_id=(select auth.uid()) and (select private.has_business_role(business_id,array['owner'])));
create policy privacy_manager_select on public.privacy_requests for select to authenticated
 using ((select private.has_business_role(business_id,array['owner','manager'])));
create policy privacy_manager_update on public.privacy_requests for update to authenticated
 using ((select private.has_business_role(business_id,array['owner','manager'])))
 with check ((select private.has_business_role(business_id,array['owner','manager'])));

revoke all on public.onboarding_sessions,public.privacy_requests from anon,authenticated;
grant select,insert,update on public.onboarding_sessions to authenticated;
grant select,update on public.privacy_requests to authenticated;
grant all on public.onboarding_sessions,public.privacy_requests to service_role;
grant select on public.qr_codes,public.businesses,public.loyalty_programs,public.rewards to service_role;

create trigger onboarding_sessions_set_updated_at before update on public.onboarding_sessions
 for each row execute function private.set_updated_at();

create or replace function private.consume_qr_rate_limit(
 p_action text,p_scope_kind text,p_scope_hash bytea,p_limit integer,p_window interval default interval '5 minutes')
returns void language plpgsql set search_path=''
as $$
declare v_count integer; v_window timestamptz := date_bin(p_window,now(),timestamptz '2020-01-01 00:00:00+00');
begin
 if p_scope_hash is null or p_limit<1 then raise exception 'invalid rate-limit input' using errcode='22023'; end if;
 insert into private.qr_rate_limit_buckets(action,scope_kind,scope_hash,window_start,request_count,expires_at)
 values(p_action,p_scope_kind,p_scope_hash,v_window,1,v_window+p_window*2)
 on conflict(action,scope_kind,scope_hash,window_start) do update
 set request_count=private.qr_rate_limit_buckets.request_count+1,expires_at=excluded.expires_at
 returning request_count into v_count;
 if v_count>p_limit then raise exception 'rate limit exceeded' using errcode='P0001'; end if;
 delete from private.qr_rate_limit_buckets where expires_at<now();
end $$;
revoke all on function private.consume_qr_rate_limit(text,text,bytea,integer,interval) from public,anon,authenticated,service_role;

create or replace function private.complete_onboarding(
 p_session_id uuid,p_expected_version integer,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
 s public.onboarding_sessions%rowtype; v_actor uuid := (select auth.uid()); v_type_id uuid; v_location_id uuid;
 v_mock boolean; v_goal text; v_channel jsonb; v_result jsonb; v_signal_id uuid;
begin
 if v_actor is null then raise exception 'authentication required' using errcode='42501'; end if;
 if char_length(coalesce(p_idempotency_key,'')) not between 8 and 200 then raise exception 'invalid idempotency key' using errcode='22023'; end if;
 select * into s from public.onboarding_sessions where id=p_session_id and user_id=v_actor for update;
 if s.id is null or not private.has_business_role(s.business_id,array['owner']) then raise exception 'forbidden' using errcode='42501'; end if;
 if s.status='completed' then return jsonb_build_object('business_id',s.business_id,'completed',true,'duplicate',true); end if;
 if s.optimistic_version<>p_expected_version then raise exception 'optimistic lock conflict' using errcode='40001'; end if;
 if s.current_step<>6 or coalesce(s.draft->>'businessType','')='' or coalesce(s.draft#>>'{location,city}','')=''
   or coalesce(s.draft#>>'{economics,marginFloorBps}','')='' or jsonb_array_length(coalesce(s.draft->'goals','[]'::jsonb))=0
 then raise exception 'onboarding data is incomplete' using errcode='23514'; end if;

 select id into v_type_id from public.business_types where code=s.draft->>'businessType' and status='published';
 if v_type_id is null then raise exception 'unsupported business type' using errcode='23503'; end if;
 v_mock := coalesce(s.import_mode,s.draft->>'importMode','manual')='demo';
 v_goal := s.draft->'goals'->>0;

 update public.businesses set business_type_id=v_type_id,
  name=coalesce(nullif(s.draft->>'businessName',''),name),currency='KZT',timezone='Asia/Almaty',
  mode=case when v_mock then 'demo' else 'production' end,is_mock=v_mock
 where id=s.business_id;
 update public.business_members set is_mock=v_mock where business_id=s.business_id and user_id=v_actor;

 insert into public.business_profiles(business_id,average_check_minor,currency,margin_floor_bps,monthly_marketing_budget_minor,profile_confidence,source_evidence,is_mock)
 values(s.business_id,(s.draft#>>'{economics,averageCheckMinor}')::bigint,'KZT',(s.draft#>>'{economics,marginFloorBps}')::integer,
  (s.draft#>>'{economics,budgetMinor}')::bigint,85,jsonb_build_object('source','owner_onboarding','calculated_at',now()),v_mock)
 on conflict(business_id) do update set average_check_minor=excluded.average_check_minor,currency=excluded.currency,
  margin_floor_bps=excluded.margin_floor_bps,monthly_marketing_budget_minor=excluded.monthly_marketing_budget_minor,
  profile_confidence=excluded.profile_confidence,source_evidence=excluded.source_evidence,is_mock=excluded.is_mock;

 insert into public.business_limits(business_id,monthly_budget_minor,currency,max_campaigns_per_month,max_contacts_per_month,approval_threshold_minor,is_mock)
 values(s.business_id,(s.draft#>>'{economics,budgetMinor}')::bigint,'KZT',10,1000,50000,v_mock)
 on conflict(business_id) do update set monthly_budget_minor=excluded.monthly_budget_minor,currency=excluded.currency,is_mock=excluded.is_mock;

 insert into public.business_locations(business_id,name,city,district,address_text,timezone,capacity,is_active,is_mock)
 values(s.business_id,coalesce(nullif(s.draft#>>'{location,name}',''),'Основная точка'),s.draft#>>'{location,city}',
  nullif(s.draft#>>'{location,district}',''),nullif(s.draft#>>'{location,address}',''),'Asia/Almaty',
  nullif(s.draft#>>'{location,capacity}','')::integer,true,v_mock)
 on conflict(business_id,name) do update set city=excluded.city,district=excluded.district,address_text=excluded.address_text,
  capacity=excluded.capacity,is_active=true,is_mock=excluded.is_mock returning id into v_location_id;

 if not exists(select 1 from public.business_goals where business_id=s.business_id and code=v_goal and status='active') then
  insert into public.business_goals(business_id,code,priority,status,is_mock) values(s.business_id,v_goal,1,'active',v_mock);
 end if;
 insert into public.brand_memory(business_id,locale,voice_rules,source_evidence,is_mock)
 values(s.business_id,'ru',jsonb_build_object('voice',coalesce(s.draft->>'brandVoice','дружелюбный')),
  jsonb_build_object('source','owner_onboarding'),v_mock)
 on conflict(business_id,locale) do update set voice_rules=excluded.voice_rules,source_evidence=excluded.source_evidence,is_mock=excluded.is_mock;
 insert into public.brand_memory(business_id,locale,voice_rules,source_evidence,is_mock)
 values(s.business_id,'kk',jsonb_build_object('voice',coalesce(s.draft->>'brandVoice','достық')),
  jsonb_build_object('source','owner_onboarding'),v_mock)
 on conflict(business_id,locale) do update set voice_rules=excluded.voice_rules,source_evidence=excluded.source_evidence,is_mock=excluded.is_mock;

 for v_channel in select value from jsonb_array_elements(coalesce(s.draft->'channels','[]'::jsonb)) loop
  insert into public.business_channels(business_id,channel_type,status,settings,is_mock)
  values(s.business_id,v_channel#>>'{}','not_connected',jsonb_build_object('source','owner_onboarding'),v_mock)
  on conflict(business_id,channel_type) do update set is_mock=excluded.is_mock;
 end loop;

 insert into public.business_tools(business_id,tool_id,status,activated_by,is_mock)
 select s.business_id,t.id,'active',v_actor,v_mock from public.tools t
 where t.status='published' order by t.code limit 3
 on conflict(business_id,tool_id) do update set status='active',activated_by=excluded.activated_by,is_mock=excluded.is_mock;

 if v_mock and exists(select 1 from public.businesses where id='10000000-0000-4000-8000-000000000001'::uuid and is_mock) then
  insert into public.customers(id,business_id,display_name,preferred_locale,lifecycle_stage,first_seen_at,last_seen_at,is_mock)
  select md5(s.business_id::text||c.id::text)::uuid,s.business_id,c.display_name,c.preferred_locale,c.lifecycle_stage,c.first_seen_at,c.last_seen_at,true
  from public.customers c where c.business_id='10000000-0000-4000-8000-000000000001'::uuid on conflict(id) do nothing;
  insert into public.customer_identities(id,business_id,customer_id,identity_type,lookup_hash,masked_value,verified_at,is_primary,is_mock)
  select md5(s.business_id::text||ci.id::text)::uuid,s.business_id,md5(s.business_id::text||ci.customer_id::text)::uuid,
   ci.identity_type,extensions.digest(s.business_id::text||encode(ci.lookup_hash,'hex'),'sha256'),ci.masked_value,ci.verified_at,ci.is_primary,true
  from public.customer_identities ci where ci.business_id='10000000-0000-4000-8000-000000000001'::uuid on conflict do nothing;
  insert into public.customer_consents(id,business_id,customer_id,scope,status,source,evidence,granted_at,revoked_at,expires_at,is_mock,created_at)
  select md5(s.business_id::text||cc.id::text)::uuid,s.business_id,md5(s.business_id::text||cc.customer_id::text)::uuid,
   cc.scope,cc.status,cc.source,cc.evidence,cc.granted_at,cc.revoked_at,cc.expires_at,true,cc.created_at
  from public.customer_consents cc where cc.business_id='10000000-0000-4000-8000-000000000001'::uuid on conflict(id) do nothing;
  insert into public.transactions(id,business_id,location_id,customer_id,external_ref,occurred_at,gross_minor,discount_minor,net_minor,cost_minor,currency,source,is_mock)
  select md5(s.business_id::text||tr.id::text)::uuid,s.business_id,v_location_id,
   case when tr.customer_id is null then null else md5(s.business_id::text||tr.customer_id::text)::uuid end,
   'demo:'||tr.id::text,tr.occurred_at,tr.gross_minor,tr.discount_minor,tr.net_minor,tr.cost_minor,tr.currency,'demo_seed_clone',true
  from public.transactions tr where tr.business_id='10000000-0000-4000-8000-000000000001'::uuid on conflict(id) do nothing;
  insert into public.customer_segments(id,business_id,code,name_ru,name_kk,definition,is_dynamic,status,is_mock,rule_version,last_evaluated_at)
  select md5(s.business_id::text||cs.id::text)::uuid,s.business_id,cs.code,cs.name_ru,cs.name_kk,cs.definition,cs.is_dynamic,cs.status,true,cs.rule_version,now()
  from public.customer_segments cs where cs.business_id='10000000-0000-4000-8000-000000000001'::uuid on conflict(id) do nothing;
  insert into public.segment_memberships(id,business_id,segment_id,customer_id,evaluated_at,reason,is_mock)
  select md5(s.business_id::text||sm.id::text)::uuid,s.business_id,md5(s.business_id::text||sm.segment_id::text)::uuid,
   md5(s.business_id::text||sm.customer_id::text)::uuid,now(),sm.reason,true
  from public.segment_memberships sm where sm.business_id='10000000-0000-4000-8000-000000000001'::uuid on conflict do nothing;
  insert into public.daily_analytics(id,business_id,location_id,metric_date,gross_revenue_minor,transactions_count,new_customers_count,repeat_customers_count,currency,source,is_mock)
  select md5(s.business_id::text||da.id::text)::uuid,s.business_id,v_location_id,da.metric_date,da.gross_revenue_minor,
   da.transactions_count,da.new_customers_count,da.repeat_customers_count,da.currency,'demo_seed_clone',true
  from public.daily_analytics da where da.business_id='10000000-0000-4000-8000-000000000001'::uuid on conflict do nothing;
  insert into public.signals(id,business_id,location_id,signal_type,metric_key,period_start,period_end,comparison_start,comparison_end,
   change_bps,growth_opportunity_score,confidence,status,evidence,detected_at,is_mock,baseline,delta,assumptions,formula_version)
  select md5(s.business_id::text||sg.id::text)::uuid,s.business_id,v_location_id,sg.signal_type,sg.metric_key,sg.period_start,sg.period_end,
   sg.comparison_start,sg.comparison_end,sg.change_bps,sg.growth_opportunity_score,sg.confidence,sg.status,sg.evidence,now(),true,
   sg.baseline,sg.delta,sg.assumptions,sg.formula_version
  from public.signals sg where sg.business_id='10000000-0000-4000-8000-000000000001'::uuid on conflict(id) do nothing;
  insert into public.recommendations(id,business_id,signal_id,title_ru,title_kk,explanation,confidence,status,is_mock,origin_key)
  select md5(s.business_id::text||r.id::text)::uuid,s.business_id,
   case when r.signal_id is null then null else md5(s.business_id::text||r.signal_id::text)::uuid end,
   r.title_ru,r.title_kk,r.explanation,r.confidence,'open',true,'demo:'||r.id::text
  from public.recommendations r where r.business_id='10000000-0000-4000-8000-000000000001'::uuid
  on conflict(business_id,origin_key) where origin_key is not null do nothing;
 else
  insert into public.recommendations(business_id,title_ru,title_kk,explanation,confidence,status,is_mock,origin_key)
  values
   (s.business_id,'Проверьте качество данных','Деректер сапасын тексеріңіз',jsonb_build_object('reason','Первое безопасное действие после настройки','goal',v_goal,'gos',null),70,'open',false,'onboarding:data_quality'),
   (s.business_id,'Настройте QR-лояльность','QR-адалдықты баптаңыз',jsonb_build_object('reason','Начните собирать consent и повторные визиты','goal',v_goal,'gos',null),75,'open',false,'onboarding:loyalty'),
   (s.business_id,'Подключите источник продаж','Сату дереккөзін қосыңыз',jsonb_build_object('reason','Без источника QADAM не делает причинных выводов','goal',v_goal,'gos',null),65,'open',false,'onboarding:source')
  on conflict(business_id,origin_key) where origin_key is not null do nothing;
 end if;

 update public.onboarding_sessions set status='completed',completed_at=now(),current_step=6,
  optimistic_version=optimistic_version+1,is_mock=v_mock where id=s.id;
 v_result:=jsonb_build_object('business_id',s.business_id,'completed',true,'duplicate',false,'mode',case when v_mock then 'demo' else 'production' end);
 insert into public.activity_logs(business_id,actor_id,action,resource_type,resource_id,metadata,is_mock)
 values(s.business_id,v_actor,'onboarding.completed','business',s.business_id,v_result,v_mock);
 return v_result;
end $$;
revoke all on function private.complete_onboarding(uuid,integer,text) from public,anon,authenticated,service_role;
grant execute on function private.complete_onboarding(uuid,integer,text) to authenticated;
create or replace function public.complete_onboarding(p_session_id uuid,p_expected_version integer,p_idempotency_key text)
returns jsonb language sql security invoker set search_path=''
as $$ select private.complete_onboarding(p_session_id,p_expected_version,p_idempotency_key) $$;
revoke all on function public.complete_onboarding(uuid,integer,text) from public,anon;
grant execute on function public.complete_onboarding(uuid,integer,text) to authenticated;

create or replace function private.create_loyalty_program(
 p_business_id uuid,p_name text,p_program_type text,p_rules jsonb,p_rewards jsonb,p_location_id uuid,
 p_token text,p_expires_at timestamptz,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_actor uuid := (select auth.uid()); v_mock boolean; v_program_id uuid; v_qr_id uuid; v_result jsonb; v_receipt jsonb;
begin
 if v_actor is null or not private.has_business_role(p_business_id,array['owner','manager']) then raise exception 'forbidden' using errcode='42501'; end if;
 if p_program_type not in ('points','stamps') or char_length(trim(coalesce(p_name,''))) not between 2 and 120
  or jsonb_typeof(p_rules)<>'object' or jsonb_typeof(p_rewards)<>'array' then raise exception 'invalid loyalty program' using errcode='22023'; end if;
 if char_length(coalesce(p_token,''))<32 or char_length(coalesce(p_idempotency_key,'')) not between 8 and 200 then raise exception 'invalid token or idempotency key' using errcode='22023'; end if;
 if p_location_id is not null and not exists(select 1 from public.business_locations where id=p_location_id and business_id=p_business_id and is_active) then raise exception 'location not found' using errcode='23503'; end if;
 select result into v_receipt from private.domain_command_receipts where business_id=p_business_id and idempotency_key=p_idempotency_key;
 if v_receipt is not null then return v_receipt; end if;
 select mode='demo' into v_mock from public.businesses where id=p_business_id and status='active';
 if v_mock is null then raise exception 'business is inactive' using errcode='23503'; end if;
 insert into public.loyalty_programs(business_id,name,program_type,rules,status,is_mock)
 values(p_business_id,trim(p_name),p_program_type,p_rules,'active',v_mock) returning id into v_program_id;
 insert into public.rewards(business_id,loyalty_program_id,name_ru,name_kk,cost_points,cost_stamps,inventory_limit,status,is_mock)
 select p_business_id,v_program_id,x->>'nameRu',x->>'nameKk',nullif(x->>'costPoints','')::bigint,
  nullif(x->>'costStamps','')::integer,nullif(x->>'inventoryLimit','')::integer,'active',v_mock
 from jsonb_array_elements(p_rewards) x;
 insert into public.qr_codes(business_id,location_id,loyalty_program_id,token_hash,purpose,status,expires_at,public_context,created_by,is_mock)
 values(p_business_id,p_location_id,v_program_id,extensions.digest(convert_to(p_token,'utf8'),'sha256'),'loyalty_join','active',p_expires_at,
  jsonb_build_object('programName',trim(p_name),'programType',p_program_type,'demo',v_mock),v_actor,v_mock) returning id into v_qr_id;
 v_result:=jsonb_build_object('program_id',v_program_id,'qr_code_id',v_qr_id,'duplicate',false,'is_demo',v_mock);
 insert into private.domain_command_receipts values(p_business_id,p_idempotency_key,'loyalty.create','loyalty_program',v_program_id,v_result,now());
 insert into public.activity_logs(business_id,actor_id,action,resource_type,resource_id,metadata,is_mock)
 values(p_business_id,v_actor,'loyalty.program_created','loyalty_program',v_program_id,v_result,v_mock);
 return v_result;
end $$;
revoke all on function private.create_loyalty_program(uuid,text,text,jsonb,jsonb,uuid,text,timestamptz,text) from public,anon,authenticated,service_role;
grant execute on function private.create_loyalty_program(uuid,text,text,jsonb,jsonb,uuid,text,timestamptz,text) to authenticated;
create or replace function public.create_loyalty_program(
 p_business_id uuid,p_name text,p_program_type text,p_rules jsonb,p_rewards jsonb,p_location_id uuid,
 p_token text,p_expires_at timestamptz,p_idempotency_key text)
returns jsonb language sql security invoker set search_path=''
as $$ select private.create_loyalty_program(p_business_id,p_name,p_program_type,p_rules,p_rewards,p_location_id,p_token,p_expires_at,p_idempotency_key) $$;
revoke all on function public.create_loyalty_program(uuid,text,text,jsonb,jsonb,uuid,text,timestamptz,text) from public,anon;
grant execute on function public.create_loyalty_program(uuid,text,text,jsonb,jsonb,uuid,text,timestamptz,text) to authenticated;

create or replace function private.process_loyalty_join(
 p_token text,p_identity_type text,p_identity_value text,p_display_name text,p_loyalty_consent boolean,p_marketing_consent boolean,
 p_verification_kind text,p_idempotency_key text,p_ip_key text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
 q record; v_identity_hash bytea; v_ip_hash bytea; v_customer_id uuid; v_account public.loyalty_accounts%rowtype;
 v_ledger_id uuid; v_points bigint; v_stamps integer; v_masked text; v_result jsonb; v_receipt jsonb; v_mock boolean;
begin
 if not p_loyalty_consent then raise exception 'loyalty consent is required' using errcode='23514'; end if;
 if p_identity_type not in ('email','phone') or char_length(trim(coalesce(p_identity_value,'')))<5
  or char_length(coalesce(p_idempotency_key,'')) not between 8 and 200 then raise exception 'invalid join input' using errcode='22023'; end if;
 select qc.*,b.mode,b.status as business_status,lp.status as program_status,lp.program_type,lp.rules
 into q from public.qr_codes qc join public.businesses b on b.id=qc.business_id
 join public.loyalty_programs lp on lp.id=qc.loyalty_program_id and lp.business_id=qc.business_id
 where qc.token_hash=extensions.digest(convert_to(p_token,'utf8'),'sha256') and qc.purpose='loyalty_join';
 if q.id is null or q.status<>'active' or q.business_status<>'active' or q.program_status<>'active'
  or (q.expires_at is not null and q.expires_at<=now()) then raise exception 'QR code is invalid or expired' using errcode='22023'; end if;
 if q.mode='production' and p_verification_kind<>'provider_verified' then raise exception 'real identity verification is required' using errcode='42501'; end if;
 if q.mode='demo' and p_verification_kind not in ('simulated','provider_verified') then raise exception 'verification is required' using errcode='42501'; end if;
 v_mock:=q.mode='demo';
 v_identity_hash:=extensions.digest(convert_to(lower(trim(p_identity_value)),'utf8'),'sha256');
 v_ip_hash:=extensions.digest(convert_to(coalesce(p_ip_key,''),'utf8'),'sha256');
 perform private.consume_qr_rate_limit('loyalty_join','ip',v_ip_hash,12,interval '5 minutes');
 perform private.consume_qr_rate_limit('loyalty_join','token',q.token_hash,60,interval '5 minutes');
 perform private.consume_qr_rate_limit('loyalty_join','customer',v_identity_hash,6,interval '5 minutes');
 select result into v_receipt from private.domain_command_receipts where business_id=q.business_id and idempotency_key=p_idempotency_key;
 if v_receipt is not null then return v_receipt||jsonb_build_object('duplicate',true); end if;
 perform pg_advisory_xact_lock(hashtextextended(encode(v_identity_hash,'hex'),0));
 select customer_id into v_customer_id from public.customer_identities
 where business_id=q.business_id and identity_type=p_identity_type and lookup_hash=v_identity_hash;
 if v_customer_id is null then
  insert into public.customers(business_id,display_name,preferred_locale,lifecycle_stage,first_seen_at,last_seen_at,is_mock)
  values(q.business_id,nullif(trim(p_display_name),''),'ru','new',now(),now(),v_mock) returning id into v_customer_id;
  v_masked:=case when p_identity_type='email' then left(split_part(lower(trim(p_identity_value)),'@',1),2)||'***@'||split_part(lower(trim(p_identity_value)),'@',2)
   else '***'||right(regexp_replace(p_identity_value,'\D','','g'),4) end;
  insert into public.customer_identities(business_id,customer_id,identity_type,lookup_hash,masked_value,verified_at,is_primary,is_mock)
  values(q.business_id,v_customer_id,p_identity_type,v_identity_hash,v_masked,now(),true,v_mock);
 else
  update public.customers set last_seen_at=now() where id=v_customer_id;
 end if;
 insert into public.customer_consents(business_id,customer_id,scope,status,source,evidence,granted_at,is_mock)
 values(q.business_id,v_customer_id,'loyalty','granted','qr_checkout',jsonb_build_object('qr_code_id',q.id,'verification',p_verification_kind),now(),v_mock);
 insert into public.customer_consents(business_id,customer_id,scope,status,source,evidence,granted_at,is_mock)
 values(q.business_id,v_customer_id,'marketing',case when p_marketing_consent then 'granted' else 'denied' end,'qr_checkout',
  jsonb_build_object('qr_code_id',q.id,'separate_choice',true),case when p_marketing_consent then now() else null end,v_mock);
 insert into public.loyalty_accounts(business_id,loyalty_program_id,customer_id,is_mock)
 values(q.business_id,q.loyalty_program_id,v_customer_id,v_mock)
 on conflict(loyalty_program_id,customer_id) do update set updated_at=now()
 returning * into v_account;
 insert into public.qr_scans(business_id,qr_code_id,customer_id,user_agent_hash,ip_hash,scan_kind,request_key,is_mock)
 values(q.business_id,q.id,v_customer_id,v_ip_hash,v_ip_hash,'join',p_idempotency_key,v_mock) on conflict do nothing;
 v_points:=case when q.program_type='points' then coalesce((q.rules->>'joinPoints')::bigint,0) else 0 end;
 v_stamps:=case when q.program_type='stamps' then coalesce((q.rules->>'joinStamps')::integer,1) else 0 end;
 insert into public.loyalty_ledger(business_id,loyalty_account_id,entry_type,points_delta,stamps_delta,source_type,source_id,idempotency_key,metadata,is_mock)
 values(q.business_id,v_account.id,'earn',v_points,v_stamps,'qr_join',q.id,'earn:'||p_idempotency_key,
  jsonb_build_object('verification',p_verification_kind),v_mock)
 on conflict do nothing returning id into v_ledger_id;
 if v_ledger_id is not null then
  update public.loyalty_accounts set points_balance=points_balance+v_points,stamps_balance=stamps_balance+v_stamps,
   optimistic_version=optimistic_version+1 where id=v_account.id returning * into v_account;
 end if;
 v_result:=jsonb_build_object('business_id',q.business_id,'customer_id',v_customer_id,'loyalty_account_id',v_account.id,
  'points_balance',v_account.points_balance,'stamps_balance',v_account.stamps_balance,'marketing_consent',p_marketing_consent,
  'verification',p_verification_kind,'duplicate',false,'is_demo',v_mock);
 insert into private.domain_command_receipts values(q.business_id,p_idempotency_key,'loyalty.join','customer',v_customer_id,v_result,now());
 insert into public.activity_logs(business_id,action,resource_type,resource_id,metadata,is_mock) values
  (q.business_id,'qr.scanned','qr_code',q.id,jsonb_build_object('customer_id',v_customer_id),v_mock),
  (q.business_id,'loyalty.joined','customer',v_customer_id,jsonb_build_object('account_id',v_account.id),v_mock),
  (q.business_id,'loyalty.earned','loyalty_account',v_account.id,jsonb_build_object('points',v_points,'stamps',v_stamps,'ledger_id',v_ledger_id),v_mock);
 return v_result;
end $$;
revoke all on function private.process_loyalty_join(text,text,text,text,boolean,boolean,text,text,text) from public,anon,authenticated,service_role;
grant execute on function private.process_loyalty_join(text,text,text,text,boolean,boolean,text,text,text) to service_role;
create or replace function public.process_loyalty_join(
 p_token text,p_identity_type text,p_identity_value text,p_display_name text,p_loyalty_consent boolean,p_marketing_consent boolean,
 p_verification_kind text,p_idempotency_key text,p_ip_key text)
returns jsonb language sql security invoker set search_path=''
as $$ select private.process_loyalty_join(p_token,p_identity_type,p_identity_value,p_display_name,p_loyalty_consent,p_marketing_consent,p_verification_kind,p_idempotency_key,p_ip_key) $$;
revoke all on function public.process_loyalty_join(text,text,text,text,boolean,boolean,text,text,text) from public,anon,authenticated;
grant execute on function public.process_loyalty_join(text,text,text,text,boolean,boolean,text,text,text) to service_role;

create or replace function private.process_loyalty_redeem(
 p_token text,p_identity_type text,p_identity_value text,p_reward_id uuid,p_idempotency_key text,p_ip_key text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare q record; v_identity_hash bytea; v_ip_hash bytea; v_customer_id uuid; v_account public.loyalty_accounts%rowtype;
 v_reward public.rewards%rowtype; v_ledger_id uuid; v_redemption_id uuid; v_result jsonb; v_receipt jsonb; v_mock boolean; v_used integer;
begin
 if p_identity_type not in ('email','phone') or char_length(trim(coalesce(p_identity_value,'')))<5
  or char_length(coalesce(p_idempotency_key,'')) not between 8 and 200 then raise exception 'invalid redeem input' using errcode='22023'; end if;
 select qc.*,b.mode,b.status as business_status,lp.status as program_status into q
 from public.qr_codes qc join public.businesses b on b.id=qc.business_id
 join public.loyalty_programs lp on lp.id=qc.loyalty_program_id
 where qc.token_hash=extensions.digest(convert_to(p_token,'utf8'),'sha256') and qc.purpose='loyalty_join';
 if q.id is null or q.status<>'active' or q.business_status<>'active' or q.program_status<>'active'
  or (q.expires_at is not null and q.expires_at<=now()) then raise exception 'QR code is invalid or expired' using errcode='22023'; end if;
 v_mock:=q.mode='demo'; v_identity_hash:=extensions.digest(convert_to(lower(trim(p_identity_value)),'utf8'),'sha256');
 v_ip_hash:=extensions.digest(convert_to(coalesce(p_ip_key,''),'utf8'),'sha256');
 perform private.consume_qr_rate_limit('loyalty_redeem','ip',v_ip_hash,10,interval '5 minutes');
 perform private.consume_qr_rate_limit('loyalty_redeem','token',q.token_hash,40,interval '5 minutes');
 perform private.consume_qr_rate_limit('loyalty_redeem','customer',v_identity_hash,5,interval '5 minutes');
 select result into v_receipt from private.domain_command_receipts where business_id=q.business_id and idempotency_key=p_idempotency_key;
 if v_receipt is not null then return v_receipt||jsonb_build_object('duplicate',true); end if;
 select customer_id into v_customer_id from public.customer_identities
 where business_id=q.business_id and identity_type=p_identity_type and lookup_hash=v_identity_hash;
 if v_customer_id is null then raise exception 'customer not found' using errcode='23503'; end if;
 select * into v_reward from public.rewards where id=p_reward_id and business_id=q.business_id
  and loyalty_program_id=q.loyalty_program_id and status='active';
 if v_reward.id is null then raise exception 'reward not found' using errcode='23503'; end if;
 select * into v_account from public.loyalty_accounts where loyalty_program_id=q.loyalty_program_id and customer_id=v_customer_id for update;
 if v_account.id is null then raise exception 'loyalty account not found' using errcode='23503'; end if;
 if v_account.points_balance<coalesce(v_reward.cost_points,0) or v_account.stamps_balance<coalesce(v_reward.cost_stamps,0)
  then raise exception 'insufficient loyalty balance' using errcode='23514'; end if;
 if v_reward.inventory_limit is not null then
  select count(*) into v_used from public.reward_redemptions where reward_id=v_reward.id and status in ('issued','redeemed');
  if v_used>=v_reward.inventory_limit then raise exception 'reward inventory exhausted' using errcode='23514'; end if;
 end if;
 insert into public.loyalty_ledger(business_id,loyalty_account_id,entry_type,points_delta,stamps_delta,source_type,source_id,idempotency_key,metadata,is_mock)
 values(q.business_id,v_account.id,'redeem',-coalesce(v_reward.cost_points,0),-coalesce(v_reward.cost_stamps,0),'reward',v_reward.id,
  'redeem:'||p_idempotency_key,jsonb_build_object('reward_id',v_reward.id),v_mock) returning id into v_ledger_id;
 update public.loyalty_accounts set points_balance=points_balance-coalesce(v_reward.cost_points,0),
  stamps_balance=stamps_balance-coalesce(v_reward.cost_stamps,0),optimistic_version=optimistic_version+1
 where id=v_account.id returning * into v_account;
 insert into public.reward_redemptions(business_id,reward_id,customer_id,loyalty_ledger_id,status,idempotency_key,is_mock)
 values(q.business_id,v_reward.id,v_customer_id,v_ledger_id,'redeemed',p_idempotency_key,v_mock) returning id into v_redemption_id;
 insert into public.qr_scans(business_id,qr_code_id,customer_id,user_agent_hash,ip_hash,scan_kind,request_key,is_mock)
 values(q.business_id,q.id,v_customer_id,v_ip_hash,v_ip_hash,'redeem','scan:'||p_idempotency_key,v_mock) on conflict do nothing;
 v_result:=jsonb_build_object('redemption_id',v_redemption_id,'customer_id',v_customer_id,'loyalty_account_id',v_account.id,
  'points_balance',v_account.points_balance,'stamps_balance',v_account.stamps_balance,'duplicate',false,'is_demo',v_mock);
 insert into private.domain_command_receipts values(q.business_id,p_idempotency_key,'loyalty.redeem','reward_redemption',v_redemption_id,v_result,now());
 insert into public.activity_logs(business_id,action,resource_type,resource_id,metadata,is_mock)
 values(q.business_id,'loyalty.redeemed','reward_redemption',v_redemption_id,v_result,v_mock);
 return v_result;
end $$;
revoke all on function private.process_loyalty_redeem(text,text,text,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function private.process_loyalty_redeem(text,text,text,uuid,text,text) to service_role;
create or replace function public.process_loyalty_redeem(
 p_token text,p_identity_type text,p_identity_value text,p_reward_id uuid,p_idempotency_key text,p_ip_key text)
returns jsonb language sql security invoker set search_path=''
as $$ select private.process_loyalty_redeem(p_token,p_identity_type,p_identity_value,p_reward_id,p_idempotency_key,p_ip_key) $$;
revoke all on function public.process_loyalty_redeem(text,text,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.process_loyalty_redeem(text,text,text,uuid,text,text) to service_role;

create or replace function private.process_customer_privacy_request(
 p_token text,p_identity_type text,p_identity_value text,p_request_type text,p_idempotency_key text,p_ip_key text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare q record; v_identity_hash bytea; v_ip_hash bytea; v_customer public.customers%rowtype; v_request_id uuid;
 v_result jsonb; v_receipt jsonb; v_export jsonb; v_mock boolean;
begin
 if p_request_type not in ('export','delete') or p_identity_type not in ('email','phone')
  or char_length(coalesce(p_idempotency_key,'')) not between 8 and 200 then raise exception 'invalid privacy request' using errcode='22023'; end if;
 select qc.*,b.mode,b.status as business_status into q from public.qr_codes qc join public.businesses b on b.id=qc.business_id
 where qc.token_hash=extensions.digest(convert_to(p_token,'utf8'),'sha256') and qc.purpose='loyalty_join';
 if q.id is null or q.business_status<>'active' then raise exception 'business not found' using errcode='23503'; end if;
 v_mock:=q.mode='demo'; v_identity_hash:=extensions.digest(convert_to(lower(trim(p_identity_value)),'utf8'),'sha256');
 v_ip_hash:=extensions.digest(convert_to(coalesce(p_ip_key,''),'utf8'),'sha256');
 perform private.consume_qr_rate_limit('privacy_'||p_request_type,'ip',v_ip_hash,5,interval '15 minutes');
 perform private.consume_qr_rate_limit('privacy_'||p_request_type,'customer',v_identity_hash,3,interval '15 minutes');
 select result into v_receipt from private.domain_command_receipts where business_id=q.business_id and idempotency_key=p_idempotency_key;
 if v_receipt is not null then return v_receipt||jsonb_build_object('duplicate',true); end if;
 select c.* into v_customer from public.customer_identities ci join public.customers c on c.id=ci.customer_id
 where ci.business_id=q.business_id and ci.identity_type=p_identity_type and ci.lookup_hash=v_identity_hash;
 if v_customer.id is null then raise exception 'customer not found' using errcode='23503'; end if;
 insert into public.privacy_requests(business_id,customer_id,request_type,status,requester_hash,idempotency_key,is_mock)
 values(q.business_id,v_customer.id,p_request_type,'processing',v_identity_hash,p_idempotency_key,v_mock) returning id into v_request_id;
 if p_request_type='export' then
  select jsonb_build_object(
   'customer',jsonb_build_object('id',v_customer.id,'display_name',v_customer.display_name,'first_seen_at',v_customer.first_seen_at,'last_seen_at',v_customer.last_seen_at),
   'consents',coalesce((select jsonb_agg(jsonb_build_object('scope',scope,'status',status,'source',source,'granted_at',granted_at,'revoked_at',revoked_at)) from public.customer_consents where customer_id=v_customer.id),'[]'::jsonb),
   'loyalty',coalesce((select jsonb_agg(jsonb_build_object('points_balance',points_balance,'stamps_balance',stamps_balance,'created_at',created_at)) from public.loyalty_accounts where customer_id=v_customer.id),'[]'::jsonb),
   'transactions',coalesce((select jsonb_agg(jsonb_build_object('occurred_at',occurred_at,'net_minor',net_minor,'currency',currency)) from public.transactions where customer_id=v_customer.id),'[]'::jsonb)
  ) into v_export;
  v_result:=jsonb_build_object('privacy_request_id',v_request_id,'request_type','export','status','completed','export',v_export,'duplicate',false);
 else
  delete from public.customer_notes where customer_id=v_customer.id;
  delete from public.customer_identities where customer_id=v_customer.id;
  update public.customer_consents set status='revoked',revoked_at=coalesce(revoked_at,now()) where customer_id=v_customer.id and status<>'revoked';
  update public.customers set display_name=null,preferred_locale=null,lifecycle_stage='anonymized',anonymized_at=now(),updated_at=now() where id=v_customer.id;
  v_result:=jsonb_build_object('privacy_request_id',v_request_id,'request_type','delete','status','completed','customer_id',v_customer.id,'anonymized',true,'duplicate',false);
 end if;
 update public.privacy_requests set status='completed',completed_at=now(),result_summary=v_result-'export' where id=v_request_id;
 insert into private.domain_command_receipts values(q.business_id,p_idempotency_key,'privacy.'||p_request_type,'privacy_request',v_request_id,v_result,now());
 insert into public.activity_logs(business_id,action,resource_type,resource_id,metadata,is_mock)
 values(q.business_id,'privacy.'||p_request_type||'_completed','privacy_request',v_request_id,v_result-'export',v_mock);
 return v_result;
end $$;
revoke all on function private.process_customer_privacy_request(text,text,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function private.process_customer_privacy_request(text,text,text,text,text,text) to service_role;
create or replace function public.process_customer_privacy_request(
 p_token text,p_identity_type text,p_identity_value text,p_request_type text,p_idempotency_key text,p_ip_key text)
returns jsonb language sql security invoker set search_path=''
as $$ select private.process_customer_privacy_request(p_token,p_identity_type,p_identity_value,p_request_type,p_idempotency_key,p_ip_key) $$;
revoke all on function public.process_customer_privacy_request(text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.process_customer_privacy_request(text,text,text,text,text,text) to service_role;

comment on table public.onboarding_sessions is 'Server-side six-step onboarding draft; local browser copy is recovery only.';
comment on table public.privacy_requests is 'Audited customer export/delete requests; delete anonymizes retained business records.';
comment on function public.process_loyalty_join(text,text,text,text,boolean,boolean,text,text,text) is 'Service-only atomic QR join, separate consents, scan and idempotent earn.';
comment on function public.process_loyalty_redeem(text,text,text,uuid,text,text) is 'Service-only atomic redeem with rate limits, balance lock and replay protection.';

commit;
