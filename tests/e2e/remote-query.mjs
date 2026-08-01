#!/usr/bin/env node
/**
 * One SQL read against a remote Supabase project, printed the way
 * `psql -A -t` prints it: no header, no padding, columns joined by `|`,
 * null rendered as empty.
 *
 * The harness runs its database assertions synchronously, and there is no
 * synchronous HTTP in Node, so it shells out to this file rather than turning
 * every spec into async. That is the whole reason this exists as a script.
 *
 * Errors go to stderr with a non-zero exit so dbTry() can assert on them the
 * same way it asserts on a psql failure.
 */

const sql = process.argv[2];
const ref = process.env.QADAM_SUPABASE_PROJECT_REF;
const token = process.env.SUPABASE_ACCESS_TOKEN;

if (!ref || !token) {
  console.error('QADAM_SUPABASE_PROJECT_REF and SUPABASE_ACCESS_TOKEN are both required.');
  process.exit(2);
}

// A read that fails to connect is not an answer about the product, but it
// aborts the suite as if it were. Reaching the API is retried; a query the
// database actually rejected is not, because that is a real result.
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
      console.error(`could not reach the Management API after ${ATTEMPTS} attempts: ${error}`);
      process.exit(1);
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
  }
}

const raw = await response.text();
if (!response.ok) {
  console.error(raw);
  process.exit(1);
}

let rows;
try {
  rows = JSON.parse(raw);
} catch {
  console.error(`unexpected response: ${raw.slice(0, 300)}`);
  process.exit(1);
}
if (!Array.isArray(rows)) rows = [rows];

const render = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

console.log(rows.map((row) => Object.values(row).map(render).join('|')).join('\n'));
