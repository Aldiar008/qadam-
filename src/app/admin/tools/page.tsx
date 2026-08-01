import { AdminBanners, AdminNav, AuditTrail, ReasonField, ReauthControl } from '@/components/admin/AdminShell';
import { getAdminCatalog } from '@/server/qadam/admin';
import { saveTool, setToolStatus } from '../actions';

export const dynamic = 'force-dynamic';

const statusLabels: Record<string, string> = { draft: 'Черновик', published: 'Опубликован', archived: 'В архиве' };

export default async function AdminToolsPage({
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
        <h1 className="text-3xl font-extrabold tracking-tight">Инструменты</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Владелец видит только опубликованные инструменты, совместимые с его типом бизнеса.
          Удаления нет: инструмент архивируется, а его история активаций сохраняется.
        </p>
      </header>

      <AdminNav current="/admin/tools" />
      <AdminBanners params={params} />
      {canWrite && <ReauthControl next="/admin/tools" />}

      {canWrite && (
        <section className="rounded-3xl border border-border bg-surface p-6">
          <h2 className="text-xl font-bold">Новый инструмент</h2>
          <form action={saveTool} className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-semibold">
              Код
              <input name="code" required className="min-h-11 rounded-xl border border-border bg-surface-muted px-3 font-normal" />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Категория
              <select name="categoryId" required className="min-h-11 rounded-xl border border-border bg-surface-muted px-3 font-normal">
                {data.categories.filter((category) => category.status !== 'deprecated').map((category) => (
                  <option key={category.id} value={category.id}>{category.name_ru}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Название RU
              <input name="nameRu" required className="min-h-11 rounded-xl border border-border bg-surface-muted px-3 font-normal" />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Название KK
              <input name="nameKk" required lang="kk" className="min-h-11 rounded-xl border border-border bg-surface-muted px-3 font-normal" />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Описание RU
              <textarea name="descriptionRu" required rows={2} className="rounded-xl border border-border bg-surface-muted p-3 font-normal" />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Описание KK
              <textarea name="descriptionKk" required rows={2} lang="kk" className="rounded-xl border border-border bg-surface-muted p-3 font-normal" />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Маршрут
              <input name="route" defaultValue="/app/tools" className="min-h-11 rounded-xl border border-border bg-surface-muted px-3 font-normal" />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Совместимые типы бизнеса <span className="font-normal text-muted-foreground">(коды через запятую, пусто — все)</span>
              <input name="compatibleBusinessTypes" placeholder="cafe, retail" className="min-h-11 rounded-xl border border-border bg-surface-muted px-3 font-normal" />
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" name="isPublic" defaultChecked className="size-4" /> Виден в публичном каталоге
            </label>
            <div className="sm:col-span-2"><ReasonField id="tool-reason" /></div>
            <div className="sm:col-span-2">
              <button className="min-h-12 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground">Создать черновик</button>
            </div>
          </form>
        </section>
      )}

      <section className="rounded-3xl border border-border bg-surface p-6">
        <h2 className="text-xl font-bold">Каталог ({data.tools.length})</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <caption className="sr-only">Инструменты платформы</caption>
            <thead className="bg-surface-muted text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="p-3 font-semibold">Код</th>
                <th scope="col" className="p-3 font-semibold">Название</th>
                <th scope="col" className="p-3 font-semibold">Категория</th>
                <th scope="col" className="p-3 font-semibold">Совместимость</th>
                <th scope="col" className="p-3 font-semibold">Статус</th>
                <th scope="col" className="p-3 font-semibold">Действия</th>
              </tr>
            </thead>
            <tbody>
              {data.tools.map((tool) => {
                const category = data.categories.find((item) => item.id === tool.category_id);
                return (
                  <tr key={tool.id} className="border-t border-border">
                    <td className="p-3 font-mono text-xs">{tool.code}</td>
                    <td className="p-3">
                      <p className="font-semibold">{tool.name_ru}</p>
                      <p className="text-xs text-muted-foreground" lang="kk">{tool.name_kk}</p>
                    </td>
                    <td className="p-3 text-xs">{category?.name_ru ?? '—'}</td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {tool.compatible_business_types?.length ? tool.compatible_business_types.join(', ') : 'все типы'}
                    </td>
                    <td className="p-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        tool.status === 'published' ? 'bg-emerald-500/10 text-emerald-800'
                          : tool.status === 'archived' ? 'bg-surface-muted text-muted-foreground'
                            : 'bg-amber-500/10 text-amber-900'}`}>
                        {statusLabels[tool.status] ?? tool.status}
                      </span>
                      <span className="ml-2 font-mono text-xs text-muted-foreground">v{tool.version}</span>
                    </td>
                    <td className="p-3">
                      {canWrite && (
                        <div className="flex flex-wrap gap-2">
                          {tool.status !== 'published' && (
                            <form action={setToolStatus}>
                              <input type="hidden" name="id" value={tool.id} />
                              <input type="hidden" name="status" value="published" />
                              <input type="hidden" name="reason" value={`Публикация инструмента ${tool.code}`} />
                              <button className="min-h-11 rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground">Опубликовать</button>
                            </form>
                          )}
                          {tool.status !== 'archived' && (
                            <form action={setToolStatus}>
                              <input type="hidden" name="id" value={tool.id} />
                              <input type="hidden" name="status" value="archived" />
                              <input type="hidden" name="reason" value={`Архивирование инструмента ${tool.code}`} />
                              <button className="min-h-11 rounded-xl border border-border px-3 text-xs font-bold">Архивировать</button>
                            </form>
                          )}
                          {tool.status === 'archived' && (
                            <form action={setToolStatus}>
                              <input type="hidden" name="id" value={tool.id} />
                              <input type="hidden" name="status" value="draft" />
                              <input type="hidden" name="reason" value={`Восстановление инструмента ${tool.code}`} />
                              <button className="min-h-11 rounded-xl border border-border px-3 text-xs font-bold">Восстановить</button>
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
      </section>

      <AuditTrail rows={data.audit} />
    </div>
  );
}
