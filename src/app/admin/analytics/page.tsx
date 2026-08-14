import { AdminNav } from '@/components/admin/AdminShell';
import { requirePlatformAdmin } from '@/server/qadam/admin';

export const dynamic = 'force-dynamic';

const money = (value: number) => `${new Intl.NumberFormat('ru-RU').format(Math.round(value))} ₸`;

interface FlowerOverview {
  cohort: number;
  suppressed: boolean;
  minCohort: number;
  activeLocations?: number;
  riskyCategories?: { category: string; decisions: number; spoilageDecisions: number; shops: number }[];
  wasteEvents?: number;
  wasteShops?: number;
  wasteQuantityMilli?: number;
  approvedDecisions?: number;
  avgPreventedRiskMinor?: number;
}

/**
 * Аналитика платформы по цветочным магазинам.
 *
 * Четыре вопроса: сколько точек работает, какие категории рискуют чаще, как
 * часто списывают и во сколько расчёт оценивает предотвращённый риск. Ни один
 * не требует знать, чей это магазин, — и ни одна строка заведения сюда не
 * попадает: агрегат считает функция базы, а не запрос из браузера.
 */
export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const params = await searchParams;
  const ctx = await requirePlatformAdmin();

  const days = Math.min(365, Math.max(1, Number(params.days ?? 30) || 30));
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);

  const { data, error } = await ctx.supabase.rpc('flower_platform_overview', {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });

  const overview = (data ?? { cohort: 0, suppressed: true, minCohort: 5 }) as unknown as FlowerOverview;
  const wastePerShop =
    overview.wasteShops && overview.wasteShops > 0 && overview.wasteEvents
      ? (overview.wasteEvents / overview.wasteShops / (days / 7)).toFixed(1)
      : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight">Аналитика цветочных магазинов</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Срез по всем магазинам платформы за {days} дней. Здесь нет ни одной строки заведения: агрегат считает функция
          базы, и разрез меньше {overview.minCohort} магазинов не показывается вовсе.
        </p>
      </header>

      <AdminNav current="/admin/analytics" />

      <nav aria-label="Период" className="flex flex-wrap gap-2">
        {[7, 30, 90].map((option) => (
          <a
            key={option}
            href={`/admin/analytics?days=${option}`}
            className={
              'min-h-11 rounded-xl px-4 py-2 text-sm font-bold ' +
              (days === option ? 'bg-primary text-primary-foreground' : 'border border-border bg-surface')
            }
          >
            {option} дней
          </a>
        ))}
      </nav>

      {error && (
        <p role="alert" className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm">
          {error.message}
        </p>
      )}

      {overview.suppressed ? (
        <section className="rounded-3xl border border-amber-500/40 bg-amber-500/5 p-6">
          <h2 className="text-lg font-bold">Разрез скрыт</h2>
          <p className="mt-2 text-sm leading-6">
            На платформе {overview.cohort} активных цветочных магазинов — меньше порога в {overview.minCohort}. Показать
            цифры сейчас означало бы показать цифры конкретного магазина, даже если в них нет ни одного идентификатора.
            Обнулить их было бы неотличимо от «ничего не произошло», поэтому разрез помечен скрытым.
          </p>
        </section>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Активных точек', String(overview.activeLocations ?? 0), 'работают, а не просто заведены'],
              ['Цветочных магазинов', String(overview.cohort), 'активных на платформе'],
              [
                'Списаний на магазин',
                wastePerShop === null ? '—' : `${wastePerShop} / нед.`,
                wastePerShop === null ? 'списаний не было' : 'в среднем за неделю',
              ],
              [
                'Предотвращённый риск',
                overview.avgPreventedRiskMinor ? money(overview.avgPreventedRiskMinor) : '—',
                `прогноз по ${overview.approvedDecisions ?? 0} подтверждённым решениям`,
              ],
            ].map(([label, value, note]) => (
              <article key={label} className="rounded-2xl border border-border bg-surface p-4">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-2 font-mono text-2xl font-bold">{value}</p>
                <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{note}</p>
              </article>
            ))}
          </section>

          <section className="rounded-3xl border border-border bg-surface p-6">
            <h2 className="text-xl font-bold">Самые рискованные категории</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              По числу решений, которые продукт поставил в очередь. Отдельной колонкой — сколько из них про списание, а
              не про дефицит: это разные беды и разные выводы для закупщика.
            </p>

            {(overview.riskyCategories ?? []).length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">За период решений не было.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <caption className="sr-only">Категории по числу решений</caption>
                  <thead className="bg-surface-muted text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className="p-3 font-semibold">Категория</th>
                      <th scope="col" className="p-3 font-semibold">Решений</th>
                      <th scope="col" className="p-3 font-semibold">Из них про списание</th>
                      <th scope="col" className="p-3 font-semibold">Магазинов</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(overview.riskyCategories ?? []).map((row) => (
                      <tr key={row.category} className="border-t border-border">
                        <td className="p-3 font-semibold">{row.category}</td>
                        <td className="p-3 font-mono">{row.decisions}</td>
                        <td className="p-3 font-mono">{row.spoilageDecisions}</td>
                        <td className="p-3 font-mono">{row.shops}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <p className="text-xs leading-5 text-muted-foreground">
            «Предотвращённый риск» — это прогноз, а не подтверждённая экономия: средняя разница между выбранным планом и
            вариантом «всё у быстрого поставщика» по решениям, которые владелец подтвердил. Проверкой она станет только
            после замера с базовым периодом.
          </p>
        </>
      )}
    </div>
  );
}
