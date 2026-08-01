begin;
create or replace function private.has_business_role(target_business_id uuid, allowed_roles text[] default null)
returns boolean language sql stable security definer set search_path=''
as $$
 select (select auth.uid()) is not null and exists (
  select 1 from public.business_members bm
  where bm.business_id=target_business_id and bm.user_id=(select auth.uid()) and bm.status='active'
    and (allowed_roles is null or bm.role=any(allowed_roles))
 )
$$;
revoke all on function private.has_business_role(uuid,text[]) from public, anon, authenticated, service_role;
grant usage on schema private to authenticated;
grant execute on function private.has_business_role(uuid,text[]) to authenticated;

create or replace function private.is_platform_admin(allowed_roles text[] default array['platform_admin'])
returns boolean language sql stable security definer set search_path=''
as $$
 select (select auth.uid()) is not null and exists (
  select 1 from private.platform_admin_assignments pa
  where pa.user_id=(select auth.uid()) and pa.active and pa.role=any(allowed_roles)
 )
$$;
revoke all on function private.is_platform_admin(text[]) from public, anon, authenticated, service_role;
grant execute on function private.is_platform_admin(text[]) to authenticated;

do $$
declare t text;
begin
 for t in select tablename from pg_tables where schemaname='public'
 loop execute format('alter table public.%I enable row level security',t); end loop;
end $$;

create policy profiles_own_select on public.profiles for select to authenticated using (id=(select auth.uid()));
create policy profiles_own_insert on public.profiles for insert to authenticated with check (id=(select auth.uid()));
create policy profiles_own_update on public.profiles for update to authenticated using (id=(select auth.uid())) with check (id=(select auth.uid()));

create policy businesses_member_select on public.businesses for select to authenticated
 using ((select private.has_business_role(id,null)) or created_by=(select auth.uid()));
create policy businesses_create on public.businesses for insert to authenticated with check (created_by=(select auth.uid()) and not is_mock);
create policy businesses_manage on public.businesses for update to authenticated
 using ((select private.has_business_role(id,array['owner','manager'])))
 with check ((select private.has_business_role(id,array['owner','manager'])));
create policy businesses_delete on public.businesses for delete to authenticated
 using ((select private.has_business_role(id,array['owner'])));

create policy members_select on public.business_members for select to authenticated
 using ((select private.has_business_role(business_id,null)));
create policy members_owner_insert on public.business_members for insert to authenticated
 with check (
  (select private.has_business_role(business_id,array['owner']))
  or (role='owner' and user_id=(select auth.uid()) and exists (
   select 1 from public.businesses b where b.id=business_id and b.created_by=(select auth.uid())
  ))
 );
create policy members_owner_update on public.business_members for update to authenticated
 using ((select private.has_business_role(business_id,array['owner'])))
 with check ((select private.has_business_role(business_id,array['owner'])));
create policy members_owner_delete on public.business_members for delete to authenticated
 using ((select private.has_business_role(business_id,array['owner'])));

do $$
declare t text;
begin
 foreach t in array array[
  'business_locations','business_profiles','business_goals','brand_memory','business_channels','feature_flags','subscriptions','usage_counters',
  'operating_hours','capacity_slots','catalog_items','data_imports','data_import_errors','source_connections','customers','customer_identities',
  'customer_consents','customer_notes','transactions','transaction_items','customer_segments','segment_memberships','loyalty_programs','loyalty_accounts',
  'loyalty_ledger','qr_codes','qr_scans','rewards','reward_redemptions','signals','recommendations','growth_contracts','forecast_runs','campaigns',
  'promotions','campaign_audiences','content_items','tracking_codes','campaign_deliveries','campaign_events','redemptions','impact_measurements',
  'ai_generation_runs','automations','automation_runs','outbox_events','notifications','activity_logs','business_tools','favorite_tools','daily_analytics'
 ] loop
  execute format('create policy %I on public.%I for select to authenticated using ((select private.has_business_role(business_id,null)))',t||'_member_select',t);
 end loop;
end $$;

create policy business_limits_owner_select on public.business_limits for select to authenticated
 using ((select private.has_business_role(business_id,array['owner','manager'])));
create policy business_limits_owner_insert on public.business_limits for insert to authenticated
 with check ((select private.has_business_role(business_id,array['owner'])));
create policy business_limits_owner_update on public.business_limits for update to authenticated
 using ((select private.has_business_role(business_id,array['owner'])))
 with check ((select private.has_business_role(business_id,array['owner'])));
