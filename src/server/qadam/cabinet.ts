import { requireBusinessContext } from '@/server/qadam/repository';
import { buildRiskQueue, loadSupplyPositions, type QueueEntry, type SupplyPosition } from '@/server/qadam/supply-core';

/**
 * Кабинет владельца цветочного магазина.
 *
 * Экран отвечает на один вопрос: что делать сегодня. Всё остальное — история,
 * надёжность поставщиков, эффект — стоит ниже и отвечает на «как дела», а не
 * соревнуется за первое внимание.
 *
 * Модуль собирает данные и ничего не решает про оформление. Числа приходят
 * вместе с тем, из чего они получены: сумма без основания на этом экране была
 * бы просто крупным шрифтом.
 */

/** Одна карточка очереди: риск, деньги, срок и одно действие. */
export interface CabinetDecision {
  itemId: string;
  itemName: string;
  unit: string;
  kind: 'stockout' | 'spoilage';
  /** Зелёный, янтарный, красный — по тому, насколько поздно реагировать. */
  tone: 'calm' | 'today' | 'urgent';
  headline: string;
  consequence: string;
  /** Деньги под риском в тиынах. `null`, когда цена позиции неизвестна. */
  amountMinor: number | null;
  amountBasis: string;
  /** Срок словами: «через 29 часов», «уже просрочено». */
  deadline: string;
  actionLabel: string;
  actionHref: string;
}

export interface CabinetOrder {
  id: string;
  supplier: string;
  status: string;
  statusLabel: string;
  isUrgent: boolean;
  expectedAt: string | null;
  totalCostMinor: number;
  itemCount: number;
}

export interface CabinetSupplier {
  supplierId: string;
  name: string;
  ordersTotal: number;
  otifPpm: number | null;
  shortfallRatePpm: number;
  avgDelayHours: number;
  avgFreshnessDays: number | null;
  lastDeliveryAt: string | null;
}

export interface CabinetImpact {
  forecastMinor: number;
  influencedMinor: number;
  verifiedMinor: number;
  /** Почему подтверждённый эффект равен нулю — это не пустая ячейка. */
  verifiedNote: string;
}

export interface CabinetHistoryEntry {
  id: string;
  at: string;
  title: string;
  detail: string;
  quantity: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Черновик',
  sent: 'Отправлен',
  confirmed: 'Подтверждён поставщиком',
  in_transit: 'В пути',
  delivered: 'Доставлен',
  failed: 'Сорвался',
  cancelled: 'Отменён',
};

const EVENT_LABEL: Record<string, string> = {
  receive: 'Приёмка',
  consume: 'Продажа',
  waste: 'Списание',
  adjust: 'Пересчёт',
  transfer_in: 'Приход с точки',
  transfer_out: 'Уход на точку',
};

const WASTE_REASON: Record<string, string> = {
  withered: 'завяли',
  damaged: 'повреждены',
  unsold: 'не продались',
  other: 'другая причина',
};

const SOURCE_LABEL: Record<string, string> = {
  manual: 'вручную',
  messenger: 'из чата',
  receiving: 'на приёмке',
  transfer: 'перемещение',
  seed: 'демо-данные',
  import: 'импорт',
};

/** Заказы, которые ещё не закрыты: по ним магазин чего-то ждёт. */
const OPEN_ORDER_STATUSES = ['draft', 'sent', 'confirmed', 'in_transit'];

function hoursToWords(hours: number | null): string {
  if (hours === null) return 'срок неизвестен';
  if (hours <= 0) return 'уже пора';
  if (hours < 48) return `через ${Math.round(hours)} ч`;
  return `через ${Math.round(hours / 24)} дн`;
}

/**
 * Цвет карточки — это не настроение, а то, сколько осталось времени.
 *
 * Красный ставится там, где реагировать уже поздно или почти поздно: поставка
 * не успевает или партия просрочена. Янтарный — там, где сегодня ещё можно
 * успеть. Зелёного в очереди не бывает: попавшее в неё уже требует решения.
 */
function toneFor(entry: QueueEntry): 'calm' | 'today' | 'urgent' {
  if (entry.kind === 'stockout') {
    const gap = entry.position.assessment.coverageGapHours;
    if (entry.position.assessment.level === 'critical' || (gap !== null && gap > 0)) return 'urgent';
    return 'today';
  }
  if (entry.position.spoilage.expiredLots > 0) return 'urgent';
  const hours = entry.position.spoilage.nearestExpiryHours;
  return hours !== null && hours <= 24 ? 'urgent' : 'today';
}

/**
 * Деньги под риском.
 *
 * Считаются по закупочной цене, а не по выручке, и подписаны именно так.
 * Умножить на розничную наценку было бы приятнее и неверно: продукт не знает,
 * по какой цене этот магазин продаёт букет, и выдумывать её ради красивой
 * цифры — ровно тот приём, за который такому продукту не стоит верить.
 */
