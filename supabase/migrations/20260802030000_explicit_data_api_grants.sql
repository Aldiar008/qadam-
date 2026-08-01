-- Make the Data API surface explicit instead of inherited.
--
-- Until now most of the 79 tables in `public` reached PostgREST through the
-- default privileges Supabase grants automatically on table creation. Supabase
-- is changing that platform default so exposure becomes opt-in (changelog,
-- 2026-04-28: "Tables not exposed to Data and GraphQL API automatically", with
-- existing projects to follow before 2026-10-30).
--
-- A schema that depends on an automatic grant is a schema that stops working on
-- a project created after the switch: every query would fail with "permission
-- denied for table", and the failure would arrive at deploy time rather than
-- here. So the grants below state exactly what the application needs.
--
-- This changes nothing about behaviour on the current local database: the set
-- was read back from the privileges the passing test suites already run
-- against. What changes is that it is now written down and portable.
--
-- Two rules hold across the whole list:
--   * `anon` gets SELECT only, and only on catalogue and policy tables that
--     carry no tenant data;
--   * nobody gets TRUNCATE, TRIGGER or REFERENCES - row level security does not
--     filter those (see 20260802020000).
--
-- Row level security still decides which rows each role sees. A grant is
-- permission to ask the question, not permission to see the answer.

-- Signed-out visitors: catalogue, public offers and the privacy tables.
grant select on public.data_inventory to anon;
grant select on public.nearby_offers to anon;
grant select on public.retention_policies to anon;
grant select on public.tool_categories to anon;
grant select on public.tools to anon;

-- Signed-in users. Every one of these tables is behind row level security.
grant insert, select on public.activity_logs to authenticated;
grant select on public.admin_audit_log to authenticated;
grant delete, insert, select, update on public.ai_generation_runs to authenticated;
grant select on public.ai_usage_quota to authenticated;
grant delete, insert, select, update on public.automation_runs to authenticated;
grant delete, insert, select, update on public.automations to authenticated;
grant select on public.billing_events to authenticated;
grant delete, insert, select, update on public.brand_memory to authenticated;
grant delete, insert, select, update on public.business_channels to authenticated;
grant insert, select, update on public.business_execution_state to authenticated;
grant delete, insert, select, update on public.business_goals to authenticated;
grant delete, insert, select, update on public.business_limits to authenticated;
grant delete, insert, select, update on public.business_locations to authenticated;
grant delete, insert, select, update on public.business_members to authenticated;
grant delete, insert, select, update on public.business_profiles to authenticated;
grant delete, insert, select, update on public.business_tools to authenticated;
grant delete, insert, select, update on public.business_types to authenticated;
grant delete, insert, select, update on public.businesses to authenticated;
grant delete, insert, select, update on public.campaign_audiences to authenticated;
grant delete, insert, select, update on public.campaign_deliveries to authenticated;
grant delete, insert, select, update on public.campaign_drafts to authenticated;
grant insert, select on public.campaign_events to authenticated;
grant delete, insert, select, update on public.campaigns to authenticated;
grant delete, insert, select, update on public.capacity_slots to authenticated;
grant delete, insert, select, update on public.catalog_items to authenticated;
grant delete, insert, select, update on public.content_items to authenticated;
grant delete, insert, select, update on public.customer_consents to authenticated;
grant delete, insert, select, update on public.customer_identities to authenticated;
grant delete, insert, select, update on public.customer_notes to authenticated;
grant delete, insert, select, update on public.customer_segments to authenticated;
grant delete, insert, select, update on public.customers to authenticated;
grant delete, insert, select, update on public.daily_analytics to authenticated;
grant delete, insert, select, update on public.data_import_errors to authenticated;
grant delete, insert, select, update on public.data_imports to authenticated;
grant select on public.data_inventory to authenticated;
grant delete, insert, select, update on public.entitlements to authenticated;
grant delete, insert, select, update on public.favorite_tools to authenticated;
grant delete, insert, select, update on public.feature_flags to authenticated;
grant delete, insert, select, update on public.forecast_runs to authenticated;
grant delete, insert, select, update on public.growth_contracts to authenticated;
grant select on public.impact_baselines to authenticated;
grant delete, insert, select, update on public.impact_measurements to authenticated;
grant delete, insert, select, update on public.loyalty_accounts to authenticated;
grant insert, select on public.loyalty_ledger to authenticated;
grant delete, insert, select, update on public.loyalty_programs to authenticated;
grant select on public.nearby_offer_events to authenticated;
grant delete, insert, select, update on public.nearby_offers to authenticated;
grant insert, select, update on public.notification_preferences to authenticated;
grant delete, insert, select, update on public.notifications to authenticated;
grant insert, select, update on public.onboarding_sessions to authenticated;
grant delete, insert, select, update on public.operating_hours to authenticated;
grant insert, select on public.outbox_events to authenticated;
grant delete, insert, select, update on public.plan_entitlements to authenticated;
grant delete, insert, select, update on public.plans to authenticated;
grant select, update on public.privacy_requests to authenticated;
grant delete, insert, select, update on public.profiles to authenticated;
grant delete, insert, select, update on public.promotions to authenticated;
grant select on public.provider_events to authenticated;
grant delete, insert, select, update on public.qr_codes to authenticated;
grant insert, select on public.qr_scans to authenticated;
grant delete, insert, select, update on public.recommendations to authenticated;
grant delete, insert, select, update on public.redemptions to authenticated;
grant select on public.retention_policies to authenticated;
grant delete, insert, select, update on public.reward_redemptions to authenticated;
grant delete, insert, select, update on public.rewards to authenticated;
grant delete, insert, select, update on public.segment_memberships to authenticated;
grant delete, insert, select, update on public.signals to authenticated;
grant delete, insert, select, update on public.source_connections to authenticated;
grant delete, insert, select, update on public.subscriptions to authenticated;
grant delete, insert, select on public.suppression_entries to authenticated;
grant insert, select, update on public.team_invitations to authenticated;
grant delete, insert, select, update on public.template_versions to authenticated;
grant delete, insert, select, update on public.templates to authenticated;
grant delete, insert, select, update on public.tool_categories to authenticated;
grant delete, insert, select, update on public.tools to authenticated;
grant delete, insert, select, update on public.tracking_codes to authenticated;
grant delete, insert, select, update on public.transaction_items to authenticated;
grant delete, insert, select, update on public.transactions to authenticated;
grant delete, insert, select, update on public.usage_counters to authenticated;
