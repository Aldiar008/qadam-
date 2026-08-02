export type BusinessMode = 'demo' | 'production';

const truthy = new Set(['1', 'true', 'yes', 'on', 'enabled']);

/**
 * Deployment ceiling: whether this installation exposes seeded demo tenants.
 * Tenant behaviour itself is decided by public.businesses.mode.
 */
export function demoTenantsEnabled(env: Readonly<Record<string, string | undefined>> = process.env) {
  const explicit = env.QADAM_DEMO_TENANTS_ENABLED;
  if (explicit != null) return truthy.has(explicit.trim().toLowerCase());
  return env.QADAM_APP_MODE === 'DEMO_MODE';
}

/**
 * Narrows the mode column to the two values the schema permits.
 *
 * `businesses.mode` is `text` with a check constraint, so the generated types
 * only know it as a string. An unrecognised value means the schema drifted, and
 * the safe reading of "I do not know what this tenant is" is `production`:
 * that grants nothing, whereas guessing `demo` would hand a real tenant
 * simulations and time travel. This mirrors the rule the migrations already
 * follow — the absence of a grant means "not permitted", never "no limit".
 */
export function asBusinessMode(value: string | null | undefined): BusinessMode {
  return value === 'demo' ? 'demo' : 'production';
}

export function modeTelemetryLabel(mode: BusinessMode) {
  return mode === 'demo' ? 'DEMO_TENANT' : 'PRODUCTION_TENANT';
}
