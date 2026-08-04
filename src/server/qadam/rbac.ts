/**
 * Role matrix.
 *
 * Deliberately not marked `server-only`: it holds no secret and no server API.
 * The matrix is rendered to the owner on the team screen, and the test suite
 * asserts every cell, so it must be importable from a plain Node context too.
 *
 * This is the documentation and the implementation at once: the UI reads it to
 * decide what to render, the server actions read it to decide what to allow, and
 * the test suite asserts every cell. Where a capability is also enforced by RLS
 * or a database function, that is noted — the matrix is a convenience, never the
 * only line of defence.
 */

export type TenantRole = 'owner' | 'manager' | 'marketer' | 'analyst' | 'viewer';

export const TENANT_ROLES: readonly TenantRole[] = ['owner', 'manager', 'marketer', 'analyst', 'viewer'];

/**
 * Roles the product actually offers when inviting or changing someone.
 *
 * «Маркетолог» из продукта убран: в кофейне или салоне кампанию готовит
 * менеджер, а отдельное маркетинговое место оставалось незанятым. Само значение
 * `marketer` осталось — под ним теперь бариста, человек за стойкой: он видит
 * гостей и готовит кампании, но не подтверждает запуск и не трогает лимиты.
 * Права те же, поменялось название.
 */
export const ASSIGNABLE_ROLES: readonly TenantRole[] = ['owner', 'manager', 'marketer', 'analyst', 'viewer'];

export function isAssignableRole(role: string): role is TenantRole {
  return (ASSIGNABLE_ROLES as readonly string[]).includes(role);
}

/**
 * Как роль называется на экране.
 *
 * `marketer` — значение колонки в базе, и оно упоминается в политиках RLS и в
 * проверках домена; переименовывать его пришлось бы миграцией, которая трогает
 * права доступа ради слова. Меняется подпись: в кофейне у стойки стоит бариста,
 * а не маркетолог, и владелец приглашает в команду именно его.
 */
export const ROLE_LABELS: Record<TenantRole, string> = {
  owner: 'Владелец',
  manager: 'Менеджер',
  marketer: 'Бариста',
  analyst: 'Аналитик',
  viewer: 'Наблюдатель',
};

export type Capability =
  | 'view_dashboard'
  | 'view_customers'
  | 'edit_customers'
  | 'manage_consent'
  | 'export_customer_data'
  | 'delete_customer_data'
  | 'create_campaign'
  | 'approve_launch'
  | 'manage_automations'
  | 'manage_connectors'
  | 'manage_connector_secrets'
  | 'manage_team'
  | 'manage_billing'
  | 'manage_limits'
  | 'emergency_stop';

/** Capabilities the product treats as critical; each one is audited. */
export const CRITICAL_CAPABILITIES: readonly Capability[] = [
  'manage_billing',
  'manage_team',
  'export_customer_data',
  'delete_customer_data',
  'manage_limits',
  'manage_connector_secrets',
  'approve_launch',
];

export const CAPABILITY_LABELS: Record<Capability, string> = {
  view_dashboard: 'Смотреть дашборд',
  view_customers: 'Смотреть клиентов',
  edit_customers: 'Редактировать клиентов',
  manage_consent: 'Управлять согласиями',
  export_customer_data: 'Экспортировать данные клиентов',
  delete_customer_data: 'Удалять данные клиентов',
  create_campaign: 'Готовить кампании',
  approve_launch: 'Подтверждать запуск',
  manage_automations: 'Управлять автоматизациями',
  manage_connectors: 'Настраивать каналы',
  manage_connector_secrets: 'Управлять секретами каналов',
  manage_team: 'Управлять командой',
  manage_billing: 'Управлять тарифом',
  manage_limits: 'Менять лимиты',
  emergency_stop: 'Аварийная остановка',
};

const MATRIX: Record<Capability, readonly TenantRole[]> = {
  view_dashboard: ['owner', 'manager', 'marketer', 'analyst', 'viewer'],
  view_customers: ['owner', 'manager', 'marketer', 'analyst', 'viewer'],
  edit_customers: ['owner', 'manager'],
  manage_consent: ['owner', 'manager'],
  export_customer_data: ['owner', 'manager', 'marketer'],
  delete_customer_data: ['owner', 'manager'],
  create_campaign: ['owner', 'manager', 'marketer'],
  // Approving a launch commits real money and real messages, so a marketer may
  // prepare a campaign but not authorise it.
  approve_launch: ['owner', 'manager'],
  manage_automations: ['owner', 'manager', 'marketer'],
  manage_connectors: ['owner', 'manager'],
  manage_connector_secrets: ['owner'],
  manage_team: ['owner', 'manager'],
  manage_billing: ['owner'],
  manage_limits: ['owner'],
  emergency_stop: ['owner', 'manager'],
};

export function can(role: TenantRole, capability: Capability): boolean {
  return MATRIX[capability].includes(role);
}

export function capabilitiesFor(role: TenantRole): Capability[] {
  return (Object.keys(MATRIX) as Capability[]).filter((capability) => can(role, capability));
}

export function rolesFor(capability: Capability): readonly TenantRole[] {
  return MATRIX[capability];
}

/** Rendered in the team screen and asserted by the tests. */
export const ROLE_MATRIX = MATRIX;
