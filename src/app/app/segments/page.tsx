import Link from 'next/link';
import { canManage, getSegmentsData } from '@/server/qadam/repository';
import { DynamicSegmentEditor } from '@/components/segments/DynamicSegmentEditor';
import { describeSegmentRule } from '@/lib/segment-rules';

export const dynamic = 'force-dynamic';

export default async function SegmentsPage() {
  const data = await getSegmentsData();
  const inactiveSegment = data.segments.find((segment) => segment.code === 'inactive_30');
  const inactiveCount = inactiveSegment?.count ?? 0;

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Клиентские сегменты</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Сегмент — это правило, по которому отбираются люди. Правило видно целиком, состав
            пересчитывается по базе, и в кампанию попадают только те, кто дал согласие.
          </p>
        </div>
        {inactiveSegment && (
          <Link
            href="/app/customers?segment=inactive"
            className="inline-flex min-h-11 items-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground transition-all hover:brightness-110"
          >
            Открыть спящих ({inactiveCount})
          </Link>
        )}
      </header>

      <DynamicSegmentEditor canEdit={canManage(data.role)} />

      <section className="space-y-4">
        <h2 className="text-xl font-bold">Готовые сегменты</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {data.segments.map((segment) => {
            const lines = describeSegmentRule(segment.definition);
            return (
              <article key={segment.id} className="rounded-3xl border border-border bg-surface p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-bold">{segment.name_ru}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Версия правила {segment.rule_version}
                      {segment.last_evaluated_at
                        ? ` · пересчитан ${new Date(segment.last_evaluated_at).toLocaleDateString('ru-RU')}`
                        : ' · ещё не пересчитывался'}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-surface-muted px-3 py-1 text-xs font-bold">
                    {segment.count} чел.
                  </span>
                </div>

                {lines.length ? (
                  <ul className="mt-4 space-y-1.5 text-sm leading-6">
                    {lines.map((line) => (
                      <li key={line} className="flex gap-2">
                        <span aria-hidden className="text-primary">·</span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-4 rounded-xl bg-surface-muted p-3 text-sm text-muted-foreground">
                    Правило записано в форме, которую эта страница не умеет прочитать. Состав сегмента
                    ниже взят из последнего пересчёта — доверять ему без проверки правила не стоит.
                  </p>
                )}

                {segment.count === 0 && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Сейчас под это правило не подходит никто — рассылать по такому сегменту нечего.
                  </p>
                )}

                {/* The rule is kept verbatim for anyone who wants to check it
                    against the database, but it is no longer the first thing a
                    person has to decipher. */}
                <details className="mt-4">
                  <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
                    Правило в исходном виде
                  </summary>
                  <pre className="mt-2 overflow-x-auto rounded-xl bg-surface-muted p-3 text-xs text-muted-foreground">
                    {JSON.stringify(segment.definition, null, 2)}
                  </pre>
                </details>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <Link
                    href={`/app/campaigns/new?segment=${segment.code}`}
                    className="inline-flex min-h-11 items-center text-sm font-bold text-primary hover:underline"
                  >
                    Запустить кампанию
                  </Link>
                  <Link
                    href={`/app/customers?segment=${segment.code}`}
                    className="inline-flex min-h-11 items-center rounded-xl border border-border px-3 text-xs font-bold"
                  >
                    Просмотреть список
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
