begin;
do $$
declare r record; idx text;
begin
 for r in
  select c.conrelid::regclass as table_name, a.attname as column_name
  from pg_constraint c
  join pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey)
  where c.contype='f' and c.connamespace in ('public'::regnamespace,'private'::regnamespace)
 loop
  idx := left(replace(r.table_name::text,'.','_')||'_'||r.column_name||'_fk_idx_',45)||substr(md5(r.table_name::text||r.column_name),1,10);
  execute format('create index if not exists %I on %s (%I)',idx,r.table_name,r.column_name);
 end loop;
end $$;

create index business_members_rls_idx on public.business_members(user_id,business_id,role) where status='active';
create index transactions_cursor_idx on public.transactions(business_id,occurred_at desc,id desc);
create index customers_cursor_idx on public.customers(business_id,last_seen_at desc nulls last,id);
create index signals_open_cursor_idx on public.signals(business_id,status,detected_at desc,id) where status='open';
create index campaigns_active_cursor_idx on public.campaigns(business_id,status,created_at desc,id) where status in ('draft','pending_approval','approved','scheduled','running','paused');
create index campaign_events_cursor_idx on public.campaign_events(business_id,campaign_id,occurred_at desc,id);
create index activity_logs_cursor_idx on public.activity_logs(business_id,occurred_at desc,id);
create index notifications_unread_cursor_idx on public.notifications(business_id,user_id,created_at desc,id) where read_at is null;
create index outbox_ready_idx on public.outbox_events(business_id,status,available_at,id) where status in ('pending','failed');
create index automation_runs_active_idx on public.automation_runs(business_id,status,scheduled_at,id) where status in ('queued','running');
create index imports_active_idx on public.data_imports(business_id,status,created_at,id) where status in ('pending','validating','running');
create index consent_lookup_idx on public.customer_consents(business_id,customer_id,scope,created_at desc);
create index segment_memberships_customer_idx on public.segment_memberships(business_id,customer_id,segment_id);
create index deliveries_status_idx on public.campaign_deliveries(business_id,campaign_id,status,queued_at,id);
create index daily_analytics_range_idx on public.daily_analytics(business_id,metric_date desc,id);
create index nearby_public_idx on public.nearby_offers(status,district,expires_at,id) where status='published';

create or replace function private.set_updated_at()
returns trigger language plpgsql set search_path=''
as $$ begin new.updated_at=now(); return new; end $$;
revoke all on function private.set_updated_at() from public, anon, authenticated, service_role;

do $$
declare t text;
begin
 foreach t in array array[
  'profiles','business_types','plans','businesses','business_members','business_locations','business_profiles','business_goals','business_limits',
  'brand_memory','business_channels','feature_flags','subscriptions','usage_counters','operating_hours','capacity_slots','catalog_items','data_imports',
  'source_connections','customers','customer_notes','customer_segments','loyalty_programs','loyalty_accounts','rewards','signals','recommendations',
  'growth_contracts','campaigns','promotions','content_items','automations','tool_categories','tools','templates','business_tools','nearby_offers'
 ] loop execute format('create trigger %I before update on public.%I for each row execute function private.set_updated_at()',t||'_set_updated_at',t); end loop;
 execute 'create trigger platform_admin_assignments_set_updated_at before update on private.platform_admin_assignments for each row execute function private.set_updated_at()';
end $$;

create or replace function private.prevent_business_id_change()
returns trigger language plpgsql set search_path=''
as $$ begin if new.business_id is distinct from old.business_id then raise exception 'business_id is immutable' using errcode='42501'; end if; return new; end $$;
revoke all on function private.prevent_business_id_change() from public, anon, authenticated, service_role;

do $$
declare t text;
begin
 for t in select table_name from information_schema.columns where table_schema='public' and column_name='business_id'
 loop execute format('create trigger %I before update on public.%I for each row execute function private.prevent_business_id_change()',t||'_business_id_immutable',t); end loop;
end $$;

create or replace function private.enforce_mock_tenant()
returns trigger language plpgsql security definer set search_path=''
as $$
declare b_mode text;
begin
 select b.mode into b_mode from public.businesses b where b.id=new.business_id;
 if b_mode='production' and new.is_mock then raise exception 'mock rows are forbidden in production businesses' using errcode='23514'; end if;
 if b_mode='demo' and not new.is_mock then raise exception 'demo business rows must be marked is_mock=true' using errcode='23514'; end if;
 return new;
end $$;
revoke all on function private.enforce_mock_tenant() from public, anon, authenticated, service_role;

do $$
declare t text;
begin
 for t in select table_name from information_schema.columns where table_schema='public' and column_name='business_id'
             and table_name not in ('businesses')
 loop execute format('create trigger %I before insert or update on public.%I for each row execute function private.enforce_mock_tenant()',t||'_mock_tenant_guard',t); end loop;
end $$;

create or replace function private.reject_append_only_change()
returns trigger language plpgsql set search_path=''
as $$ begin raise exception '% is append-only',tg_table_name using errcode='42501'; end $$;
revoke all on function private.reject_append_only_change() from public, anon, authenticated, service_role;
create trigger loyalty_ledger_append_only before update or delete on public.loyalty_ledger for each row execute function private.reject_append_only_change();
create trigger campaign_events_append_only before update or delete on public.campaign_events for each row execute function private.reject_append_only_change();
create trigger impact_measurements_append_only before update or delete on public.impact_measurements for each row execute function private.reject_append_only_change();
create trigger activity_logs_append_only before update or delete on public.activity_logs for each row execute function private.reject_append_only_change();
create trigger platform_events_append_only before update or delete on public.platform_events for each row execute function private.reject_append_only_change();

create or replace function private.protect_accepted_growth_contract()
returns trigger language plpgsql set search_path=''
as $$
begin
 if old.status<>'draft' and (
  new.accepted_snapshot is distinct from old.accepted_snapshot or new.schema_version is distinct from old.schema_version
  or new.version is distinct from old.version or new.content_hash is distinct from old.content_hash
 ) then raise exception 'accepted Growth Contract snapshot is immutable' using errcode='42501'; end if;
 return new;
end $$;
revoke all on function private.protect_accepted_growth_contract() from public, anon, authenticated, service_role;
create trigger growth_contract_snapshot_immutable before update on public.growth_contracts for each row execute function private.protect_accepted_growth_contract();

create or replace function private.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 insert into public.profiles(id,display_name,preferred_locale,timezone,is_mock)
 values(new.id,coalesce(new.raw_user_meta_data->>'display_name',''),coalesce(new.raw_user_meta_data->>'locale','ru'),coalesce(new.raw_user_meta_data->>'timezone','Asia/Almaty'),false)
 on conflict(id) do nothing;
 return new;
end $$;
revoke all on function private.handle_new_auth_user() from public, anon, authenticated, service_role;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_auth_user();

comment on table public.growth_contracts is 'Immutable accepted decision snapshots; new decisions create new versions.';
comment on table public.loyalty_ledger is 'Append-only loyalty balance journal.';
comment on table public.activity_logs is 'Append-only tenant audit trail.';
comment on column public.source_connections.credential_reference is 'Opaque reference to a server-side secret store; never a credential value.';
comment on column public.customer_identities.lookup_hash is 'One-way lookup hash; raw identity is not stored here.';
comment on column public.qr_codes.token_hash is 'Only the opaque QR token hash is stored.';

commit;
