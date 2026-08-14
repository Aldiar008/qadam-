import { AdminBanners, AdminNav, AuditTrail, ReasonField, ReauthControl } from '@/components/admin/AdminShell';
import { requirePlatformAdmin } from '@/server/qadam/admin';
import { savePolicyTemplate } from '../flower-actions';

export const dynamic = 'force-dynamic';

const field = 'min-h-11 w-full rounded-xl border border-border bg-surface-muted px-3 text-sm font-normal';

const CRITICALITY_LABEL: Record<string, string> = {
  critical: 'без неё нельзя',
  normal: 'обычная',
  optional: 'можно обойтись',
};

/**
 * Шаблоны товарной политики.
 *
 * Здесь задаются отраслевые значения по умолчанию, которые получает новый
 * магазин: сколько дней стоит категория, какой кратностью её возят, сколько
 * идёт поставка и какую долю списаний считать нормой.
 *
 * Пион стоит три дня, роза пять, а упаковочная бумага не портится вовсе. Именно
 * из-за этой разницы одна и та же ошибка закупки стоит по-разному — и поэтому
 * сроки здесь не украшение карточки, а вход в расчёт риска.
 */
export default async function AdminPoliciesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const ctx = await requirePlatformAdmin();

  const [{ data: categories }, { data: policies }, { data: audit }] = await Promise.all([
    ctx.supabase.from('flower_categories').select('id,code,name_ru,status').order('sort_order'),
    ctx.supabase
      .from('product_policy_templates')
      .select('id,category_id,shelf_life_days,pack_size_milli,moq_milli,lead_time_p80_hours,criticality,spoilage_tolerance_bps,unit'),
    ctx.supabase
      .from('admin_audit_log')
      .select('id,action,resource_type,resource_code,reason,occurred_at')
      .eq('resource_type', 'product_policy_template')
      .order('occurred_at', { ascending: false })
      .limit(10),
  ]);

  const byCategory = new Map((policies ?? []).map((policy) => [policy.category_id, policy]));
  const active = (categories ?? []).filter((category) => category.status !== 'archived');

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight">Товарная политика</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Значения, которые новый магазин получает вместо пустых полей. Они помечены отраслевыми до тех пор, пока у
          заведения не накопится собственная история: подставленное число и измеренное — не одно и то же.
        </p>
      </header>

      <AdminNav current="/admin/policies" />
      <AdminBanners params={params} />
      {ctx.canWrite && <ReauthControl next="/admin/policies" />}

      <section className="rounded-3xl border border-border bg-surface p-6">
        <h2 className="text-xl font-bold">Значения по категориям</h2>
        <div className="mt-4 grid gap-4">
          {active.map((category) => {
            const policy = byCategory.get(category.id);
            return (
              <form
                key={category.id}
                action={savePolicyTemplate}
                className="grid gap-3 rounded-2xl border border-border p-4 md:grid-cols-[1.2fr_repeat(5,minmax(0,1fr))_auto] md:items-end"
              >
                <input type="hidden" name="categoryId" value={category.id} />

                <div>
                  <p className="text-sm font-bold">{category.name_ru}</p>
                  <p className="font-mono text-xs text-muted-foreground">{category.code}</p>
                </div>

                <label className="grid gap-1 text-xs font-semibold">
                  Срок, дней
                  <input
                    name="shelfLifeDays"
                    type="number"
                    min="1"
                    max="365"
                    defaultValue={policy?.shelf_life_days ?? ''}
                    placeholder="не портится"
                    className={field}
                  />
                </label>

                <label className="grid gap-1 text-xs font-semibold">
                  Кратность
                  <input
                    name="packSize"
                    type="number"
                    min="1"
                    step="1"
                    defaultValue={policy ? Number(policy.pack_size_milli) / 1000 : 10}
                    className={field}
                  />
                </label>

                <label className="grid gap-1 text-xs font-semibold">
                  Мин. партия
                  <input
                    name="moq"
                    type="number"
                    min="0"
                    step="1"
                    defaultValue={policy ? Number(policy.moq_milli) / 1000 : 0}
                    className={field}
                  />
                </label>

                <label className="grid gap-1 text-xs font-semibold">
                  Доставка, ч
                  <input
                    name="leadTimeHours"
                    type="number"
                    min="1"
                    max="720"
                    defaultValue={policy?.lead_time_p80_hours ?? 48}
                    className={field}
                  />
                </label>

                <label className="grid gap-1 text-xs font-semibold">
                  Списания, %
                  <input
                    name="tolerancePercent"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    defaultValue={policy ? policy.spoilage_tolerance_bps / 100 : 8}
                    className={field}
                  />
                </label>

                <div className="grid gap-2 md:col-span-7 md:grid-cols-[repeat(3,minmax(0,1fr))_auto] md:items-end">
                  <label className="grid gap-1 text-xs font-semibold">
                    Критичность
                    <select name="criticality" defaultValue={policy?.criticality ?? 'normal'} className={field}>
                      {Object.entries(CRITICALITY_LABEL).map(([code, label]) => (
                        <option key={code} value={code}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-1 text-xs font-semibold">
                    Единица
                    <input name="unit" defaultValue={policy?.unit ?? 'стебель'} className={field} />
                  </label>

                  {ctx.canWrite ? (
                    <>
                      <ReasonField id={`policy-reason-${category.code}`} defaultValue={`Политика для «${category.name_ru}»`} />
                      <button className="min-h-11 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground">
                        Сохранить
                      </button>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground md:col-span-2">Только чтение: у вашей роли нет права изменять справочники.</p>
                  )}
                </div>
              </form>
            );
          })}
        </div>

        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          Пустой срок означает «не портится» — упаковка и лента, а не «неизвестно». Разница существенная: у неизвестного
          срока риск списания посчитать нельзя, у отсутствующего — не нужно.
        </p>
      </section>

      <AuditTrail rows={audit ?? []} />
    </div>
  );
}
