import { AdminBanners, AdminNav, AuditTrail, ReasonField } from '@/components/admin/AdminShell';
import { getAdminCatalog } from '@/server/qadam/admin';
import { saveBusinessType, saveCategory, setBusinessTypeStatus, setCategoryStatus } from '../actions';

export const dynamic = 'force-dynamic';

const statusLabels: Record<string, string> = { draft: 'Черновик', published: 'Опубликована', deprecated: 'Устарела' };

export default async function AdminCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const data = await getAdminCatalog();
  const canWrite = data.ctx.canWrite;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight">Категории и типы бизнеса</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Устаревание не удаляет запись: она перестаёт предлагаться новым бизнесам, но остаётся
          у тех, кто уже её использует. Категорию с опубликованными инструментами устареть нельзя.
        </p>
      </header>

      <AdminNav current="/admin/categories" />
      <AdminBanners params={params} />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-4">
          <div className="rounded-3xl border border-border bg-surface p-6">
            <h2 className="text-xl font-bold">Категории инструментов</h2>
            {canWrite && (
              <form action={saveCategory} className="mt-4 grid gap-3">
                <label className="grid gap-1 text-sm font-semibold">
                  Код <input name="code" required className="min-h-11 rounded-xl border border-border bg-surface-muted px-3 font-normal" />
                </label>
                <label className="grid gap-1 text-sm font-semibold">
                  Название RU <input name="nameRu" required className="min-h-11 rounded-xl border border-border bg-surface-muted px-3 font-normal" />
                </label>
                <label className="grid gap-1 text-sm font-semibold">
                  Название KK <input name="nameKk" required lang="kk" className="min-h-11 rounded-xl border border-border bg-surface-muted px-3 font-normal" />
                </label>
                <label className="grid gap-1 text-sm font-semibold">
                  Порядок сортировки <input name="sortOrder" type="number" defaultValue={data.categories.length + 1} className="min-h-11 rounded-xl border border-border bg-surface-muted px-3 font-normal" />
                </label>
                <ReasonField id="category-reason" />
                <button className="min-h-12 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground">Добавить категорию</button>
              </form>
            )}

            <ul className="mt-5 grid gap-2">
              {data.categories.map((category) => (
                <li key={category.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      <span className="mr-2 font-mono text-xs text-muted-foreground">#{category.sort_order}</span>
                      {category.name_ru}
                    </p>
                    <p className="text-xs text-muted-foreground" lang="kk">{category.name_kk}</p>
                  </div>
                  {/* Editing and reordering were reachable in the server action but
                      had no control on the page, so neither could actually be done. */}
                  {canWrite && (
                    <form action={saveCategory} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="id" value={category.id} />
                      <input type="hidden" name="code" value={category.code} />
                      <label className="grid gap-1 text-xs font-semibold">
                        <span className="sr-only">{`Название RU для ${category.code}`}</span>
                        <input name="nameRu" defaultValue={category.name_ru} aria-label={`Название RU для ${category.code}`} className="min-h-11 w-40 rounded-xl border border-border bg-surface-muted px-3 font-normal" />
                      </label>
                      <label className="grid gap-1 text-xs font-semibold">
                        <span className="sr-only">{`Название KK для ${category.code}`}</span>
                        <input name="nameKk" defaultValue={category.name_kk} lang="kk" aria-label={`Название KK для ${category.code}`} className="min-h-11 w-40 rounded-xl border border-border bg-surface-muted px-3 font-normal" />
                      </label>
                      <label className="grid gap-1 text-xs font-semibold">
                        <span className="sr-only">{`Порядок для ${category.code}`}</span>
                        <input name="sortOrder" type="number" defaultValue={category.sort_order} aria-label={`Порядок сортировки для ${category.code}`} className="min-h-11 w-20 rounded-xl border border-border bg-surface-muted px-3 font-normal" />
                      </label>
                      <input type="hidden" name="reason" value={`Изменение категории ${category.code}`} />
                      <button className="min-h-11 rounded-xl border border-border px-3 text-xs font-bold">Сохранить</button>
                    </form>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-bold">
                      {statusLabels[category.status] ?? category.status}
                    </span>
                    {canWrite && category.status !== 'published' && (
                      <form action={setCategoryStatus}>
                        <input type="hidden" name="id" value={category.id} />
                        <input type="hidden" name="status" value="published" />
                        <input type="hidden" name="reason" value={`Публикация категории ${category.code}`} />
                        <button className="min-h-11 rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground">Опубликовать</button>
                      </form>
                    )}
                    {canWrite && category.status === 'published' && (
                      <form action={setCategoryStatus}>
                        <input type="hidden" name="id" value={category.id} />
                        <input type="hidden" name="status" value="deprecated" />
                        <input type="hidden" name="reason" value={`Устаревание категории ${category.code}`} />
                        <button className="min-h-11 rounded-xl border border-border px-3 text-xs font-bold">Устареть</button>
                      </form>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="space-y-4">
          <div className="rounded-3xl border border-border bg-surface p-6">
            <h2 className="text-xl font-bold">Типы бизнеса</h2>
            {canWrite && (
              <form action={saveBusinessType} className="mt-4 grid gap-3">
                <label className="grid gap-1 text-sm font-semibold">
                  Код <input name="code" required className="min-h-11 rounded-xl border border-border bg-surface-muted px-3 font-normal" />
                </label>
                <label className="grid gap-1 text-sm font-semibold">
                  Название RU <input name="nameRu" required className="min-h-11 rounded-xl border border-border bg-surface-muted px-3 font-normal" />
                </label>
                <label className="grid gap-1 text-sm font-semibold">
                  Название KK <input name="nameKk" required lang="kk" className="min-h-11 rounded-xl border border-border bg-surface-muted px-3 font-normal" />
                </label>
                <ReasonField id="type-reason" />
                <button className="min-h-12 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground">Добавить тип</button>
              </form>
            )}

            <ul className="mt-5 grid gap-2">
              {data.businessTypes.map((type) => (
                <li key={type.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{type.name_ru}</p>
                    <p className="text-xs text-muted-foreground" lang="kk">{type.name_kk}</p>
                  </div>
                  {canWrite && (
                    <form action={saveBusinessType} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="id" value={type.id} />
                      <input type="hidden" name="code" value={type.code} />
                      <label className="grid gap-1 text-xs font-semibold">
                        <span className="sr-only">{`Название RU для ${type.code}`}</span>
                        <input name="nameRu" defaultValue={type.name_ru} aria-label={`Название RU для ${type.code}`} className="min-h-11 w-40 rounded-xl border border-border bg-surface-muted px-3 font-normal" />
                      </label>
                      <label className="grid gap-1 text-xs font-semibold">
                        <span className="sr-only">{`Название KK для ${type.code}`}</span>
                        <input name="nameKk" defaultValue={type.name_kk} lang="kk" aria-label={`Название KK для ${type.code}`} className="min-h-11 w-40 rounded-xl border border-border bg-surface-muted px-3 font-normal" />
                      </label>
                      <input type="hidden" name="reason" value={`Изменение типа ${type.code}`} />
                      <button className="min-h-11 rounded-xl border border-border px-3 text-xs font-bold">Сохранить</button>
                    </form>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-bold">
                      {statusLabels[type.status] ?? type.status}
                    </span>
                    {canWrite && type.status !== 'published' && (
                      <form action={setBusinessTypeStatus}>
                        <input type="hidden" name="id" value={type.id} />
                        <input type="hidden" name="status" value="published" />
                        <input type="hidden" name="reason" value={`Публикация типа ${type.code}`} />
                        <button className="min-h-11 rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground">Опубликовать</button>
                      </form>
                    )}
                    {canWrite && type.status === 'published' && (
                      <form action={setBusinessTypeStatus}>
                        <input type="hidden" name="id" value={type.id} />
                        <input type="hidden" name="status" value="deprecated" />
                        <input type="hidden" name="reason" value={`Устаревание типа ${type.code}`} />
                        <button className="min-h-11 rounded-xl border border-border px-3 text-xs font-bold">Устареть</button>
                      </form>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      <AuditTrail rows={data.audit} />
    </div>
  );
}
