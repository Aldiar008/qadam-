import assert from 'node:assert/strict';
import test from 'node:test';

import { REPLY_SCHEMA_VERSION, parseGuestReply } from '../../ai/contract.ts';

/**
 * A wrong price quoted by the venue's own bot is worse than no answer: the
 * guest turns up expecting it. These are the checks that stop that.
 */

const FACTS = new Set(['700', '900', '1400', '5', '08', '8', '22', '0800', '2200', '3']);

const reply = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: REPLY_SCHEMA_VERSION,
  reply: 'Капучино стоит 1400 ₸, эспрессо — 700 ₸.',
  usedFacts: ['меню'],
  needsHuman: false,
  ...overrides,
});

test('an answer built from the venue own prices is accepted', () => {
  const parsed = parseGuestReply(reply(), FACTS);
  assert.equal(parsed.needsHuman, false);
  assert.match(parsed.reply, /1400/);
});

test('a price the venue never set is refused', () => {
  assert.throws(
    () => parseGuestReply(reply({ reply: 'Латте у нас 1250 ₸.' }), FACTS),
    /1250/,
    'a figure absent from the facts must fail the parse',
  );
});

test('an invented discount is refused', () => {
  assert.throws(
    () => parseGuestReply(reply({ reply: 'Сегодня скидка 30 процентов на всё.' }), FACTS),
    /30/,
  );
});

test('an invented opening hour is refused', () => {
  assert.throws(
    () => parseGuestReply(reply({ reply: 'Работаем до 23:00.' }), FACTS),
    /23/,
  );
});

test('"I will ask a colleague" is a valid answer, not a failure', () => {
  const parsed = parseGuestReply(reply({
    reply: 'Такого у нас не указано — уточню у коллег и вернусь.',
    usedFacts: [],
    needsHuman: true,
  }), FACTS);
  assert.equal(parsed.needsHuman, true);
});

test('a foreign schema version is refused', () => {
  assert.throws(() => parseGuestReply(reply({ schemaVersion: 'other.v2' }), FACTS), /schemaVersion must be/);
});

test('an empty or oversized answer is refused', () => {
  assert.throws(() => parseGuestReply(reply({ reply: '' }), FACTS), /must not be empty/);
  assert.throws(() => parseGuestReply(reply({ reply: 'а'.repeat(1000) }), FACTS), /at most/);
});

// ---------------------------------------------------------------------------
// Times are numbers too, and the first live answer was rejected over one
// ---------------------------------------------------------------------------

test('an opening time survives the number check in every shape it is written', () => {
  // «22:00» reads to the scanner as «22» and «00»; a set that only knew «22»
  // rejected a correct answer and fell back to the template.
  const withTimes = new Set([...FACTS, '00', '0']);
  const parsed = parseGuestReply(reply({
    reply: 'Работаем с 8 до 22:00, капучино — 1400 ₸.',
    usedFacts: ['часы работы', 'меню'],
  }), withTimes);
  assert.match(parsed.reply, /22:00/);
});
