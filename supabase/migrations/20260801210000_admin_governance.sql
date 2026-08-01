begin;

-- ===========================================================================
-- Prompt 6: platform governance.
--
-- Principles encoded here:
--  * Platform role lives in a private assignment table, never in user_metadata,
--    which the user themself can edit.
--  * Every admin mutation records actor, before, after, reason and timestamp.
--  * A published template version is immutable; history is never rewritten.
--  * Hard delete is refused wherever historical rows reference the record.
--  * Entitlements are data, not conditionals, and are enforced server-side.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Admin audit: separate from tenant activity_logs, and append-only.
-- ---------------------------------------------------------------------------
create table public.admin_audit_log (
 id uuid primary key default gen_random_uuid(),
 actor_id uuid not null references auth.users(id) on delete restrict,
 actor_role text not null,
 action text not null,
 resource_type text not null,
 resource_id uuid,
 resource_code text,
 before_state jsonb,
 after_state jsonb,
 reason text not null check (char_length(reason) between 3 and 500),
 /* Set when the operation required a fresh credential check. */
 reauth_verified_at timestamptz,
 occurred_at timestamptz not null default now()
);
create index admin_audit_log_actor_idx on public.admin_audit_log(actor_id, occurred_at desc);
create index admin_audit_log_resource_idx on public.admin_audit_log(resource_type, resource_id, occurred_at desc);

alter table public.admin_audit_log enable row level security;
create policy admin_audit_select on public.admin_audit_log for select to authenticated
 using ((select private.is_platform_admin(array['platform_admin','platform_editor','platform_analyst'])));
revoke all on public.admin_audit_log from anon, authenticated;
grant select on public.admin_audit_log to authenticated;
grant all on public.admin_audit_log to service_role;

-- An audit entry may never be edited or removed: that is the whole point of it.
create or replace function private.protect_admin_audit()
returns trigger language plpgsql set search_path=''
as $$
begin
 raise exception 'admin audit entries are append-only' using errcode='42501';
end $$;
revoke all on function private.protect_admin_audit() from public,anon,authenticated,service_role;
create trigger admin_audit_append_only before update or delete on public.admin_audit_log
 for each row execute function private.protect_admin_audit();

-- ---------------------------------------------------------------------------
-- Sensitive operations require a recent credential check.
-- ---------------------------------------------------------------------------
create table private.admin_reauth (
 user_id uuid primary key references auth.users(id) on delete cascade,
 verified_at timestamptz not null default now()
);
revoke all on private.admin_reauth from public, anon, authenticated, service_role;

create or replace function private.mark_admin_reauth()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_actor uuid := (select auth.uid());
begin
 if v_actor is null or not private.is_platform_admin(array['platform_admin','platform_editor']) then
  raise exception 'forbidden' using errcode='42501';
 end if;
 insert into private.admin_reauth(user_id, verified_at) values(v_actor, now())
 on conflict (user_id) do update set verified_at=now();
 return jsonb_build_object('user_id', v_actor, 'verified_at', now());
end $$;
revoke all on function private.mark_admin_reauth() from public,anon,authenticated,service_role;
grant execute on function private.mark_admin_reauth() to authenticated;

create or replace function public.mark_admin_reauth()
returns jsonb language sql security invoker set search_path=''
as $$ select private.mark_admin_reauth() $$;
revoke all on function public.mark_admin_reauth() from public,anon;
grant execute on function public.mark_admin_reauth() to authenticated;

create or replace function private.has_fresh_reauth(p_max_age interval default interval '15 minutes')
returns boolean language sql stable security definer set search_path=''
as $$
 select exists(
  select 1 from private.admin_reauth r
  where r.user_id=(select auth.uid()) and r.verified_at > now() - p_max_age
 )
$$;
revoke all on function private.has_fresh_reauth(interval) from public,anon,authenticated,service_role;
grant execute on function private.has_fresh_reauth(interval) to authenticated;

-- ---------------------------------------------------------------------------
-- Catalogue lifecycle: archive/deprecate instead of hard delete.
-- ---------------------------------------------------------------------------
alter table public.tools drop constraint if exists tools_status_check;
alter table public.tools add constraint tools_status_check
 check (status in ('draft','published','archived'));
alter table public.tools add column archived_at timestamptz;
alter table public.tools add column compatible_business_types text[] not null default '{}'::text[];

alter table public.tool_categories drop constraint if exists tool_categories_status_check;
alter table public.tool_categories add constraint tool_categories_status_check
 check (status in ('draft','published','deprecated'));
alter table public.tool_categories add column deprecated_at timestamptz;

alter table public.business_types drop constraint if exists business_types_status_check;
alter table public.business_types add constraint business_types_status_check
 check (status in ('draft','published','deprecated'));