create policy business_limits_owner_delete on public.business_limits for delete to authenticated
 using ((select private.has_business_role(business_id,array['owner'])));

do $$
declare t text;
begin
 foreach t in array array[
  'business_locations','business_profiles','business_goals','brand_memory','business_channels','feature_flags',
  'operating_hours','capacity_slots','catalog_items','data_imports','data_import_errors','source_connections',
  'customers','customer_identities','customer_consents','customer_notes','transactions','transaction_items','customer_segments','segment_memberships',
  'loyalty_programs','loyalty_accounts','qr_codes','rewards','reward_redemptions','notifications','business_tools','daily_analytics'
 ] loop
  execute format('create policy %I on public.%I for insert to authenticated with check ((select private.has_business_role(business_id,array[''owner'',''manager''])))',t||'_manager_insert',t);
  execute format('create policy %I on public.%I for update to authenticated using ((select private.has_business_role(business_id,array[''owner'',''manager'']))) with check ((select private.has_business_role(business_id,array[''owner'',''manager''])))',t||'_manager_update',t);
  execute format('create policy %I on public.%I for delete to authenticated using ((select private.has_business_role(business_id,array[''owner'',''manager''])))',t||'_manager_delete',t);
 end loop;
end $$;

do $$
declare t text;
begin
 foreach t in array array[
  'signals','recommendations','growth_contracts','forecast_runs','campaigns','promotions','campaign_audiences','content_items','tracking_codes',
  'campaign_deliveries','redemptions','impact_measurements','ai_generation_runs','automations','automation_runs','notifications','business_tools','favorite_tools'
 ] loop
  execute format('create policy %I on public.%I for insert to authenticated with check ((select private.has_business_role(business_id,array[''owner'',''manager'',''marketer''])))',t||'_growth_insert',t);
  execute format('create policy %I on public.%I for update to authenticated using ((select private.has_business_role(business_id,array[''owner'',''manager'',''marketer'']))) with check ((select private.has_business_role(business_id,array[''owner'',''manager'',''marketer''])))',t||'_growth_update',t);
  execute format('create policy %I on public.%I for delete to authenticated using ((select private.has_business_role(business_id,array[''owner'',''manager'',''marketer''])))',t||'_growth_delete',t);
 end loop;
end $$;

do $$
declare t text;
begin
 foreach t in array array['loyalty_ledger','qr_scans','campaign_events','outbox_events','activity_logs']
 loop execute format('create policy %I on public.%I for insert to authenticated with check ((select private.has_business_role(business_id,array[''owner'',''manager'',''marketer''])))',t||'_append_insert',t); end loop;
end $$;

create policy business_types_authenticated_select on public.business_types for select to authenticated using (status='published' or (select private.is_platform_admin(array['platform_admin','platform_editor','platform_analyst'])));
create policy plans_authenticated_select on public.plans for select to authenticated using ((status='active' and is_public) or (select private.is_platform_admin(array['platform_admin','platform_editor','platform_analyst'])));
create policy entitlements_authenticated_select on public.entitlements for select to authenticated using (true);
create policy plan_entitlements_authenticated_select on public.plan_entitlements for select to authenticated using (true);
create policy tool_categories_public_select on public.tool_categories for select to anon, authenticated using (status='published');
create policy tools_public_select on public.tools for select to anon, authenticated using (status='published' and is_public);
create policy nearby_public_select on public.nearby_offers for select to anon, authenticated
 using (status='published' and published_at is not null and (expires_at is null or expires_at>now()));
create policy nearby_member_all on public.nearby_offers for all to authenticated
 using ((select private.has_business_role(business_id,array['owner','manager','marketer'])))
 with check ((select private.has_business_role(business_id,array['owner','manager','marketer'])));

do $$
declare t text;
begin
 foreach t in array array['business_types','plans','entitlements','plan_entitlements','tool_categories','tools','templates','template_versions']
 loop
  execute format('create policy %I on public.%I for all to authenticated using ((select private.is_platform_admin(array[''platform_admin'',''platform_editor'']))) with check ((select private.is_platform_admin(array[''platform_admin'',''platform_editor''])))',t||'_platform_admin_all',t);
 end loop;
end $$;

