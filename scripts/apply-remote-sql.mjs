#!/usr/bin/env node
/**
 * Runs one SQL file against a remote Supabase project over the Management API.
 *
 * `supabase db push` covers migrations and nothing else, so anything that is
 * deliberately not a migration — the demo seed, a one-off check from the
 * runbook — otherwise needs psql, which is not installed on every machine that
 * has to run this.
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/apply-remote-sql.mjs <project-ref> <file.sql>
 *
 * The token is read from the environment and never printed. The ref is passed
 * explicitly and echoed back before anything runs, because a runbook step that
 * does not name its target is how the wrong database gets written to.
 */

import { readFileSync } from 'node:fs';

const [ref, file] = process.argv.slice(2);
const token = process.env.SUPABASE_ACCESS_TOKEN;

if (!ref || !file) {
  console.error('Usage: node scripts/apply-remote-sql.mjs <project-ref> <file.sql>');
  process.exit(2);
}
if (!token) {
  console.error('SUPABASE_ACCESS_TOKEN is not set. Refusing to guess credentials.');
  process.exit(2);
}

const sql = readFileSync(file, 'utf8');
console.log(`Target project : ${ref}`);
console.log(`SQL file       : ${file} (${sql.length} bytes)`);

// Failing to reach the API is not a decision the database made, and this tool
// is used in sequences — a reset followed by a seed — where losing the second
// step leaves the environment empty. Connection failures are retried; a query
// the database rejected is reported as-is below, never retried.
const ATTEMPTS = 4;
let response;
for (let attempt = 1; ; attempt += 1) {
  try {
    response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ query: sql }),
    });
    break;
  } catch (error) {
    if (attempt === ATTEMPTS) {
      console.error(`FAIL: could not reach the Management API after ${ATTEMPTS} attempts: ${error}`);
      process.exit(1);
    }
    console.error(`  retrying (${attempt}/${ATTEMPTS - 1}) after a connection failure…`);
    await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
  }
}

const raw = await response.text();
if (!response.ok) {
  console.error(`FAIL: HTTP ${response.status}`);
  console.error(raw.slice(0, 2000));
  process.exit(1);
}

// A guarded seed reports refusal by raising, which surfaces here as a non-2xx
// above. A 2xx with a body is the normal path; the body is usually [].
console.log(`PASS: applied. Response: ${raw.slice(0, 300)}`);