alter table public.business_types add column deprecated_at timestamptz;

-- Hard delete is refused while anything historical still points at the row.
create or replace function private.guard_catalog_delete()
returns trigger language plpgsql set search_path=''
as $$
declare v_refs integer := 0;
begin
 if tg_table_name='tools' then
  select count(*) into v_refs from public.business_tools where tool_id=old.id;
  if v_refs = 0 then select count(*) into v_refs from public.favorite_tools where tool_id=old.id; end if;
 elsif tg_table_name='tool_categories' then
  select count(*) into v_refs from public.tools where category_id=old.id;
 elsif tg_table_name='business_types' then
  select count(*) into v_refs from public.businesses where business_type_id=old.id;
 elsif tg_table_name='templates' then
  select count(*) into v_refs from public.template_versions where template_id=old.id;
 end if;
 if v_refs > 0 then
  raise exception '% is referenced by % historical row(s); archive or deprecate it instead of deleting',
   tg_table_name, v_refs using errcode='23503';
 end if;
 return old;
end $$;
revoke all on function private.guard_catalog_delete() from public,anon,authenticated,service_role;
create trigger tools_delete_guard before delete on public.tools for each row execute function private.guard_catalog_delete();
create trigger tool_categories_delete_guard before delete on public.tool_categories for each row execute function private.guard_catalog_delete();
create trigger business_types_delete_guard before delete on public.business_types for each row execute function private.guard_catalog_delete();
create trigger templates_delete_guard before delete on public.templates for each row execute function private.guard_catalog_delete();

-- ---------------------------------------------------------------------------
-- Template versioning: compatibility, migration path, immutability.
-- ---------------------------------------------------------------------------
alter table public.templates add column business_type_codes text[] not null default '{}'::text[];
alter table public.templates add column archived_at timestamptz;
alter table public.templates drop constraint if exists templates_status_check;
alter table public.templates add constraint templates_status_check
 check (status in ('draft','published','archived'));

alter table public.template_versions add column locales text[] not null default array['ru','kk']::text[];
alter table public.template_versions add column compatible_business_types text[] not null default '{}'::text[];
/* How a Growth Contract built on the previous schema version is carried forward. */
alter table public.template_versions add column migration_notes text;
alter table public.template_versions add column migrates_from_version integer;
alter table public.template_versions add column archived_at timestamptz;
alter table public.template_versions add column published_by uuid references auth.users(id) on delete set null;
alter table public.template_versions drop constraint if exists template_versions_status_check;
alter table public.template_versions add constraint template_versions_status_check
 check (status in ('draft','published','archived'));
create index template_versions_published_by_fk_idx on public.template_versions(published_by);
create index template_versions_lookup_idx on public.template_versions(template_id, status, version desc);

-- Once published, a version is frozen. A correction means a new version, so a
-- historical Growth Contract can never be rewritten under the owner's feet.
create or replace function private.protect_published_template_version()
returns trigger language plpgsql set search_path=''
as $$
begin
 if tg_op='DELETE' then
  if old.status='published' then
   raise exception 'a published template version cannot be deleted; archive it' using errcode='42501';
  end if;
  return old;
 end if;
 if old.status='published' and (
   new.content is distinct from old.content
   or new.schema_version is distinct from old.schema_version
   or new.version is distinct from old.version
   or new.compatible_business_types is distinct from old.compatible_business_types
   or new.locales is distinct from old.locales
 ) then
  raise exception 'a published template version is immutable; create a new version' using errcode='42501';
 end if;
 -- Publishing is one-way for a given row: archived is the only exit.
 if old.status='published' and new.status not in ('published','archived') then
  raise exception 'a published template version can only move to archived' using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function private.protect_published_template_version() from public,anon,authenticated,service_role;
create trigger template_versions_immutable before update or delete on public.template_versions
 for each row execute function private.protect_published_template_version();

-- ---------------------------------------------------------------------------
-- Team invitations
-- ---------------------------------------------------------------------------
create table public.team_invitations (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 email_hash bytea not null,
 masked_email text not null,
 role text not null check (role in ('owner','manager','marketer','analyst','viewer')),
 token_hash bytea not null unique,
 status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
 invited_by uuid not null references auth.users(id) on delete restrict,
 accepted_by uuid references auth.users(id) on delete set null,
 expires_at timestamptz not null,
 accepted_at timestamptz,
 revoked_at timestamptz,
 is_mock boolean not null default false,
 created_at timestamptz not null default now(),
 unique (business_id, email_hash, status) deferrable initially deferred
);
create index team_invitations_business_id_fk_idx on public.team_invitations(business_id);
create index team_invitations_invited_by_fk_idx on public.team_invitations(invited_by);
create index team_invitations_accepted_by_fk_idx on public.team_invitations(accepted_by);
create index team_invitations_pending_idx on public.team_invitations(business_id, status, expires_at);

