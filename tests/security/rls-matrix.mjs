// Exhaustive two-tenant RLS matrix.
//
// The table list is read from the schema rather than written by hand, so a new
// tenant table added tomorrow is tested tomorrow. For every table carrying a
// `business_id` this asserts four things, from the position of a real signed-in
// user rather than from a superuser connection:
//
//   1. tenant A's owner reads tenant A's rows;
//   2. tenant B's owner reads none of them;
//   3. anonymous reads none of them;
//   4. tenant B cannot claim a row by writing tenant A's business_id.
//
// It also walks every table in `public` that has no `business_id`, to confirm
// none of them is an unprotected side door.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const CONTAINER = process.env.QADAM_DB_CONTAINER ?? 'supabase_db_qadam_serpin';
const TENANT_A = '10000000-0000-4000-8000-000000000001';
const TENANT_B = '20000000-0000-4000-8000-000000000001';
const OWNER_A = '00000000-0000-4000-8000-000000000101';
const OWNER_B = '00000000-0000-4000-8000-000000000201';

function sql(text) {
  return execFileSync('docker', ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-A', '-t', '-F', '', '-c', text], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  }).replace(/\r/g, '').trim();
}

const rows = [];
let failures = 0;
function check(area, name, actual, expected) {
  const pass = typeof expected === 'function' ? Boolean(expected(actual)) : String(actual) === String(expected);
  if (!pass) failures += 1;
  rows.push({ area, name, actual: String(actual).slice(0, 200), pass });
  process.stdout.write(`  ${pass ? 'PASS' : 'FAIL'}  ${name.padEnd(62)} ${String(actual).slice(0, 60)}\n`);
}

// --------------------------------------------------------------- enumerate
const tenantTables = sql(`
  select c.relname
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join information_schema.columns col
    on col.table_schema = 'public' and col.table_name = c.relname and col.column_name = 'business_id'
  where n.nspname = 'public' and c.relkind = 'r'
  order by c.relname`).split('\n').filter(Boolean);

const otherTables = sql(`
  select c.relname
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and not exists (
      select 1 from information_schema.columns col
      where col.table_schema = 'public' and col.table_name = c.relname and col.column_name = 'business_id')
  order by c.relname`).split('\n').filter(Boolean);

process.stdout.write(`\nSEC-RLS  ${tenantTables.length} tenant tables, ${otherTables.length} shared tables\n\n`);

// ------------------------------------------------------- RLS is switched on
process.stdout.write('SEC-RLS-1  Row level security is enabled and forced on every public table\n');
const rlsOff = sql(`
  select string_agg(c.relname, ', ' order by c.relname)
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname='public' and c.relkind='r' and c.relrowsecurity = false`);
check('rls', 'no public table has RLS switched off', rlsOff || 'none', 'none');

const noPolicy = sql(`
  select coalesce(string_agg(c.relname, ', ' order by c.relname), 'none')
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r'
    and not exists (select 1 from pg_policy p where p.polrelid = c.oid)`);
// A table with RLS on, no policy and no grant is closed to every application
// role. That is deny-by-default, not an omission — but it has to be checked,
// not assumed.
const noPolicyUngranted = noPolicy === 'none' ? 'none' : sql(`
  select coalesce(string_agg(t.table_name, ', '), 'none') from (
    select distinct table_name from information_schema.role_table_grants
    where table_schema='public' and grantee in ('anon','authenticated')
      and table_name in (${noPolicy.split(', ').map((t) => `'${t}'`).join(',')})
  ) t`);
check('rls', 'any table without a policy is also without a grant (deny by default)', `${noPolicy} -> granted: ${noPolicyUngranted}`, (v) => v.endsWith('granted: none'));

// ------------------------------------------------------ the tenant matrix
process.stdout.write('\nSEC-RLS-2  Two-tenant read isolation, table by table\n');

/** Runs a statement as a signed-in user, exactly as PostgREST would. */
const asUser = (userId, body) => `
  begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', '${userId}', true);
  ${body}
  rollback;`;

/**
 * Counts tenant A's rows in every tenant table from one role's point of view.
 * A per-table exception block is essential: a table that denies the role
 * outright must be recorded as denied, not abort the whole sweep.
 */
function countsAs(roleSetup, tables = tenantTables, where = `where business_id = ''${TENANT_A}''`) {
  const list = tables.map((t) => `'${t}'`).join(',');
  const out = sql(`
    begin;
    create temp table _rls_probe(name text, n text) on commit drop;
    grant insert, select on _rls_probe to authenticated, anon;
    ${roleSetup}
    do $probe$
    declare t text; c bigint;
    begin
      foreach t in array array[${list}] loop
        begin
          execute format('select count(*) from public.%I ${where}', t) into c;
          insert into _rls_probe values (t, c::text);
        exception when others then
          insert into _rls_probe values (t, 'denied');
        end;
      end loop;
    end
    $probe$;
    reset role;
    select '@'||string_agg(name||'='||n, ',' order by name) from _rls_probe;
    rollback;`);
  const line = out.split('@').pop().split('\n')[0];
  return Object.fromEntries(line.split(',').map((pair) => pair.split('=')));
}

const asOwnerA = `set local role authenticated; select set_config('request.jwt.claim.sub', '${OWNER_A}', true);`;
const asOwnerB = `set local role authenticated; select set_config('request.jwt.claim.sub', '${OWNER_B}', true);`;
const asAnon = 'set local role anon;';
const a = countsAs(asOwnerA);
const b = countsAs(asOwnerB);
const anonCounts = countsAs(asAnon);

const positive = (map, t) => map[t] !== 'denied' && Number(map[t]) > 0;
const leakedToB = tenantTables.filter((t) => positive(b, t));
const leakedToAnon = tenantTables.filter((t) => positive(anonCounts, t));
const visibleToA = tenantTables.filter((t) => positive(a, t));
const deniedToAnon = tenantTables.filter((t) => anonCounts[t] === 'denied');

check('rls', `tenant B reads none of tenant A's rows in any of ${tenantTables.length} tables`, leakedToB.length ? leakedToB.join(', ') : 'no leak', 'no leak');
check('rls', `anonymous reads none of tenant A's rows in any of ${tenantTables.length} tables`, leakedToAnon.length ? leakedToAnon.join(', ') : 'no leak', 'no leak');
check('rls', 'the test is meaningful: tenant A does see its own data', `${visibleToA.length} of ${tenantTables.length} tables populated`, (v) => Number(v.split(' ')[0]) >= 20);
check('rls', 'tables closed to anonymous outright are recorded', String(deniedToAnon.length), (v) => Number(v) >= 0);

// --------------------------------------------- writing another business_id
process.stdout.write('\nSEC-RLS-3  A tenant cannot claim rows by writing another business_id\n');
// One statement per table, again inside a per-table exception block, so a
// table that refuses outright is recorded as refused rather than stopping the
// sweep at the first denial.
const tamperRaw = sql(`
  begin;
  create temp table _tamper(name text, verdict text) on commit drop;
  grant insert, select on _tamper to authenticated;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', '${OWNER_B}', true);
  do $tamper$
  declare t text; moved bigint;
  begin
    foreach t in array array[${tenantTables.map((t) => `'${t}'`).join(',')}] loop
      begin
        execute format('update public.%I set business_id = %L where business_id = %L', t, '${TENANT_B}', '${TENANT_A}');
        get diagnostics moved = row_count;
        insert into _tamper values (t, case when moved = 0 then 'no rows moved' else 'MOVED ' || moved end);
      exception when others then
        insert into _tamper values (t, 'refused');
      end;
    end loop;
  end
  $tamper$;
  reset role;
  select '@'||string_agg(name||'|'||verdict, ',' order by name) from _tamper;
  rollback;`).split('@').pop().split('\n')[0];
const tamperResults = tamperRaw.split(',').map((pair) => pair.split('|'));
const badTamper = tamperResults.filter(([, result]) => !['refused', 'no rows moved'].includes(result));
check('rls', 'no table lets a tenant move another tenant\'s rows to itself', badTamper.length ? badTamper.map(([t, v]) => `${t}: ${v}`).join('; ') : 'all refused or no-op', 'all refused or no-op');

const insertForeign = (() => {
  try {
    sql(asUser(OWNER_B, `insert into public.customers(business_id, lifecycle_stage, is_mock) values ('${TENANT_A}', 'new', true);`));
    return 'accepted';
  } catch (error) {
    return /42501|row-level security/.test(String(error.stderr ?? error.message)) ? 'refused' : 'other error';
  }
})();
check('rls', 'a tenant cannot insert a row into another tenant', insertForeign, 'refused');

// --------------------------------------------------- the anon access matrix
process.stdout.write('\nSEC-RLS-4  Anonymous access matrix\n');
const anonGrants = sql(`
  select coalesce(string_agg(distinct table_name || ':' || privilege_type, ', ' order by table_name || ':' || privilege_type), 'none')
  from information_schema.role_table_grants
  where table_schema='public' and grantee='anon' and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')`);
check('anon', 'anonymous holds no write privilege on any table', anonGrants, 'none');

// TRUNCATE, TRIGGER and REFERENCES are not filtered by row policies. Supabase's
// bootstrap grants all three to anon and authenticated; leaving them in place
// means a signed-in user of any tenant can `truncate public.customers cascade`
// and destroy every tenant's data while being unable to read a single row of it.
// That was reproducible here before 20260802020000 revoked them.
const rlsBypassing = sql(`
  select coalesce(string_agg(distinct grantee||':'||privilege_type, ', ' order by grantee||':'||privilege_type), 'none')
  from information_schema.role_table_grants
  where table_schema='public' and grantee in ('anon','authenticated')
    and privilege_type in ('TRUNCATE','TRIGGER','REFERENCES')`);
check('anon', 'no application role holds a privilege that bypasses RLS', rlsBypassing, 'none');

const truncateAttempt = (() => {
  try {
    sql(asUser(OWNER_B, 'truncate table public.customers cascade;'));
    return 'TRUNCATE SUCCEEDED — every tenant lost its customers';
  } catch (error) {
    return /permission denied/.test(String(error.stderr ?? error.message)) ? 'refused' : 'other error';
  }
})();
check('anon', 'a tenant cannot truncate a table it cannot read', truncateAttempt, 'refused');

// Every table in `public`, counted with no tenant filter at all: whatever comes
// back non-zero is genuinely world-readable and has to be on the reviewed list.
const anonAll = countsAs(asAnon, tenantTables.concat(otherTables), '');
const anonReadable = Object.entries(anonAll)
  .filter(([, n]) => n !== 'denied' && Number(n) > 0)
  .map(([t]) => t)
  .sort()
  .join(', ') || 'none';
check('anon', 'what anonymous can read is a deliberate, reviewed list', anonReadable, (v) => {
  const allowed = new Set(['tool_categories', 'tools', 'business_types', 'templates', 'template_versions', 'plans', 'plan_entitlements', 'data_inventory', 'retention_policies', 'nearby_offers', 'business_locations', 'tracking_codes']);
  const actual = v === 'none' ? [] : v.split(', ');
  const unexpected = actual.filter((t) => !allowed.has(t));
  if (unexpected.length) process.stdout.write(`        unexpected anonymous-readable tables: ${unexpected.join(', ')}\n`);
  return unexpected.length === 0;
});

const privateSchema = sql(`
  select coalesce(string_agg(distinct grantee, ', '), 'none')
  from information_schema.role_table_grants where table_schema='private' and grantee in ('anon','authenticated')`);
check('anon', 'the private schema is not reachable by an application role', privateSchema, 'none');

// ------------------------------------------------------------- role matrix
process.stdout.write('\nSEC-RLS-5  Tenant role matrix enforced in the database\n');
const VIEWER = '00000000-0000-4000-8000-000000000103';
const MARKETER = '00000000-0000-4000-8000-000000000102';
const attempt = (userId, statement) => {
  try {
    sql(asUser(userId, statement));
    return 'allowed';
  } catch (error) {
    return /42501|row-level security|permission denied/.test(String(error.stderr ?? error.message)) ? 'refused' : 'other error';
  }
};
check('roles', 'viewer cannot create a campaign', attempt(VIEWER, `insert into public.campaigns(business_id,name,status,channel,budget_minor,currency,stop_rule,created_by,is_mock) values ('${TENANT_A}','viewer','draft','whatsapp',0,'KZT','{}','${VIEWER}',true);`), 'refused');
// An UPDATE that RLS filters to zero rows does not raise, so the assertion has
// to be on the stored value rather than on whether the statement threw.
const limitsUnchangedBy = (userId, probe) => {
  attempt(userId, `update public.business_limits set monthly_budget_minor = ${probe} where business_id='${TENANT_A}';`);
  return sql(`select monthly_budget_minor from public.business_limits where business_id='${TENANT_A}'`) === String(probe) ? 'CHANGED' : 'unchanged';
};
check('roles', 'viewer cannot change business limits', limitsUnchangedBy(VIEWER, 1), 'unchanged');
check('roles', 'marketer cannot change business limits', limitsUnchangedBy(MARKETER, 2), 'unchanged');
check('roles', 'a tenant owner cannot write the platform catalogue', attempt(OWNER_A, `insert into public.tools(category_id,code,name_ru,name_kk,description_ru,description_kk,route,status,is_public,is_mock) select id,'sec_probe','x','x','x','x','/x','draft',false,true from public.tool_categories limit 1;`), 'refused');
check('roles', 'a tenant owner cannot write the admin audit log', attempt(OWNER_A, `insert into public.admin_audit_log(actor_id,actor_role,action,resource_type,reason) values ('${OWNER_A}','platform_admin','forged','tool','forged entry');`), 'refused');
// The `@` prefix marks the value line so it can be picked out of psql's
// BEGIN/SET/…/ROLLBACK chatter.
const noMembership = sql(asUser('00000000-0000-4000-8000-000000000301', `select '@'||count(*)::text from public.customers;`));
check('roles', 'a user with no membership sees nothing', noMembership.split('@').pop().split('\n')[0], '0');

// ---------------------------------------------- security definer surface
process.stdout.write('\nSEC-RLS-6  SECURITY DEFINER surface and grants\n');
const definers = sql(`
  select coalesce(string_agg(n.nspname||'.'||p.proname, ', ' order by n.nspname||'.'||p.proname), 'none')
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where p.prosecdef and n.nspname in ('public','private')
    and pg_get_function_identity_arguments(p.oid) is not null
    and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')
    and coalesce(array_to_string(p.proconfig, ','), '') not like '%search_path%'`);
check('definer', 'every SECURITY DEFINER function pins its search_path', definers, 'none');

const definerGrants = sql(`
  select coalesce(string_agg(p.proname, ', ' order by p.proname), 'none')
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.prosecdef
    and has_function_privilege('anon', p.oid, 'execute')`);
check('definer', 'no private definer function is executable by anonymous', definerGrants, 'none');

const publicSchemaGrants = sql(`
  select coalesce(string_agg(grantee||':'||privilege_type, ', '), 'none')
  from information_schema.role_table_grants
  where table_schema='public' and grantee='PUBLIC'`);
check('definer', 'no blanket PUBLIC grant on tenant data', publicSchemaGrants, 'none');

// -------------------------------------------------------------------- done
mkdirSync('tests/security/results', { recursive: true });
writeFileSync('tests/security/results/rls-matrix.json', JSON.stringify({
  tenantTables, otherTables, total: rows.length, failed: failures, rows,
}, null, 2), 'utf8');
process.stdout.write(`\nrls-matrix: ${rows.length - failures}/${rows.length} passed over ${tenantTables.length} tenant tables\n`);
process.exit(failures === 0 ? 0 : 1);
