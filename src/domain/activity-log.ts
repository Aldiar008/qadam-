/**
 * Журнал действий человеческими словами.
 *
 * `activity_logs.action` — это коды вида `content.social_generated`, и до сих
 * пор экраны показывали их как есть. Владельцу кофейни такая строка не говорит
 * ничего, а положение турнира просит в личном кабинете «историю действий
 * (созданные акции, уведомления, изменения)» — то есть список, который можно
 * прочитать.
 *
 * Незнакомый код не прячется и не подменяется выдуманным текстом: он
 * показывается как есть, с пометкой раздела «Прочее». Список действий растёт
 * вместе с продуктом, и молча терять новые события хуже, чем показать код.
 */

export type ActivityKind = 'campaign' | 'content' | 'customer' | 'loyalty' | 'automation' | 'team' | 'settings' | 'other';

export interface ActivityEntry {
  id: string;
  action: string;
  occurredAt: string;
  resourceType: string | null;
  metadata: Record<string, unknown> | null;
}

export interface ReadableActivity extends ActivityEntry {
  kind: ActivityKind;
  title: string;
  /** true, если код действия нам незнаком — экран об этом честно говорит. */
  unknown: boolean;
}

const DICTIONARY: Record<string, { kind: ActivityKind; title: string }> = {
  'signal.detected': { kind: 'campaign', title: 'Найден сигнал дня' },
  'signal.remeasured': { kind: 'campaign', title: 'Сигнал перепроверен по свежим продажам' },
  'recommendation.generated': { kind: 'campaign', title: 'Собрана рекомендация' },
  'growth_contract.approved': { kind: 'campaign', title: 'Утверждён Growth Contract' },
  'campaign.simulated': { kind: 'campaign', title: 'Кампания просимулирована (демо-режим)' },
  'campaign.launch_requested': { kind: 'campaign', title: 'Запрошен запуск кампании' },
  'campaign.audience_expanded': { kind: 'campaign', title: 'Аудитория кампании расширена' },
  'campaign.expansion_refused': { kind: 'campaign', title: 'Расширение аудитории отклонено' },
  'campaign.stop_loss_paused': { kind: 'campaign', title: 'Кампания остановлена защитой маржи' },
  'delivery.requested': { kind: 'campaign', title: 'Сообщения поставлены в очередь' },
  'marketing.telegram': { kind: 'campaign', title: 'Отправка в Telegram' },
  'marketing.email': { kind: 'campaign', title: 'Отправка по email' },
  'marketing.whatsapp': { kind: 'campaign', title: 'Отправка в WhatsApp' },

  'content.generated': { kind: 'content', title: 'Сгенерированы тексты кампании' },
  'content.social_generated': { kind: 'content', title: 'Обновлён пакет материалов для соцсетей' },

  'customers.import': { kind: 'customer', title: 'Импорт клиентов' },
  'customers.imported': { kind: 'customer', title: 'Клиенты импортированы' },
  'customers.exported': { kind: 'customer', title: 'Выгрузка клиентов в CSV' },
  'segment.recomputed': { kind: 'customer', title: 'Сегмент пересчитан' },
  'consent.granted': { kind: 'customer', title: 'Гость дал согласие' },
  'consent.revoked': { kind: 'customer', title: 'Согласие отозвано' },
  'privacy.customer_anonymized': { kind: 'customer', title: 'Данные гостя обезличены' },

  'loyalty.program_created': { kind: 'loyalty', title: 'Создана программа лояльности' },
  'loyalty.create': { kind: 'loyalty', title: 'Создана программа лояльности' },
  'loyalty.join': { kind: 'loyalty', title: 'Гость вступил в программу' },
  'loyalty.joined': { kind: 'loyalty', title: 'Гость вступил в программу' },
  'loyalty.earned': { kind: 'loyalty', title: 'Начислен штамп за визит' },
  'loyalty.redeem': { kind: 'loyalty', title: 'Погашена награда' },
  'loyalty.redeemed': { kind: 'loyalty', title: 'Погашена награда' },
  'qr.revoked': { kind: 'loyalty', title: 'QR-код отозван' },

  'automation.run': { kind: 'automation', title: 'Сработала автоматизация' },
  'execution.demo_cycle': { kind: 'automation', title: 'Прогнан цикл исполнения' },
  'execution.emergency_stopped': { kind: 'automation', title: 'Аварийная остановка' },
  'execution.resumed': { kind: 'automation', title: 'Исполнение возобновлено' },
  'impact.recomputed': { kind: 'automation', title: 'Impact Ledger пересчитан' },
  'demo.time_jump': { kind: 'automation', title: 'Демо-время сдвинуто вперёд' },

  'team.invited': { kind: 'team', title: 'Приглашён сотрудник' },
  'team.joined': { kind: 'team', title: 'Сотрудник присоединился' },
  'team.role_changed': { kind: 'team', title: 'Изменена роль сотрудника' },
  'team.invitation_revoked': { kind: 'team', title: 'Приглашение отозвано' },
  'team.ownership_transferred': { kind: 'team', title: 'Передано владение' },
  'telegram.owner_linked': { kind: 'team', title: 'Telegram владельца привязан' },
  'admin.telegram_key_used': { kind: 'team', title: 'Использован ключ администратора в Mini App' },

  'onboarding.completed': { kind: 'settings', title: 'Настройка завершена' },
  'business.settings_updated': { kind: 'settings', title: 'Изменены настройки заведения' },
  'business.limits_updated': { kind: 'settings', title: 'Изменены лимиты рассылок' },
  'entitlement.consume': { kind: 'settings', title: 'Списан лимит тарифа' },
};

export const KIND_LABEL: Record<ActivityKind, string> = {
  campaign: 'Кампании',
  content: 'Контент',
  customer: 'Клиенты',
  loyalty: 'Лояльность',
  automation: 'Автоматизации',
  team: 'Команда',
  settings: 'Настройки',
  other: 'Прочее',
};

export function readActivity(entry: ActivityEntry): ReadableActivity {
  const known = DICTIONARY[entry.action];
  return {
    ...entry,
    kind: known?.kind ?? 'other',
    title: known?.title ?? entry.action,
    unknown: !known,
  };
}

/** Сколько записей в каждом разделе — для фильтров, которые не врут про пустоту. */
export function countByKind(entries: ReadableActivity[]): Array<{ kind: ActivityKind; label: string; count: number }> {
  const counts = new Map<ActivityKind, number>();
  for (const entry of entries) counts.set(entry.kind, (counts.get(entry.kind) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([kind, count]) => ({ kind, label: KIND_LABEL[kind], count }));
}
