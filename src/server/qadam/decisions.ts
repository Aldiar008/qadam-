import 'server-only';

import { formatQuantity } from '@/domain/inventory';
import { compareSuppliers, type SupplierOffer } from '@/domain/supplier-score';
import { solveOrder } from '@/domain/order-solver';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireBusinessContext } from './repository';
import { loadSupplyPositions, type SupplyPosition } from './supply-core';

/**
 * Сборка решения по закупке.
 *
 * Риск отвечает на вопрос «что случится»; решение — на вопрос «что делать».
 * Между ними лежит работа, которую владелец цветочного магазина делает в уме
 * между двумя покупателями: сколько добрать до точки перезаказа, у кого это
 * есть сейчас, кто успеет до того, как витрина опустеет, и во что это встанет.
 *
 * Решение сохраняется строкой с версией. Пересчёт поднимает версию той же
 * строки, а не создаёт вторую: две карточки про одни и те же розы — это не
 * выбор, а неразбериха. Подтверждение проверяет версию и отклоняется, если
 * данные успели измениться.
 */

const HOURS_PER_DAY = 24;

export interface DecisionDraft {
  position: SupplyPosition;
  headline: string;
  consequence: string;
  neededMilli: number;
  urgentMilli: number;
  plan: {
    supplierId: string;
    supplierName: string;
    quantityMilli: number;
    unitPriceMinor: number;
    costMinor: number;
    leadTimeP80Hours: number;
    urgent: boolean;
  }[];
  rejected: { supplierName: string; reason: string; detail: string }[];
  expectedCostMinor: number;
  counterfactual: {
    allFastCostMinor: number | null;
    differenceMinor: number | null;
    note: string;
  };
  ranked: ReturnType<typeof compareSuppliers>['ranked'];
  evidence: Record<string, unknown>;
  modelVersion: string;
}

function toOffer(row: {
  supplier_id: string;
  unit_price_minor: number;
  pack_size_milli: number;
  moq_milli: number;
  available_milli: number;
  lead_time_p80_hours: number;
  freshness_on_arrival_days: number | null;
  matches_variety: boolean;
  suppliers: { name: string; payment_terms_days: number } | null;
  performance: {
    orders_total: number;
    orders_on_time_in_full: number;
    shortfall_rate_ppm: number;
  } | null;
  shelfLifeDays: number | null;
}): SupplierOffer {
  const total = row.performance?.orders_total ?? 0;
  const otif = row.performance?.orders_on_time_in_full ?? 0;

  return {
    supplierId: row.supplier_id,
    supplierName: row.suppliers?.name ?? 'Без названия',
    unitPriceMinor: Number(row.unit_price_minor),
    packSizeMilli: Number(row.pack_size_milli),
    moqMilli: Number(row.moq_milli),
    availableMilli: Number(row.available_milli),
    leadTimeP80Hours: row.lead_time_p80_hours,
    // Если свежесть на приёмке не указана, считаем её полным сроком позиции:
    // занижать вслепую — значит наказывать поставщика за отсутствие данных.
    freshnessOnArrivalDays: row.freshness_on_arrival_days ?? row.shelfLifeDays ?? 0,
    otifPpm: total > 0 ? Math.round((otif / total) * 1_000_000) : 800_000,
    shortfallRatePpm: row.performance?.shortfall_rate_ppm ?? 0,
    sampleSize: total,
    paymentTermsDays: row.suppliers?.payment_terms_days ?? 0,
    matchesVariety: row.matches_variety,
  };
}

/**
 * Сколько добрать и сколько из этого нужно срочно.
 *
 * Общая потребность — до точки перезаказа. Срочная часть — то, чего не хватает,
 * чтобы дожить до ближайшей реальной поставки: именно её и нужно закрыть
 * быстрым поставщиком, а остальное можно взять дешевле.
 */
function needFor(position: SupplyPosition, fastestLeadHours: number): { neededMilli: number; urgentMilli: number } {
  const shortfall = Math.max(position.assessment.shortfallMilli, position.item.moqMilli);
  const neededMilli = Math.max(shortfall, 0);

  const clock = position.assessment.timeToStockoutHours;
  if (clock === null || position.forecast.dailyForecastMilli <= 0) {
    return { neededMilli, urgentMilli: 0 };
  }

  // Сколько разойдётся, пока едет самый быстрый: это и есть дыра, которую
  // нельзя закрыть плановой поставкой.
  const gapHours = Math.max(0, fastestLeadHours - clock);
  const urgentMilli = Math.min(
    neededMilli,
    Math.round((position.forecast.dailyForecastMilli * gapHours) / HOURS_PER_DAY),
  );

  return { neededMilli, urgentMilli };
}

