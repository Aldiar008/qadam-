/**
 * One shape for a segment rule, in the language the owner speaks.
 *
 * The same object is stored in `customer_segments.definition`, counted by
 * `public.preview_segment_audience` and described on the segment card. Keeping
 * them identical is the point: the JSON shown on screen is the JSON that was
 * executed, so «правило» is a claim anyone can check rather than decoration.
 */

export interface SegmentRule {
  stage?: string;
  daysInactive?: number;
  minVisits?: number;
  minAovMinor?: number;
  consentFilter?: 'any' | 'loyalty_only' | 'marketing_required';
  channel?: string;
}

/**
 * One vocabulary for lifecycle stages.
 *
 * The customer list called `active` «Постоянные» while the segment named
 * «Постоянные» was `loyal`, so the same word meant two different groups on two
 * screens. Everything that names a stage now names it from here.
 */
export const STAGE_OPTIONS: ReadonlyArray<readonly [string, string]> = [
  ['new', 'Новые'],
  ['active', 'Активные'],
  ['loyal', 'Постоянные'],
  ['vip', 'VIP'],
  ['inactive', 'Спящие'],
  ['churned', 'Ушедшие'],
];

const STAGES: Record<string, string> = Object.fromEntries([...STAGE_OPTIONS, ['all', 'Все клиенты']]);

export const stageLabel = (stage?: string): string => STAGES[stage ?? ''] ?? stage ?? 'Все клиенты';

export const isLifecycleStage = (value: string): boolean => STAGE_OPTIONS.some(([code]) => code === value);

const positive = (value: unknown): number | undefined => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : undefined;
};

/** Reads whatever is stored in the column without trusting its shape. */
export function asSegmentRule(definition: unknown): SegmentRule {
  const raw = (definition ?? {}) as Record<string, unknown>;
  const filter = String(raw.consentFilter ?? '');
  return {
    stage: typeof raw.stage === 'string' && raw.stage ? raw.stage : undefined,
    daysInactive: positive(raw.daysInactive),
    minVisits: positive(raw.minVisits),
    minAovMinor: positive(raw.minAovMinor),
    consentFilter: filter === 'loyalty_only' || filter === 'marketing_required' || filter === 'any' ? filter : undefined,
    channel: typeof raw.channel === 'string' && raw.channel ? raw.channel : undefined,
  };
}

/**
 * Turns a rule into the sentences a card can show.
 *
 * An empty list means the stored value describes nothing — worth saying out
 * loud rather than rendering an empty box, because a segment whose rule cannot
 * be read is a segment nobody can audit.
 */
export function describeSegmentRule(definition: unknown): string[] {
  const rule = asSegmentRule(definition);
  const lines: string[] = [];
  if (rule.stage) lines.push(`Стадия клиента: ${stageLabel(rule.stage).toLowerCase()}`);
  if (rule.daysInactive) lines.push(`Не приходили ${rule.daysInactive}+ дней`);
  if (rule.minVisits) lines.push(`Минимум визитов: ${rule.minVisits}`);
  if (rule.minAovMinor) lines.push(`Средний чек от ${rule.minAovMinor.toLocaleString('ru-RU')} ₸`);
  if (rule.consentFilter === 'marketing_required') {
    lines.push(`Только с активным согласием на рассылку (${rule.channel ?? 'telegram'})`);
  }
  if (rule.consentFilter === 'loyalty_only') lines.push('Достаточно согласия на программу лояльности');
  return lines;
}

/** The consent scope a rule resolves to, or null when it filters by nothing. */
export function consentScopeOf(definition: unknown): string | null {
  const rule = asSegmentRule(definition);
  if (rule.consentFilter === 'marketing_required') return `marketing.${rule.channel ?? 'telegram'}`;
  if (rule.consentFilter === 'loyalty_only') return 'loyalty';
  return null;
}