function riskMoney(entry: QueueEntry): { amountMinor: number | null; basis: string } {
  const price = entry.position.item.currentPriceMinor;

  if (entry.kind === 'spoilage') {
    return {
      amountMinor: entry.position.spoilage.atRiskCostMinor,
      basis: 'закупочная стоимость партий, которые не успеют продаться',
    };
  }

  if (price === null) {
    return { amountMinor: null, basis: 'цена позиции не задана — оценить нечем' };
  }

  const shortfall = entry.position.assessment.shortfallMilli;
  return {
    amountMinor: Math.round((shortfall * price) / 1000),
    basis: 'закупочная стоимость того, чего не хватит до точки заказа',
  };
}

function decisionOf(entry: QueueEntry): CabinetDecision {
  const { position, kind } = entry;
  const money = riskMoney(entry);
  const tone = toneFor(entry);

  if (kind === 'stockout') {
    const clock = position.assessment.timeToStockoutHours;
    return {
      itemId: position.item.id,
      itemName: position.item.name,
      unit: position.item.unit,
      kind,
      tone,
      headline: `${position.item.name} закончится ${hoursToWords(clock)}`,
      consequence: position.assessment.reason,
      amountMinor: money.amountMinor,
      amountBasis: money.basis,
      deadline: hoursToWords(clock),
      actionLabel: 'Открыть решение',
      actionHref: '/app/decisions',
    };
  }

  const expiry = position.spoilage.nearestExpiryHours;
  return {
    itemId: position.item.id,
    itemName: position.item.name,
    unit: position.item.unit,
    kind,
    tone,
    headline:
      position.spoilage.expiredLots > 0
        ? `${position.item.name}: ${position.spoilage.expiredLots} партия уже просрочена`
        : `${position.item.name} может не дожить до продажи`,
    consequence: `Под риском ${Math.round(position.spoilage.atRiskSharePpm / 10_000)}% остатка при вашем пороге ${
      position.spoilage.toleranceBps / 100
    }%.`,
    amountMinor: money.amountMinor,
    amountBasis: money.basis,
    deadline: expiry === null ? 'срок партии неизвестен' : hoursToWords(expiry),
    actionLabel: 'Открыть решение',
    actionHref: '/app/decisions',
  };
}

/**
 * Всё, что показывает кабинет.
 *
 * Один вызов вместо десяти на экране: страница остаётся разметкой, а порядок
 * чтения и правила отбора живут здесь, где их видно и можно проверить.
 */