/** Готовит черновик решения по одной позиции. `null`, если решать нечего. */
export async function buildDecisionDraft(position: SupplyPosition): Promise<DecisionDraft | null> {
  const ctx = await requireBusinessContext();
  const isMock = ctx.business.mode === 'demo';

  if (position.assessment.level === 'none' && !position.spoilage.overTolerance) return null;

  const { data: offerRows } = await ctx.supabase
    .from('supplier_offers')
    .select(
      'supplier_id,unit_price_minor,pack_size_milli,moq_milli,available_milli,lead_time_p80_hours,freshness_on_arrival_days,matches_variety,suppliers(name,payment_terms_days)',
    )
    .eq('business_id', ctx.businessId)
    .eq('supply_item_id', position.item.id);

  if (!offerRows || offerRows.length === 0) return null;

  const { data: performanceRows } = await ctx.supabase
    .from('supplier_performance')
    .select('supplier_id,orders_total,orders_on_time_in_full,shortfall_rate_ppm')
    .eq('business_id', ctx.businessId);

  const performanceBySupplier = new Map((performanceRows ?? []).map((row) => [row.supplier_id, row]));

  const offers = offerRows.map((row) =>
    toOffer({
      ...row,
      suppliers: Array.isArray(row.suppliers) ? row.suppliers[0] : row.suppliers,
      performance: performanceBySupplier.get(row.supplier_id) ?? null,
      shelfLifeDays: position.item.shelfLifeDays,
    }),
  );

  const fastestLead = Math.min(...offers.map((offer) => offer.leadTimeP80Hours));
  const { neededMilli, urgentMilli } = needFor(position, fastestLead);

  // Позиция под риском списания заказа не требует — там решение обратное:
  // уменьшить ближайшую закупку. Карточка всё равно нужна, но плана нет.
  const isSpoilage = position.assessment.level === 'none' && position.spoilage.overTolerance;

  const comparison = compareSuppliers({
    offers,
    neededMilli: Math.max(neededMilli, 1),
    // Для сравнения срок не отсекает: разделение заказа как раз про то, как
    // совместить быстрого и выгодного. Выполнимость проверит солвер.
    hoursUntilStockout: null,
    budgetMinor: null,
    requiredFreshnessDays: position.item.shelfLifeDays ?? 0,
    source: 'supplier_offers + supplier_performance',
    isMock,
  });

  const solved = isSpoilage
    ? null
    : solveOrder({
        offers: comparison.ranked,
        neededMilli,
        urgentMilli,
        hoursUntilStockout: position.assessment.timeToStockoutHours,
        budgetMinor: null,
        source: 'order-solver',
        isMock,
      });

  const unit = position.item.unit;
  const clock = position.assessment.timeToStockoutHours;

  const headline = isSpoilage
    ? `${position.item.name}: ${formatQuantity(position.spoilage.atRiskMilli, unit)} не успеет продаться`
    : clock === null
      ? `${position.item.name}: остаток ниже точки перезаказа`
      : `${position.item.name} закончится через ${clock} ч`;

  const consequence = isSpoilage
    ? `Если заказать столько же, к концу срока свежести придётся списать ${formatQuantity(position.spoilage.atRiskMilli, unit)}`
    : position.forecast.appliedEvents.length > 0
      ? `Витрина не выдержит спрос: ${position.forecast.appliedEvents.map((event) => event.name).join(', ')}`
      : 'Витрина опустеет раньше, чем приедет плановая поставка';

  const plan = (solved?.best?.lines ?? []).map((line) => ({
    supplierId: line.supplierId,
    supplierName: line.supplierName,
    quantityMilli: line.quantityMilli,
    unitPriceMinor: line.unitPriceMinor,
    costMinor: line.costMinor,
    leadTimeP80Hours: line.leadTimeP80Hours,
    urgent: line.urgent,
  }));

  return {
    position,
    headline,
    consequence,
    neededMilli,
    urgentMilli,
    plan,
    rejected: comparison.rejected.map((item) => ({
      supplierName: item.offer.supplierName,
      reason: item.reason,
      detail: item.detail,
    })),
    expectedCostMinor: solved?.best?.totalCostMinor ?? 0,
    counterfactual: {
      allFastCostMinor: solved?.allFast?.totalCostMinor ?? null,
      differenceMinor: solved?.savingVsAllFastMinor ?? null,
      note: 'Разница с вариантом «всё у быстрого» — прогноз, а не фактическая экономия',
    },
    ranked: comparison.ranked,
    evidence: {
      formula: {
        need: 'точка перезаказа − (остаток + то, что уже едет)',
        urgent: 'дневной прогноз × (срок быстрого поставщика − часы до пустой витрины)',
        score: comparison.explanation.formula,
        plan: solved?.explanation.formula ?? null,
      },
      forecast: {
        modelVersion: position.forecast.modelVersion,
        dailyForecastMilli: position.forecast.dailyForecastMilli,
        eventFactorPpm: position.forecast.eventFactorPpm,
        events: position.forecast.appliedEvents.map((event) => event.name),
        wapePpm: position.forecast.wapePpm,
        sampleDays: position.forecast.sampleDays,
      },
      assumptions: [...comparison.explanation.assumptions, ...(solved?.assumptions ?? [])],
      source: 'inventory_balances + inventory_lots + supplier_offers',
      isMock,
    },
    modelVersion: `${comparison.version}+${solved?.version ?? 'no-plan'}`,
  };
}

