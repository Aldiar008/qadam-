import { AdminBanners, AdminNav, AuditTrail, ReasonField, ReauthControl } from '@/components/admin/AdminShell';
import { requirePlatformAdmin } from '@/server/qadam/admin';
import { saveFlowerCategory, setFlowerCategoryStatus } from '../flower-actions';

export const dynamic = 'force-dynamic';

const field = 'min-h-11 rounded-xl border border-border bg-surface-muted px-3 text-sm font-normal';

const STATUS_LABEL: Record<string, string> = {
  draft: 'Черновик',
  published: 'Опубликована',
  archived: 'В архиве',
};

/**
 * Категории цветов.
 *
 * Из этого списка магазин выбирает при регистрации, чем он торгует. Псевдонимы
 * рядом — не украшение: заведение называет позицию своими словами, и без них
 * платформенную категорию пришлось бы навязывать переименованием чужого
 * ассортимента.
 */
export default async function AdminFlowerCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const ctx = await requirePlatformAdmin();

  const [{ data: categories }, { data: audit }] = await Promise.all([
    ctx.supabase.from('flower_categories').select('id,code,name_ru,name_kk,aliases,sort_order,status').order('sort_order'),
    ctx.supabase
      .from('admin_audit_log')
      .select('id,action,resource_type,resource_code,reason,occurred_at')
      .eq('resource_type', 'flower_category')
      .order('occurred_at', { ascending: false })
      .limit(10),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight">Категории цветов</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Из этого списка владелец выбирает при регистрации, чем торгует его магазин. Категория, которую никто не
          выбрал, ничего не ломает; категории, которую забыли добавить, магазин не найдёт.
        </p>
      </header>

      <AdminNav current="/admin/flower-categories" />
      <AdminBanners params={params} />
      {ctx.canWrite && <ReauthControl next="/admin/flower-categories" />}

      {ctx.canWrite && (
        <section className="rounded-3xl border border-border bg-surface p-6">
          <h2 className="text-xl font-bold">Новая категория</h2>
          <form action={saveFlowerCategory} className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-semibold">
              Код
              <input name="code" required pattern="[a-z][a-z0-9_]{1,63}" className={field} placeholder="orchids" />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Порядок
              <input name="sortOrder" type="number" defaultValue={0} className={field} />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Название RU
              <input name="nameRu" required className={field} />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Название KK
              <input name="nameKk" required lang="kk" className={field} />
            </label>
            <label className="grid gap-1 text-sm font-semibold sm:col-span-2">
              Псевдонимы <span className="font-normal text-muted-foreground">(как называют магазины, через запятую)</span>
              <input name="aliases" className={field} placeholder="орхидеи, фаленопсис" />
            </label>
            <div className="sm:col-span-2">
              <ReasonField id="flower-category-reason" />
            </div>
            <div className="sm:col-span-2">
              <button className="min-h-12 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground">
                Создать черновик
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="rounded-3xl border border-border bg-surface p-6">
        <h2 className="text-xl font-bold">Справочник ({(categories ?? []).length})</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <caption className="sr-only">Категории цветов платформы</caption>
            <thead className="bg-surface-muted text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="p-3 font-semibold">Код</th>
                <th scope="col" className="p-3 font-semibold">Название</th>
                <th scope="col" className="p-3 font-semibold">Псевдонимы</th>
                <th scope="col" className="p-3 font-semibold">Статус</th>
                <th scope="col" className="p-3 font-semibold">Действия</th>
              </tr>
            </thead>
            <tbody>
              {(categories ?? []).map((category) => (
                <tr key={category.id} className="border-t border-border">
                  <td className="p-3 font-mono text-xs">{category.code}</td>
                  <td className="p-3">
                    <p className="font-semibold">{category.name_ru}</p>
                    <p className="text-xs text-muted-foreground" lang="kk">{category.name_kk}</p>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {category.aliases?.length ? category.aliases.join(', ') : '—'}
                  </td>
                  <td className="p-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        category.status === 'published'
                          ? 'bg-emerald-500/10 text-emerald-800'
                          : category.status === 'archived'
                            ? 'bg-surface-muted text-muted-foreground'
                            : 'bg-amber-500/10 text-amber-900'
                      }`}
                    >
                      {STATUS_LABEL[category.status] ?? category.status}
                    </span>
                  </td>
                  <td className="p-3">
                    {ctx.canWrite && (
                      <div className="flex flex-wrap gap-2">
                        {category.status !== 'published' && (
                          <form action={setFlowerCategoryStatus}>
                            <input type="hidden" name="id" value={category.id} />
                            <input type="hidden" name="status" value="published" />
                            <input type="hidden" name="reason" value={`Публикация категории ${category.code}`} />
                            <button className="min-h-11 rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground">
                              Опубликовать
                            </button>
                          </form>
                        )}
                        {category.status !== 'archived' && (
                          <form action={setFlowerCategoryStatus}>
                            <input type="hidden" name="id" value={category.id} />
                            <input type="hidden" name="status" value="archived" />
                            <input type="hidden" name="reason" value={`Архивирование категории ${category.code}`} />
                            <button className="min-h-11 rounded-xl border border-border px-3 text-xs font-bold">
                              В архив
                            </button>
                          </form>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          Архивирование убирает категорию из анкеты новых магазинов и не трогает тех, кто её уже выбрал: их настройка
          не должна исчезать от чужого решения.
        </p>
      </section>

      <AuditTrail rows={audit ?? []} />
    </div>
  );
}
