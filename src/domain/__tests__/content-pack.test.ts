import assert from 'node:assert/strict';
import test from 'node:test';

import { CHANNEL_LIMITS, buildContentPack, checkPackCompleteness, type ContentPackInput } from '../../ai/content-pack.ts';
import { checkContentSafety } from '../../ai/redaction.ts';

const INPUT: ContentPackInput = {
  businessName: 'TAMYR Coffee',
  offerRu: 'круассан в подарок при заказе от 3 500 ₸',
  offerKk: '3 500 ₸-ден бастап тапсырысқа круассан сыйлыққа',
  briefRu: 'Вернуть спящих клиентов в тихие часы будней.',
  briefKk: 'Ұйықтап қалған клиенттерді тыныш сағаттарда қайтару.',
  channel: 'whatsapp',
  trackingCode: 'QDM-A1B2C3D4',
  quietWindow: '15:00–18:00',
  durationDays: 7,
};

test('one brief produces the full bilingual channel pack', () => {
  const assets = buildContentPack(INPUT);

  for (const locale of ['ru', 'kk'] as const) {
    assert.equal(assets.filter((a) => a.locale === locale && a.kind === 'post').length, 1, `${locale} main post`);
    assert.equal(assets.filter((a) => a.locale === locale && a.kind === 'short_post').length, 1, `${locale} short post`);
    assert.equal(assets.filter((a) => a.locale === locale && a.kind === 'story').length, 3, `${locale} three stories`);
    assert.equal(assets.filter((a) => a.locale === locale && a.kind === 'video_script').length, 1, `${locale} reels script`);
    assert.equal(assets.filter((a) => a.locale === locale && a.kind === 'direct_message').length, 1, `${locale} messenger text`);
  }
  assert.equal(assets.length, 14);
});

test('every asset has a CTA, alt text and stays inside its channel limit', () => {
  for (const asset of buildContentPack(INPUT)) {
    assert.ok(asset.cta.trim().length > 0, `${asset.locale}:${asset.kind} needs a CTA`);
    assert.ok(asset.altText.trim().length > 0, `${asset.locale}:${asset.kind} needs alt text`);
    assert.ok(asset.body.length <= CHANNEL_LIMITS[asset.kind], `${asset.locale}:${asset.kind} exceeds its channel limit`);
    assert.equal(checkContentSafety(asset.body).safe, true, `${asset.locale}:${asset.kind} must pass content safety`);
  }
});

test('the tracking code is printed so redemption can be attributed', () => {
  const assets = buildContentPack(INPUT);
  const carriers = assets.filter((asset) => asset.body.includes(INPUT.trackingCode));
  assert.ok(carriers.length >= 6, 'the code must appear in the assets a guest actually reads');
  assert.ok(carriers.some((asset) => asset.kind === 'direct_message'));
  assert.ok(carriers.some((asset) => asset.kind === 'post'));
});

test('RU and KK are distinct messages, not the same string', () => {
  const assets = buildContentPack(INPUT);
  for (const kind of ['post', 'short_post', 'video_script', 'direct_message'] as const) {
    const ru = assets.find((a) => a.kind === kind && a.locale === 'ru');
    const kk = assets.find((a) => a.kind === kind && a.locale === 'kk');
    assert.ok(ru && kk);
    assert.notEqual(ru!.body, kk!.body);
    assert.notEqual(ru!.cta, kk!.cta);
  }
});

test('the three stories do different jobs rather than repeating one line', () => {
  const stories = buildContentPack(INPUT).filter((asset) => asset.kind === 'story' && asset.locale === 'ru');
  assert.equal(stories.length, 3);
  assert.equal(new Set(stories.map((story) => story.body)).size, 3);
  assert.deepEqual(stories.map((story) => story.ordinal), [1, 2, 3]);
});

test('Kazakh copy is flagged for native review and Russian is not', () => {
  const assets = buildContentPack(INPUT);
  assert.ok(assets.filter((a) => a.locale === 'kk').every((a) => a.reviewStatus === 'native_review_required'));
  assert.ok(assets.filter((a) => a.locale === 'ru').every((a) => a.reviewStatus === 'auto_checked'));

  const report = checkPackCompleteness(assets, ['ru', 'kk']);
  assert.equal(report.complete, true);
  assert.deepEqual(report.nativeReviewRequired, ['kk']);
});

test('completeness reports exactly what is missing', () => {
  const assets = buildContentPack(INPUT).filter((asset) => !(asset.kind === 'story' && asset.locale === 'kk' && asset.ordinal === 3));
  const report = checkPackCompleteness(assets, ['ru', 'kk']);

  assert.equal(report.complete, false);
  assert.ok(report.missing.some((entry) => entry.includes('kk:story')));
});

test('the message a guest receives carries an opt-out', () => {
  const assets = buildContentPack(INPUT).filter((asset) => asset.kind === 'direct_message');
  assert.ok(assets.some((asset) => /стоп/i.test(asset.body)));
  assert.ok(assets.some((asset) => /тоқта/i.test(asset.body)));
});

test('the pack is stable for a given brief', () => {
  assert.deepEqual(buildContentPack(INPUT), buildContentPack(INPUT));
});