/**
 * Сохраняет решения по всем позициям, требующим внимания.
 *
 * Открытое решение по позиции всегда одно: если оно уже есть, поднимается его
 * версия и обновляется содержимое. Подтверждённые и отклонённые не трогаются —
 * они история, и переписывать её нельзя.
 */
export async function refreshDecisions(): Promise<{ created: number; updated: number }> {
  const ctx = await requireBusinessContext();
  const admin = createAdminClient();
  const isMock = ctx.business.mode === 'demo';
  const { positions } = await loadSupplyPositions();

  let created = 0;
  let updated = 0;

  for (const position of positions) {
    const draft = await buildDecisionDraft(position);

    const { data: existing } = await admin
      .from('decision_contracts')
      .select('id,version')
      .eq('business_id', ctx.businessId)
      .eq('supply_item_id', position.item.id)
      .eq('status', 'open')
      .maybeSingle();

    // Риск ушёл — открытое решение больше не актуально. Оно не удаляется:
    // «было и рассосалось» — это тоже история, по которой видно, что продукт
    // не выдумывал проблему.
    if (!draft) {
      if (existing) {
        await admin
          .from('decision_contracts')
          .update({ status: 'expired', updated_at: new Date().toISOString() })
          .eq('id', existing.id);
      }
      continue;
    }

    const payload = {
      business_id: ctx.businessId,
      supply_item_id: position.item.id,
      risk_type: position.assessment.level === 'none' ? 'expiry' : 'stockout',
      headline: draft.headline,
      consequence: draft.consequence,
      on_hand_milli: position.onHandMilli,
      daily_forecast_milli: position.forecast.dailyForecastMilli,
      time_to_stockout_hours: position.assessment.timeToStockoutHours,
      shelf_life_days: position.item.shelfLifeDays,
      recommended_quantity_milli: draft.plan.reduce((sum, line) => sum + line.quantityMilli, 0),
      urgent_quantity_milli: draft.urgentMilli,
      expected_cost_minor: draft.expectedCostMinor,
      counterfactual: draft.counterfactual,
      spoilage_at_risk_milli: position.spoilage.atRiskMilli,
      confidence_ppm: position.forecast.confidencePpm,
      plan: draft.plan,
      rejected_offers: draft.rejected,
      evidence: draft.evidence as never,
      model_version: draft.modelVersion,
      is_mock: isMock,
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      await admin
        .from('decision_contracts')
        .update({ ...payload, version: existing.version + 1 })
        .eq('id', existing.id);
      updated += 1;
    } else {
      await admin.from('decision_contracts').insert({ ...payload, version: 1, status: 'open' });
      created += 1;
    }
  }

  return { created, updated };
}
