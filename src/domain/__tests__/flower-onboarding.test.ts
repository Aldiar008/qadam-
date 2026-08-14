import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HOLIDAYS,
  SUPPLIER_SUGGESTIONS,
  TOLERANCE_LEVELS,
  daysUntil,
  holidayByCode,
  isInWindow,
  nextOccurrence,
} from '../flower-onboarding.ts';
import { profileSummary, recommendMechanics, recommendTools } from '../tool-recommendations.ts';

/**
 * Справочники регистрации и подбор инструментов под цветочный профиль.
 *
 * Проверяется не то, что списки непустые, а то, что из них нельзя вывести
 * неправду: повод всегда впереди, коэффициент всегда помечен предположением,
 * а рекомендация не ведёт в раздел, которого у цветочного магазина нет.
 */

const FLOWER_CATALOGUE = [
  { code: 'freshness_inventory', nameRu: 'Учёт свежести цветов', route: '/app/inventory', active: false },
  { code: 'flower_forecast', nameRu: 'Прогноз спроса', route: '/app/forecast', active: false },
  { code: 'decision_contract', nameRu: 'Decision Contract', route: '/app/decisions', active: false },
  { code: 'supplier_compare', nameRu: 'Сравнение поставщиков', route: '/app/suppliers', active: false },
  { code: 'auto_order', nameRu: 'Автозаказ', route: '/app/reorder-rules', active: false },
  { code: 'receiving_quality', nameRu: 'Приёмка', route: '/app/receiving', active: false },
  { code: 'messenger_stock', nameRu: 'Остатки из чата', route: '/app/messenger-stock', active: false },
  { code: 'flower_calendar', nameRu: 'Flower Calendar', route: '/app/forecast#calendar', active: false },
  { code: 'supplier_trust', nameRu: 'Supplier Trust', route: '/app/suppliers#community', active: false },
];

// ─── Справочник поводов ─────────────────────────────────────────────────────

test('восьмое марта стоит первым: у цветочного это не праздник в ряду других', () => {
  assert.equal(HOLIDAYS[0].code, 'march_8');
});

test('у каждого повода есть окно, подъём и объяснение', () => {
  for (const holiday of HOLIDAYS) {
    assert.ok(holiday.windowDays >= 1, `${holiday.code}: окно не задано`);
    assert.ok(holiday.liftPpm > 1_000_000, `${holiday.code}: подъём должен быть больше обычного дня`);
    assert.ok(holiday.hint.length > 20, `${holiday.code}: повод без объяснения нельзя проверить`);
  }
});

test('коды поводов уникальны — иначе профиль магазина ссылался бы на два разных', () => {
  const codes = HOLIDAYS.map((holiday) => holiday.code);
  assert.equal(new Set(codes).size, codes.length);
});

test('ближайшая дата повода всегда впереди переданного дня', () => {
  const from = new Date('2026-08-15T00:00:00Z');
  for (const holiday of HOLIDAYS) {
    const next = nextOccurrence(holiday, from);
    assert.ok(next.getTime() >= from.getTime(), `${holiday.code} оказался в прошлом`);
    assert.ok(daysUntil(holiday, from) >= 0, `${holiday.code}: отрицательное число дней`);
  }
});

test('повод в тот же день считается наступившим, а не перенесённым на год', () => {
  const march8 = holidayByCode('march_8');
  assert.ok(march8);
  const onTheDay = new Date('2026-03-08T00:00:00Z');
  assert.equal(nextOccurrence(march8, onTheDay).toISOString().slice(0, 10), '2026-03-08');
  assert.equal(daysUntil(march8, onTheDay), 0);
});

test('окно повода открывается ровно за столько дней, сколько у него задано', () => {
  const march8 = holidayByCode('march_8');
  assert.ok(march8);
  // Окно восьмого марта — четыре дня: четвёртого оно уже открыто, третьего ещё нет.
  assert.equal(isInWindow(march8, new Date('2026-03-04T00:00:00Z')), true);
  assert.equal(isInWindow(march8, new Date('2026-03-03T00:00:00Z')), false);
});

test('время — вход, а не скрытое состояние: тот же день даёт тот же ответ', () => {
  const march8 = holidayByCode('march_8');
  assert.ok(march8);
  const first = daysUntil(march8, new Date('2026-01-10T00:00:00Z'));
  const second = daysUntil(march8, new Date('2026-01-10T00:00:00Z'));
  assert.equal(first, second);
  assert.equal(first, 57);
});

test('несуществующий код повода возвращает пусто, а не первый попавшийся', () => {
  assert.equal(holidayByCode('halloween'), undefined);
});

