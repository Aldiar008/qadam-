import 'server-only';

import {
  forecastDailyDemand,
  type DemandEvent,
  type ForecastResult,
} from '@/domain/forecast';
import { assessSpoilageRisk, type InventoryLot, type SpoilageAssessment } from '@/domain/freshness';
import { assessStockoutRisk, type RiskAssessment } from '@/domain/risk';
import type { DemandSample } from '@/domain/inventory';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireBusinessContext } from './repository';

/**
 * Пересчёт снабжения: остаток → прогноз → риск.
 *
 * Расчёт живёт здесь, а не в базе, по одной причине: формулы прогноза и риска
 * должны быть покрыты обычными тестами и читаться как текст. В базе остаётся
 * то, что обязано быть атомарным, — запись движения вместе с остатком.
 *
 * Снимки прогноза и риска пишутся служебной ролью: клиенту эти таблицы выданы
 * только на чтение, иначе «уверенность 99%» можно было бы проставить из
 * браузера.
 */

/** Сколько дней истории читаем для прогноза. */
const HISTORY_WINDOW_DAYS = 28;

export interface SupplyItemPolicy {
  id: string;
  name: string;
  unit: string;
  category: string | null;
  packSizeMilli: number;
  moqMilli: number;
  minStockMilli: number;
  shelfLifeDays: number | null;
  leadTimeP80Hours: number;
  serviceLevelZMilli: number;
  currentPriceMinor: number | null;
  currentSupplier: string | null;
  /** Насколько больно остаться без позиции: у роз перед праздником — очень. */
  criticality: 'critical' | 'normal' | 'optional';
  /** Какую долю списания владелец считает нормальной, в базисных пунктах. */
  spoilageToleranceBps: number;
}

export interface SupplyPosition {
  item: SupplyItemPolicy;
  onHandMilli: number;
  inboundMilli: number;
  lastEventAt: string | null;
  history: DemandSample[];
  forecast: ForecastResult;
  assessment: RiskAssessment;
  /** Живые партии с их сроками — из них считается риск списания. */
  lots: InventoryLot[];
  spoilage: SpoilageAssessment;
  /** Сколько списано за окно истории: не спрос, но важный факт. */
  wastedMilli: number;
}

function toPolicy(row: {
  id: string;
  name_ru: string;
  unit: string;
  category: string | null;
  pack_size_milli: number;
  moq_milli: number;
  min_stock_milli: number;
  shelf_life_days: number | null;
  lead_time_p80_hours: number;
  service_level_z_milli: number;
  current_price_minor: number | null;
  current_supplier: string | null;
  criticality: string;
  spoilage_tolerance_bps: number;
}): SupplyItemPolicy {
  return {
    id: row.id,
    name: row.name_ru,
    unit: row.unit,
    category: row.category,
    packSizeMilli: Number(row.pack_size_milli),
    moqMilli: Number(row.moq_milli),
    minStockMilli: Number(row.min_stock_milli),
    shelfLifeDays: row.shelf_life_days,
    leadTimeP80Hours: row.lead_time_p80_hours,
    serviceLevelZMilli: row.service_level_z_milli,
    currentPriceMinor: row.current_price_minor === null ? null : Number(row.current_price_minor),
    currentSupplier: row.current_supplier,
    criticality: (row.criticality === 'critical' || row.criticality === 'optional' ? row.criticality : 'normal'),
    spoilageToleranceBps: row.spoilage_tolerance_bps,
  };
}

/**
 * Критичность поднимает уровень сервиса.
 *
 * Страховой запас — это плата за то, чтобы не остаться без товара. У роз перед
 * праздником пустая витрина стоит дороже лишнего ведра, у лент — наоборот.
 * Поэтому один и тот же разброс расхода превращается в разный запас.
 */
function serviceLevelFor(policy: SupplyItemPolicy): number {
  if (policy.criticality === 'critical') return 2326; // ~99% обслуживания
  if (policy.criticality === 'optional') return 1036; // ~85%
  return policy.serviceLevelZMilli;
}

/**
 * Собирает картину по всем позициям заведения.
 *
 * История расхода читается из базы одним вызовом на позицию: дневной ряд
 * возвращает функция `daily_demand`, потому что группировку по календарным дням
 * в часовом поясе заведения дешевле сделать там, где лежат данные.
 */
