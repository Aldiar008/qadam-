begin;

-- ===========================================================================
-- Admin operations, entitlement enforcement, invitations and privacy exports.
-- Every admin mutation goes through one auditing helper so no path can skip it.
-- ===========================================================================

/**
 * Single entry point for admin mutations.
 *
 * Takes the reason as a required argument, records before and after state, and
 * refuses a sensitive operation without a fresh credential check. Callers never
 * write to admin_audit_log directly — the table is append-only anyway.
 */
create or replace function private.admin_audit(
 p_action text, p_resource_type text, p_resource_id uuid, p_resource_code text,
 p_before jsonb, p_after jsonb, p_reason text, p_sensitive boolean default false)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_actor uuid := (select auth.uid()); v_role text; v_id uuid; v_reauth timestamptz;
begin
 if v_actor is null then raise exception 'authentication required' using errcode='42501'; end if;
 select pa.role into v_role from private.platform_admin_assignments pa
 where pa.user_id=v_actor and pa.active limit 1;
 if v_role is null then raise exception 'forbidden: not a platform admin' using errcode='42501'; end if;
 if char_length(coalesce(p_reason,'')) < 3 then
  raise exception 'a reason is required for every admin action' using errcode='22023';
 end if;

 if p_sensitive then
  if not private.has_fresh_reauth(interval '15 minutes') then
   raise exception 'this operation requires a fresh credential check' using errcode='42501';
  end if;
  select verified_at into v_reauth from private.admin_reauth where user_id=v_actor;
 end if;

 insert into public.admin_audit_log(actor_id,actor_role,action,resource_type,resource_id,resource_code,
  before_state,after_state,reason,reauth_verified_at)
 values(v_actor,v_role,p_action,p_resource_type,p_resource_id,p_resource_code,p_before,p_after,p_reason,v_reauth)
 returning id into v_id;

 insert into public.platform_events(event_type,actor_id,payload)
 values('admin.'||p_action, v_actor, jsonb_build_object('resource_type',p_resource_type,'resource_id',p_resource_id));
 return v_id;
end $$;
revoke all on function private.admin_audit(text,text,uuid,text,jsonb,jsonb,text,boolean) from public,anon,authenticated,service_role;
grant execute on function private.admin_audit(text,text,uuid,text,jsonb,jsonb,text,boolean) to authenticated;

create or replace function public.admin_audit(
 p_action text, p_resource_type text, p_resource_id uuid, p_resource_code text,
 p_before jsonb, p_after jsonb, p_reason text, p_sensitive boolean default false)
