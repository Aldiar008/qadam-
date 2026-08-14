import { AdminBanners, AdminNav, AuditTrail, ReasonField, ReauthControl } from '@/components/admin/AdminShell';
import { requirePlatformAdmin } from '@/server/qadam/admin';
import { savePlatformDemandEvent } from '../flower-actions';

export const dynamic = 'force-dynamic';

const field = 'min-h-11 w-full rounded-xl border border-border bg-surface-muted px-3 text-sm font-normal';

const date = (value: string) => new Date(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });

/**
 * Календарь поводов платформы.
 *
 * Здесь живут отраслевые шаблоны: восьмое марта, выпускные, Наурыз. Они
 * приходят магазинам предложением и не двигают прогноз, пока владелец их не
 * одобрит, — потому что подъём из шаблона это предположение, а подтвердить его
 * может только тот, у кого есть прошлогодний факт.
 */
export default async function AdminCalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const ctx = await requirePlatformAdmin();

  const [{ data: events }, { data: categories }, { data: audit }] = await Promise.all([
    ctx.supabase
      .from('demand_events')
      .select('id,code,name_ru,event_date,lead_days,lift_ppm,categories,region,confidence_ppm,source,verified,approved')
      .is('business_id', null)
      .order('event_date'),
    ctx.supabase.from('flower_categories').select('code,name_ru').eq('status', 'published').order('sort_order'),
    ctx.supabase
      .from('admin_audit_log')
      .select('id,action,resource_type,resource_code,reason,occurred_at')
      .eq('resource_type', 'demand_event')
      .order('occurred_at', { ascending: false })
      .limit(10),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight">Календарь поводов</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Отраслевые шаблоны, которые платформа предлагает всем цветочным магазинам. Каждый приходит владельцу
          предложением и начинает двигать прогноз только после его одобрения.
        </p>
      </header>

      <AdminNav current="/admin/calendar" />
      <AdminBanners params={params} />
      {ctx.canWrite && <ReauthControl next="/admin/calendar" />}

      {ctx.canWrite && (
        <section className="rounded-3xl border border-border bg-surface p-6">
          <h2 className="text-xl font-bold">Новый повод</h2>
          <form action={savePlatformDemandEvent} className="mt-4 grid gap-4 sm:grid-cols-3">
            <label className="grid gap-1 text-sm font-semibold sm:col-span-2">
              Название
              <input name="name" required className={field} placeholder="День матери" />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Код <span className="font-normal text-muted-foreground">(пусто — из названия)</span>
              <input name="code" className={field} placeholder="mothers_day" />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Дата
              <input name="eventDate" type="date" required className={field} />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Окно, дней
              <input name="windowDays" type="number" min="1" max="60" defaultValue={3} className={field} />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Подъём спроса, %
              <input name="liftPercent" type="number" min="0" max="500" defaultValue={50} className={field} />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Регион <span className="font-normal text-muted-foreground">(всплеск разный)</span>
              <input name="region" defaultValue="Алматы" className={field} />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Уверенность, %
              <input name="confidencePercent" type="number" min="0" max="100" defaultValue={40} className={field} />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Источник
              <input name="source" defaultValue="отраслевой шаблон" className={field} />
            </label>
            <label className="grid gap-1 text-sm font-semibold sm:col-span-3">
              Затронутые категории <span className="font-normal text-muted-foreground">(через запятую)</span>
              <input name="categories" className={field} placeholder="розы, хризантемы, упаковка" />
            </label>
            <div className="sm:col-span-3"><ReasonField id="event-reason" /></div>
            <div className="sm:col-span-3">
              <button className="min-h-12 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground">
                Добавить повод
              </button>
            </div>
          </form>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            Доступные категории: {(categories ?? []).map((category) => category.name_ru.toLowerCase()).join(', ')}.
            Новый повод всегда создаётся неподтверждённым и неодобренным — это предположение, а не измерение.
          </p>
        </section>
      )}

      <section className="rounded-3xl border border-border bg-surface p-6">
        <h2 className="text-xl font-bold">Шаблоны платформы ({(events ?? []).length})</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <caption className="sr-only">Отраслевые поводы спроса</caption>
            <thead className="bg-surface-muted text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="p-3 font-semibold">Повод</th>
                <th scope="col" className="p-3 font-semibold">Дата</th>
                <th scope="col" className="p-3 font-semibold">Окно</th>
                <th scope="col" className="p-3 font-semibold">Подъём</th>
                <th scope="col" className="p-3 font-semibold">Регион</th>
                <th scope="col" className="p-3 font-semibold">Уверенность</th>
                <th scope="col" className="p-3 font-semibold">Категории</th>
              </tr>
            </thead>
            <tbody>
              {(events ?? []).map((event) => (
                <tr key={event.id} className="border-t border-border">
                  <td className="p-3">
                    <p className="font-semibold">{event.name_ru}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {event.code} · {event.source}
                    </p>
                  </td>
                  <td className="p-3 font-mono text-xs">{date(event.event_date)}</td>
                  <td className="p-3 font-mono text-xs">{event.lead_days} дн.</td>
                  <td className="p-3 font-mono text-xs font-bold">×{(event.lift_ppm / 1_000_000).toFixed(2)}</td>
                  <td className="p-3 text-xs">{event.region}</td>
                  <td className="p-3 font-mono text-xs">
                    {Math.round(event.confidence_ppm / 10_000)}%
                    {!event.verified && <span className="ml-1 text-amber-700">гипотеза</span>}
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {event.categories?.length ? event.categories.join(', ') : 'все'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          Ни один шаблон платформы не одобрен: одобрение принадлежит магазину, а не платформе. Пока владелец не принял
          повод, коэффициент лежит рядом с прогнозом и на него не влияет.
        </p>
      </section>

      <AuditTrail rows={audit ?? []} />
    </div>
  );
}
