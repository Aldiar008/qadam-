import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';

// The verifier is deliberately dependency-free so it can be exercised here
// rather than only in a browser inside Telegram. `server-only` would make that
// impossible, which is why this module does not import it.
import { verifyInitData } from '../../lib/telegram/init-data.ts';
import { decodeSession, encodeSession } from '../../lib/telegram/session-token.ts';

const TOKEN = '8659654809:TEST-TOKEN-NOT-REAL';
const NOW = 1_800_000_000_000;

function signedInitData(overrides: Record<string, string> = {}, token = TOKEN): string {
  const fields: Record<string, string> = {
    auth_date: String(Math.floor(NOW / 1000)),
    query_id: 'AAH-test',
    user: JSON.stringify({ id: 4242, first_name: 'Айбек', username: 'aibek' }),
    ...overrides,
  };
  const pairs = Object.entries(fields).map(([key, value]) => `${key}=${value}`).sort();
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', secret).update(pairs.join('\n')).digest('hex');
  const params = new URLSearchParams(fields);
  params.set('hash', hash);
  return params.toString();
}

test('a blob signed with this bot token is accepted', () => {
  const result = verifyInitData(signedInitData(), TOKEN, NOW);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.userId, '4242');
  assert.equal(result.data.firstName, 'Айбек');
});

test('a blob signed with another bot token is refused', () => {
  const result = verifyInitData(signedInitData({}, 'someone-elses-token'), TOKEN, NOW);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, 'bad_signature');
});

test('editing a single field invalidates the signature', () => {
  const original = signedInitData();
  // Swap the user id for somebody else's — the exact attack this check exists
  // to stop, since the user id is what resolves to a loyalty card.
  const tampered = original.replace(encodeURIComponent('"id":4242'), encodeURIComponent('"id":9999'));
  assert.notEqual(tampered, original);
  const result = verifyInitData(tampered, TOKEN, NOW);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, 'bad_signature');
});

test('a valid but stale blob is refused', () => {
  const result = verifyInitData(signedInitData(), TOKEN, NOW + 25 * 60 * 60 * 1000);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, 'expired');
});

test('a missing or malformed blob never reads as a valid guest', () => {
  for (const input of ['', 'hash=zzz', 'user=%7B%7D&hash=' + 'a'.repeat(64), 'auth_date=0&hash=' + 'a'.repeat(64)]) {
    const result = verifyInitData(input, TOKEN, NOW);
    assert.equal(result.ok, false, `"${input.slice(0, 24)}" must not verify`);
  }
});

test('no bot token is a refusal, not an open door', () => {
  const result = verifyInitData(signedInitData(), undefined, NOW);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, 'not_configured');
});

// ---------------------------------------------------------------------------
// The session cookie that stands in for a guest login
// ---------------------------------------------------------------------------

test('a session survives a round trip and refuses a forged one', () => {
  const session = {
    chatId: '4242', businessId: '10000000-0000-4000-8000-000000000001',
    customerId: '20000000-0000-4000-8000-000000000002', ownerUserId: null,
    name: 'Айбек', expiresAt: NOW + 60_000,
  };

  const cookie = encodeSession(session, TOKEN);
  assert.deepEqual(decodeSession(cookie, TOKEN, NOW), session);

  // Same payload, different secret: the whole point of signing it.
  assert.equal(decodeSession(cookie, 'another-token', NOW), null);

  // Editing the payload to point at another customer must not survive.
  const [payload, signature] = cookie.split('.');
  const swapped = Buffer.from(
    Buffer.from(payload, 'base64url').toString('utf8').replace(session.customerId, '30000000-0000-4000-8000-000000000003'),
    'utf8',
  ).toString('base64url');
  assert.equal(decodeSession(`${swapped}.${signature}`, TOKEN, NOW), null);
});

test('an expired session is not a session', () => {
  const cookie = encodeSession({
    chatId: '4242', businessId: '10000000-0000-4000-8000-000000000001',
    customerId: null, ownerUserId: 'linked', name: 'Айбек', expiresAt: NOW - 1,
  }, TOKEN);
  assert.equal(decodeSession(cookie, TOKEN, NOW), null);
});

test('rubbish in the cookie jar is ignored quietly', () => {
  for (const value of [undefined, '', 'not-a-cookie', 'a.b', 'x'.repeat(500)]) {
    assert.equal(decodeSession(value, TOKEN, NOW), null);
  }
});
