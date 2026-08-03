import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  MARKET_STATUS_LABELS,
  searchKaspi,
  searchSalaries,
  type MarketStatus,
} from '@/connectors/market.ts';

/**
 * «Закончились стаканы» → цены с рынка, записанные как факты с датой и ссылкой.
 *
 * The connector fetches and validates; this decides whether a fetch is allowed
 * at all, what becomes a row, and what the owner is told. Three rules hold it
 * together:
 *
 *  1. A found price is never `verified`. It says «откройте ссылку» until a
 *     person does.
 *  2. A repeat search updates the listing it already knows instead of adding a
 *     second row, so the list does not grow into a wall of the same product.
 *  3. Every attempt is written down, including the refusals. Otherwise a screen
 *     showing last week's prices looks exactly like a screen showing today's.
 */

/** How long a fresh search stays fresh. Pressing again inside this window reuses it. */
const COOLDOWN_MINUTES = 20;

export interface SupplySearchOutcome {
  status: MarketStatus | 'cooldown';
  /** Ready to show to the owner, in Russian, always specific about what happened. */
  message: string;
  stored: number;
  updated: number;
}

const label = (status: MarketStatus) => MARKET_STATUS_LABELS[status];

export async function searchMarketForItem(
  db: SupabaseClient,
  input: { businessId: string; itemId: string; isMock: boolean; city?: string; force?: boolean },
): Promise<SupplySearchOutcome> {
  const { data: item } = await db
    .from('supply_items')
    .select('id,name_ru,unit,search_query')
    .eq('id', input.itemId)
    .eq('business_id', input.businessId)
    .maybeSingle();
  if (!item) return { status: 'unavailable', message: 'Позиция не найдена в этом бизнесе.', stored: 0, updated: 0 };

  const query = (item.search_query || item.name_ru).trim();

  if (!input.force) {
    const since = new Date(Date.now() - COOLDOWN_MINUTES * 60_000).toISOString();
    const { data: recent } = await db
      .from('supply_search_runs')
      .select('id,status,offers_found,ran_at')
      .eq('supply_item_id', item.id).eq('source', 'kaspi').eq('status', 'ok')
      .gte('ran_at', since).limit(1).maybeSingle();
    if (recent) {
      return {
        status: 'cooldown',
        stored: 0,
        updated: 0,
        message: `Цены уже обновлялись меньше ${COOLDOWN_MINUTES} минут назад — найдено предложений: ${recent.offers_found}. Площадку не дёргаем чаще без нужды.`,
      };
    }
  }

  const result = await searchKaspi(query, { city: input.city });

  // The attempt is written down before anything is decided about the result.
  // If even that fails the caller is told: a search log that quietly does not
  // record is worse than none, because the screen then dates today's prices by
  // whenever the log last happened to work.
  const { error: logError } = await db.from('supply_search_runs').insert({
    business_id: input.businessId,
    supply_item_id: item.id,
    source: 'kaspi',
    query,
    status: result.status,
    http_status: result.httpStatus,
    offers_found: result.offers.length,
    error: result.error,
    is_mock: input.isMock,
  });
  const logNote = logError ? ` Журнал поиска не записался: ${logError.message}.` : '';

  if (result.status !== 'ok') {
    const detail = result.error ? ` ${result.error}` : '';
    return {
      status: result.status,
      stored: 0,
      updated: 0,
      message: `${label(result.status)} по запросу «${query}».${detail} Ранее найденные цены остались на месте — с датой, когда их нашли.${logNote}`,
    };
  }

  // Which listings are already known, so a repeat search updates rather than duplicates.
  const { data: existing } = await db
    .from('supply_offers')
    .select('id,external_id,price_minor')
    .eq('supply_item_id', item.id).eq('source', 'web')
    .not('external_id', 'is', null);
  const known = new Map((existing ?? []).map((row) => [row.external_id as string, row]));

  let stored = 0;
  let updated = 0;
  const now = new Date().toISOString();

  for (const offer of result.offers) {
    const seen = known.get(offer.externalId);
    if (seen) {
      const patch: Record<string, unknown> = {
        supplier: offer.supplier,
        title: offer.title,
        price_minor: offer.priceMinor,
        pack_size: offer.packSize,
        url: offer.url,
        found_at: now,
      };
      // A changed price is a new claim, so it goes back to unverified even if
      // somebody had confirmed the old one. An unchanged price keeps whatever
      // confirmation it already earned.
      if (Number(seen.price_minor) !== offer.priceMinor) patch.verified = false;

      const { error } = await db.from('supply_offers').update(patch).eq('id', seen.id).eq('business_id', input.businessId);
      if (!error) updated += 1;
      continue;
    }

    const { error } = await db.from('supply_offers').insert({
      business_id: input.businessId,
      supply_item_id: item.id,
      supplier: offer.supplier,
      title: offer.title,
      price_minor: offer.priceMinor,
      pack_size: offer.packSize,
      url: offer.url,
      external_id: offer.externalId,
      source: 'web',
      verified: false,
      found_at: now,
      is_mock: input.isMock,
    });
    if (!error) stored += 1;
  }

  return {
    status: 'ok',
    stored,
    updated,
    message: stored || updated
      ? `Kaspi: новых предложений ${stored}, обновлено ${updated}. Цены не подтверждены — откройте ссылку перед заказом.${logNote}`
      : `Kaspi ответил, но ни одно предложение не прошло проверку: без цены, без ссылки или в другой валюте.${logNote}`,
  };
}

export interface SalaryOutcome {
  status: MarketStatus;
  message: string;
}

/**
 * Сколько сейчас стоит нанять по этой роли.
 *
 * The other half of a small venue's costs. Stored with its sample size, so a
 * median over four postings is shown as four postings and not as «рынок».
 */
export async function refreshSalarySnapshot(
  db: SupabaseClient,
  input: { businessId: string; role: string; isMock: boolean; city?: string },
): Promise<SalaryOutcome> {
  const result = await searchSalaries(input.role, { city: input.city });
  if (result.status !== 'ok' || !result.snapshot) {
    return {
      status: result.status,
      message: `${label(result.status)}: hh.kz по запросу «${input.role}».${result.error ? ` ${result.error}` : ''}`,
    };
  }

  const snapshot = result.snapshot;
  const { error } = await db.from('market_salary_snapshots').upsert({
    business_id: input.businessId,
    role_query: snapshot.roleQuery,
    area_name: snapshot.areaName,
    sample_size: snapshot.sampleSize,
    median_minor: snapshot.medianMinor,
    p25_minor: snapshot.p25Minor,
    p75_minor: snapshot.p75Minor,
    currency: snapshot.currency,
    source: 'hh',
    fetched_at: new Date().toISOString(),
    is_mock: input.isMock,
  }, { onConflict: 'business_id,role_query,area_name' });
  if (error) return { status: 'unavailable', message: error.message };

  return {
    status: 'ok',
    message: `hh.kz: просмотрено вакансий ${snapshot.scanned}, с указанной зарплатой ${snapshot.sampleSize}.`,
  };
}
