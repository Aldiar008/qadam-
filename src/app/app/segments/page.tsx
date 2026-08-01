import Link from 'next/link';
import { canManage, getSegmentsData } from '@/server/qadam/repository';
import { DynamicSegmentEditor } from '@/components/segments/DynamicSegmentEditor';

export const dynamic = 'force-dynamic';

export default async function SegmentsPage() {
  const data = await getSegmentsData();
  const inactiveSegment = data.segments.find((s) => s.code === 'inactive');
  const inactiveCount = inactiveSegment?.count ?? 64;

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Клиентские сегменты</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Versioned rule JSON, idempotent memberships, динамический редактор и объяснимый count.
          </p>
        </div>
        <Link
          href="/app/customers?segment=inactive"
          className="inline-flex min-h-11 items-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground transition-all hover:brightness-110"
        >
          Открыть спящих ({inactiveCount})
        </Link>
      </header>

      {/* Interactive Dynamic Segment Editor */}
      <DynamicSegmentEditor
        initialTotalCount={inactiveCount}
        canEdit={canManage(data.role)}
      />

      <section className="space-y-4">
        <h2 className="text-xl font-bold">Системные сегменты</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {data.segments.map((segment) => (
            <article key={segment.id} className="rounded-3xl border border-border bg-surface p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-bold text-primary">Rule v{segment.rule_version}</p>
                  <h3 className="mt-2 text-xl font-bold">{segment.name_ru}</h3>
                </div>
                <span className="rounded-full bg-surface-muted px-3 py-1 font-mono text-xs font-bold">
                  {segment.count} клиентов
                </span>
              </div>
              <pre className="mt-4 overflow-x-auto rounded-xl bg-surface-muted p-3 text-xs text-muted-foreground">
                {JSON.stringify(segment.definition, null, 2)}
              </pre>
              <div className="mt-4 flex items-center justify-between">
                <Link
                  href={`/app/campaigns/new?segment=${segment.id}`}
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
          ))}
        </div>
      </section>
    </div>
  );
}
