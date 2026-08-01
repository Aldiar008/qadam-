import { AlertTriangle, CreditCard } from 'lucide-react';

import { createBillingProvider } from '@/billing/provider.ts';
import { requireBusinessContext } from '@/server/qadam/repository';
import { can, type TenantRole } from '@/server/qadam/rbac';

export const dynamic = 'force-dynamic';

const money = (minor: number, currency: string) =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency, maximumFractionDigits: 0 }).format(minor);

export default async function PlanPage() {
  const ctx = await requireBusinessContext();
  const role = ctx.role as TenantRole;
  const billing = createBillingProvider();

  const [{ data: plans }, { data: subscription }, { data: entitlements }, { data: usage }] = await Promise.all([
    ctx.supabase.from('plans').select('id,code,name,price_minor,currency,billing_period,tier_order,description_ru,is_public,status')
      .eq('status', 'active').eq('is_public', true).order('tier_order'),
    ctx.supabase.from('subscriptions').select('plan_id,status,period_start,period_end,grace_period_ends_at,provider')
      .eq('business_id', ctx.businessId).maybeSingle(),
    ctx.supabase.from('plan_entitlements').select('plan_id,value,entitlement_id'),
    ctx.supabase.from('usage_counters').select('entitlement_key,used,period_start').eq('business_id', ctx.businessId),
  ]);

  const { data: keys } = await ctx.supabase.from('entitlements').select('id,key,description').order('key');
  const currentPlan = (plans ?? []).find((plan) => plan.id === subscription?.plan_id)
    ?? (plans ?? []).find((plan) => plan.code === 'free');

  const grantFor = (planId: string, entitlementId: string) =>
    (entitlements ?? []).find((row) => row.plan_id === planId && row.entitlement_id === entitlementId)?.value;
  const usedFor = (key: string) => (usage ?? []).find((row) => row.entitlement_key === key)?.used ?? 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight">Тариф и лимиты</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Лимиты — это данные, а не условия в коде: сервер читает их из тарифа при каждом действии.
          Текущий тариф: <strong>{currentPlan?.name ?? 'Free'}</strong>
          {subscription?.status ? ` · статус ${subscription.status}` : ' · подписка не оформлена, действуют лимиты Free'}.
        </p>
      </header>

      <section className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
        <p className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-800" aria-hidden="true" />
          <span>
            <strong className="font-bold">Платёжный провайдер не подключён ({billing.name}).</strong>{' '}
            Тарифы и лимиты работают по-настоящему, но оплатить подписку сейчас нельзя — QADAM не показывает
            фиктивную оплату. Подключение биллинга отмечено как внешний блокер.
          </span>
        </p>
      </section>

      <section className="rounded-3xl border border-border bg-surface p-6">
        <h2 className="text-xl font-bold">Использование в текущем периоде</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {(keys ?? []).map((entitlement) => {
            const limit = currentPlan ? grantFor(currentPlan.id, entitlement.id) : null;
            const limitText = limit == null ? '—' : String(limit).replace(/"/g, '');
            const used = usedFor(entitlement.key);
            const numericLimit = Number(limitText);
            const atLimit = Number.isFinite(numericLimit) && used >= numericLimit;
            return (
              <div key={entitlement.id} className={`rounded-2xl border p-4 ${atLimit ? 'border-amber-500/40 bg-amber-500/5' : 'border-border bg-surface-muted'}`}>
                <p className="text-xs text-muted-foreground">{entitlement.description}</p>
                <p className="mt-1 font-mono text-lg font-bold">
                  {used} / {limitText === 'unlimited' ? '∞' : limitText}
                </p>
                {atLimit && <p className="mt-1 text-xs font-semibold text-amber-900">Лимит достигнут — черновики сохраняются.</p>}
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-3xl border border-border bg-surface p-6">
        <h2 className="text-xl font-bold">Тарифы</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <caption className="sr-only">Сравнение тарифов и включённых лимитов</caption>
            <thead className="bg-surface-muted text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="p-3 font-semibold">Возможность</th>
                {(plans ?? []).map((plan) => (
                  <th key={plan.id} scope="col" className="p-3 text-center font-semibold">
                    {plan.name}
                    <span className="mt-1 block font-mono text-xs font-normal">
                      {plan.price_minor === 0 ? 'бесплатно' : `${money(plan.price_minor, plan.currency)}/мес`}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(keys ?? []).map((entitlement) => (
                <tr key={entitlement.id} className="border-t border-border">
                  <th scope="row" className="p-3 text-left font-normal">{entitlement.description}</th>
                  {(plans ?? []).map((plan) => {
                    const grant = grantFor(plan.id, entitlement.id);
                    const label = grant == null ? '—' : String(grant).replace(/"/g, '');
                    return (
                      <td key={plan.id} className={`p-3 text-center font-mono text-xs ${plan.id === currentPlan?.id ? 'bg-primary/5 font-bold' : ''}`}>
                        {label === 'unlimited' ? '∞' : label}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {can(role, 'manage_billing') ? (
          <p className="mt-4 flex items-center gap-2 rounded-2xl bg-surface-muted p-3 text-xs">
            <CreditCard className="size-4 shrink-0" aria-hidden="true" />
            Смена тарифа станет доступна сразу после подключения платёжного провайдера. Кнопка оплаты
            намеренно отсутствует, а не отключена, чтобы не создавать впечатление работающего платежа.
          </p>
        ) : (
          <p className="mt-4 text-xs text-muted-foreground">Управлять тарифом может только владелец.</p>
        )}
      </section>
    </div>
  );
}
