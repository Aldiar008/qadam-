import assert from 'node:assert/strict';
import test from 'node:test';

import { profileSummary, recommendMechanics, recommendTools } from '../tool-recommendations.ts';

const CATALOGUE = [
  { code: 'winback', nameRu: 'Возврат спящих', route: '/app/customers?segment=inactive', active: false },
  { code: 'segments', nameRu: 'Сегменты клиентов', route: '/app/segments', active: false },
  { code: 'campaign_studio', nameRu: 'Студия кампаний', route: '/app/campaigns/studio', active: false },
  { code: 'automations', nameRu: 'Автоматизации', route: '/app/automations', active: false },
  { code: 'qr_loyalty', nameRu: 'QR-лояльность', route: '/app/loyalty', active: false },
  { code: 'content_studio', nameRu: 'Контент-студия', route: '/app/content', active: false },
];

test('цель определяет порядок, а не только состав', () => {
  const back = recommendTools({ businessType: 'cafe', goal: 'reactivate', tools: CATALOGUE });
  const attract = recommendTools({ businessType: 'cafe', goal: 'acquire', tools: CATALOGUE });
  assert.equal(back[0].code, 'winback');
  assert.equal(attract[0].code, 'qr_loyalty');
});

test('закреплённый инструмент не предлагается второй раз', () => {
  const withPinned = CATALOGUE.map((tool) => (tool.code === 'winback' ? { ...tool, active: true } : tool));
  const picked = recommendTools({ businessType: 'cafe', goal: 'reactivate', tools: withPinned });
  assert.ok(!picked.some((tool) => tool.code === 'winback'));
  assert.equal(picked[0].code, 'segments');
});

test('инструмент, снятый с публикации, не всплывает из подбора', () => {
  const withoutWinback = CATALOGUE.filter((tool) => tool.code !== 'winback');
  const picked = recommendTools({ businessType: 'cafe', goal: 'reactivate', tools: withoutWinback });
  assert.ok(picked.every((tool) => withoutWinback.some((row) => row.code === tool.code)));
});

test('причина зависит от типа заведения там, где это правда', () => {
  const cafe = recommendTools({ businessType: 'cafe', goal: 'reactivate', tools: CATALOGUE });
  const salon = recommendTools({ businessType: 'beauty', goal: 'reactivate', tools: CATALOGUE });
  const cafeWhy = cafe.find((tool) => tool.code === 'winback')?.reason ?? '';
  const salonWhy = salon.find((tool) => tool.code === 'winback')?.reason ?? '';
  assert.notEqual(cafeWhy, salonWhy);
  assert.match(cafeWhy, /кофейн/i);
  assert.match(salonWhy, /салон/i);
});

test('подбор не длиннее четырёх и никогда не пустой на полном каталоге', () => {
  for (const goal of ['reactivate', 'acquire', 'average_check', 'quiet_hours'] as const) {
    const picked = recommendTools({ businessType: 'retail', goal, tools: CATALOGUE });
    assert.ok(picked.length > 0 && picked.length <= 4, `${goal}: ${picked.length}`);
  }
});

test('механики отличаются по типу и совпадают с теми, что умеет студия', () => {
  const known = new Set(['2_plus_1', 'gift_with_threshold', 'return_coupon', 'fixed_discount', 'percent_discount', 'bonus_points']);
  const cafe = recommendMechanics('cafe');
  const salon = recommendMechanics('beauty');
  assert.equal(cafe[0].kind, '2_plus_1');
  assert.notEqual(cafe[0].kind, salon[0].kind);
  for (const mechanic of [...cafe, ...salon, ...recommendMechanics('retail'), ...recommendMechanics('service')]) {
    assert.ok(known.has(mechanic.kind), mechanic.kind);
  }
});

test('подпись называет и тип, и цель — иначе подбор ничем не обоснован', () => {
  assert.match(profileSummary('beauty', 'average_check'), /салону/);
  assert.match(profileSummary('beauty', 'average_check'), /средний чек/);
});
