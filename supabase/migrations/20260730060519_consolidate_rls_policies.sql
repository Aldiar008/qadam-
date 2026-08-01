begin;

-- These two resources are growth-owned; the broader growth policy already
-- includes owner and manager, so duplicate manager policies only add work.
drop policy notifications_manager_insert on public.notifications;
drop policy notifications_manager_update on public.notifications;
drop policy notifications_manager_delete on public.notifications;
drop policy business_tools_manager_insert on public.business_tools;
drop policy business_tools_manager_update on public.business_tools;
drop policy business_tools_manager_delete on public.business_tools;

-- Keep one SELECT policy per API role while preserving draft visibility for
-- tenant members and public visibility for published nearby offers.
drop policy nearby_public_select on public.nearby_offers;
drop policy nearby_member_all on public.nearby_offers;
create policy nearby_anon_select on public.nearby_offers for select to anon
 using (status='published' and published_at is not null and (expires_at is null or expires_at>now()));
create policy nearby_authenticated_select on public.nearby_offers for select to authenticated
 using (
  (status='published' and published_at is not null and (expires_at is null or expires_at>now()))
  or (select private.has_business_role(business_id,array['owner','manager','marketer']))
 );
create policy nearby_member_insert on public.nearby_offers for insert to authenticated
 with check ((select private.has_business_role(business_id,array['owner','manager','marketer'])));
create policy nearby_member_update on public.nearby_offers for update to authenticated
 using ((select private.has_business_role(business_id,array['owner','manager','marketer'])))
 with check ((select private.has_business_role(business_id,array['owner','manager','marketer'])));
create policy nearby_member_delete on public.nearby_offers for delete to authenticated
 using ((select private.has_business_role(business_id,array['owner','manager','marketer'])));

-- Public catalog reads and platform draft reads share one policy per role.
drop policy tool_categories_public_select on public.tool_categories;
create policy tool_categories_anon_select on public.tool_categories for select to anon using (status='published');
create policy tool_categories_authenticated_select on public.tool_categories for select to authenticated
 using (status='published' or (select private.is_platform_admin(array['platform_admin','platform_editor','platform_analyst'])));

drop policy tools_public_select on public.tools;
create policy tools_anon_select on public.tools for select to anon using (status='published' and is_public);
create policy tools_authenticated_select on public.tools for select to authenticated
 using ((status='published' and is_public) or (select private.is_platform_admin(array['platform_admin','platform_editor','platform_analyst'])));

-- On reference catalogs the existing SELECT policies already include admins.
-- Replace FOR ALL admin policies with explicit mutation policies.
do $$
declare t text;
begin
 foreach t in array array['business_types','plans','entitlements','plan_entitlements','tool_categories','tools'] loop
  execute format('drop policy %I on public.%I',t||'_platform_admin_all',t);
  execute format('create policy %I on public.%I for insert to authenticated with check ((select private.is_platform_admin(array[''platform_admin'',''platform_editor''])))',t||'_platform_admin_insert',t);
  execute format('create policy %I on public.%I for update to authenticated using ((select private.is_platform_admin(array[''platform_admin'',''platform_editor'']))) with check ((select private.is_platform_admin(array[''platform_admin'',''platform_editor''])))',t||'_platform_admin_update',t);
  execute format('create policy %I on public.%I for delete to authenticated using ((select private.is_platform_admin(array[''platform_admin'',''platform_editor''])))',t||'_platform_admin_delete',t);
 end loop;
end $$;

commit;
