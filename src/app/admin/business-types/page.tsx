import { AdminBanners, AdminNav, AuditTrail, ReasonField, ReauthControl } from '@/components/admin/AdminShell';
import { requirePlatformAdmin } from '@/server/qadam/admin';
import { saveBusinessType, setBusinessTypeStatus } from '../actions';

export const dynamic = 'force-dynamic';

const field = 'min-h-11 w-full rounded-xl border border-border bg-surface-muted px-3 text-sm font-normal';

const STATUS_LABEL: Record<string, string> = {
  draft: 'Черновик',
  published: 'Доступен при регистрации',
  archived: 'Скрыт',
  deprecated: 'Устарел',
};

/**
 * Типы бизнеса.
 *
 * Профиль, который владелец выбирает при регистрации. Он определяет набор
 * инструментов первого дня и правила автозаказа, которые получит магазин.
 *
 * Цветочный магазин и сеть цветочных — разные типы, а не размер одного: у сети
 * иначе считается покрытие, потому что излишек на одной точке закрывает дефицит
 * на другой, если между ними полчаса, и не закрывает, если полтора.
 */
export default async function AdminBusinessTypesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const ctx = await requirePlatformAdmin();

  const [{ data: types }, { data: bundles }, { data: businesses }, { data: audit }] = await Promise.all([
    ctx.supabase.from('business_types').select('id,code,name_ru,name_kk,status,is_public').order('name_ru'),
    ctx.supabase.from('tool_bundles').select('code,name_ru,business_type_id,status').eq('status', 'published'),
    ctx.supabase.from('businesses').select('business_type_id').eq('status', 'active'),
    ctx.supabase
      .from('admin_audit_log')
      .select('id,action,resource_type,resource_code,reason,occurred_at')
      .eq('resource_type', 'business_type')
      .order('occurred_at', { ascending: false })
      .limit(10),
  ]);

  // Сколько заведений уже выбрало тип — от этого зависит, что означает его
  // архивирование: у пустого типа это уборка, у занятого — чужая настройка.
  const usage = new Map<string, number>();
  for (const row of businesses ?? []) {
    if (row.business_type_id) usage.set(row.business_type_id, (usage.get(row.business_type_id) ?? 0) + 1);
  }
  const bundleByType = new Map((bundles ?? []).map((bundle) => [bundle.business_type_id, bundle]));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight">Типы бизнеса</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Профили, которые владелец выбирает при регистрации. Тип определяет набор инструментов первого дня и правила
          автозаказа — но ничего не запирает: любой подставленный порог владелец меняет у себя.
        </p>
      </header>

      <AdminNav current="/admin/business-types" />
      <AdminBanners params={params} />
      {ctx.canWrite && <ReauthControl next="/admin/business-types" />}

      {ctx.canWrite && (
        <section className="rounded-3xl border border-border bg-surface p-6">
          <h2 className="text-xl font-bold">Новый тип</h2>
          <form action={saveBusinessType} className="mt-4 grid gap-4 sm:grid-cols-3">
            <label className="grid gap-1 text-sm font-semibold">
              Код
              <input name="code" required pattern="[a-z][a-z0-9_]{1,63}" className={field} placeholder="flower_studio" />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Название RU
              <input name="nameRu" required className={field} />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Название KK
              <input name="nameKk" required lang="kk" className={field} />
            </label>
            <div className="sm:col-span-3"><ReasonField id="business-type-reason" /></div>
            <div className="sm:col-span-3">
              <button className="min-h-12 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground">
                Создать черновик
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="rounded-3xl border border-border bg-surface p-6">
        <h2 className="text-xl font-bold">Профили ({(types ?? []).length})</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <caption className="sr-only">Типы бизнеса платформы</caption>
            <thead className="bg-surface-muted text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="p-3 font-semibold">Код</th>
                <th scope="col" className="p-3 font-semibold">Название</th>
                <th scope="col" className="p-3 font-semibold">Набор первого дня</th>
                <th scope="col" className="p-3 font-semibold">Заведений</th>
                <th scope="col" className="p-3 font-semibold">Статус</th>
                <th scope="col" className="p-3 font-semibold">Действия</th>
              </tr>
            </thead>
            <tbody>
              {(types ?? []).map((type) => {
                const bundle = bundleByType.get(type.id);
                const count = usage.get(type.id) ?? 0;
                return (
                  <tr key={type.id} className="border-t border-border">
                    <td className="p-3 font-mono text-xs">{type.code}</td>
                    <td className="p-3">
                      <p className="font-semibold">{type.name_ru}</p>
                      <p className="text-xs text-muted-foreground" lang="kk">{type.name_kk}</p>
                    </td>
                    <td className="p-3 text-xs">
                      {bundle ? (
                        bundle.name_ru
                      ) : (
                        <span className="text-amber-800">не задан — магазин получит пустой первый день</span>
                      )}
                    </td>
                    <td className="p-3 font-mono text-xs">{count}</td>
                    <td className="p-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          type.status === 'published'
                            ? 'bg-emerald-500/10 text-emerald-800'
                            : type.status === 'draft'
                              ? 'bg-amber-500/10 text-amber-900'
                              : 'bg-surface-muted text-muted-foreground'
                        }`}
                      >
                        {STATUS_LABEL[type.status] ?? type.status}
                      </span>
                    </td>
                    <td className="p-3">
                      {ctx.canWrite && (
                        <div className="flex flex-wrap gap-2">
                          {type.status !== 'published' && (
                            <form action={setBusinessTypeStatus}>
                              <input type="hidden" name="id" value={type.id} />
                              <input type="hidden" name="status" value="published" />
                              <input type="hidden" name="reason" value={`Публикация типа ${type.code}`} />
                              <button className="min-h-11 rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground">
                                Опубликовать
                              </button>
                            </form>
                          )}
                          {type.status === 'published' && (
                            <form action={setBusinessTypeStatus}>
                              <input type="hidden" name="id" value={type.id} />
                              <input type="hidden" name="status" value="archived" />
                              <input type="hidden" name="reason" value={`Скрытие типа ${type.code}`} />
                              <button className="min-h-11 rounded-xl border border-border px-3 text-xs font-bold">Скрыть</button>
                            </form>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          Скрытие убирает тип из формы регистрации и не переводит существующие заведения никуда: у них он остаётся, и
          их настройки продолжают работать.
        </p>
      </section>

      <AuditTrail rows={audit ?? []} />
    </div>
  );
}
