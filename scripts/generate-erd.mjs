// Generates the ERD from the live schema, so the diagram cannot drift from it.
//
// Every table is included, grouped by the part of the product it belongs to,
// with the foreign keys that actually exist in Postgres rather than the ones
// someone remembered while drawing.
import { execFileSync } from 'node:child_process';
import { dbContainer } from './db-container.mjs';
import { writeFileSync } from 'node:fs';

const CONTAINER = dbContainer();
const q = (sql) => execFileSync('docker', ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-A', '-t', '-F', '\u0001', '-c', sql], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).replace(/\r/g, '').trim();

const GROUPS = [
  ['Тенант и доступ', ['businesses', 'business_members', 'business_locations', 'business_profiles', 'business_goals', 'business_limits', 'profiles', 'team_invitations', 'operating_hours', 'feature_flags', 'onboarding_sessions']],
  ['Клиенты и согласия', ['customers', 'customer_identities', 'customer_consents', 'customer_notes', 'customer_segments', 'segment_memberships', 'transactions', 'transaction_items', 'data_imports', 'data_import_errors']],
  ['Лояльность и QR', ['loyalty_programs', 'loyalty_accounts', 'loyalty_ledger', 'rewards', 'reward_redemptions', 'qr_codes', 'qr_scans']],
  ['Сигналы и решения', ['signals', 'recommendations', 'growth_contracts', 'forecast_runs', 'ai_generation_runs', 'ai_usage_quota', 'campaign_drafts', 'brand_memory']],
  ['Кампании и исполнение', ['campaigns', 'campaign_audiences', 'campaign_deliveries', 'campaign_events', 'content_items', 'promotions', 'redemptions', 'tracking_codes', 'outbox_events', 'provider_events', 'business_channels', 'business_execution_state', 'suppression_entries', 'automations', 'automation_runs']],
  ['Измерение', ['impact_baselines', 'impact_measurements', 'daily_analytics', 'capacity_slots', 'catalog_items']],
  ['Витрина «Акции рядом»', ['nearby_offers', 'nearby_offer_events']],
  ['Каталог платформы', ['tools', 'tool_categories', 'business_types', 'business_tools', 'favorite_tools', 'templates', 'template_versions']],
  ['Тарифы и биллинг', ['plans', 'entitlements', 'plan_entitlements', 'subscriptions', 'usage_counters', 'billing_events']],
  ['Управление и приватность', ['admin_audit_log', 'activity_logs', 'notifications', 'notification_preferences', 'privacy_requests', 'data_inventory', 'retention_policies', 'platform_events', 'source_connections']],
];

const tables = q(`select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by relname`).split('\n').filter(Boolean);

const columns = Object.fromEntries(tables.map((t) => [t, []]));
for (const line of q(`
  select table_name, column_name, data_type, is_nullable
  from information_schema.columns where table_schema='public' order by table_name, ordinal_position`).split('\n')) {
  const [table, column, type, nullable] = line.split('\u0001');
  if (columns[table]) columns[table].push({ column, type, nullable });
}

const fks = q(`
  select tc.table_name, kcu.column_name, ccu.table_name
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name
  join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
  where tc.constraint_type='FOREIGN KEY' and tc.table_schema='public' and ccu.table_schema='public'
  order by 1,2`).split('\n').filter(Boolean).map((l) => l.split('\u0001'));

const shortType = (type) => ({
  'uuid': 'uuid', 'text': 'text', 'bigint': 'bigint', 'integer': 'int', 'boolean': 'bool',
  'timestamp with time zone': 'timestamptz', 'jsonb': 'jsonb', 'ARRAY': 'array', 'numeric': 'numeric', 'date': 'date', 'bytea': 'bytea',
}[type] ?? type.replace(/\s+/g, '_'));

const grouped = new Set(GROUPS.flatMap(([, list]) => list));
const ungrouped = tables.filter((t) => !grouped.has(t));
if (ungrouped.length) GROUPS.push(['Прочее', ungrouped]);

let out = `# ERD — QOR Autopilot

Сгенерировано из живой схемы: \`node scripts/generate-erd.mjs\`. Диаграмма не может разойтись
со схемой, потому что она из неё и строится. Всего таблиц: **${tables.length}**, внешних
ключей: **${fks.length}**.

Каждая таблица с колонкой \`business_id\` — тенантная: на ней включён row level security, и
изоляция проверяется автоматически (\`node tests/security/rls-matrix.mjs\`).

`;

for (const [title, list] of GROUPS) {
  const present = list.filter((t) => tables.includes(t));
  if (!present.length) continue;
  out += `## ${title}\n\n\`\`\`mermaid\nerDiagram\n`;
  for (const table of present) {
    out += `  ${table} {\n`;
    for (const { column, type, nullable } of (columns[table] ?? []).slice(0, 12)) {
      out += `    ${shortType(type)} ${column}${nullable === 'NO' ? ' "NOT NULL"' : ''}\n`;
    }
    if ((columns[table] ?? []).length > 12) out += `    text ellipsis "ещё ${columns[table].length - 12} колонок"\n`;
    out += '  }\n';
  }
  for (const [from, column, to] of fks) {
    if (present.includes(from) && present.includes(to) && from !== to) {
      out += `  ${to} ||--o{ ${from} : "${column}"\n`;
    }
  }
  out += '```\n\n';
}

out += `## Связи между группами\n\n\`\`\`mermaid\nerDiagram\n`;
const groupOf = new Map();
for (const [title, list] of GROUPS) for (const t of list) groupOf.set(t, title);
const crossSeen = new Set();
for (const [from, , to] of fks) {
  const a = groupOf.get(from);
  const b = groupOf.get(to);
  if (!a || !b || a === b) continue;
  const key = `${b}->${a}`;
  if (crossSeen.has(key)) continue;
  crossSeen.add(key);
  out += `  ${b.replace(/[^\p{L}]/gu, '_')} ||--o{ ${a.replace(/[^\p{L}]/gu, '_')} : ссылается\n`;
}
out += '```\n';

writeFileSync('docs/qadam/ERD.md', out, 'utf8');
process.stdout.write(`docs/qadam/ERD.md written: ${tables.length} tables, ${fks.length} foreign keys\n`);
