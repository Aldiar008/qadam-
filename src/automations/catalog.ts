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
  | 'data_quality'
  | 'second_visit'
  | 'abandoned_item'
  | 'check_drop'
  | 'low_margin_item';

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
    action: { kind: 'propose_growth_contract', goal: 'repeat_visit', channel: 'telegram' },
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
    action: { kind: 'propose_growth_contract', goal: 'reactivate', channel: 'telegram' },
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
    action: { kind: 'propose_growth_contract', goal: 'fill_quiet_hours', channel: 'telegram' },
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
    action: { kind: 'propose_growth_contract', goal: 'repeat_visit', channel: 'telegram' },
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
    action: { kind: 'propose_growth_contract', goal: 'repeat_visit', channel: 'telegram' },
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
    action: { kind: 'propose_growth_contract', goal: 'reactivate', channel: 'telegram' },
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
  // Четыре правила ниже опираются только на то, что есть у любого заведения с
  // кассой: покупки и меню. Половина каталога до них требовала того, чего у
  // маленькой кофейни может не быть вовсе — VIP-сегмента, цикла услуги, даты
  // рождения, — и раздел выглядел пустым не потому, что правил мало.
  {
    code: 'second_visit',
    version: 'second_visit.v1',
    nameRu: 'Первый визит без второго',
    descriptionRu: 'Находит гостей, которые купили один раз и не вернулись. Второй визит стоит дешевле любой новой продажи.',
    trigger: { kind: 'single_purchase_only', days: 14, intervalHours: 24 },
    filters: { excludeStages: ['anonymized'], requiresConsent: true },
    action: { kind: 'propose_growth_contract', goal: 'repeat_visit', channel: 'telegram' },
    guardrails: { ...BASE_GUARDRAILS, maxRecipientsPerRun: 40 },
    defaultMode: 'assistant',
    autopilotGates: ['Не менее 3 подтверждённых кампаний', 'Канал в состоянии connected'],
  },
  {
    code: 'abandoned_item',
    version: 'abandoned_item.v1',
    nameRu: 'Гость бросил любимую позицию',
    descriptionRu: 'Ищет тех, кто регулярно брал одну позицию и перестал. Считается по составу чека, а не по общей сумме.',
    trigger: { kind: 'item_abandoned', days: 30, minOrders: 2, intervalHours: 24 },
    filters: { requiresConsent: true, requiresReceiptLines: true },
    action: { kind: 'propose_growth_contract', goal: 'repeat_visit', channel: 'telegram' },
    guardrails: { ...BASE_GUARDRAILS, maxRecipientsPerRun: 30 },
    defaultMode: 'assistant',
    autopilotGates: ['Касса передаёт состав чека, а не только сумму', 'Канал в состоянии connected'],
  },
  {
    code: 'check_drop',
    version: 'check_drop.v1',
    nameRu: 'Средний чек падает',
    descriptionRu: 'Сравнивает средний чек за 28 дней с предыдущими 28 и предупреждает, когда он просел больше чем на 10%.',
    trigger: { kind: 'average_check_drop', windowDays: 28, thresholdBps: 1000, intervalHours: 24 },
    filters: {},
    action: { kind: 'notify_summary', category: 'risk' },
    guardrails: { ...BASE_GUARDRAILS, requiresConsent: false, maxRecipientsPerRun: 1 },
    defaultMode: 'assistant',
    autopilotGates: ['Правило только предупреждает и ничего не отправляет гостям'],
  },
  {
    code: 'low_margin_item',
    version: 'low_margin_item.v1',
    nameRu: 'Позиции ниже порога маржи',
    descriptionRu: 'Проверяет меню против вашей минимальной маржи. Именно такие позиции превращают акцию в убыток.',
    trigger: { kind: 'catalog_margin_below_floor', intervalHours: 168 },
    filters: { requiresCatalogCost: true },
    action: { kind: 'notify_summary', category: 'risk' },
    guardrails: { ...BASE_GUARDRAILS, requiresConsent: false, maxRecipientsPerRun: 1 },
    defaultMode: 'assistant',
    autopilotGates: ['Правило только предупреждает'],
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

/**
 * Правило по-человечески.
 *
 * Карточка правила печатала свои настройки как JSON: `{"kind":"customer_inactive",
 * "days":30,"intervalHours":24}`. Это точное описание и нечитаемое: владелец
 * кофейни не обязан разбирать фигурные скобки, чтобы понять, кого правило ищет.
 * Здесь тот же объект превращается в предложение. Незнакомый ключ не
 * выбрасывается — он показывается как есть, потому что молча потерять настройку
 * хуже, чем показать её некрасиво.
 */
export function describeTrigger(trigger: Record<string, unknown>): string {
  const days = Number(trigger.days ?? trigger.cycleDays ?? trigger.windowDays ?? 0);
  const every = Number(trigger.intervalHours ?? 0);
  const cadence = every >= 168 ? 'Проверяется раз в неделю'
    : every >= 24 ? 'Проверяется раз в сутки'
      : every > 0 ? `Проверяется каждые ${every} ч`
        : 'Проверяется в общем цикле';

  const what: Record<string, string> = {
    first_purchase: 'Срабатывает после первой покупки гостя',
    customer_inactive: `Ищет гостей без визита дольше ${days || 30} дней`,
    capacity_below_threshold: 'Следит за часами, загруженными меньше чем наполовину',
    service_cycle_elapsed: `Напоминает, когда прошло ${days || 45} дней с прошлой услуги`,
    birthday_within: `Смотрит, у кого день рождения в ближайшие ${days || 3} дня`,
    vip_inactive: `Ищет VIP-гостей без визита дольше ${days || 21} дней`,
    campaign_without_content: 'Ищет кампании, у которых нет утверждённого текста',
    underperformance: 'Следит за откликом идущих кампаний',
    weekly: 'Собирает итоги недели',
    daily: 'Проверяет качество данных',
    single_purchase_only: `Ищет гостей с одной покупкой, сделанной больше ${days || 14} дней назад`,
    item_abandoned: `Ищет позиции, которые гость брал регулярно и не брал ${days || 30} дней`,
    average_check_drop: 'Сравнивает средний чек с предыдущим таким же периодом',
    catalog_margin_below_floor: 'Проверяет меню против вашей минимальной маржи',
  };

  const kind = typeof trigger.kind === 'string' ? trigger.kind : '';
  return `${what[kind] ?? `Условие: ${kind || 'не задано'}`}. ${cadence}.`;
}

/** Ограничения — теми же словами, что владелец услышал бы от менеджера. */
export function describeGuardrails(guardrails: Record<string, unknown>): string[] {
  const lines: string[] = [];
  if (guardrails.requiresConsent) lines.push('Только тем, кто дал согласие');
  if (guardrails.respectsQuietHours) lines.push('Не пишет в тихие часы');
  if (guardrails.respectsSuppressionList) lines.push('Не трогает отписавшихся');
  if (guardrails.ownerApprovalRequired) lines.push('Отправка — только после вашего подтверждения');
  if (guardrails.stopOnNegativeContribution) lines.push('Останавливается, если предложение уходит в минус');
  if (guardrails.nativeReviewRequiredForKk) lines.push('Казахский текст требует проверки носителем');
  if (guardrails.canPauseAutomatically) lines.push('Может остановить кампанию само');
  if (guardrails.canRestartAutomatically === false) lines.push('Возобновить может только владелец');
  const cap = Number(guardrails.maxRecipientsPerRun ?? 0);
  if (cap > 1) lines.push(`Не больше ${cap} человек за один запуск`);
  return lines;
}
