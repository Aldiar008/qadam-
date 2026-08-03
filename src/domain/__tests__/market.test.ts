import assert from 'node:assert/strict';
import test from 'node:test';

import { packSizeFromTitle, parseKaspiPayload, summariseVacancies } from '../../connectors/market.ts';

/**
 * Взято из настоящего ответа Kaspi, а не придумано.
 *
 * A fixture invented from the docs tests the parser against the shape we hoped
 * for. This one is trimmed from a real response to a real search, which is the
 * only version that can catch a field that is not where it was expected.
 */
const KASPI_RESPONSE = {
  data: [
    {
      id: '134636061',
      title: 'Стакан бумажный однослойный, черный, 250 мл, 1000 шт',
      brand: 'Без бренда',
      shopLink: '/p/stakan-bumazhnyi-odnosloinyi-chernyi-250-ml-1000-sht-134636061/?c=750000000',
      unitPrice: 14500,
      unitSalePrice: 14500,
      currency: 'KZT',
    },
    {
      id: '153869337',
      title: 'Aosen стакан Одноразовые бумажные стаканы 210ml, 50 штук белый 50 шт',
      shopLink: '/p/aosen-stakan-153869337/',
      unitPrice: 1290,
      unitSalePrice: 990,
      currency: 'KZT',
    },
  ],
  promotedCards: [],
};

test('parseKaspiPayload reads the real response and sorts by price per unit', () => {
  const offers = parseKaspiPayload(KASPI_RESPONSE);
  assert.equal(offers.length, 2);

  // 14 500 ₸ for 1000 is 14.5 per cup; 990 ₸ for 50 is 19.8. The bigger number
  // on the tag is the cheaper purchase, and that reordering is the feature.
  assert.equal(offers[0].externalId, '134636061');
  assert.equal(offers[0].packSize, 1000);
  assert.equal(offers[1].packSize, 50);
});

test('parseKaspiPayload takes the sale price, never the higher one', () => {
  const offers = parseKaspiPayload(KASPI_RESPONSE);
  const aosen = offers.find((offer) => offer.externalId === '153869337');
  assert.equal(aosen?.priceMinor, 990, 'the shelf price is not what the owner would pay');
});

test('parseKaspiPayload turns relative links into absolute kaspi.kz URLs', () => {
  const offers = parseKaspiPayload(KASPI_RESPONSE);
  assert.ok(offers.every((offer) => offer.url.startsWith('https://kaspi.kz/p/')));
});

test('parseKaspiPayload drops anything it cannot verify', () => {
  const offers = parseKaspiPayload({
    data: [
      { id: '1', title: 'Без цены', shopLink: '/p/a-1/' },
      { id: '2', title: 'Чужая ссылка', unitPrice: 100, shopLink: 'https://evil.example.com/p/1' },
      { id: '3', title: 'Другая валюта', unitPrice: 100, shopLink: '/p/c-3/', currency: 'USD' },
      { id: '4', title: '', unitPrice: 100, shopLink: '/p/d-4/' },
      { id: '5', title: 'Отрицательная цена', unitPrice: -5, shopLink: '/p/e-5/' },
    ],
  });
  assert.deepEqual(offers, [], 'a price without a source is exactly the invention this module forbids');
});

test('parseKaspiPayload survives a changed layout instead of throwing', () => {
  assert.deepEqual(parseKaspiPayload({ data: { cards: [] } }), []);
  assert.deepEqual(parseKaspiPayload({ nothing: true }), []);
  assert.deepEqual(parseKaspiPayload(null), []);
  assert.deepEqual(parseKaspiPayload('<html>are you a robot</html>'), []);
});

test('packSizeFromTitle only counts what the title actually says', () => {
  assert.equal(packSizeFromTitle('Стакан бумажный 250 мл, 1000 шт'), 1000);
  assert.equal(packSizeFromTitle('Стаканы 210ml, 50 штук белый'), 50);
  // No count written down means one listing, not a guess from the volume.
  assert.equal(packSizeFromTitle('Стакан бумажный 400 мл'), 1);
  assert.equal(packSizeFromTitle('Набор 99999 шт'), 1, 'an implausible count is not trusted');
});

test('summariseVacancies counts a posted range once, at its midpoint', () => {
  const snapshot = summariseVacancies(
    [
      { salary: { from: 200_000, to: 300_000, currency: 'KZT' } },
      { salary: { from: 250_000, to: null, currency: 'KZT' } },
      { salary: null },
      { salary: { from: 1_000, to: 2_000, currency: 'USD' } },
    ],
    { roleQuery: 'бариста', areaName: 'Алматы' },
  );

  assert.equal(snapshot.sampleSize, 2, 'a hidden salary and a foreign currency are not a sample');
  assert.equal(snapshot.scanned, 4, 'but they are counted as scanned, so the sample is not oversold');
  assert.equal(snapshot.medianMinor, 250_000);
});

test('summariseVacancies on an empty board reports nothing rather than zero', () => {
  const snapshot = summariseVacancies([{ salary: null }], { roleQuery: 'повар', areaName: 'Алматы' });
  assert.equal(snapshot.sampleSize, 0);
  assert.equal(snapshot.medianMinor, null, 'zero tenge is a wage, null is «неизвестно»');
});