export async function loadCabinet(): Promise<{
  businessName: string;
  isMock: boolean;
  decisions: CabinetDecision[];
  positionsTotal: number;
  /** Закупочная стоимость того, чего не хватит до точки заказа. */
  shortageMinor: number;
  /** Уже потраченные деньги, которые могут уйти в мусор. */
  spoilageMinor: number;
  /** Ложь, если у части позиций нет цены: тогда обе суммы неполные. */
  riskAtStakeKnown: boolean;
  orders: CabinetOrder[];
  suppliers: CabinetSupplier[];
  impact: CabinetImpact;
  wasteHistory: CabinetHistoryEntry[];
  eventHistory: CabinetHistoryEntry[];
  decisionHistory: CabinetHistoryEntry[];
}> {
  const ctx = await requireBusinessContext();
  const { positions, isMock } = await loadSupplyPositions();
  const queue = buildRiskQueue(positions, 5);

  const [orderRows, performanceRows, impactRows, wasteRows, eventRows, decisionRows] = await Promise.all([
    ctx.supabase
      .from('purchase_orders')
      .select('id,status,is_urgent,expected_at,total_cost_minor,suppliers(name),purchase_order_items(id)')
      .eq('business_id', ctx.businessId)
      .in('status', OPEN_ORDER_STATUSES)
      .order('expected_at', { ascending: true, nullsFirst: false })
      .limit(10),
    ctx.supabase
      .from('supplier_performance')
      .select('supplier_id,orders_total,orders_on_time_in_full,shortfall_rate_ppm,avg_delay_hours,avg_freshness_days,last_delivery_at,suppliers(name)')
      .eq('business_id', ctx.businessId)
      .order('orders_total', { ascending: false })
      .limit(6),
    ctx.supabase
      .from('impact_measurements')
      .select('kind,value_minor')
      .eq('business_id', ctx.businessId),
    ctx.supabase
      .from('inventory_events')
      .select('id,occurred_at,quantity_delta_milli,note,waste_reason,supply_items(name_ru,unit)')
      .eq('business_id', ctx.businessId)
      .eq('event_type', 'waste')
      .order('occurred_at', { ascending: false })
      .limit(8),
    ctx.supabase
      .from('inventory_events')
      .select('id,occurred_at,event_type,quantity_delta_milli,source,note,supply_items(name_ru,unit)')
      .eq('business_id', ctx.businessId)
      .order('occurred_at', { ascending: false })
      .limit(12),
    ctx.supabase
      .from('decision_contracts')
      .select('id,status,headline,decided_at,created_at,expected_cost_minor,supply_items(name_ru)')
      .eq('business_id', ctx.businessId)
      .order('created_at', { ascending: false })
      .limit(8),
  ]);

  // Стоимость риска считается по всей витрине, а не по пяти карточкам очереди:
  // очередь ограничена вниманием владельца, а деньги — нет.
  //
  // Дефицит и списание держатся раздельно. Это разные убытки: первый — деньги,
  // которые ещё предстоит потратить, чтобы не потерять продажу; второй — деньги,
  // уже потраченные и рискующие уйти в мусор. Одна сумма из них складывалась бы
  // красиво и означала бы неизвестно что.
  let shortageMinor = 0;
  let spoilageMinor = 0;
  let riskAtStakeKnown = true;
  for (const position of positions) {
    if (position.spoilage.overTolerance) {
      if (position.spoilage.atRiskCostMinor === null) riskAtStakeKnown = false;
      else spoilageMinor += position.spoilage.atRiskCostMinor;
    }

    if (position.assessment.level !== 'none') {
      const price = position.item.currentPriceMinor;
      if (price === null) riskAtStakeKnown = false;
      else shortageMinor += Math.round((position.assessment.shortfallMilli * price) / 1000);
    }
  }

  const sumOf = (kind: string) =>
    (impactRows.data ?? []).filter((row) => row.kind === kind).reduce((total, row) => total + Number(row.value_minor), 0);

  const impact: CabinetImpact = {
    forecastMinor: sumOf('forecast'),
    influencedMinor: sumOf('influenced'),
    verifiedMinor: sumOf('verified_fact'),
    // Ноль здесь не заглушка и не скромность. База запрещает демонстрационной
    // строке быть подтверждённым фактом, поэтому в демо-магазине подтверждённый
    // эффект не может быть ничем, кроме нуля, — и это правильное поведение.
    verifiedNote: isMock
      ? 'В демонстрационном магазине подтверждённого эффекта не бывает: база не даёт демо-строке стать подтверждённым фактом. Ноль — это правило, а не пустая ячейка.'
      : 'Подтверждённый эффект появляется после замера с базовым периодом, а не по прошествии времени.',
  };

  // Дельта знаковая, но знак уже сказан словом: «Списание −12 стеблей» читается
  // как двойное отрицание. Направление несёт заголовок строки, число — величину.
  const quantityWords = (milli: number | null, unit: string | null) =>
    milli === null ? null : `${(Math.abs(Number(milli)) / 1000).toLocaleString('ru-RU')} ${unit ?? ''}`.trim();

  return {
    businessName: ctx.business.name,
    isMock,
    decisions: queue.map(decisionOf),
    positionsTotal: positions.length,
    shortageMinor,
    spoilageMinor,
    riskAtStakeKnown,
    orders: (orderRows.data ?? []).map((row) => ({
      id: row.id,
      supplier: row.suppliers?.name ?? 'Поставщик не указан',
      status: row.status,
      statusLabel: STATUS_LABEL[row.status] ?? row.status,
      isUrgent: row.is_urgent,
      expectedAt: row.expected_at,
      totalCostMinor: Number(row.total_cost_minor),
      itemCount: (row.purchase_order_items ?? []).length,
    })),
    suppliers: (performanceRows.data ?? []).map((row) => ({
      supplierId: row.supplier_id,
      name: row.suppliers?.name ?? 'Поставщик',
      ordersTotal: row.orders_total,
      // Процент от нуля поставок — не ноль процентов, а отсутствие ответа.
      otifPpm: row.orders_total > 0 ? Math.round((row.orders_on_time_in_full / row.orders_total) * 1_000_000) : null,
      shortfallRatePpm: row.shortfall_rate_ppm,
      avgDelayHours: row.avg_delay_hours,
      avgFreshnessDays: row.avg_freshness_days === null ? null : Number(row.avg_freshness_days),
      lastDeliveryAt: row.last_delivery_at,
    })),
    impact,
    wasteHistory: (wasteRows.data ?? []).map((row) => ({
      id: row.id,
      at: row.occurred_at,
      title: row.supply_items?.name_ru ?? 'Позиция',
      detail: WASTE_REASON[row.waste_reason ?? ''] ?? row.note ?? 'причина не указана',
      quantity: quantityWords(row.quantity_delta_milli, row.supply_items?.unit ?? null),
    })),
    eventHistory: (eventRows.data ?? []).map((row) => ({
      id: row.id,
      at: row.occurred_at,
      title: `${EVENT_LABEL[row.event_type] ?? row.event_type} · ${row.supply_items?.name_ru ?? 'позиция'}`,
      detail: row.note ?? SOURCE_LABEL[row.source] ?? row.source,
      quantity: quantityWords(row.quantity_delta_milli, row.supply_items?.unit ?? null),
    })),
    decisionHistory: (decisionRows.data ?? []).map((row) => ({
      id: row.id,
      at: row.decided_at ?? row.created_at,
      title: row.headline,
      detail: row.status === 'approved' ? 'подтверждено владельцем' : `статус: ${row.status}`,
      quantity: row.expected_cost_minor > 0 ? `${Number(row.expected_cost_minor).toLocaleString('ru-RU')} ₸` : null,
    })),
  };
}

export type { SupplyPosition };
