begin;

-- ===========================================================================
-- Prompt 5: execution substrate.
--
-- Everything after owner approval: how an action is dispatched, retried,
-- stopped, and how the result is measured without inflating it.
--
-- Design rules encoded here:
--  * Side effects go through the outbox. Nothing sends inside a long
--    transaction, and a crash between "decided" and "sent" cannot lose or
--    duplicate the action.
--  * Delivery is at-least-once, so every consumer is keyed and idempotent.
--  * Consent is re-checked at send time, not only when the audience was built.
--  * Raw provider events are stored apart from derived metrics, so a duplicate
--    webhook can never move a number.
--  * A baseline, once recorded for a measurement version, is immutable.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Business-level execution state and emergency stop
-- ---------------------------------------------------------------------------
create table public.business_execution_state (
 business_id uuid primary key references public.businesses(id) on delete cascade,
 emergency_stopped_at timestamptz,
 emergency_stopped_by uuid references auth.users(id) on delete set null,
 emergency_stop_reason text,
 quiet_hours_start time not null default '21:00',
 quiet_hours_end time not null default '09:00',
 timezone text not null default 'Asia/Almaty',
 daily_send_cap integer not null default 500 check (daily_send_cap >= 0),
 updated_at timestamptz not null default now()
);

-- The schema contract requires an index on every foreign key column.
create index business_execution_state_stopped_by_fk_idx on public.business_execution_state(emergency_stopped_by);

alter table public.business_execution_state enable row level security;
create policy business_execution_state_member_select on public.business_execution_state for select to authenticated
 using ((select private.has_business_role(business_id, null)));
create policy business_execution_state_manager_insert on public.business_execution_state for insert to authenticated
 with check ((select private.has_business_role(business_id, array['owner','manager'])));
create policy business_execution_state_manager_update on public.business_execution_state for update to authenticated
 using ((select private.has_business_role(business_id, array['owner','manager'])))
 with check ((select private.has_business_role(business_id, array['owner','manager'])));
revoke all on public.business_execution_state from anon, authenticated;
grant select, insert, update on public.business_execution_state to authenticated;
grant all on public.business_execution_state to service_role;
create trigger business_execution_state_set_updated_at before update on public.business_execution_state
 for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Suppression list: a hard block that outranks any audience or consent record.
-- ---------------------------------------------------------------------------
create table public.suppression_entries (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 customer_id uuid references public.customers(id) on delete cascade,
 identity_hash bytea,
 channel text,
 reason text not null check (reason in ('unsubscribed','complained','bounced','owner_block','privacy_delete')),
 created_at timestamptz not null default now(),
 is_mock boolean not null default false,
 check (customer_id is not null or identity_hash is not null)
);
create index suppression_entries_business_customer_idx on public.suppression_entries(business_id, customer_id, channel);
create index suppression_entries_business_id_fk_idx on public.suppression_entries(business_id);
create index suppression_entries_customer_id_fk_idx on public.suppression_entries(customer_id);

alter table public.suppression_entries enable row level security;
create policy suppression_member_select on public.suppression_entries for select to authenticated
 using ((select private.has_business_role(business_id, null)));
create policy suppression_manager_insert on public.suppression_entries for insert to authenticated
 with check ((select private.has_business_role(business_id, array['owner','manager'])));
create policy suppression_manager_delete on public.suppression_entries for delete to authenticated
 using ((select private.has_business_role(business_id, array['owner','manager'])));
revoke all on public.suppression_entries from anon, authenticated;
grant select, insert, delete on public.suppression_entries to authenticated;
grant all on public.suppression_entries to service_role;

-- ---------------------------------------------------------------------------
-- Connector state. A connector is only "connected" once a health check passed.
-- ---------------------------------------------------------------------------
alter table public.business_channels add column connector_state text not null default 'not_configured'
 check (connector_state in ('not_configured','simulated','sandbox','connected','error'));
alter table public.business_channels add column adapter text not null default 'mock';
alter table public.business_channels add column last_health_check_at timestamptz;
alter table public.business_channels add column health_evidence jsonb not null default '{}'::jsonb
 check (jsonb_typeof(health_evidence)='object');
alter table public.business_channels add column last_error text;

-- A live connector must carry proof: a passing health check with evidence.
-- Without it the strongest state available is 'sandbox'.
alter table public.business_channels add constraint business_channels_connected_requires_evidence
 check (connector_state <> 'connected' or (last_health_check_at is not null and health_evidence ? 'health_check'));

-- ---------------------------------------------------------------------------
-- Outbox hardening: leasing, bounded retry, dead letter.
-- ---------------------------------------------------------------------------
alter table public.outbox_events add column attempts_max smallint not null default 5 check (attempts_max > 0);
alter table public.outbox_events add column locked_at timestamptz;
alter table public.outbox_events add column locked_by text;
alter table public.outbox_events add column last_error text;
alter table public.outbox_events add column dead_lettered_at timestamptz;
create index outbox_events_pending_idx on public.outbox_events(business_id, status, available_at, id);

