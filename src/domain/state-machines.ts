import { DomainError } from './shared.ts';

export type RecommendationState = 'open' | 'accepted' | 'snoozed' | 'rejected' | 'expired';
export type GrowthContractState = 'draft' | 'compiled' | 'awaiting_approval' | 'approved' | 'launching' | 'running' | 'simulated' | 'paused' | 'completed' | 'cancelled' | 'failed';
export type AutomationState = 'draft' | 'active' | 'paused' | 'disabled';
const recommendation: Readonly<Record<RecommendationState, readonly RecommendationState[]>> = { open: ['accepted','snoozed','rejected','expired'], accepted: [], snoozed: ['open','rejected','expired'], rejected: [], expired: [] };
const contract: Readonly<Record<GrowthContractState, readonly GrowthContractState[]>> = { draft: ['compiled','cancelled'], compiled: ['awaiting_approval','draft','cancelled'], awaiting_approval: ['approved','draft','cancelled'], approved: ['launching','cancelled'], launching: ['running','simulated','failed'], running: ['paused','completed','failed'], simulated: ['completed','failed'], paused: ['running','completed','cancelled'], completed: [], cancelled: [], failed: ['draft'] };
const automation: Readonly<Record<AutomationState, readonly AutomationState[]>> = { draft: ['active','disabled'], active: ['paused','disabled'], paused: ['active','disabled'], disabled: [] };

export function assertTransition<T extends string>(machine: 'recommendation' | 'growth_contract' | 'automation', from: T, to: T): void {
  const graph = machine === 'recommendation' ? recommendation : machine === 'growth_contract' ? contract : automation;
  const allowed = (graph as Readonly<Record<string, readonly string[]>>)[from];
  if (!allowed?.includes(to)) throw new DomainError('INVALID_STATE_TRANSITION', `${machine}: ${from} -> ${to} is not allowed`);
}

export interface VersionedState<T extends string> { state: T; optimisticVersion: number; lastIdempotencyKey?: string }
export function transition<T extends string>(machine: 'recommendation' | 'growth_contract' | 'automation', entity: VersionedState<T>, to: T, expectedVersion: number, idempotencyKey: string): VersionedState<T> {
  if (!idempotencyKey.trim()) throw new DomainError('MISSING_IDEMPOTENCY_KEY', 'idempotency key required');
  if (entity.lastIdempotencyKey === idempotencyKey) return entity;
  if (entity.optimisticVersion !== expectedVersion) throw new DomainError('OPTIMISTIC_LOCK_CONFLICT', 'entity version changed');
  assertTransition(machine, entity.state, to);
  return { state: to, optimisticVersion: entity.optimisticVersion + 1, lastIdempotencyKey: idempotencyKey };
}
