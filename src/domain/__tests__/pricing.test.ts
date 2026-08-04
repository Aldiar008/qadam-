import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { PUBLIC_PLANS, formatTenge } from '../pricing.ts';

const MIGRATION = 'supabase/migrations/20260804070000_the_price_list_matches_the_offer.sql';

test('the published price list is the agreed one', () => {
  assert.deepEqual(
    PUBLIC_PLANS.map((plan) => [plan.code, plan.priceMinor]),
    [['standard', 9900], ['growth', 59900], ['pro', 99000]],
  );
});

test('exactly one plan is marked as the popular choice', () => {
  assert.equal(PUBLIC_PLANS.filter((plan) => plan.popular).length, 1);
});

test('every plan says something in both languages', () => {
  for (const plan of PUBLIC_PLANS) {
    assert.ok(plan.descRu.length > 10, `${plan.code} has no Russian description`);
    assert.ok(plan.descKk.length > 10, `${plan.code} has no Kazakh description`);
    assert.equal(plan.featuresRu.length, plan.featuresKk.length, `${plan.code} lists a different number of features per language`);
  }
});

/**
 * The storefront and the server used to disagree by tens of thousands of tenge
 * because each kept its own copy of the price. They still live in two places —
 * a TypeScript module and a SQL migration — so this test reads the migration
 * and refuses to let them drift again.
 */
test('the database migration writes the same prices as the storefront', () => {
  // Matched per statement, not across the whole file: a pattern that may span
  // statements happily reads one plan's price and another plan's code.
  const statements = readFileSync(MIGRATION, 'utf8').split(';');
  for (const plan of PUBLIC_PLANS) {
    const statement = statements.find((item) => item.includes(`price_minor`) && item.includes(`where code = '${plan.code}'`));
    assert.ok(statement, `migration sets no price for ${plan.code}`);
    const found = statement.match(/price_minor\s*=\s*(\d+)/);
    assert.ok(found, `migration statement for ${plan.code} has no numeric price`);
    assert.equal(Number(found[1]), plan.priceMinor, `migration and storefront disagree on ${plan.code}`);
  }
});

test('prices are formatted the way Kazakhstan writes them', () => {
  // Intl groups thousands with a non-breaking space, which is what we want on
  // screen and not what a literal in a test file contains.
  const plain = (value: number) => formatTenge(value).replace(/[  ]/g, ' ');
  assert.equal(plain(9900), '9 900 ₸');
  assert.equal(plain(99000), '99 000 ₸');
});
