import assert from 'node:assert/strict';
import test from 'node:test';

import { BRIEF_SCHEMA_VERSION, parseCustomerBrief, type CustomerBriefInput } from '../../ai/contract.ts';
import { composeDeterministicBrief } from '../../ai/deterministic.ts';
import { calculateGos, deriveGosInputs } from '../gos.ts';

const GUEST: CustomerBriefInput = {
  businessType: 'Кофейня',
  brandVoice: 'Дружелюбно, на «вы»',
  displayName: 'Гость 007',
  lifecycleStage: 'inactive',
  visits: 7,
  averageCheckMinor: 3200,
  totalSpentMinor: 22400,
  daysSinceLastVisit: 44,
  daysKnown: 120,
  frequencyPerMonth: 1.8,
  loyalty: { stamps: 3, points: 0 },
  consents: [{ scope: 'marketing.telegram', status: 'granted' }],
  campaignsIncluded: 2,
  favouriteItems: [],
  currency: 'KZT',
};

const brief = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: BRIEF_SCHEMA_VERSION,
  summary: 'Гость 007 заходил 7 раз со средним чеком 3200 KZT.',
  observations: ['Последний визит был 44 дней назад.', 'Согласие на рассылку действует.'],
  nextStep: 'Добавить в кампанию возврата.',
  cautions: [],
  ...overrides,
});

// ---------------------------------------------------------------------------
// A brief may retell the guest's own figures and may not invent new ones
// ---------------------------------------------------------------------------

test('a brief that only retells the guest own figures is accepted', () => {
  const parsed = parseCustomerBrief(brief(), GUEST);
  assert.equal(parsed.observations.length, 2);
  assert.match(parsed.summary, /3200/);
});

test('a brief that invents a number is rejected, not shown with a disclaimer', () => {
  assert.throws(
    () => parseCustomerBrief(brief({ summary: 'Гость принесёт ещё 45000 KZT в следующем месяце.' }), GUEST),
    /45000/,
    'a figure absent from the guest data must fail the parse',
  );
  assert.throws(
    () => parseCustomerBrief(brief({ nextStep: 'Дать скидку 25 процентов.' }), GUEST),
    /25/,
  );
});

test('the number rule tolerates the guest own figures wherever they appear', () => {
  const parsed = parseCustomerBrief(brief({
    observations: ['Визитов 7, из них оплаченных 7.', 'На карте 3 штампа.'],
  }), GUEST);
  assert.equal(parsed.observations.length, 2);
});

test('a brief must carry between two and four observations', () => {
  assert.throws(() => parseCustomerBrief(brief({ observations: ['одно'] }), GUEST), /between 2 and 4/);
  assert.throws(
    () => parseCustomerBrief(brief({ observations: ['a', 'b', 'c', 'd', 'e'] }), GUEST),
    /between 2 and 4/,
  );
});

test('the deterministic brief validates against the same schema as a model answer', () => {
  const fallback = composeDeterministicBrief(GUEST);
  const reparsed = parseCustomerBrief(JSON.parse(JSON.stringify(fallback)), GUEST);
  assert.equal(reparsed.schemaVersion, BRIEF_SCHEMA_VERSION);
  assert.ok(reparsed.nextStep.length > 0);
});

test('the deterministic brief says what is missing instead of guessing', () => {
  const unknown = composeDeterministicBrief({ ...GUEST, visits: 0, totalSpentMinor: 0, averageCheckMinor: 0, daysSinceLastVisit: null, loyalty: null, consents: [] });
  const text = [unknown.summary, ...unknown.observations, unknown.nextStep].join(' ');
  assert.match(text, /не записан|неизвестна|нет/i);
  // Consent absent means the guest cannot be messaged, and the next step says so.
  assert.match(unknown.nextStep, /согласи/i);
});

// ---------------------------------------------------------------------------
// GOS varies with the business it scores
// ---------------------------------------------------------------------------

const FACTS = {
  signalChangeBps: -2700,
  signalConfidence: 80,
  segmentSize: 64,
  consentEligible: 18,
  contributionMargin: 0.58,
  inactiveShare: 0.36,
  consentShare: 0.1,
  dataQuality: 0.9,
  budgetMinor: 120_000,
  expectedCostMinor: 360,
  loyaltyShare: 0.35,
};

test('two businesses with different data cannot score the same', () => {
  const strong = deriveGosInputs(FACTS);
  const weak = deriveGosInputs({
    ...FACTS,
    signalChangeBps: -300,
    signalConfidence: 30,
    consentEligible: 2,
    contributionMargin: 0.12,
    dataQuality: 0.2,
    loyaltyShare: 0,
  });

  const guards = { expectedIncrementalContributionMinor: 10_000, hasConsent: true, withinLimits: true };
  const strongScore = calculateGos(strong, guards).score;
  const weakScore = calculateGos(weak, guards).score;
  assert.ok(strongScore > weakScore, `${strongScore} must beat ${weakScore}`);
});

test('every derived component stays inside the unit interval', () => {
  const extreme = deriveGosInputs({
    ...FACTS,
    signalChangeBps: -99_999,
    consentEligible: 1_000,
    segmentSize: 10,
    contributionMargin: 4,
    inactiveShare: 3,
    dataQuality: -1,
  });
  for (const [key, value] of Object.entries(extreme)) {
    assert.ok(value >= 0 && value <= 1, `${key} = ${value} is outside 0..1`);
  }
});

test('no signal is scored as uncertain rather than as a strong opportunity', () => {
  const blind = deriveGosInputs({ ...FACTS, signalChangeBps: null, signalConfidence: null });
  assert.ok(blind.P < 0.5 && blind.S < 0.5);
});

test('a guard still blocks a high score', () => {
  const result = calculateGos(deriveGosInputs(FACTS), {
    expectedIncrementalContributionMinor: -1,
    hasConsent: true,
    withinLimits: true,
  });
  assert.equal(result.status, 'blocked');
  assert.ok(result.blockedReasons.includes('non_positive_contribution'));
});
