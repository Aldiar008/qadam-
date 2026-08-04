/**
 * Коды состояний — по-русски.
 *
 * База хранит состояния английскими словами, и это правильно: `approved` —
 * значение колонки, а не текст для человека. Беда в том, что экраны печатали их
 * как есть, и владелец читал «draft», «granted», «marketing.telegram» и
 * «verified_fact». Здесь один словарь на всё приложение.
 *
 * Незнакомый код показывается как есть, а не заменяется прочерком: код,
 * которого нет в словаре, — это признак того, что схема ушла вперёд, и прятать
 * его от человека хуже, чем показать некрасиво.
 */

const CONTENT_STATUS: Record<string, string> = {
  draft: 'черновик',
  approved: 'утверждён',
  published: 'опубликован',
  archived: 'в архиве',
};

const MEMBER_STATUS: Record<string, string> = {
  active: 'работает',
  invited: 'приглашён',
  revoked: 'отключён',
  suspended: 'приостановлен',
};

const INVITATION_STATUS: Record<string, string> = {
  pending: 'ждёт ответа',
  accepted: 'принято',
  revoked: 'отозвано',
  expired: 'истекло',
};

const CONSENT_STATUS: Record<string, string> = {
  granted: 'разрешено',
  revoked: 'отозвано',
  denied: 'отказано',
  expired: 'истекло',
  pending: 'не подтверждено',
};

const CONSENT_SCOPE: Record<string, string> = {
  'marketing.telegram': 'рассылка в Telegram',
  'marketing.email': 'рассылка на email',
  'marketing.sms': 'рассылка по SMS',
  'marketing.whatsapp': 'рассылка в WhatsApp',
  'loyalty.participation': 'участие в программе лояльности',
  'data.processing': 'обработка данных',
};

const CONSENT_SOURCE: Record<string, string> = {
  qr: 'по QR-коду',
  telegram: 'в Telegram',
  import: 'из импорта',
  manual: 'вручную',
  web: 'на сайте',
  owner_onboarding: 'при настройке',
};

const RUN_STATUS: Record<string, string> = {
  running: 'выполняется',
  completed: 'выполнено',
  skipped: 'пропущено',
  failed: 'ошибка',
  queued: 'в очереди',
};

const TRIGGER_SOURCE: Record<string, string> = {
  scheduler: 'по расписанию',
  manual: 'вручную',
  owner: 'владельцем',
  cycle: 'циклом исполнения',
  webhook: 'по событию',
};

const OUTCOME: Record<string, string> = {
  proposed: 'подготовлено предложение',
  acted: 'выполнено действие',
  reported: 'составлен отчёт',
  nothing_to_do: 'ничего не найдено',
  skipped: 'пропущено',
};

function lookup(table: Record<string, string>, code: string | null | undefined): string {
  if (!code) return '—';
  return table[code] ?? code;
}

export const contentStatusLabel = (code: string | null | undefined) => lookup(CONTENT_STATUS, code);
export const memberStatusLabel = (code: string | null | undefined) => lookup(MEMBER_STATUS, code);
export const invitationStatusLabel = (code: string | null | undefined) => lookup(INVITATION_STATUS, code);
export const consentStatusLabel = (code: string | null | undefined) => lookup(CONSENT_STATUS, code);
export const consentScopeLabel = (code: string | null | undefined) => lookup(CONSENT_SCOPE, code);
export const consentSourceLabel = (code: string | null | undefined) => lookup(CONSENT_SOURCE, code);
export const runStatusLabel = (code: string | null | undefined) => lookup(RUN_STATUS, code);
export const triggerSourceLabel = (code: string | null | undefined) => lookup(TRIGGER_SOURCE, code);
export const outcomeLabel = (code: string | null | undefined) => lookup(OUTCOME, code);

export const STATUS_TABLES = {
  content: CONTENT_STATUS,
  member: MEMBER_STATUS,
  invitation: INVITATION_STATUS,
  consentStatus: CONSENT_STATUS,
  consentScope: CONSENT_SCOPE,
  consentSource: CONSENT_SOURCE,
  run: RUN_STATUS,
  triggerSource: TRIGGER_SOURCE,
  outcome: OUTCOME,
};
