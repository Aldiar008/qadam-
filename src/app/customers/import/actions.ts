'use server';

import { revalidatePath } from 'next/cache';
import { canManage, requireBusinessContext } from '@/server/qadam/repository';
import type { Json } from '@/types/database.generated';

export interface ImportRowInput {
  rowNumber: number;
  displayName: string;
  identityType: 'email' | 'phone';
  identityValue: string;
  visits: number;
  aovMinor: number;
  marketingConsent: boolean;
}

export interface ImportOutcome {
  ok: boolean;
  dataImportId?: string;
  rowsTotal?: number;
  inserted?: number;
  updated?: number;
  skipped?: number;
  invalid?: number;
  duplicate?: boolean;
  error?: string;
}

const MAX_ROWS = 1000;

export async function importCustomers(
  rows: ImportRowInput[],
  duplicateStrategy: 'skip' | 'update',
  idempotencyKey: string,
): Promise<ImportOutcome> {
  let ctx;
  try {
    ctx = await requireBusinessContext();
  } catch {
    return { ok: false, error: 'Требуется вход в кабинет заведения.' };
  }
  if (!canManage(ctx.role)) return { ok: false, error: 'Импорт доступен только владельцу или менеджеру.' };
  if (!Array.isArray(rows) || rows.length === 0) return { ok: false, error: 'Нет строк для импорта.' };
  if (rows.length > MAX_ROWS) return { ok: false, error: `За один раз можно импортировать не более ${MAX_ROWS} строк.` };
  if (idempotencyKey.length < 8 || idempotencyKey.length > 200) return { ok: false, error: 'Некорректный ключ идемпотентности.' };

  const payload = rows.map((row) => ({
    row_number: row.rowNumber,
    display_name: row.displayName?.slice(0, 200) ?? null,
    identity_type: row.identityType,
    identity_value: row.identityValue?.slice(0, 320) ?? '',
    visits: Number.isFinite(row.visits) ? Math.max(0, Math.trunc(row.visits)) : 0,
    aov_minor: Number.isFinite(row.aovMinor) ? Math.max(0, Math.trunc(row.aovMinor)) : 0,
    marketing_consent: Boolean(row.marketingConsent),
  }));

  const { data, error } = await ctx.supabase.rpc('import_customers', {
    p_business_id: ctx.businessId,
    p_rows: payload as unknown as Json,
    p_duplicate_strategy: duplicateStrategy,
    p_idempotency_key: idempotencyKey,
  });
  if (error) return { ok: false, error: error.message };

  const result = (data ?? {}) as Record<string, unknown>;
  revalidatePath('/app/customers');
  revalidatePath('/customers');
  revalidatePath('/app/today');
  return {
    ok: true,
    dataImportId: String(result.data_import_id ?? ''),
    rowsTotal: Number(result.rows_total ?? 0),
    inserted: Number(result.inserted ?? 0),
    updated: Number(result.updated ?? 0),
    skipped: Number(result.skipped ?? 0),
    invalid: Number(result.invalid ?? 0),
    duplicate: Boolean(result.duplicate),
  };
}
