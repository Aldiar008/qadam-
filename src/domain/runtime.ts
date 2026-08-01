import { DomainError } from './shared.ts';
import type { GosInputs } from './gos.ts';
import type { PromotionMechanic } from './simulator.ts';

export interface CompileCommand {
  businessId: string; signalId: string; recommendationId: string; audienceCustomerIds: string[]; consentScope: string;
  simulator: { baselineConversion: number; uplift: { pessimistic: number; base: number; optimistic: number }; averageOrderValueMinor: number; unitCostMinor: number; channelCostPerContactMinor: number; fixedCostMinor: number; durationDays: number; frequencyCap: number; cannibalization: number; mechanic: PromotionMechanic; period: { start: string; end: string }; source: string };
  gos: GosInputs; contentBrief: { ru: string; kk: string }; channel: string; attributionPlan: Record<string, unknown>; stopRule: Record<string, unknown>; previewHash?: string;
}

function object(value: unknown, name: string): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DomainError('INVALID_REQUEST', `${name} must be an object`); return value as Record<string, unknown>; }
function string(value: unknown, name: string): string { if (typeof value !== 'string' || !value.trim()) throw new DomainError('INVALID_REQUEST', `${name} is required`); return value; }
function number(value: unknown, name: string): number { if (typeof value !== 'number' || !Number.isFinite(value)) throw new DomainError('INVALID_REQUEST', `${name} must be a number`); return value; }
function uuid(value: unknown, name: string): string { const result = string(value,name); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) throw new DomainError('INVALID_REQUEST', `${name} must be UUID`); return result; }

export function parseCompileCommand(raw: unknown): CompileCommand {
  const body=object(raw,'body'), simulator=object(body.simulator,'simulator'), uplift=object(simulator.uplift,'uplift'), content=object(body.contentBrief,'contentBrief'), gos=object(body.gos,'gos');
  const ids=body.audienceCustomerIds; if (!Array.isArray(ids) || ids.length>500) throw new DomainError('INVALID_REQUEST','audienceCustomerIds must be an array up to 500');
  const mechanic=object(simulator.mechanic,'mechanic') as unknown as PromotionMechanic;
  const period=object(simulator.period,'period');
  return { businessId:uuid(body.businessId,'businessId'), signalId:uuid(body.signalId,'signalId'), recommendationId:uuid(body.recommendationId,'recommendationId'), audienceCustomerIds:[...new Set(ids.map((id)=>uuid(id,'customerId')))], consentScope:string(body.consentScope,'consentScope'), simulator:{ baselineConversion:number(simulator.baselineConversion,'baselineConversion'), uplift:{ pessimistic:number(uplift.pessimistic,'uplift.pessimistic'), base:number(uplift.base,'uplift.base'), optimistic:number(uplift.optimistic,'uplift.optimistic') }, averageOrderValueMinor:number(simulator.averageOrderValueMinor,'averageOrderValueMinor'), unitCostMinor:number(simulator.unitCostMinor,'unitCostMinor'), channelCostPerContactMinor:number(simulator.channelCostPerContactMinor,'channelCostPerContactMinor'), fixedCostMinor:number(simulator.fixedCostMinor,'fixedCostMinor'), durationDays:number(simulator.durationDays,'durationDays'), frequencyCap:number(simulator.frequencyCap,'frequencyCap'), cannibalization:number(simulator.cannibalization,'cannibalization'), mechanic, period:{start:string(period.start,'period.start'),end:string(period.end,'period.end')}, source:string(simulator.source,'source') }, gos:{P:number(gos.P,'gos.P'),S:number(gos.S,'gos.S'),R:number(gos.R,'gos.R'),V:number(gos.V,'gos.V'),G:number(gos.G,'gos.G'),C:number(gos.C,'gos.C'),D:number(gos.D,'gos.D'),A:number(gos.A,'gos.A'),L:number(gos.L,'gos.L')}, contentBrief:{ru:string(content.ru,'contentBrief.ru'),kk:string(content.kk,'contentBrief.kk')}, channel:string(body.channel,'channel'), attributionPlan:object(body.attributionPlan,'attributionPlan'), stopRule:object(body.stopRule,'stopRule'), previewHash:body.previewHash===undefined?undefined:string(body.previewHash,'previewHash') };
}

export function parseTransitionCommand(raw: unknown): { toStatus: string; expectedVersion: number; idempotencyKey: string } { const body=object(raw,'body'); return { toStatus:string(body.toStatus,'toStatus'), expectedVersion:number(body.expectedVersion,'expectedVersion'), idempotencyKey:string(body.idempotencyKey,'idempotencyKey') }; }
export function parseLaunchCommand(raw: unknown): { name: string; channel: string; expectedVersion: number; idempotencyKey: string } { const body=object(raw,'body'); return { name:string(body.name,'name'), channel:string(body.channel,'channel'), expectedVersion:number(body.expectedVersion,'expectedVersion'), idempotencyKey:string(body.idempotencyKey,'idempotencyKey') }; }
