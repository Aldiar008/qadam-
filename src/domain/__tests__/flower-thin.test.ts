import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CONFIRM_THRESHOLD_PPM,
  PARSER_VERSION,
  parseStockMessage,
  suggestOperation,
  type KnownItem,
} from '../stock-message.ts';
import {
  COMMUNITY_TRUST_VERSION,
  MIN_ORDERS,
  MIN_TENANTS,
  readCommunityTrust,
  smoothPpm,
  trustCategoryFor,
  type CommunityAggregate,
} from '../community-trust.ts';
import { combinedEventFactorPpm, eventsInEffect, forecastDailyDemand, type DemandEvent } from '../forecast.ts';
import { DomainError } from '../shared.ts';

const ITEMS: KnownItem[] = [
  { id: 'rose-red', name: 'Роза красная 60 см', unit: 'стебель', aliases: ['красная роза'] },
  { id: 'rose-pink', name: 'Роза розовая 60 см', unit: 'стебель' },
  { id: 'tulip', name: 'Тюльпан микс', unit: 'стебель' },
  { id: 'euc', name: 'Эвкалипт зелень', unit: 'пучок', aliases: ['зелень', 'эвкалипт'] },
  { id: 'wrap', name: 'Бумага упаковочная', unit: 'лист' },
];

// ─── Разбор сообщения флориста ───────────────────────────────────────────────

test('простое сообщение разбирается в позицию, количество и единицу', () => {
  const parsed = parseStockMessage('осталось 70 тюльпанов', ITEMS);
  assert.equal(parsed.outcome, 'proposed');
  assert.equal(parsed.itemId, 'tulip');
  assert.equal(parsed.quantityMilli, 70_000);
  assert.equal(parsed.unit, 'стебель');
  assert.equal(parsed.version, PARSER_VERSION);
});

test('разбор ничего не меняет сам по себе — он возвращает предложение', () => {
  const parsed = parseStockMessage('осталось 70 тюльпанов', ITEMS);
  // У результата нет ни одного поля, которым можно было бы записать событие:
  // изменение остатка живёт за подтверждением, а не за парсером.
  assert.ok(!('inventoryEventId' in parsed));
  assert.ok(!('applied' in parsed));
});

test('дробное количество читается', () => {
  const parsed = parseStockMessage('зелени осталось 2,5 пучка', ITEMS);
  assert.equal(parsed.quantityMilli, 2_500);
  assert.equal(parsed.itemId, 'euc');
});

test('позиция узнаётся по прозвищу, а не только по полному названию', () => {
  const parsed = parseStockMessage('красной розы 40', ITEMS);
  assert.equal(parsed.itemId, 'rose-red');
  assert.equal(parsed.outcome, 'proposed');
});

test('два похожих сорта — повод спросить, а не угадать', () => {
  const parsed = parseStockMessage('розы 60 см осталось 25', ITEMS);
  assert.equal(parsed.outcome, 'needs_clarification');
  assert.ok(parsed.confidencePpm < CONFIRM_THRESHOLD_PPM);
  assert.ok(parsed.question?.includes('Уточните позицию'));
  assert.ok(parsed.candidates.length >= 2, 'оба кандидата показаны человеку');
});

test('сообщение без числа не подтверждается автоматически', () => {
  const parsed = parseStockMessage('тюльпаны кончаются', ITEMS);
  assert.equal(parsed.outcome, 'needs_clarification');
  assert.equal(parsed.quantityMilli, null);
  assert.ok(parsed.question?.includes('Сколько именно'));
});

test('незнакомая позиция не подставляется наугад', () => {
  const parsed = parseStockMessage('осталось 5 орхидей', ITEMS);
  assert.equal(parsed.outcome, 'needs_clarification');
  assert.equal(parsed.itemId, null);
  assert.equal(parsed.candidates.length, 0);
  assert.ok(parsed.question?.includes('Выберите её из списка'));
});

test('пустое сообщение — ошибка вызова, а не молчаливый пропуск', () => {
  assert.throws(
    () => parseStockMessage('   ', ITEMS),
    (error: unknown) => error instanceof DomainError && error.code === 'EMPTY_MESSAGE',
  );
});

test('слова флориста подсказывают вид движения', () => {
  assert.equal(suggestOperation('осталось 70 роз'), 'adjust');
  assert.equal(suggestOperation('выбросили 12 завядших роз'), 'waste');
  assert.equal(suggestOperation('привезли 100 тюльпанов'), 'receive');
});

// ─── Календарь и одобрение ───────────────────────────────────────────────────

const MARCH8: DemandEvent = {
  code: 'march8',
  name: '8 марта',
  date: '2027-03-08',
  leadDays: 10,
  liftPpm: 3_800_000,
  categories: ['розы'],
  source: 'отраслевой шаблон',
  verified: false,
  approved: false,
};

test('неодобренное событие не двигает прогноз', () => {
  const inEffect = eventsInEffect([MARCH8], '2027-03-05', 'розы');
  assert.equal(inEffect.length, 0, 'пока владелец не одобрил, событие остаётся предложением');
});

test('одобренное событие вступает в силу', () => {
  const approved = { ...MARCH8, approved: true };
  assert.equal(eventsInEffect([approved], '2027-03-05', 'розы').length, 1);
});

test('коэффициент ограничен сверху и снизу по формуле продукта', () => {
  const approved = { ...MARCH8, approved: true };
  // ×3,8 даёт прибавку +2,8, но потолок обрезает до ×1,8.
  assert.equal(combinedEventFactorPpm([approved]), 1_800_000);

  const drop = { ...approved, code: 'drop', liftPpm: 100_000 };
  assert.equal(combinedEventFactorPpm([drop]), 500_000, 'снизу коэффициент тоже ограничен');
});

