import { DomainError } from './shared.ts';
import type { GosResult } from './gos.ts';
import type { MarginDecision } from './margin-shield.ts';
import type { SimulatorResult } from './simulator.ts';
import type { GrowthContractState } from './state-machines.ts';

export interface GrowthContractInput {
  schemaVersion: number; signal: Readonly<Record<string, unknown>>; recommendation: Readonly<Record<string, unknown>>;
  goal: string; audience: { inclusion: readonly string[]; exclusion: readonly string[]; eligibleCount: number; ruleVersion: number };
  consentSummary: { scope: string; granted: number; excluded: number; checkedAt: string };
  simulator: SimulatorResult; marginDecision: MarginDecision; gos: GosResult;
  contentBrief: { ru: string; kk: string }; channel: string; attributionPlan: Readonly<Record<string, unknown>>;
  stopRule: Readonly<Record<string, unknown>>; ownerLimits: { budgetMinor: number; marginFloor: number; approvalThresholdMinor: number };
}
export interface CompiledGrowthContract { schemaVersion: number; version: number; status: GrowthContractState; snapshot: Readonly<GrowthContractInput>; contentHash: string; requiresApproval: true; approvedAt?: string }

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
function fnv1a(text: string): string { let hash = 0x811c9dc5; for (let index = 0; index < text.length; index++) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 0x01000193); } return `fnv1a-${(hash >>> 0).toString(16).padStart(8,'0')}`; }

export function compileGrowthContract(input: GrowthContractInput, previous?: CompiledGrowthContract): CompiledGrowthContract {
  if (!input.consentSummary?.scope || input.consentSummary.granted <= 0) throw new DomainError('CONSENT_REQUIRED', 'consent summary with eligible audience required');
  if (!input.simulator?.scenarios?.base) throw new DomainError('SIMULATOR_REQUIRED', 'simulator result required');
  if (!input.marginDecision) throw new DomainError('MARGIN_DECISION_REQUIRED', 'Margin Shield decision required');
  if (input.marginDecision.status === 'blocked') throw new DomainError('MARGIN_BLOCKED', 'blocked economics cannot compile');
  if (!input.attributionPlan || !Object.keys(input.attributionPlan).length) throw new DomainError('ATTRIBUTION_REQUIRED', 'attribution plan required');
  if (!input.ownerLimits || input.ownerLimits.budgetMinor < input.simulator.scenarios.base.campaignCostMinor) throw new DomainError('LIMITS_EXCEEDED', 'owner limits missing or exceeded');
  if (!input.contentBrief.ru.trim() || !input.contentBrief.kk.trim()) throw new DomainError('BILINGUAL_CONTENT_REQUIRED', 'RU and KK briefs required');
  const snapshot = Object.freeze(structuredClone(input)); const contentHash = fnv1a(stable(snapshot));
  if (previous && previous.contentHash === contentHash) return previous;
  return { schemaVersion: input.schemaVersion, version: previous ? previous.version + 1 : 1, status: 'compiled', snapshot, contentHash, requiresApproval: true };
}
