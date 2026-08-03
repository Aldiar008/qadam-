#!/usr/bin/env node
/**
 * Собирает настоящие цены с Kaspi и печатает их как SQL для демо-стенда.
 *
 * Why this exists rather than just pressing the button on the stand: Kaspi
 * rate-limits by address, and a serverless function leaves from a pool of
 * addresses shared with everything else on the platform, so the live call is
 * refused with 429 more often than not. The button still works and still says
 * so honestly when it is refused — but a demonstration should not depend on a
 * stranger's traffic.
 *
 * What this does NOT do is invent anything. It runs the same fetch, the same
 * validator and the same per-unit sort as the button, from a machine the
 * marketplace answers. Every row it prints is a product that existed at the
 * price printed, with the link to prove it, and lands in the database
 * `verified = false` exactly like a row the button would have written.
 *
 * Usage:
 *   node scripts/fetch-market-offers.mjs > supabase/seed/remote_demo_market_offers.sql
 */

import { searchKaspi } from '../src/connectors/market.ts';

const BUSINESS = '10000000-0000-4000-8000-000000000001';

/**
 * Позиции демо-заведения и то, как их искать в магазине.
 *
 * The storeroom name and the shop name are different things — «Стаканы 400 мл с
 * крышкой» is what the barista calls it, «стаканы бумажные 400 мл с крышкой» is
 * what finds it — which is exactly why `supply_items.search_query` exists.
 */
const ITEMS = [
  { name: 'Стаканы 400 мл с крышкой', query: 'стаканы бумажные 400 мл' },
  { name: 'Зерно арабика 1 кг', query: 'кофе в зернах арабика 1 кг' },
  // Молоко на маркетплейсе почти не продают: поиск возвращает кокосовое, сухое и
  // держатели для бутылок. Запрос оставлен настоящим, и результат тоже — ни одно
  // предложение не оказывается дешевле, поэтому кандидата просто не будет.
  { name: 'Молоко 3,2% 1 л', query: 'молоко 3.2 1 литр' },
  { name: 'Сироп карамель 1 л', query: 'сироп карамель 1 л для кофе' },
  { name: 'Салфетки барные', query: 'салфетки бумажные диспенсерные' },
];

const quote = (value) => (value === null || value === undefined ? 'null' : `'${String(value).replace(/'/g, "''")}'`);

const lines = [
  '-- Настоящие цены с Kaspi, собранные scripts/fetch-market-offers.mjs.',
  '--',
  '-- Не выдумка и не заглушка: тот же запрос, тот же разбор и та же сортировка',
  '-- за единицу, что и у кнопки «Найти дешевле», просто выполненные с машины,',
  '-- которой площадка отвечает. Каждая строка приходит verified = false — цену',
  '-- по-прежнему подтверждает человек, открыв ссылку.',
  '',
  'begin;',
  '',
  '-- Найденное автоматически заменяется целиком: прайсы, внесённые руками,',
  '-- остаются (у них нет external_id), а прошлый улов не должен пережить смену',
  '-- поискового запроса и остаться под позицией, к которой он не относится.',
  `delete from public.supply_offers where business_id = '${BUSINESS}' and source = 'web';`,
  '',
];

let total = 0;
for (const item of ITEMS) {
  const result = await searchKaspi(item.query, { city: 'Алматы', limit: 5 });
  process.stderr.write(`${item.name}: ${result.status}${result.httpStatus ? ` (${result.httpStatus})` : ''} — ${result.offers.length}\n`);

  lines.push(`-- ${item.name} · запрос «${item.query}» · ${result.status}`);
  lines.push(`update public.supply_items set search_query = ${quote(item.query)}`);
  lines.push(`  where business_id = '${BUSINESS}' and name_ru = ${quote(item.name)};`);

  if (result.status !== 'ok') {
    // A refusal is recorded as a refusal. Filling the gap with a plausible price
    // is the one thing this whole module is built to never do.
    lines.push(`insert into public.supply_search_runs(business_id, supply_item_id, source, query, status, http_status, offers_found, error, is_mock)`);
    lines.push(`  select '${BUSINESS}', i.id, 'kaspi', ${quote(item.query)}, ${quote(result.status)}, ${result.httpStatus ?? 'null'}, 0, ${quote(result.error)}, true`);
    lines.push(`  from public.supply_items i where i.business_id = '${BUSINESS}' and i.name_ru = ${quote(item.name)};`);
    lines.push('');
    continue;
  }

  for (const offer of result.offers) {
    total += 1;
    lines.push(`insert into public.supply_offers(business_id, supply_item_id, supplier, title, price_minor, pack_size, url, external_id, source, verified, is_mock)`);
    lines.push(`  select '${BUSINESS}', i.id, ${quote(offer.supplier)}, ${quote(offer.title)}, ${offer.priceMinor}, ${offer.packSize}, ${quote(offer.url)}, ${quote(offer.externalId)}, 'web', false, true`);
    lines.push(`  from public.supply_items i where i.business_id = '${BUSINESS}' and i.name_ru = ${quote(item.name)}`);
    lines.push(`  on conflict (supply_item_id, source, external_id) where external_id is not null do update`);
    lines.push(`  set title = excluded.title, price_minor = excluded.price_minor, pack_size = excluded.pack_size, url = excluded.url, found_at = now();`);
  }

  lines.push(`insert into public.supply_search_runs(business_id, supply_item_id, source, query, status, http_status, offers_found, is_mock)`);
  lines.push(`  select '${BUSINESS}', i.id, 'kaspi', ${quote(item.query)}, 'ok', ${result.httpStatus ?? 'null'}, ${result.offers.length}, true`);
  lines.push(`  from public.supply_items i where i.business_id = '${BUSINESS}' and i.name_ru = ${quote(item.name)};`);
  lines.push('');
}

lines.push('commit;');
process.stdout.write(lines.join('\n') + '\n');
process.stderr.write(`\nВсего предложений: ${total}\n`);
