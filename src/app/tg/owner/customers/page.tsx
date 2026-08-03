import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { readTelegramSession } from '@/server/telegram/session';

export const dynamic = 'force-dynamic';

const STAGES: Record<string, string> = {
  new: 'новый', active: 'активный', loyal: 'постоянный', vip: 'VIP', inactive: 'спящий', churned: 'ушёл',
};

/** Гости заведения — кто они и до кого можно дотянуться. */
export default async function OwnerCustomersPage({ searchParams }: { searchParams: Promise<{ stage?: string }> }) {
  const params = await searchParams;
  const session = await readTelegramSession();
  if (!session) redirect('/tg');
  if (!session.ownerUserId) redirect('/tg/card');

  const db = createAdminClient();
  let query = db.from('customers')
    .select('id,display_name,lifecycle_stage,last_seen_at')
    .eq('business_id', session.businessId).neq('lifecycle_stage', 'anonymized')
    .order('last_seen_at', { ascending: false, nullsFirst: false }).limit(40);
  if (params.stage) query = query.eq('lifecycle_stage', params.stage);

  const [{ data: customers }, { data: accounts }, { data: console_ }] = await Promise.all([
    query,
    db.from('loyalty_accounts').select('customer_id,stamps_balance').eq('business_id', session.businessId).limit(500),
    db.rpc('owner_console', { p_business_id: session.businessId }),
  ]);

  const stamps = new Map((accounts ?? []).map((row) => [row.customer_id, row.stamps_balance]));
  const kpi = ((console_ ?? {}) as { kpi?: { customers: number; sleeping: number; reachable: number } }).kpi;
  // The date, not «N дней назад»: a relative age needs the current time, and
  // reading the clock while rendering makes the same list disagree with itself
  // between renders. The date is stable and just as useful on a phone.
  const lastVisit = (iso: string | null) =>
    (iso ? new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : null);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold">Гости</h1>
        {kpi && (
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Всего {kpi.customers}. Спящих {kpi.sleeping}, написать по закону можно {kpi.reachable}.
          </p>
        )}
      </header>

      <nav aria-label="Группы гостей" className="flex gap-2 overflow-x-auto pb-1">
        {([['', 'Все'], ['inactive', 'Спящие'], ['vip', 'VIP'], ['loyal', 'Постоянные'], ['new', 'Новые']] as const).map(([code, label]) => (
          <Link
            key={label}
            href={code ? `/tg/owner/customers?stage=${code}` : '/tg/owner/customers'}
            className={'whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-bold ' + ((params.stage ?? '') === code ? 'bg-primary text-primary-foreground' : 'border border-border bg-surface')}
          >
            {label}
          </Link>
        ))}
      </nav>

      {customers?.length ? (
        <ul className="divide-y divide-border overflow-hidden rounded-3xl border border-border bg-surface">
          {customers.map((customer) => {
            const seen = lastVisit(customer.last_seen_at);
            const balance = stamps.get(customer.id);
            return (
              <li key={customer.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{customer.display_name || 'Без имени'}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {STAGES[customer.lifecycle_stage] ?? customer.lifecycle_stage}
                    {seen === null ? '' : ` · был ${seen}`}
                  </p>
                </div>
                {typeof balance === 'number' && (
                  <span className="shrink-0 rounded-full bg-surface-muted px-2.5 py-1 font-mono text-xs font-bold">{balance} шт.</span>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-3xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          В этой группе пока никого нет.
        </p>
      )}

      {/* Not an omission: there is no column holding a full contact, so there is
          nothing to show here even to the owner. */}
      <p className="pb-2 text-center text-[11px] leading-4 text-muted-foreground">
        Телефонов и адресов здесь нет — в базе хранится только хеш и маска.
      </p>
    </div>
  );
}
