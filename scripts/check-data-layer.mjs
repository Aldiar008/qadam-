import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const migrationDir = join(process.cwd(), 'supabase', 'migrations');
const migrationFiles = readdirSync(migrationDir).filter((name) => name.endsWith('.sql')).sort();
const migrations = migrationFiles.map((name) => readFileSync(join(migrationDir, name), 'utf8')).join('\n');
// The type rules below match on substrings, so prose has to come out first: a
// comment explaining what happens "for a real tenant" is not a `real` column,
// and failing on it only teaches people to phrase comments around the linter.
const migrationSql = migrations.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
const seed = readFileSync(join(process.cwd(), 'supabase', 'seed.sql'), 'utf8');
const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));
const requiredTables = [
  'profiles','businesses','business_members','business_locations','business_profiles','business_goals','business_limits','brand_memory',
  'business_channels','feature_flags','plans','subscriptions','entitlements','usage_counters','operating_hours','capacity_slots','catalog_items',
  'data_imports','data_import_errors','source_connections','customers','customer_identities','customer_consents','customer_notes','transactions',
  'transaction_items','customer_segments','segment_memberships','loyalty_programs','loyalty_accounts','loyalty_ledger','qr_codes','qr_scans',
  'rewards','reward_redemptions','signals','recommendations','growth_contracts','campaigns','promotions','campaign_audiences','content_items',
  'tracking_codes','campaign_deliveries','campaign_events','redemptions','impact_measurements','forecast_runs','ai_generation_runs','automations',
  'automation_runs','outbox_events','notifications','activity_logs','tool_categories','tools','templates','template_versions','business_tools',
  'favorite_tools','business_types','platform_events','daily_analytics','nearby_offers','onboarding_sessions','privacy_requests','ai_usage_quota','campaign_drafts','business_execution_state','suppression_entries','provider_events','impact_baselines','notification_preferences','nearby_offer_events','admin_audit_log','team_invitations','retention_policies','data_inventory','billing_events'
];
const failures = [];
for (const table of requiredTables) if (!new RegExp(`create table (?:public|private)\\.${table}\\s*\\(`, 'i').test(migrations)) failures.push(`missing table ${table}`);
for (const bad of [' double precision ', ' real ', ' float ']) if (migrationSql.toLowerCase().includes(bad)) failures.push(`forbidden approximate numeric type: ${bad.trim()}`);
for (const kind of ['forecast','influenced','incremental_estimate','mock_actual','verified_fact']) if (!migrations.includes(`'${kind}'`)) failures.push(`missing metric kind ${kind}`);
for (const pattern of ['enable row level security','private.has_business_role','business_id is immutable','append-only','security invoker','business-assets','business-exports']) if (!migrations.toLowerCase().includes(pattern.toLowerCase())) failures.push(`missing safeguard: ${pattern}`);
for (const [series, count] of [['customers',180],['transactions',1129],['recommendations',3],['campaigns',3],['content',3],['automations',3],['tools',12],['templates',3],['daily',120],['activity',20]]) {
  if (!seed.includes(`generate_series(1,${count})`)) failures.push(`seed generator/count not found for ${series}: ${count}`);
}
if (!seed.includes('local/dev-only')) failures.push('seed lacks production refusal guard');
if (pkg.dependencies['@supabase/supabase-js'] !== '2.111.0' || pkg.dependencies['@supabase/ssr'] !== '0.12.4' || pkg.devDependencies.supabase !== '2.110.0') failures.push('Supabase dependencies are not pinned');
// A hardcoded count only forces an edit on every migration; it says nothing
// about whether the migrations are sound. These do.
const timestamps = migrationFiles.map((name) => name.slice(0, 14));
if (new Set(timestamps).size !== timestamps.length) failures.push('two migrations share a timestamp, so replay order is ambiguous');
if (timestamps.some((stamp) => !/^\d{14}$/.test(stamp))) failures.push('a migration filename does not start with a 14-digit timestamp');
if ([...timestamps].sort().join() !== timestamps.join()) failures.push('migration filenames do not sort into replay order');
const empty = migrationFiles.filter((name) => readFileSync(join(migrationDir, name), 'utf8').trim().length === 0);
if (empty.length) failures.push(`empty migration(s): ${empty.join(', ')}`);
// TRUNCATE, TRIGGER and REFERENCES are not filtered by row policies, so an
// application role holding them is an RLS bypass.
if (!migrations.includes('revoke truncate, trigger, references on all tables in schema public from anon, authenticated')) {
  failures.push('the RLS-bypassing table privileges are not revoked from anon/authenticated');
}
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log(`PASS: ${requiredTables.length} required tables, ${migrationFiles.length} migrations, seed contracts and security invariants are present.`);