alter table public.team_invitations enable row level security;
create policy team_invitations_manager_select on public.team_invitations for select to authenticated
 using ((select private.has_business_role(business_id, array['owner','manager'])));
create policy team_invitations_manager_insert on public.team_invitations for insert to authenticated
 with check ((select private.has_business_role(business_id, array['owner','manager'])));
create policy team_invitations_manager_update on public.team_invitations for update to authenticated
 using ((select private.has_business_role(business_id, array['owner','manager'])))
 with check ((select private.has_business_role(business_id, array['owner','manager'])));
revoke all on public.team_invitations from anon, authenticated;
grant select, insert, update on public.team_invitations to authenticated;
grant all on public.team_invitations to service_role;

-- The last active owner cannot leave or demote themselves; ownership must be
-- transferred first, otherwise a business becomes unadministrable.
create or replace function private.guard_last_owner()
returns trigger language plpgsql set search_path=''
as $$
declare v_owners integer;
begin
 if tg_op='UPDATE' and old.role='owner' and old.status='active'
    and (new.role <> 'owner' or new.status <> 'active') then
  select count(*) into v_owners from public.business_members
  where business_id=old.business_id and role='owner' and status='active' and id <> old.id;
  if v_owners = 0 then
   raise exception 'the last owner cannot be removed or demoted; transfer ownership first' using errcode='23514';
  end if;
 end if;
 if tg_op='DELETE' and old.role='owner' and old.status='active' then
  select count(*) into v_owners from public.business_members
  where business_id=old.business_id and role='owner' and status='active' and id <> old.id;
  if v_owners = 0 then
   raise exception 'the last owner cannot be removed; transfer ownership first' using errcode='23514';
  end if;
  return old;
 end if;
 return new;
end $$;
revoke all on function private.guard_last_owner() from public,anon,authenticated,service_role;
create trigger business_members_last_owner_guard before update or delete on public.business_members
 for each row execute function private.guard_last_owner();

-- ---------------------------------------------------------------------------
-- Retention policy: declared per record type, so "how long do you keep this?"
-- has a data answer rather than a prose promise.
-- ---------------------------------------------------------------------------
create table public.retention_policies (
 record_type text primary key,
 category text not null check (category in ('identity','behavioural','financial','audit','operational','ai_trace')),
 contains_pii boolean not null,
 retain_days integer check (retain_days is null or retain_days > 0),
 /* Financial and audit rows survive erasure, but only with identity removed. */
 anonymize_instead_of_delete boolean not null default false,
 lawful_basis text not null,
 notes text
);
alter table public.retention_policies enable row level security;
create policy retention_policies_read on public.retention_policies for select to anon, authenticated using (true);
revoke all on public.retention_policies from anon, authenticated;
grant select on public.retention_policies to anon, authenticated;
grant all on public.retention_policies to service_role;

insert into public.retention_policies(record_type, category, contains_pii, retain_days, anonymize_instead_of_delete, lawful_basis, notes) values
 ('customer_identities','identity',true,null,false,'consent','Хэш и маска контакта. Удаляются по запросу клиента.'),
 ('customers','identity',true,null,true,'consent','Профиль анонимизируется, чтобы не разрушить финансовую историю.'),
 ('customer_consents','audit',true,2555,true,'legal_obligation','Доказательство согласия хранится 7 лет в обезличенном виде.'),
 ('transactions','financial',false,2555,true,'legal_obligation','Финансовые записи хранятся 7 лет; связь с клиентом обрывается при удалении.'),
 ('redemptions','financial',false,2555,true,'legal_obligation','То же основание, что и транзакции.'),
 ('campaign_deliveries','operational',false,365,false,'legitimate_interest','Операционные записи об отправках.'),
 ('campaign_events','behavioural',false,365,false,'legitimate_interest','Открытия и отклики.'),
 ('provider_events','operational',false,90,false,'legitimate_interest','Сырые события провайдера.'),
 ('qr_scans','behavioural',false,365,false,'legitimate_interest','Сканирования QR, без координат.'),
 ('activity_logs','audit',false,1095,false,'legal_obligation','Аудит действий владельца.'),
 ('admin_audit_log','audit',false,2555,false,'legal_obligation','Аудит действий платформы.'),
 ('ai_generation_runs','ai_trace',false,180,false,'legitimate_interest','Только редактированный ввод и хэш; сырых данных нет.'),
 ('nearby_offer_events','behavioural',false,180,false,'legitimate_interest','Намерение, не визит. Без идентификации посетителя.');

comment on table public.retention_policies is
 'Declared retention per record type. Financial and audit rows are anonymised rather than deleted so an erasure request cannot destroy legally required history.';

commit;