test('несколько поводов складываются, но упираются в тот же потолок', () => {
  const first = { ...MARCH8, approved: true, liftPpm: 1_500_000 };
  const second = { ...MARCH8, approved: true, code: 'wed', liftPpm: 1_400_000 };
  // +0,5 и +0,4 дают ×1,9 — потолок срезает до ×1,8.
  assert.equal(combinedEventFactorPpm([first, second]), 1_800_000);
});

test('базовый прогноз и сценарий различимы по числам', () => {
  const history = Array.from({ length: 28 }, (_, index) => ({
    date: new Date(Date.parse('2027-02-08T00:00:00Z') + index * 86_400_000).toISOString().slice(0, 10),
    quantityMilli: 60_000,
  }));

  const baseline = forecastDailyDemand({ history, targetDate: '2027-03-05', source: 't', isMock: false, category: 'розы' });
  const scenario = forecastDailyDemand({
    history,
    targetDate: '2027-03-05',
    source: 't',
    isMock: false,
    category: 'розы',
    events: [{ ...MARCH8, approved: true }],
  });

  assert.equal(baseline.eventFactorPpm, 1_000_000, 'база не знает про праздник');
  assert.equal(scenario.eventFactorPpm, 1_800_000);
  assert.equal(scenario.baselineMilli, baseline.baselineMilli, 'база одна и та же — различается только сценарий');
  assert.ok(scenario.dailyForecastMilli > baseline.dailyForecastMilli);
  assert.ok(scenario.assumptions.some((line) => line.includes('гипотеза')), 'непроверенный лифт остаётся гипотезой');
});

// ─── Общий рейтинг поставщика ────────────────────────────────────────────────

const aggregate = (over: Partial<CommunityAggregate> = {}): CommunityAggregate => ({
  canonicalSupplier: 'Оптовая база «Барыс»',
  region: 'Алматы',
  category: 'roses',
  windowDays: 90,
  nOrders: 40,
  nTenants: 14,
  deliveryReliabilityPpm: 920_000,
  fillRatePpm: 960_000,
  freshnessScorePpm: 800_000,
  ...over,
});

test('рейтинг публикуется, когда выборки достаточно', () => {
  const trust = readCommunityTrust(aggregate());
  assert.equal(trust.visibility, 'published');
  assert.ok(trust.reliabilityPpm && trust.reliabilityPpm > 0);
  assert.equal(trust.version, COMMUNITY_TRUST_VERSION);
});

test('мало заказов — рейтинг скрыт, и сказано, чего не хватает', () => {
  const trust = readCommunityTrust(aggregate({ nOrders: 12 }));
  assert.equal(trust.visibility, 'below_threshold');
  assert.equal(trust.reliabilityPpm, null);
  assert.equal(trust.missing.orders, MIN_ORDERS - 12);
  assert.ok(trust.explanation.nextAction.includes('недостаточно данных'));
});

test('мало магазинов — рейтинг скрыт даже при большом числе заказов', () => {
  const trust = readCommunityTrust(aggregate({ nOrders: 300, nTenants: 3 }));
  assert.equal(trust.visibility, 'below_threshold');
  assert.equal(trust.missing.tenants, MIN_TENANTS - 3);
});

test('сглаживание тянет короткую историю к средней по рынку', () => {
  const perfect = smoothPpm(1_000_000, 3);
  assert.ok(perfect < 1_000_000, 'три идеальные поставки не дают ста процентов');
  const long = smoothPpm(1_000_000, 200);
  assert.ok(long > perfect, 'с ростом выборки оценка приближается к наблюдаемой');
});

test('в рейтинге нет ничего, по чему можно узнать чужой магазин', () => {
  const trust = readCommunityTrust(aggregate());
  const serialised = JSON.stringify(trust);

  // Ищутся идентификаторы, а не слово «магазин»: `missing.tenants` — это
  // «скольких ещё магазинов не хватает до публикации», и оно обязано остаться.
  assert.ok(!serialised.includes('business_id'));
  assert.ok(!serialised.includes('tenant_id'));
  assert.ok(!serialised.includes('order_id'));
  assert.ok(
    !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(serialised),
    'ни одного uuid в ответе',
  );
  assert.deepEqual(Object.keys(trust).filter((key) => /(^|_)id$/i.test(key)), []);
});

test('демонстрационный агрегат помечен явно', () => {
  const trust = readCommunityTrust(aggregate(), true);
  assert.ok(trust.assumptions.some((line) => line.includes('[MOCK AGGREGATE]')));
  assert.equal(trust.explanation.kind, 'mock_actual');
});

test('категория рейтинга выводится из категории позиции', () => {
  assert.equal(trustCategoryFor('розы'), 'roses');
  assert.equal(trustCategoryFor('тюльпаны'), 'tulips');
  assert.equal(trustCategoryFor('зелень'), 'greenery');
  assert.equal(trustCategoryFor('упаковка'), 'packaging');
  assert.equal(trustCategoryFor('пионы'), null, 'неизвестная категория не подгоняется под ближайшую');
  assert.equal(trustCategoryFor(null), null);
});

test('отрицательная выборка — ошибка вызова', () => {
  assert.throws(
    () => smoothPpm(900_000, -1),
    (error: unknown) => error instanceof DomainError && error.code === 'INVALID_SAMPLE',
  );
});
