import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { buildCohort } from '@/domain/customer-insights';
import { moneyOnTheTable, type ItemTrend, type MoneyOnTheTable } from '@/domain/money-on-the-table';

/**
 * Что заведение может заработать сегодня — собрано из его собственных данных.
 *
 * Экран «Сегодня» показывал показатели: клиенты, продажи, повторные, кампании.
 * Всё это правда и всё это не ответ на вопрос владельца «что мне делать». Здесь
 * из тех же таблиц собираются четыре конкретные возможности с суммами и
 * кнопками.
 *
 * Ни одна из сумм не берётся из воздуха: спящие считаются по вероятности
 * возврата, посчитанной по промежуткам между визитами этой же базы; тихие часы
 * — против собственного медианного часа; просевшая позиция — против её же
 * прошлого периода. Где считать не из чего, стоит `null`, и экран это печатает.
 */

export type TransactionRow = { customer_id: string | null; net_minor: number; occurred_at: string };

const DAY = 86_400_000;

/** Час и календарный день в часовом поясе заведения, а не сервера. */
function localParts(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, hour: '2-digit', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return { hour: Number(get('hour')), day: `${get('year')}-${get('month')}-${get('day')}` };
}

export async function loadTodayOpportunities(
  db: SupabaseClient,
  businessId: string,
  timeZone: string,
  transactions: readonly TransactionRow[],
): Promise<MoneyOnTheTable> {
  const now = Date.now();
  const since = new Date(now - 56 * DAY).toISOString();
  const halfway = now - 28 * DAY;

  // --- гости: последний визит и сколько раз приходил ----------------------
  const visitsByCustomer = new Map<string, string[]>();
  for (const row of transactions) {
    if (!row.customer_id) continue;
    const list = visitsByCustomer.get(row.customer_id) ?? [];
    list.push(row.occurred_at);
    visitsByCustomer.set(row.customer_id, list);
  }

  const [{ data: consentRows }, { data: interactionRows }, itemTrend] = await Promise.all([
    db.from('customer_consents')
      .select('customer_id,scope,status,created_at')
      .eq('business_id', businessId).like('scope', 'marketing%')
      .order('created_at', { ascending: false }).limit(5000),
    db.from('customer_interactions')
      .select('customer_id,direction,kind,occurred_at')
      .eq('business_id', businessId).gte('occurred_at', new Date(now - 14 * DAY).toISOString())
      .order('occurred_at', { ascending: false }).limit(500),
    loadItemTrend(db, businessId, since, new Date(halfway).toISOString()),
  ]);

  // Согласия дописываются, а не переписываются: решение — самая свежая строка.
  const consent = new Map<string, boolean>();
  for (const row of (consentRows ?? []) as { customer_id: string; scope: string; status: string }[]) {
    const key = `${row.customer_id}:${row.scope}`;
    if (!consent.has(key)) consent.set(key, row.status === 'granted');
  }
  const granted = new Set<string>();
  for (const [key, allowed] of consent) if (allowed) granted.add(key.split(':')[0]);

  const guests = [...visitsByCustomer.entries()].map(([customerId, visits]) => {
    const last = Math.max(...visits.map((iso) => new Date(iso).getTime()));
    return {
      daysSinceLastVisit: Math.max(0, Math.round((now - last) / DAY)),
      visits: visits.length,
      consentGranted: granted.has(customerId),
    };
  });

  // --- вопросы без ответа --------------------------------------------------
  type Interaction = { customer_id: string | null; direction: string; kind: string; occurred_at: string };
  const interactions = (interactionRows ?? []) as Interaction[];
  const lastOutbound = new Map<string, number>();
  for (const row of interactions) {
    if (row.direction !== 'outbound' || !row.customer_id) continue;
    const at = new Date(row.occurred_at).getTime();
    if (at > (lastOutbound.get(row.customer_id) ?? 0)) lastOutbound.set(row.customer_id, at);
  }
  const unansweredQuestions = interactions.filter((row) => {
    if (row.direction !== 'inbound' || row.kind !== 'question' || !row.customer_id) return false;
    return new Date(row.occurred_at).getTime() > (lastOutbound.get(row.customer_id) ?? 0);
  }).length;

  // Доля обращений, за которыми в течение недели последовала покупка. Считается
  // по тем же данным; когда обращений слишком мало, честнее не считать вовсе.
  const answered = interactions.filter((row) => row.direction === 'inbound' && row.customer_id);
  let questionConversionBps: number | null = null;
  if (answered.length >= 10) {
    const bought = answered.filter((row) => {
      const asked = new Date(row.occurred_at).getTime();
      return (visitsByCustomer.get(row.customer_id as string) ?? [])
        .some((iso) => { const at = new Date(iso).getTime(); return at > asked && at <= asked + 7 * DAY; });
    }).length;
    questionConversionBps = Math.round((bought / answered.length) * 10_000);
  }

  // --- выручка по часам ----------------------------------------------------
  const byHour = new Map<number, { revenueMinor: number; days: Set<string> }>();
  for (const row of transactions) {
    const { hour, day } = localParts(row.occurred_at, timeZone);
    if (!Number.isFinite(hour)) continue;
    const slice = byHour.get(hour) ?? { revenueMinor: 0, days: new Set<string>() };
    slice.revenueMinor += Number(row.net_minor);
    slice.days.add(day);
    byHour.set(hour, slice);
  }
  const hourly = [...byHour.entries()]
    .map(([hour, slice]) => ({ hour, revenueMinor: slice.revenueMinor, days: slice.days.size }))
    .sort((left, right) => left.hour - right.hour);

  const revenue = transactions.reduce((sum, row) => sum + Number(row.net_minor), 0);

  return moneyOnTheTable({
    averageCheckMinor: transactions.length ? Math.round(revenue / transactions.length) : 0,
    guests,
    cohort: buildCohort(visitsByCustomer, now),
    unansweredQuestions,
    questionConversionBps,
    hourly,
    itemTrend,
  });
}

/**
 * Продажи по позициям: последние 28 дней против предыдущих 28.
 *
 * Запрос идёт через связь с чеком, потому что дата продажи лежит там. Если
 * связь по какой-то причине недоступна, раздел просто не появится — падать
 * целым экраном из-за одной строки нельзя.
 */
async function loadItemTrend(db: SupabaseClient, businessId: string, since: string, halfway: string): Promise<ItemTrend[]> {
  const { data, error } = await db.from('transaction_items')
    .select('item_name,total_minor,transactions!inner(occurred_at)')
    .eq('business_id', businessId)
    .gte('transactions.occurred_at', since)
    .limit(5000);
  if (error || !data) return [];

  type Row = { item_name: string; total_minor: number; transactions: { occurred_at: string } | { occurred_at: string }[] };
  const totals = new Map<string, { recentMinor: number; previousMinor: number }>();
  const boundary = new Date(halfway).getTime();
  for (const row of data as unknown as Row[]) {
    const joined = Array.isArray(row.transactions) ? row.transactions[0] : row.transactions;
    if (!joined?.occurred_at) continue;
    const bucket = totals.get(row.item_name) ?? { recentMinor: 0, previousMinor: 0 };
    const amount = Number(row.total_minor ?? 0);
    if (new Date(joined.occurred_at).getTime() >= boundary) bucket.recentMinor += amount;
    else bucket.previousMinor += amount;
    totals.set(row.item_name, bucket);
  }
  return [...totals.entries()].map(([name, value]) => ({ name, ...value }));
}