-- ---------------------------------------------------------------------------
-- Automations: mode, versioning and schedule.
-- ---------------------------------------------------------------------------
alter table public.automations add column mode text not null default 'assistant'
 check (mode in ('manual','assistant','autopilot'));
alter table public.automations add column rule_version integer not null default 1 check (rule_version > 0);
alter table public.automations add column approved_template_version text;
alter table public.automations add column owner_id uuid references auth.users(id) on delete set null;
alter table public.automations add column next_run_at timestamptz;
alter table public.automations add column last_run_at timestamptz;
alter table public.automations add column filters jsonb not null default '{}'::jsonb check (jsonb_typeof(filters)='object');
create index automations_owner_id_fk_idx on public.automations(owner_id);
create index automations_due_idx on public.automations(business_id, status, next_run_at);

-- Autopilot is gated on trust: an approved template and an owner on record.
alter table public.automations add constraint automations_autopilot_requires_trust
 check (mode <> 'autopilot' or (approved_template_version is not null and owner_id is not null));

-- ---------------------------------------------------------------------------
-- Automation runs: attempt tracking and dead letter.
-- ---------------------------------------------------------------------------
alter table public.automation_runs add column attempt smallint not null default 1 check (attempt > 0);
alter table public.automation_runs add column error text;
alter table public.automation_runs add column trigger_source text not null default 'scheduler'
 check (trigger_source in ('scheduler','manual','demo_cycle','webhook'));
alter table public.automation_runs drop constraint automation_runs_status_check;
alter table public.automation_runs add constraint automation_runs_status_check
 check (status in ('queued','running','completed','failed','stopped','skipped','dead_letter'));

-- ---------------------------------------------------------------------------
-- Raw provider events, stored separately from any derived metric.
-- ---------------------------------------------------------------------------
create table public.provider_events (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 provider text not null,
 channel text not null,
 external_event_id text not null,
 event_type text not null,
 delivery_id uuid references public.campaign_deliveries(id) on delete set null,
 campaign_id uuid references public.campaigns(id) on delete set null,
 signature_verified boolean not null default false,
 received_at timestamptz not null default now(),
 payload jsonb not null,
 processed_at timestamptz,
 is_mock boolean not null default false,
 -- A provider replaying the same event id must not be able to move a number twice.
 unique (business_id, provider, external_event_id)
);
create index provider_events_business_id_fk_idx on public.provider_events(business_id);
create index provider_events_delivery_id_fk_idx on public.provider_events(delivery_id);
create index provider_events_campaign_id_fk_idx on public.provider_events(campaign_id);
create index provider_events_unprocessed_idx on public.provider_events(business_id, processed_at, received_at);

alter table public.provider_events enable row level security;
create policy provider_events_member_select on public.provider_events for select to authenticated
 using ((select private.has_business_role(business_id, null)));
revoke all on public.provider_events from anon, authenticated;
grant select on public.provider_events to authenticated;
grant all on public.provider_events to service_role;

-- ---------------------------------------------------------------------------
-- Impact baselines: fixed before launch, immutable per measurement version.
-- ---------------------------------------------------------------------------
create table public.impact_baselines (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 campaign_id uuid not null references public.campaigns(id) on delete cascade,
 measurement_version text not null,
 method text not null check (method in ('pre_period','holdout_lite','matched_baseline')),
 audience_size integer not null check (audience_size >= 0),
 baseline_orders integer not null check (baseline_orders >= 0),
 baseline_revenue_minor bigint not null check (baseline_revenue_minor >= 0),
 baseline_period_start timestamptz not null,
 baseline_period_end timestamptz not null,
 /* Below this many observations the estimate is reported as an observed
    difference with an interval, never as an incremental result. */
 min_sample_size integer not null default 30 check (min_sample_size > 0),
 evidence jsonb not null default '{}'::jsonb,
 recorded_at timestamptz not null default now(),
 is_mock boolean not null default false,
 unique (campaign_id, measurement_version),
 check (baseline_period_end > baseline_period_start)
);
create index impact_baselines_business_id_fk_idx on public.impact_baselines(business_id);
create index impact_baselines_campaign_id_fk_idx on public.impact_baselines(campaign_id);

alter table public.impact_baselines enable row level security;
create policy impact_baselines_member_select on public.impact_baselines for select to authenticated
 using ((select private.has_business_role(business_id, null)));
revoke all on public.impact_baselines from anon, authenticated;
grant select on public.impact_baselines to authenticated;
grant all on public.impact_baselines to service_role;

