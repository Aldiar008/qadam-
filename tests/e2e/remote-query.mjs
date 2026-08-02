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
// Six attempts backing off to half a minute in total. Four attempts spaced
// half a second apart covered a dropped packet and nothing else: a connection
// that is out for twenty seconds — which this network does — aborted a suite
// mid-run and read as a product failure.
//
// A refusal by the API itself is retried on the same terms as a dropped
// connection. It used to be reported straight through, so a rate-limited read —
// this suite makes hundreds in a row — aborted the run and was written down as
// «the product failed», which is precisely the confusion this retry exists to
// prevent. A query the database rejected still comes back at once: that is a
// real answer about the product.
//
// Failure sets the exit code and stops rather than calling process.exit: with a
// request still in flight, an immediate exit crashes libuv on Windows and
// replaces the explanation with an assertion dump.
const fail = (message) => {
  console.error(message);
  process.exitCode = 1;
};

const ATTEMPTS = 6;
const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
      fail(`could not reach the Management API after ${ATTEMPTS} attempts: ${error}`);
      break;
    }
    await wait(1000 * attempt * attempt);
    continue;
  }

  const body = await response.text();
  if (response.ok) {
    raw = body;
    break;
  }
  if (!RETRYABLE.has(response.status) || last) {
    fail(`Management API answered ${response.status}: ${body}`);
    break;
  }
  // Honour the server's own pacing when it offers one.
  const after = Number(response.headers.get('retry-after'));
  await wait(Number.isFinite(after) && after > 0 ? after * 1000 : 1000 * attempt * attempt);
}

if (raw !== null) {
  let rows;
  try {
    rows = JSON.parse(raw);
  } catch {
    fail(`unexpected response: ${raw.slice(0, 300)}`);
    rows = null;
  }
  if (rows !== null) {
    if (!Array.isArray(rows)) rows = [rows];
    const render = (value) => {
      if (value === null || value === undefined) return '';
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value);
    };
    console.log(rows.map((row) => Object.values(row).map(render).join('|')).join('\n'));
  }
}
