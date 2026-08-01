import Link from 'next/link';

import { AdminBanners, AdminNav } from '@/components/admin/AdminShell';
import { getAdminOverview } from '@/server/qadam/admin';

export const dynamic = 'force-dynamic';

/**
 * Platform overview.
 *
 * Every figure comes from `platform_overview`, a security-definer aggregate that
 * refuses a non-admin and withholds a segment smaller than the cohort threshold.
 * No card on this page is hardcoded, and none of them can reach a customer row.
 */
export default async function AdminOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; type?: string; city?: string; error?: string; reauth?: string }>;
}) {
  const params = await searchParams;
  const data = await getAdminOverview({
    days: Number(params.days ?? 30) || 30,
    businessType: params.type,
    city: params.city,
  });
  const { metrics } = data;

  const rate = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—');

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight">Admin Console</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Агрегированные показатели платформы за {data.days} дн. Роль:{' '}
          <span className="font-mono">{data.ctx.role}</span>. Персональные данные клиентов на этой
          странице недоступны по построению.
        </p>
      </header>

      <AdminNav current="/admin" />
      <AdminBanners params={params} />

      <form className="grid gap-3 rounded-3xl border border-border bg-surface p-4 sm:grid-cols-4">
        <label className="grid gap-1 text-sm font-semibold">
          Период, дней
          <select name="days" defaultValue={String(data.days)} className="min-h-11 rounded-xl border border-border bg-surface-muted px-3 text-sm">
            {[7, 30, 90, 365].map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Тип бизнеса
          <select name="type" defaultValue={params.type ?? ''} className="min-h-11 rounded-xl border border-border bg-surface-muted px-3 text-sm">
            <option value="">Все</option>
            {data.businessTypes.map((type) => <option key={type.code} value={type.code}>{type.name_ru}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Город
          <select name="city" defaultValue={params.city ?? ''} className="min-h-11 rounded-xl border border-border bg-surface-muted px-3 text-sm">
            <option value="">Все</option>
            {data.cities.map((city) => <option key={city} value={city}>{city}</option>)}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button className="min-h-11 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground">Применить</button>
          <Link href="/admin" className="inline-flex min-h-11 items-center rounded-xl border border-border px-4 text-sm font-bold">Сбросить</Link>
        </div>
      </form>

      {data.suppressed ? (
        <section role="status" className="rounded-3xl border border-amber-500/40 bg-amber-500/5 p-8 text-center">
          <h2 className="text-lg font-bold text-amber-900">Срез скрыт: слишком маленькая выборка</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6">
            {data.suppressionMessage ?? `В этом срезе ${data.cohortSize} бизнесов, минимальный порог — ${data.minCohort}.`}
            {' '}Агрегат по такой выборке позволил бы опознать конкретный бизнес, поэтому он не показывается.
          </p>
        </section>
      ) : (
        <>
          <section aria-label="Платформа" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Активные бизнесы', value: metrics.activeBusinesses, note: `новых за период: ${metrics.newBusinesses}` },
              { label: 'Онбординг завершён', value: metrics.onboardingCompleted, note: `из ${metrics.onboardingStarted} начатых · ${rate(metrics.onboardingCompleted, metrics.onboardingStarted)}` },
              { label: 'Активные кампании', value: metrics.activeCampaigns, note: 'approved / scheduled / running / paused' },
              { label: 'Активаций инструментов', value: metrics.toolActivations, note: 'business_tools в статусе active' },
              { label: 'Обращений к AI', value: metrics.aiRuns, note: `откатов на шаблон: ${metrics.aiFallbackRuns} · ${rate(metrics.aiFallbackRuns, metrics.aiRuns)}` },
              { label: 'Ошибок AI', value: metrics.aiErrorRuns, note: `доля: ${rate(metrics.aiErrorRuns, metrics.aiRuns)}` },
              { label: 'Запусков автоматизаций', value: metrics.automationRuns, note: `сбоев: ${metrics.automationFailures} · ${rate(metrics.automationFailures, metrics.automationRuns)}` },
              { label: 'Не доставлено (dead letter)', value: metrics.outboxDeadLetters, note: 'ждут решения владельца' },
            ].map((metric) => (
              <div key={metric.label} className="rounded-3xl border border-border bg-surface p-5">
                <p className="text-xs text-muted-foreground">{metric.label}</p>
                <p className="mt-2 font-mono text-2xl font-extrabold">{metric.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{metric.note}</p>
              </div>
            ))}
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="rounded-3xl border border-border bg-surface p-6">
              <h2 className="text-lg font-bold">Популярные инструменты</h2>
              {data.popularTools.length ? (
                <ol className="mt-3 grid gap-2">
                  {data.popularTools.map((tool) => (
                    <li key={tool.code} className="flex items-center justify-between rounded-xl border border-border p-3 text-sm">
                      <span className="font-semibold">{tool.name_ru}</span>
                      <span className="font-mono text-xs text-muted-foreground">{tool.activations} активаций</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">Активаций пока нет.</p>
              )}
            </section>

            <section className="rounded-3xl border border-border bg-surface p-6">
              <h2 className="text-lg font-bold">Использование шаблонов</h2>
              {data.templateAdoption.length ? (
                <ul className="mt-3 grid gap-2">
                  {data.templateAdoption.map((template) => (
                    <li key={template.code} className="flex items-center justify-between rounded-xl border border-border p-3 text-sm">
                      <span className="font-semibold">{template.code}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        активна v{template.current_version} · опубликовано версий: {template.published_versions}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">Шаблонов пока нет.</p>
              )}
            </section>
          </div>

          <section className="rounded-3xl border border-border bg-surface p-6">
            <h2 className="text-lg font-bold">Здоровье платформы</h2>
            <dl className="mt-3 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-surface-muted p-4">
                <dt className="text-xs text-muted-foreground">Событий платформы</dt>
                <dd className="mt-1 font-mono text-xl font-bold">{metrics.platformEvents}</dd>
              </div>
              <div className="rounded-2xl bg-surface-muted p-4">
                <dt className="text-xs text-muted-foreground">Доля откатов AI на шаблон</dt>
                <dd className="mt-1 font-mono text-xl font-bold">{rate(metrics.aiFallbackRuns, metrics.aiRuns)}</dd>
              </div>
              <div className="rounded-2xl bg-surface-muted p-4">
                <dt className="text-xs text-muted-foreground">Доля сбоев автоматизаций</dt>
                <dd className="mt-1 font-mono text-xl font-bold">{rate(metrics.automationFailures, metrics.automationRuns)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">
              Размер выборки: {data.cohortSize} бизнесов. Срезы меньше {data.minCohort} скрываются целиком.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