export async function loadSupplyPositions(nowIso = new Date().toISOString()): Promise<{
  positions: SupplyPosition[];
  isMock: boolean;
  timezone: string;
}> {
  const ctx = await requireBusinessContext();
  const timezone = ctx.business.timezone ?? 'Asia/Almaty';
  const isMock = ctx.business.mode === 'demo';

  const [{ data: items }, { data: balances }, { data: lotRows }, { data: eventRows }, { data: wasteRows }] =
    await Promise.all([
      ctx.supabase
        .from('supply_items')
        .select('id,name_ru,unit,category,pack_size_milli,moq_milli,min_stock_milli,shelf_life_days,lead_time_p80_hours,service_level_z_milli,current_price_minor,current_supplier,criticality,spoilage_tolerance_bps')
        .eq('business_id', ctx.businessId)
        .order('name_ru'),
      ctx.supabase
        .from('inventory_balances')
        .select('supply_item_id,on_hand_milli,inbound_milli,last_event_at')
        .eq('business_id', ctx.businessId),
      // Только живые партии: пустые нужны истории, а не расчёту свежести.
      ctx.supabase
        .from('inventory_lots')
        .select('id,supply_item_id,received_at,expires_at,remaining_milli,unit_cost_minor')
        .eq('business_id', ctx.businessId)
        .gt('remaining_milli', 0)
        .order('expires_at', { ascending: true, nullsFirst: false }),
      // Общий календарь платформы плюс события этого магазина.
      ctx.supabase
        .from('demand_events')
        .select('code,name_ru,event_date,lead_days,lift_ppm,categories,source,verified,approved')
        .or(`business_id.is.null,business_id.eq.${ctx.businessId}`)
        .order('event_date'),
      ctx.supabase
        .from('inventory_events')
        .select('supply_item_id,quantity_delta_milli')
        .eq('business_id', ctx.businessId)
        .eq('event_type', 'waste'),
    ]);

  const balanceByItem = new Map(
    (balances ?? []).map((row) => [row.supply_item_id, row]),
  );

  const lotsByItem = new Map<string, InventoryLot[]>();
  for (const row of lotRows ?? []) {
    const list = lotsByItem.get(row.supply_item_id) ?? [];
    list.push({
      id: row.id,
      receivedAt: row.received_at,
      expiresAt: row.expires_at,
      remainingMilli: Number(row.remaining_milli),
      unitCostMinor: row.unit_cost_minor === null ? null : Number(row.unit_cost_minor),
    });
    lotsByItem.set(row.supply_item_id, list);
  }

  const wastedByItem = new Map<string, number>();
  for (const row of wasteRows ?? []) {
    wastedByItem.set(
      row.supply_item_id,
      (wastedByItem.get(row.supply_item_id) ?? 0) + Math.abs(Number(row.quantity_delta_milli)),
    );
  }

  const calendar: DemandEvent[] = (eventRows ?? []).map((row) => ({
    code: row.code,
    name: row.name_ru,
    date: row.event_date,
    leadDays: row.lead_days,
    liftPpm: row.lift_ppm,
    categories: row.categories ?? [],
    source: row.source,
    verified: row.verified,
    approved: row.approved,
  }));

  const targetDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(nowIso));

  const positions: SupplyPosition[] = [];

  for (const row of items ?? []) {
    const policy = toPolicy(row);
    const balance = balanceByItem.get(policy.id);
    const onHandMilli = Number(balance?.on_hand_milli ?? 0);
    const inboundMilli = Number(balance?.inbound_milli ?? 0);

    const { data: demand } = await ctx.supabase.rpc('daily_demand', {
      p_business_id: ctx.businessId,
      p_supply_item_id: policy.id,
      p_location_id: null as unknown as string,
      p_days: HISTORY_WINDOW_DAYS,
      p_timezone: timezone,
    });

    const history: DemandSample[] = (demand ?? []).map((sample: { demand_date: string; quantity_milli: number }) => ({
      date: sample.demand_date,
      quantityMilli: Number(sample.quantity_milli),
    }));

    const forecast = forecastDailyDemand({
      history,
      targetDate,
      source: `inventory_events за ${HISTORY_WINDOW_DAYS} дней`,
      isMock,
      events: calendar,
      category: policy.category,
    });

    const assessment = assessStockoutRisk({
      onHandMilli,
      inboundMilli,
      dailyForecastMilli: forecast.dailyForecastMilli,
      sigmaDailyMilli: forecast.sigmaDailyMilli,
      policy: {
        leadTimeP80Hours: policy.leadTimeP80Hours,
        serviceLevelZMilli: serviceLevelFor(policy),
        minStockMilli: policy.minStockMilli,
      },
      forecastConfidencePpm: forecast.confidencePpm,
      lastEventAt: balance?.last_event_at ?? null,
      now: nowIso,
      source: 'inventory_balances + demand_forecasts',
      isMock,
    });

    const lots = lotsByItem.get(policy.id) ?? [];
    const spoilage = assessSpoilageRisk({
      lots,
      dailyForecastMilli: forecast.dailyForecastMilli,
      toleranceBps: policy.spoilageToleranceBps,
      now: nowIso,
      source: 'inventory_lots + demand_forecasts',
      isMock,
    });

    positions.push({
      item: policy,
      onHandMilli,
      inboundMilli,
      lastEventAt: balance?.last_event_at ?? null,
      history,
      forecast,
      assessment,
      lots,
      spoilage,
      wastedMilli: wastedByItem.get(policy.id) ?? 0,
    });
  }

  return { positions, isMock, timezone };
}

