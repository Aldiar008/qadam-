import 'server-only';

import type { PostgrestError } from '@supabase/supabase-js';

/**
 * PostgREST maps a serialization_failure (40001) to a bare 503 with the text
 * "The upstream server is timing out" and no code, so the domain's optimistic
 * lock message never reaches the client. Everything else keeps its SQLSTATE.
 */
const POSTGREST_SERIALIZATION_TEXT = 'The upstream server is timing out';

const byCode: Record<string, string> = {
  '42501': 'Недостаточно прав или отсутствует согласие клиента.',
  '23514': 'Действие отклонено правилами базы данных.',
  '23503': 'Связанная запись не найдена в этом бизнесе.',
  '22023': 'Некорректные данные запроса.',
};

export function describeDbError(error: Pick<PostgrestError, 'code' | 'message'> | null | undefined): string {
  if (!error) return 'Неизвестная ошибка.';
  if (!error.code && error.message === POSTGREST_SERIALIZATION_TEXT) {
    return 'Запись изменена другим пользователем — обновите страницу и повторите.';
  }
  if (error.code === '40001') return 'Запись изменена другим пользователем — обновите страницу и повторите.';
  const known = error.code ? byCode[error.code] : undefined;
  return known ? `${known} (${error.message})` : error.message;
}
