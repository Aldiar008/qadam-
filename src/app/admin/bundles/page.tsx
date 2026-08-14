import { AdminBanners, AdminNav, AuditTrail, ReasonField, ReauthControl } from '@/components/admin/AdminShell';
import { requirePlatformAdmin } from '@/server/qadam/admin';
import { saveBundleItems, saveToolBundle, setToolBundleStatus } from '../flower-actions';

export const dynamic = 'force-dynamic';

const field = 'min-h-11 w-full rounded-xl border border-border bg-surface-muted px-3 text-sm font-normal';

const STATUS_LABEL: Record<string, string> = {
  draft: 'Черновик',
  published: 'Выдаётся',
  archived: 'В архиве',
};

/**
 * Наборы инструментов.
 *
 * Набор отвечает на вопрос первого дня: с чего начать. Без него новый магазин
 * получает каталог из девяти карточек и одинаковую растерянность перед каждой.
 *
 * Порядок в наборе значит не меньше состава: это последовательность, в которой
 * владелец пройдёт продукт. Поэтому состав задаётся целиком одной формой, а не
 * набирается галочками по одной — иначе порядок зависел бы от того, в каком
 * настроении администратор кликал.
 */
export default async function AdminBundlesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const ctx = await requirePlatformAdmin();

  const [{ data: bundles }, { data: tools }, { data: types }, { data: audit }] = await Promise.all([
    ctx.supabase
      .from('tool_bundles')
      .select('id,code,name_ru,description_ru,status,business_types(code,name_ru),tool_bundle_items(sort_order,tools(code,name_ru))')
      .order('code'),
    ctx.supabase.from('tools').select('code,name_ru').eq('status', 'published').order('name_ru'),
    ctx.supabase.from('business_types').select('id,code,name_ru').eq('status', 'published').order('name_ru'),
    ctx.supabase
      .from('admin_audit_log')
      .select('id,action,resource_type,resource_code,reason,occurred_at')
      .eq('resource_type', 'tool_bundle')
      .order('occurred_at', { ascending: false })
      .limit(10),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight">Наборы инструментов</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Что включается магазину выбранного типа в первый день. Порядок в наборе — это порядок, в котором владелец
          пройдёт продукт, а не алфавит.
        </p>
      </header>

      <AdminNav current="/admin/bundles" />
      <AdminBanners params={params} />
      {ctx.canWrite && <ReauthControl next="/admin/bundles" />}

      {ctx.canWrite && (
        <section className="rounded-3xl border border-border bg-surface p-6">
          <h2 className="text-xl font-bold">Новый набор</h2>
          <form action={saveToolBundle} className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-semibold">
              Код
              <input name="code" required pattern="[a-z][a-z0-9_]{1,63}" className={field} />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Тип бизнеса
              <select name="businessTypeId" defaultValue="" className={field}>
                <option value="">без привязки</option>
                {(types ?? []).map((type) => (
                  <option key={type.id} value={type.id}>{type.name_ru}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-semibold sm:col-span-2">
              Название
              <input name="nameRu" required className={field} />
            </label>
            <label className="grid gap-1 text-sm font-semibold sm:col-span-2">
              Описание
              <textarea name="descriptionRu" required rows={2} className="rounded-xl border border-border bg-surface-muted p-3 text-sm font-normal" />
            </label>
            <div className="sm:col-span-2"><ReasonField id="bundle-reason" /></div>
            <div className="sm:col-span-2">
              <button className="min-h-12 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground">
                Создать черновик
              </button>
            </div>
          </form>
        </section>
      )}

      <div className="grid gap-4">
        {(bundles ?? []).map((bundle) => {
          const items = [...(bundle.tool_bundle_items ?? [])].sort((a, b) => a.sort_order - b.sort_order);
          const chosen = items.map((item) => item.tools?.code).filter(Boolean) as string[];

          return (
            <section key={bundle.id} className="rounded-3xl border border-border bg-surface p-6">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold">{bundle.name_ru}</h2>
                <span className="font-mono text-xs text-muted-foreground">{bundle.code}</span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    bundle.status === 'published'
                      ? 'bg-emerald-500/10 text-emerald-800'
                      : bundle.status === 'archived'
                        ? 'bg-surface-muted text-muted-foreground'
                        : 'bg-amber-500/10 text-amber-900'
                  }`}
                >
                  {STATUS_LABEL[bundle.status] ?? bundle.status}
                </span>
                {bundle.business_types && (
                  <span className="rounded-full border border-border px-2.5 py-0.5 text-xs font-semibold">
                    {bundle.business_types.name_ru}
                  </span>
                )}
              </div>

              <p className="mt-2 text-sm leading-6 text-muted-foreground">{bundle.description_ru}</p>

              <ol className="mt-3 flex flex-wrap gap-2">
                {items.map((item, index) => (
                  <li key={item.tools?.code ?? index} className="rounded-xl bg-surface-muted px-3 py-1.5 text-xs font-semibold">
                    {index + 1}. {item.tools?.name_ru ?? '—'}
                  </li>
                ))}
                {items.length === 0 && <li className="text-xs text-muted-foreground">Состав пуст.</li>}
              </ol>

              {ctx.canWrite && (
                <>
                  <form action={saveBundleItems} className="mt-5 border-t border-border pt-4">
                    <input type="hidden" name="bundleId" value={bundle.id} />
                    <fieldset>
                      <legend className="text-sm font-bold">Состав</legend>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        Порядок задаётся порядком в списке ниже: первый отмеченный станет первым шагом.
                      </p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-3">
                        {(tools ?? []).map((tool) => (
                          <label key={tool.code} className="flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-xs font-semibold">
                            <input type="checkbox" name="toolCodes" value={tool.code} defaultChecked={chosen.includes(tool.code)} />
                            {tool.name_ru}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                      <ReasonField id={`bundle-items-${bundle.code}`} defaultValue={`Состав набора «${bundle.name_ru}»`} />
                      <button className="min-h-11 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground">
                        Сохранить состав
                      </button>
                    </div>
                  </form>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {bundle.status !== 'published' && (
                      <form action={setToolBundleStatus}>
                        <input type="hidden" name="id" value={bundle.id} />
                        <input type="hidden" name="status" value="published" />
                        <input type="hidden" name="reason" value={`Публикация набора ${bundle.code}`} />
                        <button className="min-h-11 rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground">Опубликовать</button>
                      </form>
                    )}
                    {bundle.status !== 'archived' && (
                      <form action={setToolBundleStatus}>
                        <input type="hidden" name="id" value={bundle.id} />
                        <input type="hidden" name="status" value="archived" />
                        <input type="hidden" name="reason" value={`Архивирование набора ${bundle.code}`} />
                        <button className="min-h-11 rounded-xl border border-border px-4 text-xs font-bold">В архив</button>
                      </form>
                    )}
                  </div>
                </>
              )}
            </section>
          );
        })}
      </div>

      <AuditTrail rows={audit ?? []} />
    </div>
  );
}
