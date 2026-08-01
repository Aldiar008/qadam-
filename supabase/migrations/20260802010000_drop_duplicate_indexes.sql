begin;

-- Supabase advisors flagged two indexes added in this prompt as exact duplicates
-- of ones that already existed. This is the mirror image of the earlier
-- `customers_cursor_idx` collision: there, a name clash silently skipped the
-- index I wanted; here, a different name created a second copy of one that was
-- already present. Both cost write throughput and neither adds a plan.

-- `consent_lookup_idx` already covers (business_id, customer_id, scope, created_at desc).
drop index if exists public.customer_consents_lookup_idx;

-- The unique constraint on (business_id, entitlement_key, period_start) already
-- provides the index `consume_entitlement` relies on for its ON CONFLICT.
drop index if exists public.usage_counters_period_uidx;

commit;