grant select on public.tool_categories, public.tools, public.nearby_offers to anon;
grant select on public.profiles, public.business_types, public.plans, public.entitlements, public.plan_entitlements, public.businesses, public.business_members,
 public.business_locations, public.business_profiles, public.business_goals, public.business_limits, public.brand_memory, public.business_channels,
 public.feature_flags, public.subscriptions, public.usage_counters, public.operating_hours, public.capacity_slots, public.catalog_items, public.data_imports,
 public.data_import_errors, public.source_connections, public.customers, public.customer_identities, public.customer_consents, public.customer_notes,
 public.transactions, public.transaction_items, public.customer_segments, public.segment_memberships, public.loyalty_programs, public.loyalty_accounts,
 public.loyalty_ledger, public.qr_codes, public.qr_scans, public.rewards, public.reward_redemptions, public.signals, public.recommendations,
 public.growth_contracts, public.forecast_runs, public.campaigns, public.promotions, public.campaign_audiences, public.content_items, public.tracking_codes,
 public.campaign_deliveries, public.campaign_events, public.redemptions, public.impact_measurements, public.ai_generation_runs, public.automations,
 public.automation_runs, public.outbox_events, public.notifications, public.activity_logs, public.tool_categories, public.tools, public.templates,
 public.template_versions, public.business_tools, public.favorite_tools, public.daily_analytics, public.nearby_offers to authenticated;
grant insert,update,delete on public.profiles, public.businesses, public.business_members, public.business_locations, public.business_profiles,
 public.business_goals, public.business_limits, public.brand_memory, public.business_channels, public.feature_flags, public.subscriptions,
 public.usage_counters, public.operating_hours, public.capacity_slots, public.catalog_items, public.data_imports, public.data_import_errors,
 public.source_connections, public.customers, public.customer_identities, public.customer_consents, public.customer_notes, public.transactions,
 public.transaction_items, public.customer_segments, public.segment_memberships, public.loyalty_programs, public.loyalty_accounts, public.qr_codes,
 public.rewards, public.reward_redemptions, public.signals, public.recommendations, public.growth_contracts, public.forecast_runs, public.campaigns,
 public.promotions, public.campaign_audiences, public.content_items, public.tracking_codes, public.campaign_deliveries, public.redemptions,
 public.impact_measurements, public.ai_generation_runs, public.automations, public.automation_runs, public.notifications, public.business_tools,
 public.favorite_tools, public.daily_analytics, public.nearby_offers to authenticated;
grant insert on public.loyalty_ledger, public.qr_scans, public.campaign_events, public.outbox_events, public.activity_logs to authenticated;
grant insert,update,delete on public.business_types, public.plans, public.entitlements, public.plan_entitlements, public.tool_categories, public.tools,
 public.templates, public.template_versions to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values
 ('business-assets','business-assets',false,10485760,array['image/png','image/jpeg','image/webp','application/pdf']),
 ('business-exports','business-exports',false,52428800,array['text/csv','application/pdf','application/zip'])
on conflict(id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create or replace function private.storage_business_id(object_name text)
returns uuid language plpgsql immutable set search_path=''
as $$
declare first_part text;
begin
 first_part := split_part(object_name,'/',1);
 if first_part !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then return null; end if;
 return first_part::uuid;
end $$;
revoke all on function private.storage_business_id(text) from public, anon, authenticated, service_role;
grant execute on function private.storage_business_id(text) to authenticated;

create policy storage_member_select on storage.objects for select to authenticated
 using (bucket_id in ('business-assets','business-exports') and (select private.has_business_role(private.storage_business_id(name),null)));
create policy storage_writer_insert on storage.objects for insert to authenticated
 with check (bucket_id in ('business-assets','business-exports') and (select private.has_business_role(private.storage_business_id(name),array['owner','manager','marketer'])));
create policy storage_writer_update on storage.objects for update to authenticated
 using (bucket_id in ('business-assets','business-exports') and (select private.has_business_role(private.storage_business_id(name),array['owner','manager','marketer'])))
 with check (bucket_id in ('business-assets','business-exports') and (select private.has_business_role(private.storage_business_id(name),array['owner','manager','marketer'])));
create policy storage_manager_delete on storage.objects for delete to authenticated
 using (bucket_id in ('business-assets','business-exports') and (select private.has_business_role(private.storage_business_id(name),array['owner','manager'])));

commit;

begin;
create or replace function public.is_current_platform_admin()
returns boolean language sql stable security invoker set search_path=''
as $$ select private.is_platform_admin(array['platform_admin','platform_editor']) $$;
revoke all on function public.is_current_platform_admin() from public, anon, authenticated, service_role;
grant execute on function public.is_current_platform_admin() to authenticated;
commit;
