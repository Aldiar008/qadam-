begin;

-- Telegram becomes a way in, for a guest and for an owner.
--
-- Two things were in the way. The loyalty join refused any identity that was
-- not an email or a phone, so the bot could not enrol anyone; and there was
-- nowhere to record which chat belongs to which owner, so the assistant had no
-- one to talk to.
--
-- The join is reused rather than duplicated. A guest arriving through the bot
-- goes through the same function as a guest scanning the code on a table: the
-- same rate limits, the same idempotency, the same two consent rows written
-- separately. A second, looser path into the loyalty programme is exactly the
-- kind of thing that later turns out to have skipped a check.
--
-- A Telegram identity is masked as `tg:***1234` for the same reason a phone is
-- masked: the owner needs to tell two guests apart without the product handing
-- them a contact list.

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
 if p_identity_type not in ('email','phone','telegram') or char_length(trim(coalesce(p_identity_value,'')))<5
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
  v_masked:=case when p_identity_type='telegram' then 'tg:***'||right(trim(p_identity_value),4)
   when p_identity_type='email' then left(split_part(lower(trim(p_identity_value)),'@',1),2)||'***@'||split_part(lower(trim(p_identity_value)),'@',2)
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

-- ---------------------------------------------------------------------------
-- Link codes: how an owner's chat is attached to their business.
--
-- The code is short-lived and single-use, and it carries no authority of its
-- own — claiming it only says "this chat belongs to that member of that
-- business". It is stored in `private` because possession of a live code is
-- enough to attach a chat, which makes it a credential.
-- ---------------------------------------------------------------------------
create table if not exists private.telegram_link_codes (
  code        text primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  expires_at  timestamptz not null,
  claimed_at  timestamptz,
  created_at  timestamptz not null default now()
);
alter table private.telegram_link_codes enable row level security;
revoke all on table private.telegram_link_codes from public, anon, authenticated, service_role;

create or replace function private.issue_telegram_link(p_business_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $fn$
declare v_actor uuid := (select auth.uid()); v_code text;
begin
  if v_actor is null then raise exception 'authentication required' using errcode='42501'; end if;
  if not private.has_business_role(p_business_id, array['owner','manager']) then
    raise exception 'forbidden' using errcode='42501';
  end if;

  -- A new code retires the previous one: two live codes for the same person
  -- means one of them is a spare key nobody is tracking.
  delete from private.telegram_link_codes where business_id = p_business_id and user_id = v_actor;

  v_code := encode(extensions.gen_random_bytes(9), 'hex');
  insert into private.telegram_link_codes(code, business_id, user_id, expires_at)
  values (v_code, p_business_id, v_actor, now() + interval '1 hour');

  return jsonb_build_object('code', v_code, 'expires_at', now() + interval '1 hour');
end $fn$;
revoke all on function private.issue_telegram_link(uuid) from public, anon, authenticated, service_role;
grant execute on function private.issue_telegram_link(uuid) to authenticated;

create or replace function public.issue_telegram_link(p_business_id uuid)
returns jsonb language sql security invoker set search_path=''
as $fn$ select private.issue_telegram_link(p_business_id) $fn$;
revoke all on function public.issue_telegram_link(uuid) from public, anon;
grant execute on function public.issue_telegram_link(uuid) to authenticated;

create or replace function private.claim_telegram_link(p_code text, p_chat_id text)
returns jsonb language plpgsql security definer set search_path=''
as $fn$
declare v_row private.telegram_link_codes%rowtype; v_name text;
begin
  select * into v_row from private.telegram_link_codes
  where code = p_code and claimed_at is null and expires_at > now() for update;
  if v_row.code is null then
    raise exception 'link code is not valid' using errcode='22023';
  end if;

  update private.telegram_link_codes set claimed_at = now() where code = v_row.code;

  perform private.remember_channel_address(v_row.business_id, 'telegram', p_chat_id, null, v_row.user_id);

  select name into v_name from public.businesses where id = v_row.business_id;
  insert into public.activity_logs(business_id, actor_id, action, resource_type, resource_id, metadata, is_mock)
  select v_row.business_id, v_row.user_id, 'telegram.owner_linked', 'business', v_row.business_id,
         jsonb_build_object('channel','telegram'), b.mode = 'demo'
  from public.businesses b where b.id = v_row.business_id;

  return jsonb_build_object('linked', true, 'business_id', v_row.business_id, 'business_name', v_name);
end $fn$;
revoke all on function private.claim_telegram_link(text,text) from public, anon, authenticated, service_role;
grant execute on function private.claim_telegram_link(text,text) to service_role;

create or replace function public.claim_telegram_link(p_code text, p_chat_id text)
returns jsonb language sql security invoker set search_path=''
as $fn$ select private.claim_telegram_link(p_code, p_chat_id) $fn$;
revoke all on function public.claim_telegram_link(text,text) from public, anon, authenticated;
grant execute on function public.claim_telegram_link(text,text) to service_role;

commit;
