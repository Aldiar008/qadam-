/**
 * Versioned automation rule catalogue.
 *
 * Each entry is a template, not a live rule: creating an automation copies the
 * template's trigger/action/guardrails into the row and records which template
 * version was approved. Changing a template later does not silently change a
 * running automation — the stored `rule_version` and `approved_template_version`
 * say what the owner actually agreed to.
 *
 * Every template defaults to `assistant`. Autopilot is a separate, deliberate
 * step gated on trust conditions listed in `autopilotGates`.
 */

export type AutomationMode = 'manual' | 'assistant' | 'autopilot';

export type AutomationTypeCode =
  | 'welcome'
  | 'reactivation'
  | 'quiet_hours'
  | 'repeat_service'
  | 'birthday'
  | 'vip_care'
  | 'content_queue'
  | 'stop_loss'
  | 'weekly_review'
  | 'data_quality';

export interface AutomationTemplate {
  code: AutomationTypeCode;
  version: string;
  nameRu: string;
  descriptionRu: string;
  trigger: Record<string, unknown>;
  filters: Record<string, unknown>;
  action: Record<string, unknown>;
  guardrails: Record<string, unknown>;
  defaultMode: AutomationMode;
  /** What must be true before this rule may run unattended. */
  autopilotGates: readonly string[];
  /** Set when the rule cannot run at all yet, and why. Honest by design. */
  blockedReason?: string;
}

const BASE_GUARDRAILS = {
  requiresConsent: true,
  respectsQuietHours: true,
  respectsSuppressionList: true,
  ownerApprovalRequired: true,
  stopOnNegativeContribution: true,
};

