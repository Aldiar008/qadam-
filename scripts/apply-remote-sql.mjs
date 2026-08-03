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
const ATTEMPTS = 6;
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
// Some refusals are the database saying «try again», not «no». A deadlock is
// the clear case: the demo reset truncates sixty tables while the execution
// cycle runs every five minutes, and the two collide often enough that treating
// 40P01 as final left the stand un-restored for no reason at all.
const RETRYABLE_SQLSTATE = /\b(40P01|40001|55P03|57014|53300)\b/;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Failing with `process.exit` while a request is still in flight crashes libuv
// on Windows and replaces the explanation with an assertion dump — which is how
// this failure first presented itself.
const fail = (message) => {
  console.error(message);
  process.exitCode = 1;
};

let raw = null;
for (let attempt = 1; ; attempt += 1) {
  const last = attempt === ATTEMPTS;
  let response;
  try {
    response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ query: sql }),
    });
  } catch (error) {
    if (last) {
      fail(`FAIL: could not reach the Management API after ${ATTEMPTS} attempts: ${error}`);
      break;
    }
    console.error(`  повтор (${attempt}/${ATTEMPTS - 1}) после обрыва связи…`);
    await wait(1000 * attempt);
    continue;
  }

  const body = await response.text();
  if (response.ok) {
    raw = body;
    break;
  }
  if ((RETRYABLE_STATUS.has(response.status) || RETRYABLE_SQLSTATE.test(body)) && !last) {
    const why = RETRYABLE_SQLSTATE.test(body) ? 'база попросила повторить (дедлок или блокировка)' : `HTTP ${response.status}`;
    console.error(`  повтор (${attempt}/${ATTEMPTS - 1}): ${why}…`);
    await wait(Math.min(15_000, 2_000 * attempt));
    continue;
  }

  fail(`FAIL: HTTP ${response.status}\n${body.slice(0, 2000)}`);
  break;
}

// A guarded seed reports refusal by raising, which surfaces here as a non-2xx
// above. A 2xx with a body is the normal path; the body is usually [].
if (raw !== null) console.log(`PASS: applied. Response: ${raw.slice(0, 300)}`);