-- A recorded baseline is evidence, not a working value. Once written for a
-- measurement version its numbers cannot be edited; a new version is required.
create or replace function private.protect_impact_baseline()
returns trigger language plpgsql set search_path=''
as $$
begin
 if tg_op='DELETE' then raise exception 'impact baselines are immutable and cannot be deleted' using errcode='42501'; end if;
 if new.measurement_version is distinct from old.measurement_version
  or new.baseline_orders is distinct from old.baseline_orders
  or new.baseline_revenue_minor is distinct from old.baseline_revenue_minor
  or new.audience_size is distinct from old.audience_size
  or new.baseline_period_start is distinct from old.baseline_period_start
  or new.baseline_period_end is distinct from old.baseline_period_end
  or new.method is distinct from old.method then
  raise exception 'impact baseline is immutable for this measurement version; record a new version' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function private.protect_impact_baseline() from public,anon,authenticated,service_role;
create trigger impact_baselines_immutable before update or delete on public.impact_baselines
 for each row execute function private.protect_impact_baseline();

-- ---------------------------------------------------------------------------
-- Notifications: categories and per-user muting.
-- ---------------------------------------------------------------------------
alter table public.notifications add column category text not null default 'result'
 check (category in ('opportunity','approval','risk','result','connector_error'));
alter table public.notifications add column dismissed_at timestamptz;
create index notifications_inbox_idx on public.notifications(business_id, user_id, read_at, created_at desc);

create table public.notification_preferences (
 business_id uuid not null references public.businesses(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 category text not null check (category in ('opportunity','approval','risk','result','connector_error')),
 muted boolean not null default false,
 updated_at timestamptz not null default now(),
 primary key (business_id, user_id, category),
 -- Risk and connector errors are safety signals; they cannot be silenced.
 check (not muted or category in ('opportunity','result'))
);
create index notification_preferences_user_idx on public.notification_preferences(user_id);

alter table public.notification_preferences enable row level security;
create policy notification_preferences_own_select on public.notification_preferences for select to authenticated
 using (user_id=(select auth.uid()) and (select private.has_business_role(business_id, null)));
create policy notification_preferences_own_insert on public.notification_preferences for insert to authenticated
 with check (user_id=(select auth.uid()) and (select private.has_business_role(business_id, null)));
create policy notification_preferences_own_update on public.notification_preferences for update to authenticated
 using (user_id=(select auth.uid()) and (select private.has_business_role(business_id, null)))
 with check (user_id=(select auth.uid()) and (select private.has_business_role(business_id, null)));
revoke all on public.notification_preferences from anon, authenticated;
grant select, insert, update on public.notification_preferences to authenticated;
grant all on public.notification_preferences to service_role;

-- ---------------------------------------------------------------------------
-- Nearby offers: public storefront fields and intent events.
--
-- PostGIS is not installed in this project, so proximity uses the already
-- privacy-rounded latitude/longitude columns with a haversine filter plus a
-- district fallback. No customer coordinate is ever stored or published.
-- ---------------------------------------------------------------------------
alter table public.nearby_offers add column category text not null default 'other';
alter table public.nearby_offers add column public_slug text;
alter table public.nearby_offers add column terms_ru text;
alter table public.nearby_offers add column terms_kk text;
alter table public.nearby_offers add column tracking_code_id uuid references public.tracking_codes(id) on delete set null;
alter table public.nearby_offers add column budget_minor bigint not null default 0 check (budget_minor >= 0);
alter table public.nearby_offers add column budget_spent_minor bigint not null default 0 check (budget_spent_minor >= 0);
create unique index nearby_offers_public_slug_uidx on public.nearby_offers(public_slug) where public_slug is not null;
create index nearby_offers_discovery_idx on public.nearby_offers(status, expires_at, district, category);
create index nearby_offers_tracking_code_id_fk_idx on public.nearby_offers(tracking_code_id);

create table public.nearby_offer_events (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 nearby_offer_id uuid not null references public.nearby_offers(id) on delete cascade,
 /* Intent only. A view, click or save is never counted as a visit: a visit
    requires a verified QR scan or redemption event. */
 event_kind text not null check (event_kind in ('view','click','save','visit_intent')),
 occurred_at timestamptz not null default now(),
 request_key text not null,
 coarse_district text,
 is_mock boolean not null default false,
 unique (nearby_offer_id, request_key, event_kind)
);
create index nearby_offer_events_business_id_fk_idx on public.nearby_offer_events(business_id);
create index nearby_offer_events_offer_idx on public.nearby_offer_events(nearby_offer_id, event_kind, occurred_at desc);

alter table public.nearby_offer_events enable row level security;
create policy nearby_offer_events_member_select on public.nearby_offer_events for select to authenticated
 using ((select private.has_business_role(business_id, null)));
revoke all on public.nearby_offer_events from anon, authenticated;
grant select on public.nearby_offer_events to authenticated;
grant all on public.nearby_offer_events to service_role;

commit;