// ─── Порог списаний ─────────────────────────────────────────────────────────

test('нулевого порога списаний не предлагается: это витрина, а не склад', () => {
  for (const level of TOLERANCE_LEVELS) {
    assert.ok(level.bps > 0, 'ноль списаний недостижим и не должен предлагаться как цель');
    assert.ok(level.bps <= 10_000, 'порог не может превышать сто процентов');
  }
});

test('уровни порога идут по возрастанию и не повторяются', () => {
  const values = TOLERANCE_LEVELS.map((level) => level.bps);
  assert.deepEqual([...values].sort((a, b) => a - b), values);
  assert.equal(new Set(values).size, values.length);
});

test('обычный цветочный — середина: он и стоит значением по умолчанию', () => {
  assert.ok(TOLERANCE_LEVELS.some((level) => level.bps === 800));
});

test('подсказки поставщиков не повторяются: один поставщик — один рейтинг', () => {
  assert.equal(new Set(SUPPLIER_SUGGESTIONS).size, SUPPLIER_SUGGESTIONS.length);
});

// ─── Подбор инструментов ────────────────────────────────────────────────────

test('цветочному магазину предлагается семь инструментов первого дня', () => {
  const picked = recommendTools({
    businessType: 'flower_shop',
    goal: 'freshness',
    tools: FLOWER_CATALOGUE,
    limit: 7,
  });
  assert.equal(picked.length, 7);
});

test('порядок подбора — порядок дня, а не важность вообще', () => {
  const picked = recommendTools({
    businessType: 'flower_shop',
    goal: 'freshness',
    tools: FLOWER_CATALOGUE,
    limit: 7,
  });
  // Сначала узнать, что на витрине, потом сколько уйдёт, потом что заказать,
  // и только потом у кого: обратный порядок заставляет выбирать поставщика для
  // заказа, объём которого ещё не посчитан.
  assert.deepEqual(picked.slice(0, 4).map((tool) => tool.code), [
    'freshness_inventory',
    'flower_forecast',
    'decision_contract',
    'supplier_compare',
  ]);
});

test('уже закреплённый инструмент не предлагается заново', () => {
  const withPinned = FLOWER_CATALOGUE.map((tool) =>
    tool.code === 'freshness_inventory' ? { ...tool, active: true } : tool);
  const picked = recommendTools({ businessType: 'flower_shop', goal: 'freshness', tools: withPinned, limit: 7 });
  assert.ok(!picked.some((tool) => tool.code === 'freshness_inventory'));
});

test('снятый с публикации инструмент не попадает в подбор', () => {
  const withoutForecast = FLOWER_CATALOGUE.filter((tool) => tool.code !== 'flower_forecast');
  const picked = recommendTools({ businessType: 'flower_shop', goal: 'freshness', tools: withoutForecast, limit: 7 });
  assert.ok(!picked.some((tool) => tool.code === 'flower_forecast'));
  assert.equal(picked.length, 7, 'место выбывшего занимает следующий, а не остаётся пустым');
});

test('у каждой рекомендации есть причина, и она не пустая', () => {
  const picked = recommendTools({ businessType: 'flower_shop', goal: 'freshness', tools: FLOWER_CATALOGUE, limit: 7 });
  for (const tool of picked) {
    assert.ok(tool.reason.length > 20, `${tool.code}: причина без содержания — это украшение`);
  }
});

test('у сети причина отличается там, где отличается работа', () => {
  const shop = recommendTools({ businessType: 'flower_shop', goal: 'freshness', tools: FLOWER_CATALOGUE, limit: 7 });
  const chain = recommendTools({ businessType: 'flower_chain', goal: 'freshness', tools: FLOWER_CATALOGUE, limit: 7 });
  const shopStock = shop.find((tool) => tool.code === 'freshness_inventory');
  const chainStock = chain.find((tool) => tool.code === 'freshness_inventory');
  assert.notEqual(shopStock?.reason, chainStock?.reason);
  assert.match(String(chainStock?.reason), /точке/);
});

test('цветочному магазину не предлагаются маркетинговые механики', () => {
  // Раздел кампаний убран из его меню: предложение вело бы в никуда.
  assert.deepEqual(recommendMechanics('flower_shop'), []);
  assert.deepEqual(recommendMechanics('flower_chain'), []);
  assert.ok(recommendMechanics('cafe').length > 0, 'у кофейни они остаются');
});

test('подпись подбора называет и профиль, и цель', () => {
  const summary = profileSummary('flower_shop', 'freshness');
  assert.match(summary, /цветочному магазину/);
  assert.match(summary, /витрину свежей/);
});
