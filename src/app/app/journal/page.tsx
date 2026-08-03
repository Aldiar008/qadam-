import Link from 'next/link';

import { countByKind, readActivity, KIND_LABEL, type ActivityKind } from '@/domain/activity-log';
import { requireBusinessContext } from '@/server/qadam/repository';

export const dynamic = 'force-dynamic';

const moment = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

/**
 * История действий заведения.
 *
 * Журналы уже писались отовсюду — кампании, контент, лояльность, команда, — но
 * прочитать их можно было только по одному, внутри соответствующей карточки, и
 * кодом вида `content.social_generated`. Одна страница со всем подряд отвечает
 * на вопрос, который владелец задаёт первым после отпуска: «что тут вообще
 * происходило».
 *
 * Ничего не переписывается и не удаляется: страница только читает
 * `activity_logs`, а RLS уже ограничивает выборку своим заведением.
 */
export default async function JournalPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const params = await searchParams;
  const ctx = await requireBusinessContext();

  const { data, error } = await ctx.supabase
    .from('activity_logs')
    .select('id,action,resource_type,metadata,occurred_at')
    .eq('business_id', ctx.businessId)
    .order('occurred_at', { ascending: false })
    .limit(200);

  const entries = (data ?? []).map((row) =>
    readActivity({
      id: row.id,
      action: row.action,
      occurredAt: row.occurred_at,
      resourceType: row.resource_type,
      metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    }),
  );

  const kinds = countByKind(entries);
  const selected = params.kind as ActivityKind | undefined;
  const shown = selected ? entries.filter((entry) => entry.kind === selected) : entries;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight">История действий</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Что происходило в заведении: созданные акции, отправленные сообщения, изменения настроек,
          срабатывания автоматизаций. Последние 200 записей, новые сверху. Записи создаёт сам продукт —
          вручную сюда ничего не добавить и отсюда ничего не убрать.
        </p>
      </header>

      {error && (
        <p role="alert" className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          Журнал сейчас недоступен: {error.message}. Это сбой чтения, а не пустая история.
        </p>
      )}

      {kinds.length > 0 && (
        <nav aria-label="Разделы журнала" className="flex flex-wrap gap-2">
          <Link
            href="/app/journal"
            className={'rounded-full px-4 py-2 text-sm font-bold ' + (!selected ? 'bg-primary text-primary-foreground' : 'border border-border bg-surface')}
          >
            Все {entries.length}
          </Link>
          {kinds.map((item) => (
            <Link
              key={item.kind}
              href={`/app/journal?kind=${item.kind}`}
              className={'rounded-full px-4 py-2 text-sm font-bold ' + (selected === item.kind ? 'bg-primary text-primary-foreground' : 'border border-border bg-surface')}
            >
              {item.label} {item.count}
            </Link>
          ))}
        </nav>
      )}

      {shown.length ? (
        <ol className="space-y-2">
          {shown.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-baseline justify-between gap-2 rounded-2xl border border-border bg-surface px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-bold">{entry.title}</p>
                <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                  {KIND_LABEL[entry.kind]}
                  {entry.resourceType ? ` · ${entry.resourceType}` : ''}
                  {entry.unknown ? ' · код действия показан как есть' : ''}
                </p>
              </div>
              <time dateTime={entry.occurredAt} className="text-xs text-muted-foreground">{moment(entry.occurredAt)}</time>
            </li>
          ))}
        </ol>
      ) : (
        <p className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          {selected
            ? 'В этом разделе записей нет.'
            : 'Записей пока нет. Они появятся, как только в заведении что-то произойдёт: запуск кампании, генерация текстов, срабатывание правила.'}
        </p>
      )}
    </div>
  );
}