/** Очередь на сегодня: только то, что требует решения, и не длиннее пяти строк. */
export interface QueueEntry {
  position: SupplyPosition;
  /** Чего именно опасаемся: остаться без товара или выбросить его. */
  kind: 'stockout' | 'spoilage';
  /** Насколько срочно — по нему очередь и сортируется. */
  weight: number;
}

/**
 * Очередь на сегодня из двух видов риска сразу.
 *
 * Для цветочного магазина «мало» и «много» одинаково больно, поэтому нельзя
 * показывать только дефицит: ведро тюльпанов, которое не успеет продаться,
 * стоит владельцу тех же денег, что и пустая полка с розами. Обе беды
 * попадают в один список и соревнуются за внимание по срочности.
 *
 * Одна позиция даёт не больше одной карточки: если товар и заканчивается, и
 * частично вянет, важнее дефицит — списание можно уменьшить следующим заказом,
 * а упущенную продажу вернуть нельзя.
 */
export function buildRiskQueue(positions: readonly SupplyPosition[], limit = 5): QueueEntry[] {
  const entries: QueueEntry[] = [];

  for (const position of positions) {
    if (position.assessment.level !== 'none') {
      const clock = position.assessment.timeToStockoutHours ?? 999;
      // Чем меньше часов до нуля, тем выше вес; критичность позиции добавляет.
      const weight =
        1_000 - Math.min(clock, 240) + (position.item.criticality === 'critical' ? 200 : 0);
      entries.push({ position, kind: 'stockout', weight });
      continue;
    }

    if (position.spoilage.overTolerance && position.spoilage.atRiskMilli > 0) {
      const hours = position.spoilage.nearestExpiryHours ?? 240;
      const weight = 700 - Math.min(Math.max(hours, 0), 240) + Math.round(position.spoilage.atRiskSharePpm / 20_000);
      entries.push({ position, kind: 'spoilage', weight });
    }
  }

  return entries.sort((left, right) => right.weight - left.weight).slice(0, limit);
}

export async function loadRiskQueue(limit = 5): Promise<{
  queue: QueueEntry[];
  totalPositions: number;
  isMock: boolean;
}> {
  const { positions, isMock } = await loadSupplyPositions();
  return { queue: buildRiskQueue(positions, limit), totalPositions: positions.length, isMock };
}

/**
 * Сохраняет снимки прогноза и риска.
 *
 * Снимок нужен не для скорости, а для разбирательства: когда через неделю
 * владелец спросит «почему ты сказал заказывать», должно быть видно, какой ряд
 * и какая версия формулы это утверждали. Поэтому запись идёт после каждого
 * пересчёта, а не только когда риск подтвердился.
 */
