import { AdminBanners, AdminNav, AuditTrail, ReasonField, ReauthControl } from '@/components/admin/AdminShell';
import { requirePlatformAdmin } from '@/server/qadam/admin';
import { saveAutoOrderRule, setAutoOrderRuleStatus } from '../flower-actions';

export const dynamic = 'force-dynamic';

const field = 'min-h-11 w-full rounded-xl border border-border bg-surface-muted px-3 text-sm font-normal';

const TRIGGER_LABEL: Record<string, string> = {
  time_to_stockout: 'по часам до пустой витрины',
  reorder_point: 'по точке пополнения',
  holiday_lift: 'по приближающемуся поводу',
  spoilage_risk: 'по риску списания',
};

const STATUS_LABEL: Record<string, string> = {
  draft: 'Черновик',
  published: 'Действует',
  archived: 'Отключено',
};

/**
 * Правила автозаказа платформы.
 *
 * Ни одно правило не отправляет заказ. Оно решает, когда позиция попадает в
 * очередь решений и на сколько дней покрытия считать объём. Отправляет заказ
 * владелец — и это разделение выражено тем, что у правила нет и не может быть
 * поля «отправить».
 */
export default async function AdminRulesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const ctx = await requirePlatformAdmin();

  const [{ data: rules }, { data: categories }, { data: types }, { data: audit }] = await Promise.all([
    ctx.supabase
      .from('auto_order_rule_templates')
      .select('id,code,name_ru,description_ru,business_type_codes,category_code,trigger,threshold_hours,cover_days,round_to_pack,status')
      .order('code'),
    ctx.supabase.from('flower_categories').select('code,name_ru').eq('status', 'published').order('sort_order'),
    ctx.supabase.from('business_types').select('code,name_ru').eq('status', 'published').order('name_ru'),
    ctx.supabase
      .from('admin_audit_log')
      .select('id,action,resource_type,resource_code,reason,occurred_at')
      .eq('resource_type', 'auto_order_rule_template')
      .order('occurred_at', { ascending: false })
      .limit(10),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight">Правила автозаказа</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Когда позиция попадает в очередь решений и на сколько дней считать покрытие. Правило готовит черновик —
          отправляет заказ владелец магазина, и заменить его правилом нельзя.
        </p>
      </header>

      <AdminNav current="/admin/rules" />
      <AdminBanners params={params} />
      {ctx.canWrite && <ReauthControl next="/admin/rules" />}

      {ctx.canWrite && (
        <section className="rounded-3xl border border-border bg-surface p-6">
          <h2 className="text-xl font-bold">Новое правило</h2>
          <form action={saveAutoOrderRule} className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-semibold">
              Код
              <input name="code" required pattern="[a-z][a-z0-9_]{1,63}" className={field} placeholder="rose_stockout_clock" />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Название
              <input name="nameRu" required className={field} />
            </label>
            <label className="grid gap-1 text-sm font-semibold sm:col-span-2">
              Что делает <span className="font-normal text-muted-foreground">(правило без объяснения нельзя проверить)</span>
              <textarea name="descriptionRu" required rows={2} className="rounded-xl border border-border bg-surface-muted p-3 text-sm font-normal" />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Срабатывает
              <select name="trigger" defaultValue="reorder_point" className={field}>
                {Object.entries(TRIGGER_LABEL).map(([code, label]) => (
                  <option key={code} value={code}>{label}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Порог, часов <span className="font-normal text-muted-foreground">(для часов до нуля)</span>
              <input name="thresholdHours" type="number" min="1" max="720" className={field} />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Покрытие, дней
              <input name="coverDays" type="number" min="1" max="60" defaultValue={3} className={field} />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Категория <span className="font-normal text-muted-foreground">(пусто — все)</span>
              <select name="categoryCode" defaultValue="" className={field}>
                <option value="">все категории</option>
                {(categories ?? []).map((category) => (
                  <option key={category.code} value={category.code}>{category.name_ru}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Типы бизнеса <span className="font-normal text-muted-foreground">(коды через запятую)</span>
              <input name="businessTypeCodes" defaultValue="flower_shop, flower_chain" className={field} />
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" name="roundToPack" defaultChecked className="size-4" />
              Округлять до кратности поставщика
            </label>
            <div className="sm:col-span-2"><ReasonField id="rule-reason" /></div>
            <div className="sm:col-span-2">
              <button className="min-h-12 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground">
                Создать черновик
              </button>
            </div>
          </form>
          <p className="mt-3 font-mono text-xs text-muted-foreground">
            Доступные типы: {(types ?? []).map((type) => type.code).join(', ')}
          </p>
        </section>
      )}

      <section className="rounded-3xl border border-border bg-surface p-6">
        <h2 className="text-xl font-bold">Правила ({(rules ?? []).length})</h2>
        <ul className="mt-4 grid gap-3">
          {(rules ?? []).map((rule) => (
            <li key={rule.id} className="rounded-2xl border border-border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">{rule.code}</span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    rule.status === 'published'
                      ? 'bg-emerald-500/10 text-emerald-800'
                      : rule.status === 'archived'
                        ? 'bg-surface-muted text-muted-foreground'
                        : 'bg-amber-500/10 text-amber-900'
                  }`}
                >
                  {STATUS_LABEL[rule.status] ?? rule.status}
                </span>
              </div>

              <p className="mt-2 font-bold">{rule.name_ru}</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{rule.description_ru}</p>

              <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 font-mono text-xs text-muted-foreground">
                <div><dt className="inline">Срабатывает: </dt><dd className="inline">{TRIGGER_LABEL[rule.trigger] ?? rule.trigger}</dd></div>
                {rule.threshold_hours !== null && <div><dt className="inline">Порог: </dt><dd className="inline">{rule.threshold_hours} ч</dd></div>}
                <div><dt className="inline">Покрытие: </dt><dd className="inline">{rule.cover_days} дн.</dd></div>
                <div><dt className="inline">Категория: </dt><dd className="inline">{rule.category_code ?? 'все'}</dd></div>
                <div><dt className="inline">Кратность: </dt><dd className="inline">{rule.round_to_pack ? 'округляем' : 'как есть'}</dd></div>
              </dl>

              {ctx.canWrite && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {rule.status !== 'published' && (
                    <form action={setAutoOrderRuleStatus}>
                      <input type="hidden" name="id" value={rule.id} />
                      <input type="hidden" name="status" value="published" />
                      <input type="hidden" name="reason" value={`Включение правила ${rule.code}`} />
                      <button className="min-h-11 rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground">Включить</button>
                    </form>
                  )}
                  {rule.status === 'published' && (
                    <form action={setAutoOrderRuleStatus}>
                      <input type="hidden" name="id" value={rule.id} />
                      <input type="hidden" name="status" value="archived" />
                      <input type="hidden" name="reason" value={`Отключение правила ${rule.code}`} />
                      <button className="min-h-11 rounded-xl border border-border px-4 text-xs font-bold">Отключить</button>
                    </form>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <AuditTrail rows={audit ?? []} />
    </div>
  );
}