export const AUTOMATION_TEMPLATES: readonly AutomationTemplate[] = [
  {
    code: 'welcome',
    version: 'welcome.v1',
    nameRu: 'Приветствие после первой покупки',
    descriptionRu: 'Срабатывает после первой покупки, если клиент дал согласие на сообщения.',
    trigger: { kind: 'first_purchase', withinDays: 7, intervalHours: 24 },
    filters: { lifecycleStage: 'new', requiresConsent: true },
    action: { kind: 'propose_growth_contract', goal: 'repeat_visit', channel: 'whatsapp' },
    guardrails: { ...BASE_GUARDRAILS, maxRecipientsPerRun: 50 },
    defaultMode: 'assistant',
    autopilotGates: ['Согласие подтверждено', 'Шаблон сообщения утверждён владельцем', 'Канал в состоянии connected'],
  },
  {
    code: 'reactivation',
    version: 'reactivation.v1',
    nameRu: 'Возврат после 30+ дней',
    descriptionRu: 'Ищет клиентов без визитов дольше заданного срока и предлагает безопасный win-back.',
    trigger: { kind: 'customer_inactive', days: 30, intervalHours: 24 },
    filters: { excludeStages: ['anonymized', 'churned'], requiresConsent: true },
    action: { kind: 'propose_growth_contract', goal: 'reactivate', channel: 'whatsapp' },
    guardrails: { ...BASE_GUARDRAILS, maxRecipientsPerRun: 25 },
    defaultMode: 'assistant',
    autopilotGates: ['Не менее 3 подтверждённых кампаний', 'Margin Shield ни разу не блокировал шаблон', 'Канал в состоянии connected'],
  },
  {
    code: 'quiet_hours',
    version: 'quiet_hours.v1',
    nameRu: 'Заполнение тихих часов',
    descriptionRu: 'Следит за загрузкой слотов и предлагает акцию, когда она ниже порога.',
    trigger: { kind: 'capacity_below_threshold', utilisationThreshold: 0.5, horizonDays: 7, intervalHours: 12 },
    filters: { weekdayOnly: true },
    action: { kind: 'propose_growth_contract', goal: 'fill_quiet_hours', channel: 'whatsapp' },
    guardrails: { ...BASE_GUARDRAILS, maxRecipientsPerRun: 40 },
    defaultMode: 'assistant',
    autopilotGates: ['Данные о загрузке обновляются автоматически', 'Канал в состоянии connected'],
  },
  {
    code: 'repeat_service',
    version: 'repeat_service.v1',
    nameRu: 'Повторная услуга по циклу',
    descriptionRu: 'Напоминает о повторной услуге через типичный для этого бизнеса интервал.',
    trigger: { kind: 'service_cycle_elapsed', cycleDays: 45, intervalHours: 24 },
    filters: { lifecycleStages: ['active', 'loyal', 'vip'], requiresConsent: true },
    action: { kind: 'propose_growth_contract', goal: 'repeat_visit', channel: 'whatsapp' },
    guardrails: { ...BASE_GUARDRAILS, maxRecipientsPerRun: 30 },
    defaultMode: 'assistant',
    autopilotGates: ['Цикл услуги подтверждён владельцем', 'Канал в состоянии connected'],
  },
  {
    code: 'birthday',
    version: 'birthday.v1',
    nameRu: 'День рождения клиента',
    descriptionRu: 'Поздравление и подарок в день рождения — только при законном согласии и подтверждённой дате.',
    trigger: { kind: 'birthday_within', days: 3, intervalHours: 24 },
    filters: { requiresBirthDate: true, requiresConsent: true, lawfulBasis: 'explicit_consent' },
    action: { kind: 'propose_growth_contract', goal: 'repeat_visit', channel: 'whatsapp' },
    guardrails: { ...BASE_GUARDRAILS, maxRecipientsPerRun: 20 },
    defaultMode: 'assistant',
    autopilotGates: ['Дата рождения собрана с явным согласием', 'Канал в состоянии connected'],
    // No lawful birth-date field exists in the schema yet, so the rule can be
    // created and inspected but will always report zero candidates.
    blockedReason: 'Поле даты рождения с законным основанием ещё не собирается — правило всегда вернёт 0 кандидатов.',
  },
  {
    code: 'vip_care',
    version: 'vip_care.v1',
    nameRu: 'Забота о VIP-клиентах',
    descriptionRu: 'Отмечает VIP-клиентов, которые давно не заходили, и предлагает персональное внимание.',
    trigger: { kind: 'vip_inactive', days: 21, intervalHours: 24 },
    filters: { lifecycleStages: ['vip'], requiresConsent: true },
    action: { kind: 'propose_growth_contract', goal: 'reactivate', channel: 'whatsapp' },
    guardrails: { ...BASE_GUARDRAILS, maxRecipientsPerRun: 10 },
    defaultMode: 'assistant',
    autopilotGates: ['VIP-сегмент проверен владельцем', 'Канал в состоянии connected'],
  },
  {
    code: 'content_queue',
    version: 'content_queue.v1',
    nameRu: 'Очередь контента',
    descriptionRu: 'Готовит пакет материалов к утверждённым кампаниям, чтобы владельцу оставалось только проверить.',
    trigger: { kind: 'campaign_without_content', intervalHours: 12 },
    filters: { campaignStatuses: ['approved', 'scheduled', 'running'] },
    action: { kind: 'prepare_content_pack', locales: ['ru', 'kk'] },
    guardrails: { ...BASE_GUARDRAILS, requiresConsent: false, nativeReviewRequiredForKk: true },
    defaultMode: 'assistant',
    autopilotGates: ['Казахский текст проверен носителем языка'],
  },
  {
    code: 'stop_loss',
    version: 'stop_loss.v1',
    nameRu: 'Стоп-лосс при слабом отклике',
    descriptionRu: 'Ставит кампанию на паузу, если отклик ниже порога. Возобновить может только владелец.',
    trigger: { kind: 'underperformance', minRedemptionBps: 500, minDelivered: 10, intervalHours: 6 },
    filters: { campaignStatuses: ['running', 'scheduled'] },
    action: { kind: 'pause_campaign', restartRequiresOwner: true },
    guardrails: { ...BASE_GUARDRAILS, requiresConsent: false, canPauseAutomatically: true, canRestartAutomatically: false },
    // A protective rule is the one case where acting alone is safer than waiting.
    defaultMode: 'autopilot',
    autopilotGates: ['Правило может только останавливать, но не возобновлять'],
  },
  {
    code: 'weekly_review',
    version: 'weekly_review.v1',
    nameRu: 'Еженедельный обзор',
    descriptionRu: 'Собирает итоги недели: что сработало, что остановлено, что требует решения.',
    trigger: { kind: 'weekly', dayOfWeek: 1, intervalHours: 168 },
    filters: {},
    action: { kind: 'notify_summary', category: 'result' },
    guardrails: { ...BASE_GUARDRAILS, requiresConsent: false, maxRecipientsPerRun: 1 },
    defaultMode: 'assistant',
    autopilotGates: ['Обзор только уведомляет и ничего не отправляет клиентам'],
  },
  {
    code: 'data_quality',
    version: 'data_quality.v1',
    nameRu: 'Качество данных',
    descriptionRu: 'Ищет пропущенные согласия, дубликаты и незаполненную экономику, из-за которых расчёты теряют точность.',
    trigger: { kind: 'daily', intervalHours: 24 },
    filters: {},
    action: { kind: 'notify_summary', category: 'risk' },
    guardrails: { ...BASE_GUARDRAILS, requiresConsent: false, maxRecipientsPerRun: 1 },
    defaultMode: 'assistant',
    autopilotGates: ['Правило только уведомляет'],
  },
];

export function findTemplate(code: string): AutomationTemplate | undefined {
  return AUTOMATION_TEMPLATES.find((template) => template.code === code);
}

/** Modes an owner may choose for a given template right now. */
export function allowedModes(template: AutomationTemplate): AutomationMode[] {
  // Autopilot stays off until the gates are met; only the protective stop-loss
  // ships with it enabled, because it can pause but never restart or send.
  return template.code === 'stop_loss'
    ? ['manual', 'assistant', 'autopilot']
    : ['manual', 'assistant'];
}