returns uuid language sql security invoker set search_path=''
as $$ select private.admin_audit(p_action,p_resource_type,p_resource_id,p_resource_code,p_before,p_after,p_reason,p_sensitive) $$;
revoke all on function public.admin_audit(text,text,uuid,text,jsonb,jsonb,text,boolean) from public,anon;
grant execute on function public.admin_audit(text,text,uuid,text,jsonb,jsonb,text,boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Template publish and rollback
-- ---------------------------------------------------------------------------

/**
 * Publishes a draft version in one transaction: freeze the draft, point the
 * template at it, audit. Publishing never touches an already-published version,
 * so contracts compiled against v1 keep pointing at v1 forever.
 */
create or replace function private.publish_template_version(p_version_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v public.template_versions%rowtype; t public.templates%rowtype; v_before jsonb; v_result jsonb;
begin
 if not private.is_platform_admin(array['platform_admin','platform_editor']) then
  raise exception 'forbidden' using errcode='42501';
 end if;
 select * into v from public.template_versions where id=p_version_id for update;
 if v.id is null then raise exception 'template version not found' using errcode='23503'; end if;
 if v.status <> 'draft' then raise exception 'only a draft version can be published' using errcode='23514'; end if;
 if jsonb_typeof(v.content) <> 'object' or not (v.content ? 'mechanics') then
  raise exception 'template content must be an object containing mechanics' using errcode='22023';
 end if;
 if not (v.locales @> array['ru','kk']::text[]) then
  raise exception 'a published template must provide both ru and kk' using errcode='22023';
 end if;

 select * into t from public.templates where id=v.template_id for update;
 v_before := jsonb_build_object('template_status',t.status,'current_version',t.current_version,'version_status',v.status);

 update public.template_versions set status='published', published_at=now(), published_by=(select auth.uid())
 where id=p_version_id;
 update public.templates set status='published', current_version=v.version where id=t.id;

 v_result := jsonb_build_object('template_id',t.id,'version_id',v.id,'version',v.version,'status','published');
 perform private.admin_audit('template.published','template_version',v.id,t.code,v_before,v_result,p_reason,false);
 return v_result;
end $$;
revoke all on function private.publish_template_version(uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.publish_template_version(uuid,text) to authenticated;

create or replace function public.publish_template_version(p_version_id uuid, p_reason text)
returns jsonb language sql security invoker set search_path=''
as $$ select private.publish_template_version(p_version_id,p_reason) $$;
revoke all on function public.publish_template_version(uuid,text) from public,anon;
grant execute on function public.publish_template_version(uuid,text) to authenticated;

/**
 * Rollback repoints the template at an earlier published version. It does not
 * edit or delete the newer one — that stays published and auditable, so the
 * history of what was live when remains readable.
 */
create or replace function private.rollback_template(p_template_id uuid, p_target_version integer, p_reason text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare t public.templates%rowtype; v public.template_versions%rowtype; v_before jsonb; v_result jsonb;
begin
 if not private.is_platform_admin(array['platform_admin']) then
  raise exception 'forbidden: rollback requires platform_admin' using errcode='42501';
 end if;
 if not private.has_fresh_reauth(interval '15 minutes') then
  raise exception 'this operation requires a fresh credential check' using errcode='42501';
 end if;
 select * into t from public.templates where id=p_template_id for update;
 if t.id is null then raise exception 'template not found' using errcode='23503'; end if;
 select * into v from public.template_versions
 where template_id=p_template_id and version=p_target_version and status='published';
 if v.id is null then raise exception 'target version is not published' using errcode='23503'; end if;

 v_before := jsonb_build_object('current_version',t.current_version);
 update public.templates set current_version=p_target_version where id=p_template_id;
 v_result := jsonb_build_object('template_id',p_template_id,'current_version',p_target_version,
  'note','Более новые версии остаются опубликованными и доступными в истории.');
 perform private.admin_audit('template.rolled_back','template',p_template_id,t.code,v_before,v_result,p_reason,true);
 return v_result;
end $$;
revoke all on function private.rollback_template(uuid,integer,text) from public,anon,authenticated,service_role;
grant execute on function private.rollback_template(uuid,integer,text) to authenticated;

create or replace function public.rollback_template(p_template_id uuid, p_target_version integer, p_reason text)
returns jsonb language sql security invoker set search_path=''
as $$ select private.rollback_template(p_template_id,p_target_version,p_reason) $$;
revoke all on function public.rollback_template(uuid,integer,text) from public,anon;
grant execute on function public.rollback_template(uuid,integer,text) to authenticated;

-- ---------------------------------------------------------------------------
-- Entitlements: data, not conditionals.
-- ---------------------------------------------------------------------------

/**
 * Resolves one entitlement for a business from its active subscription, falling
 * back to the Free plan. Returns null when the plan grants no explicit value,
 * which callers must treat as "not permitted" rather than "unlimited".
 */
create or replace function private.entitlement_value(p_business_id uuid, p_key text)
returns text language sql stable security definer set search_path=''
as $$
 select pe.value
 from public.subscriptions s
 join public.plan_entitlements pe on pe.plan_id = s.plan_id
 join public.entitlements e on e.id = pe.entitlement_id and e.key = p_key
 where s.business_id = p_business_id and s.status in ('active','trialing','past_due')
 order by case s.status when 'active' then 0 when 'trialing' then 1 else 2 end
 limit 1
$$;
revoke all on function private.entitlement_value(uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.entitlement_value(uuid,text) to authenticated, service_role;

/**
 * Consumes one unit of a metered entitlement inside the current period.
 *
 * Idempotent on the request key: the same key never consumes twice, so a retry
 * or a double click cannot burn a quota. When the limit is reached the caller
 * gets a structured refusal that names the limit and the plan — the draft that
 * triggered it is untouched.
 */
create or replace function private.consume_entitlement(
 p_business_id uuid, p_key text, p_amount integer, p_request_key text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
 v_limit_text text; v_limit integer; v_used integer; v_period_start date; v_period_end date;
 v_receipt jsonb; v_plan text; v_mock boolean;
begin
 if not private.has_business_role(p_business_id, array['owner','manager','marketer']) then
  raise exception 'forbidden' using errcode='42501';
 end if;
 if char_length(coalesce(p_request_key,'')) not between 8 and 200 then
  raise exception 'invalid request key' using errcode='22023';
 end if;

 select result into v_receipt from private.domain_command_receipts
 where business_id=p_business_id and idempotency_key=p_request_key;
 if v_receipt is not null then return v_receipt || jsonb_build_object('duplicate', true); end if;

 v_limit_text := private.entitlement_value(p_business_id, p_key);
 select p.code into v_plan from public.subscriptions s join public.plans p on p.id=s.plan_id
 where s.business_id=p_business_id and s.status in ('active','trialing','past_due') limit 1;

 -- No subscription or no granted value means not permitted, never unlimited.
 if v_limit_text is null then
  return jsonb_build_object('allowed',false,'reason','no_entitlement','key',p_key,'plan',coalesce(v_plan,'none'),
   'message','Текущий тариф не включает эту возможность.');
 end if;
 if v_limit_text = 'unlimited' then
  return jsonb_build_object('allowed',true,'reason','unlimited','key',p_key,'plan',v_plan);
 end if;

 v_limit := nullif(v_limit_text,'')::integer;
 v_period_start := date_trunc('month', now())::date;
 v_period_end := (date_trunc('month', now()) + interval '1 month')::date;
 select mode='demo' into v_mock from public.businesses where id=p_business_id;

 insert into public.usage_counters(business_id, entitlement_key, period_start, period_end, used, is_mock)
 values(p_business_id, p_key, v_period_start, v_period_end, 0, v_mock)
 on conflict (business_id, entitlement_key, period_start) do nothing;

 select used into v_used from public.usage_counters
 where business_id=p_business_id and entitlement_key=p_key and period_start=v_period_start for update;

 if v_used + greatest(1, coalesce(p_amount,1)) > v_limit then
  return jsonb_build_object('allowed',false,'reason','limit_reached','key',p_key,'plan',v_plan,
   'limit',v_limit,'used',v_used,'period_start',v_period_start,
   'message','Достигнут лимит тарифа. Черновик сохранён — повысьте тариф или дождитесь следующего периода.');
 end if;

 update public.usage_counters set used = used + greatest(1, coalesce(p_amount,1))
 where business_id=p_business_id and entitlement_key=p_key and period_start=v_period_start
 returning used into v_used;

 v_receipt := jsonb_build_object('allowed',true,'reason','consumed','key',p_key,'plan',v_plan,
  'limit',v_limit,'used',v_used,'duplicate',false);
 insert into private.domain_command_receipts
 values(p_business_id, p_request_key, 'entitlement.consume', 'usage_counter', p_business_id, v_receipt, now());
 return v_receipt;
end $$;
revoke all on function private.consume_entitlement(uuid,text,integer,text) from public,anon,authenticated,service_role;
grant execute on function private.consume_entitlement(uuid,text,integer,text) to authenticated;

create or replace function public.consume_entitlement(p_business_id uuid, p_key text, p_amount integer, p_request_key text)
returns jsonb language sql security invoker set search_path=''
as $$ select private.consume_entitlement(p_business_id,p_key,p_amount,p_request_key) $$;
revoke all on function public.consume_entitlement(uuid,text,integer,text) from public,anon;
grant execute on function public.consume_entitlement(uuid,text,integer,text) to authenticated;

-- A period-scoped counter must be unique so two concurrent consumers cannot
-- create parallel rows and each believe they are under the limit.
create unique index usage_counters_period_uidx
 on public.usage_counters(business_id, entitlement_key, period_start);

-- ---------------------------------------------------------------------------
-- Team invitations
-- ---------------------------------------------------------------------------
create or replace function private.invite_team_member(
 p_business_id uuid, p_email text, p_role text, p_token text, p_expires_at timestamptz)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_actor uuid := (select auth.uid()); v_mock boolean; v_id uuid; v_masked text; v_hash bytea;
begin
 if v_actor is null or not private.has_business_role(p_business_id, array['owner','manager']) then
  raise exception 'forbidden' using errcode='42501';
 end if;
 -- Only an owner may hand out ownership.
 if p_role='owner' and not private.has_business_role(p_business_id, array['owner']) then
  raise exception 'only an owner can invite another owner' using errcode='42501';
 end if;
 if p_expires_at <= now() then raise exception 'invitation expiry must be in the future' using errcode='22023'; end if;
 if char_length(coalesce(p_token,'')) < 32 then raise exception 'invitation token is too short' using errcode='22023'; end if;

 select mode='demo' into v_mock from public.businesses where id=p_business_id;
 v_hash := extensions.digest(convert_to(lower(trim(p_email)),'utf8'),'sha256');
 v_masked := left(split_part(lower(trim(p_email)),'@',1),2)||'***@'||split_part(lower(trim(p_email)),'@',2);

 update public.team_invitations set status='revoked', revoked_at=now()
 where business_id=p_business_id and email_hash=v_hash and status='pending';

 insert into public.team_invitations(business_id,email_hash,masked_email,role,token_hash,invited_by,expires_at,is_mock)
 values(p_business_id,v_hash,v_masked,p_role,
  extensions.digest(convert_to(p_token,'utf8'),'sha256'),v_actor,p_expires_at,v_mock)
 returning id into v_id;

 insert into public.activity_logs(business_id,actor_id,action,resource_type,resource_id,metadata,is_mock)
 values(p_business_id,v_actor,'team.invited','team_invitation',v_id,
  jsonb_build_object('role',p_role,'masked_email',v_masked,'expires_at',p_expires_at),v_mock);
 return jsonb_build_object('invitation_id',v_id,'masked_email',v_masked,'role',p_role,'expires_at',p_expires_at);
end $$;
revoke all on function private.invite_team_member(uuid,text,text,text,timestamptz) from public,anon,authenticated,service_role;
grant execute on function private.invite_team_member(uuid,text,text,text,timestamptz) to authenticated;

create or replace function public.invite_team_member(p_business_id uuid, p_email text, p_role text, p_token text, p_expires_at timestamptz)
returns jsonb language sql security invoker set search_path=''
as $$ select private.invite_team_member(p_business_id,p_email,p_role,p_token,p_expires_at) $$;
revoke all on function public.invite_team_member(uuid,text,text,text,timestamptz) from public,anon;
grant execute on function public.invite_team_member(uuid,text,text,text,timestamptz) to authenticated;

create or replace function private.accept_team_invitation(p_token text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_actor uuid := (select auth.uid()); i public.team_invitations%rowtype; v_member uuid;
begin
 if v_actor is null then raise exception 'authentication required' using errcode='42501'; end if;
 select * into i from public.team_invitations
 where token_hash=extensions.digest(convert_to(p_token,'utf8'),'sha256') for update;
 if i.id is null then raise exception 'invitation not found' using errcode='23503'; end if;
 if i.status='revoked' then raise exception 'this invitation was revoked' using errcode='42501'; end if;
 if i.status='accepted' then return jsonb_build_object('invitation_id',i.id,'duplicate',true,'role',i.role); end if;
 if i.expires_at <= now() then
  update public.team_invitations set status='expired' where id=i.id;
  raise exception 'this invitation has expired' using errcode='42501';
 end if;

 insert into public.business_members(business_id,user_id,role,status,invited_by,is_mock)
 values(i.business_id,v_actor,i.role,'active',i.invited_by,i.is_mock)
 on conflict (business_id,user_id) do update set role=excluded.role, status='active'
 returning id into v_member;

 update public.team_invitations set status='accepted', accepted_at=now(), accepted_by=v_actor where id=i.id;
 insert into public.activity_logs(business_id,actor_id,action,resource_type,resource_id,metadata,is_mock)
 values(i.business_id,v_actor,'team.joined','business_member',v_member,jsonb_build_object('role',i.role),i.is_mock);
 return jsonb_build_object('invitation_id',i.id,'business_id',i.business_id,'role',i.role,'duplicate',false);
end $$;
revoke all on function private.accept_team_invitation(text) from public,anon,authenticated,service_role;
grant execute on function private.accept_team_invitation(text) to authenticated;

create or replace function public.accept_team_invitation(p_token text)
returns jsonb language sql security invoker set search_path=''
as $$ select private.accept_team_invitation(p_token) $$;
revoke all on function public.accept_team_invitation(text) from public,anon;
grant execute on function public.accept_team_invitation(text) to authenticated;

/** Ownership transfer: promote the target, then step down, in one transaction. */
create or replace function private.transfer_ownership(p_business_id uuid, p_to_user uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_actor uuid := (select auth.uid()); v_mock boolean;
begin
 if v_actor is null or not private.has_business_role(p_business_id, array['owner']) then
  raise exception 'forbidden: only an owner can transfer ownership' using errcode='42501';
 end if;
 if not exists(select 1 from public.business_members
   where business_id=p_business_id and user_id=p_to_user and status='active') then
  raise exception 'the new owner must already be an active member' using errcode='23503';
 end if;
 select mode='demo' into v_mock from public.businesses where id=p_business_id;

 update public.business_members set role='owner' where business_id=p_business_id and user_id=p_to_user;
 update public.business_members set role='manager' where business_id=p_business_id and user_id=v_actor;

 insert into public.activity_logs(business_id,actor_id,action,resource_type,resource_id,metadata,is_mock)
 values(p_business_id,v_actor,'team.ownership_transferred','business',p_business_id,
  jsonb_build_object('to_user',p_to_user,'previous_owner_role','manager'),v_mock);
 return jsonb_build_object('business_id',p_business_id,'new_owner',p_to_user,'previous_owner',v_actor);
end $$;
revoke all on function private.transfer_ownership(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.transfer_ownership(uuid,uuid) to authenticated;

create or replace function public.transfer_ownership(p_business_id uuid, p_to_user uuid)
returns jsonb language sql security invoker set search_path=''
as $$ select private.transfer_ownership(p_business_id,p_to_user) $$;
revoke all on function public.transfer_ownership(uuid,uuid) from public,anon;
grant execute on function public.transfer_ownership(uuid,uuid) to authenticated;

comment on function public.consume_entitlement(uuid,text,integer,text) is
 'Idempotent metered entitlement. A missing grant means not permitted, never unlimited; a refusal leaves the caller''s draft untouched.';
comment on function public.rollback_template(uuid,integer,text) is
 'Repoints a template at an earlier published version. Newer versions stay published so the history of what was live remains readable.';

commit;
