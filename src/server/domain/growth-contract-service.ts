import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { calculateGos, compileGrowthContract, evaluateMarginShield, simulateScenarios, type CompileCommand, type CompiledGrowthContract } from '@/domain/index.ts';
import { DomainError } from '@/domain/shared.ts';

export class GrowthContractService {
  private readonly db: SupabaseClient;
  private readonly actorId: string;
  constructor(db: SupabaseClient, actorId: string) { this.db = db; this.actorId = actorId; }

  async compile(command: CompileCommand): Promise<CompiledGrowthContract & { id: string }> {
    const [businessResult, profileResult, limitsResult, signalResult, recommendationResult, consentResult, previousResult] = await Promise.all([
      this.db.from('businesses').select('id,mode,currency').eq('id',command.businessId).maybeSingle(),
      this.db.from('business_profiles').select('margin_floor_bps').eq('business_id',command.businessId).maybeSingle(),
      this.db.from('business_limits').select('monthly_budget_minor,approval_threshold_minor').eq('business_id',command.businessId).maybeSingle(),
      this.db.from('signals').select('*').eq('id',command.signalId).eq('business_id',command.businessId).maybeSingle(),
      this.db.from('recommendations').select('*').eq('id',command.recommendationId).eq('business_id',command.businessId).maybeSingle(),
      // Single source of truth for consent: the same DB resolution the audience trigger enforces.
      command.audienceCustomerIds.length ? this.db.rpc('effective_consent_customers',{ p_business_id:command.businessId, p_scope:command.consentScope, p_customer_ids:command.audienceCustomerIds }) : Promise.resolve({ data: [], error: null }),
      this.db.from('growth_contracts').select('*').eq('business_id',command.businessId).eq('signal_id',command.signalId).order('version',{ascending:false}).limit(1).maybeSingle(),
    ]);
    const error = businessResult.error ?? profileResult.error ?? limitsResult.error ?? signalResult.error ?? recommendationResult.error ?? consentResult.error ?? previousResult.error;
    if (error) throw new DomainError('DATABASE_READ_FAILED', error.message);
    if (!businessResult.data || !profileResult.data || !limitsResult.data || !signalResult.data || !recommendationResult.data) throw new DomainError('FORBIDDEN_OR_MISSING', 'tenant data unavailable through RLS');
    const granted = new Set((consentResult.data ?? []) as string[]).size;
    const contributionMargin = (command.simulator.averageOrderValueMinor-command.simulator.unitCostMinor)/command.simulator.averageOrderValueMinor;
    const simulator = simulateScenarios({ ...command.simulator, eligibleAudience:granted, contributionMargin, budgetMinor:Number(limitsResult.data.monthly_budget_minor), currency:businessResult.data.currency });
    const marginDecision = evaluateMarginShield({ simulator, mechanic:command.simulator.mechanic, averageOrderValueMinor:command.simulator.averageOrderValueMinor, contributionMargin, minimumContributionPerOrderMinor:Math.round(command.simulator.averageOrderValueMinor*(profileResult.data.margin_floor_bps/10000)), marginFloor:profileResult.data.margin_floor_bps/10000, budgetMinor:Number(limitsResult.data.monthly_budget_minor), maxCannibalization:0.25, cannibalization:command.simulator.cannibalization, consentEligibleCount:granted });
    const gos = calculateGos({ ...command.gos, P:Math.max(0,Math.min(1,simulator.scenarios.base.incrementalContributionMinor/50000)), D:signalResult.data.confidence/100 }, { expectedIncrementalContributionMinor:simulator.scenarios.base.incrementalContributionMinor, hasConsent:granted>0, withinLimits:simulator.scenarios.base.campaignCostMinor<=Number(limitsResult.data.monthly_budget_minor) });
    const previous = previousResult.data ? { schemaVersion:previousResult.data.schema_version, version:previousResult.data.version, status:previousResult.data.status, snapshot:previousResult.data.accepted_snapshot, contentHash:previousResult.data.content_hash, requiresApproval:true as const, approvedAt:previousResult.data.approved_at ?? undefined } as unknown as CompiledGrowthContract : undefined;
    const compiled = compileGrowthContract({ schemaVersion:1, signal:signalResult.data, recommendation:recommendationResult.data, goal:'reactivate', audience:{ inclusion:['selected_segment'], exclusion:['no_consent'], eligibleCount:granted, ruleVersion:1 }, consentSummary:{ scope:command.consentScope, granted, excluded:command.audienceCustomerIds.length-granted, checkedAt:new Date().toISOString() }, simulator, marginDecision, gos, contentBrief:command.contentBrief, channel:command.channel, attributionPlan:command.attributionPlan, stopRule:command.stopRule, ownerLimits:{ budgetMinor:Number(limitsResult.data.monthly_budget_minor), marginFloor:profileResult.data.margin_floor_bps/10000, approvalThresholdMinor:Number(limitsResult.data.approval_threshold_minor) } }, previous);
    if (command.previewHash && command.previewHash!==compiled.contentHash) throw new DomainError('PREVIEW_MISMATCH','client preview differs from server recalculation');
    if (previousResult.data?.content_hash===compiled.contentHash) return { ...compiled, id:previousResult.data.id };
    const insert = await this.db.from('growth_contracts').insert({ business_id:command.businessId, signal_id:command.signalId, recommendation_id:command.recommendationId, schema_version:compiled.schemaVersion, version:compiled.version, status:'compiled', accepted_snapshot:compiled.snapshot, content_hash:compiled.contentHash, created_by:this.actorId, is_mock:businessResult.data.mode==='demo', consent_summary:compiled.snapshot.consentSummary, simulator_result:compiled.snapshot.simulator, margin_decision:compiled.snapshot.marginDecision, attribution_plan:compiled.snapshot.attributionPlan, owner_limits_snapshot:compiled.snapshot.ownerLimits, compiled_at:new Date().toISOString() }).select('id').single();
    if (insert.error) throw new DomainError('DATABASE_WRITE_FAILED',insert.error.message);
    return { ...compiled, id:insert.data.id };
  }
}