export async function persistSupplySnapshots(positions: readonly SupplyPosition[]): Promise<{ written: number }> {
  const ctx = await requireBusinessContext();
  // Снимки пишет служебная роль: пользовательской сессии эти таблицы выданы
  // только на чтение, иначе «уверенность 99%» и «риска нет» можно было бы
  // проставить прямо из браузера, минуя расчёт.
  const admin = createAdminClient();
  const isMock = ctx.business.mode === 'demo';
  const timezone = ctx.business.timezone ?? 'Asia/Almaty';
  const targetDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  let written = 0;

  for (const position of positions) {
    const { data: forecastRow, error: forecastError } = await admin
      .from('demand_forecasts')
      .insert({
        business_id: ctx.businessId,
        supply_item_id: position.item.id,
        target_date: targetDate,
        daily_forecast_milli: position.forecast.dailyForecastMilli,
        baseline_milli: position.forecast.baselineMilli,
        weekday_factor_ppm: position.forecast.weekdayFactorPpm,
        wape_ppm: position.forecast.wapePpm,
        confidence_ppm: position.forecast.confidencePpm,
        sigma_daily_milli: position.forecast.sigmaDailyMilli,
        sample_days: position.forecast.sampleDays,
        days_with_demand: position.forecast.daysWithDemand,
        model_version: position.forecast.modelVersion,
        assumptions: [...position.forecast.assumptions],
        is_mock: isMock,
      })
      .select('id')
      .single();

    if (forecastError) continue;
    written += 1;

    // Открытый риск по позиции всегда один: прежний закрывается, новый пишется
    // строкой. Так у риска появляется история — видно, что позиция входила в
    // очередь трижды за неделю, а это уже разговор о поставщике, а не о запасе.
    await admin
      .from('supply_risks')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .eq('business_id', ctx.businessId)
      .eq('supply_item_id', position.item.id)
      .eq('status', 'open');

    // Риск списания пишется своей строкой: он живёт по другим правилам и
    // закрывается не тем же событием, что дефицит.
    if (position.spoilage.overTolerance && position.spoilage.atRiskMilli > 0) {
      await admin.from('supply_risks').insert({
        business_id: ctx.businessId,
        supply_item_id: position.item.id,
        forecast_id: forecastRow.id,
        risk_type: 'expiry',
        level: position.spoilage.atRiskSharePpm > position.spoilage.toleranceBps * 200 ? 'warning' : 'watch',
        on_hand_milli: position.onHandMilli,
        inbound_milli: position.inboundMilli,
        daily_forecast_milli: position.forecast.dailyForecastMilli,
        time_to_stockout_hours: position.assessment.timeToStockoutHours,
        lead_time_p80_hours: position.assessment.leadTimeP80Hours,
        coverage_gap_hours: position.assessment.coverageGapHours,
        safety_stock_milli: position.assessment.safetyStockMilli,
        reorder_point_milli: position.assessment.reorderPointMilli,
        shortfall_milli: 0,
        at_risk_milli: position.spoilage.atRiskMilli,
        at_risk_cost_minor: position.spoilage.atRiskCostMinor,
        at_risk_share_ppm: position.spoilage.atRiskSharePpm,
        nearest_expiry_hours: position.spoilage.nearestExpiryHours,
        confidence_ppm: position.forecast.confidencePpm,
        reason: `Не успеет продаться до потери свежести: ${Math.round(position.spoilage.atRiskSharePpm / 10_000)}% остатка`,
        model_version: position.spoilage.modelVersion,
        evidence: {
          formula: { atRisk: 'по каждой партии: остаток − то, что успеет продаться до её срока' },
          lots: position.lots.length,
          expiredLots: position.spoilage.expiredLots,
          toleranceBps: position.spoilage.toleranceBps,
          assumptions: [...position.spoilage.assumptions],
          source: 'inventory_lots',
          isMock,
        },
        status: 'open',
        detected_at: new Date().toISOString(),
        is_mock: isMock,
      });
    }

    if (position.assessment.level === 'none') continue;

    const evidence = {
      formula: {
        timeToStockout: 'остаток / дневной прогноз × 24',
        safetyStock: 'z × σ дневного расхода × √(срок поставки в днях)',
        reorderPoint: 'дневной прогноз × срок поставки в днях + страховой запас',
      },
      forecast: {
        modelVersion: position.forecast.modelVersion,
        sampleDays: position.forecast.sampleDays,
        daysWithDemand: position.forecast.daysWithDemand,
        wapePpm: position.forecast.wapePpm,
        weekdayFactorPpm: position.forecast.weekdayFactorPpm,
      },
      assumptions: [...position.assessment.assumptions],
      source: 'inventory_events',
      isMock,
    };

    await admin.from('supply_risks').insert({
      business_id: ctx.businessId,
      supply_item_id: position.item.id,
      forecast_id: forecastRow.id,
      risk_type: 'stockout',
      level: position.assessment.level,
      on_hand_milli: position.onHandMilli,
      inbound_milli: position.inboundMilli,
      daily_forecast_milli: position.forecast.dailyForecastMilli,
      time_to_stockout_hours: position.assessment.timeToStockoutHours,
      lead_time_p80_hours: position.assessment.leadTimeP80Hours,
      coverage_gap_hours: position.assessment.coverageGapHours,
      safety_stock_milli: position.assessment.safetyStockMilli,
      reorder_point_milli: position.assessment.reorderPointMilli,
      shortfall_milli: position.assessment.shortfallMilli,
      at_risk_milli: position.spoilage.atRiskMilli,
      at_risk_cost_minor: position.spoilage.atRiskCostMinor,
      at_risk_share_ppm: position.spoilage.atRiskSharePpm,
      nearest_expiry_hours: position.spoilage.nearestExpiryHours,
      confidence_ppm: position.forecast.confidencePpm,
      reason: position.assessment.reason,
      model_version: position.assessment.modelVersion,
      evidence,
      status: 'open',
      detected_at: new Date().toISOString(),
      is_mock: isMock,
    });
  }

  return { written };
}
