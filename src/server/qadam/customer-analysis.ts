import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { analyseCustomer, buildCohort, type CustomerInsights, type PurchaseLine } from '@/domain/customer-insights';

/**
 * Разбор покупок одного гостя — на данных заведения, а не на догадках.
 *
 * Три источника: строки его чеков (что именно он брал), меню (что ему можно
 * предложить) и промежутки между визитами всей базы (с чем сравнивать его
 * молчание). Последнее выглядит дорого для одной карточки, но без него
 * «вероятность возврата» пришлось бы либо выдумать, либо не показывать.
 *
 * Живёт отдельным модулем, потому что нужен двоим: экрану карточки и
 * генератору досье. Считать это в двух местах по-разному — верный способ
 * получить на экране одно число, а в сохранённой заметке другое.
 */
export async function analyseCustomerFromReceipts(
  db: SupabaseClient,
  businessId: string,
  purchases: readonly { id: string; occurred_at: string }[],
): Promise<CustomerInsights> {
  const receiptIds = purchases.map((row) => row.id);
  const occurredById = new Map(purchases.map((row) => [row.id, row.occurred_at]));

  const [{ data: itemRows }, { data: catalogRows }, { data: cohortRows }] = await Promise.all([
    receiptIds.length
      ? db.from('transaction_items')
        .select('transaction_id,catalog_item_id,item_name,quantity,total_minor')
        .eq('business_id', businessId).in('transaction_id', receiptIds).limit(1000)
      : Promise.resolve({ data: [] as Record<string, never>[] }),
    db.from('catalog_items')
      .select('id,name_ru,category,price_minor,cost_minor')
      .eq('business_id', businessId).eq('is_active', true).limit(300),
    // Промежутки между визитами по всей базе. `customer_id` здесь — ключ
    // группировки, а не персональные данные: из него получается только число
    // дней, и наружу уходит именно оно.
    db.from('transactions')
      .select('customer_id,occurred_at')
      .eq('business_id', businessId).not('customer_id', 'is', null)
      .order('occurred_at', { ascending: false }).limit(5000),
  ]);

  type CatalogRow = { id: string; name_ru: string; category: string | null; price_minor: number; cost_minor: number };
  const catalog = (catalogRows ?? []) as CatalogRow[];
  const catalogById = new Map(catalog.map((row) => [row.id, row]));
  const catalogByName = new Map(catalog.map((row) => [row.name_ru, row]));

  type ItemRow = { transaction_id: string; catalog_item_id: string | null; item_name: string; quantity: number; total_minor: number };
  const lines: PurchaseLine[] = ((itemRows ?? []) as ItemRow[]).flatMap((row) => {
    const occurredAt = occurredById.get(row.transaction_id);
    if (!occurredAt) return [];
    const entry = (row.catalog_item_id ? catalogById.get(row.catalog_item_id) : null) ?? catalogByName.get(row.item_name) ?? null;
    return [{
      transactionId: row.transaction_id,
      name: row.item_name,
      category: entry?.category ?? null,
      quantity: Number(row.quantity ?? 1),
      totalMinor: Number(row.total_minor ?? 0),
      occurredAt,
    }];
  });

  const visitsByCustomer = new Map<string, string[]>();
  for (const row of (cohortRows ?? []) as { customer_id: string | null; occurred_at: string }[]) {
    if (!row.customer_id) continue;
    const list = visitsByCustomer.get(row.customer_id) ?? [];
    list.push(row.occurred_at);
    visitsByCustomer.set(row.customer_id, list);
  }

  const now = Date.now();
  return analyseCustomer({
    lines,
    receipts: purchases.map((row) => row.occurred_at),
    catalog: catalog.map((row) => ({
      name: row.name_ru,
      category: row.category,
      priceMinor: Number(row.price_minor ?? 0),
      costMinor: Number(row.cost_minor ?? 0),
    })),
    cohort: buildCohort(visitsByCustomer, now),
    now,
  });
}

/** Приводит разбор к тому виду, в котором его понимает контракт генератора. */
export function insightsForBrief(insights: CustomerInsights) {
  if (!insights.linesCounted && !insights.cadence) return null;
  return {
    favourites: insights.favourites.map((item) => ({
      name: item.name, orders: item.orders, sharePercent: Math.round(item.shareBps / 100),
    })),
    categories: insights.categories.map((item) => ({
      category: item.category, sharePercent: Math.round(item.shareBps / 100),
    })),
    pairs: insights.pairs.map((item) => ({ a: item.a, b: item.b, together: item.together })),
    dropped: insights.dropped.map((item) => ({
      name: item.name, ordersBefore: item.ordersBefore, daysSince: item.daysSince,
    })),
    cadenceDays: insights.cadence?.medianDays ?? null,
    overdueDays: insights.cadence?.overdueDays ?? null,
    returnPercent: insights.returning ? Math.round(insights.returning.probabilityBps / 100) : null,
    returnHorizonDays: insights.returning?.horizonDays ?? null,
    suggestion: insights.suggestion
      ? { itemName: insights.suggestion.itemName, reason: insights.suggestion.reason }
      : null,
  };
}
