import { createHash, randomUUID } from 'node:crypto';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Logo } from '@/components/brand/Logo';
import { DemoBadge } from '@/components/common/DemoBadge';
import { createAdminClient } from '@/lib/supabase/admin';
import { describeLoyaltyError } from '@/lib/loyalty-errors';
import { customerPrivacyRequest, joinLoyalty, redeemReward } from './actions';

export const dynamic = 'force-dynamic';

const field = 'min-h-11 w-full rounded-xl border border-border bg-surface-muted px-4 text-sm outline-none focus:ring-2 focus:ring-primary';

export default async function PublicLoyaltyPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const admin = createAdminClient();

  const hash = '\\x' + createHash('sha256').update(token).digest('hex');
  const { data: qr } = await admin.from('qr_codes')
    .select('id,business_id,loyalty_program_id,status,expires_at,public_context,is_mock')
    .eq('token_hash', hash).eq('purpose', 'loyalty_join').maybeSingle();
  if (!qr || qr.status !== 'active' || (qr.expires_at && new Date(qr.expires_at) <= new Date())) notFound();

  const [{ data: business }, { data: program }, { data: rewards }, { data: menu }] = await Promise.all([
    admin.from('businesses').select('name,status,mode').eq('id', qr.business_id).single(),
    admin.from('loyalty_programs').select('name,program_type,rules,status').eq('id', qr.loyalty_program_id!).single(),
    admin.from('rewards').select('id,name_ru,name_kk,cost_points,cost_stamps').eq('loyalty_program_id', qr.loyalty_program_id!).eq('status', 'active').order('cost_stamps'),
    admin.from('catalog_items').select('name_ru,price_minor').eq('business_id', qr.business_id).eq('is_active', true).order('price_minor').limit(12),
  ]);
  if (!business || !program || business.status !== 'active' || program.status !== 'active') notFound();

  // After joining, the guest gets their own card back rather than a bare
  // «Готово»: the balance, the nearest reward and how much further to go. The
  // figures come from the RPC's answer, which is what was actually written.
  const stamps = Number(query.stamps ?? 0);
  const points = Number(query.points ?? 0);
  const joined = Boolean(query.joined || query.redeemed);
  const nearest = (rewards ?? []).find((reward) => Number(reward.cost_stamps ?? 0) > stamps) ?? (rewards ?? [])[0];
  const remaining = nearest ? Math.max(0, Number(nearest.cost_stamps ?? 0) - stamps) : 0;

  return (
    <main id="main-content" className="min-h-[100dvh] bg-background px-4 py-8">
      <div className="mx-auto max-w-lg">
        <Logo size="md" />
        <section className="mt-7 rounded-3xl border border-border bg-surface p-6 shadow-xl sm:p-8">
          {business.mode === 'demo' && <DemoBadge label="DEMO DATA · SIMULATED VERIFICATION" />}
          <h1 className="mt-4 text-3xl font-extrabold">{business.name}</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {program.name}. Контакт хранится хешем и маской — полного адреса у заведения нет.
            Согласие на участие и согласие на рассылку берутся отдельно.
          </p>

          {query.error && (
            <p role="alert" className="mt-4 rounded-xl bg-rose-500/10 p-3 text-sm leading-6 text-rose-800">
              {describeLoyaltyError(decodeURIComponent(query.error))}
            </p>
          )}

          {joined && (
            <div className="mt-5 rounded-2xl border border-primary/30 bg-primary/5 p-5">
              <div className="flex items-baseline justify-between">
                <p className="text-sm font-bold">{query.redeemed ? 'Награда выдана' : 'Карта заведена'}</p>
                <p className="font-mono text-3xl font-extrabold">{stamps}</p>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">штампов{points > 0 ? ` · ${points} баллов` : ''}</p>

              {nearest && (
                <>
                  <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-surface-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.min(100, Math.round((stamps / Math.max(1, Number(nearest.cost_stamps ?? 1))) * 100))}%` }}
                    />
                  </div>
                  <p className="mt-3 text-sm leading-6">
                    {remaining === 0
                      ? <>«{nearest.name_ru}» уже ваш — назовите свой адрес в форме ниже, чтобы забрать.</>
                      : <>До «{nearest.name_ru}» осталось <strong>{remaining}</strong> {remaining === 1 ? 'штамп' : remaining < 5 ? 'штампа' : 'штампов'}.</>}
                  </p>
                </>
              )}
              {query.duplicate === '1' && (
                <p className="mt-2 text-xs text-muted-foreground">Повтор распознан — начисление не удвоено.</p>
              )}
            </div>
          )}

          <form action={joinLoyalty} className="mt-6 grid gap-4">
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="idempotencyKey" value={`join:${randomUUID()}`} />
            <label className="grid gap-2 text-sm font-semibold">
              Имя
              <input name="displayName" required className={field} />
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              Способ проверки
              <select name="identityType" className={field}>
                <option value="email">Email</option>
                <option value="phone">Телефон</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              Email или телефон
              <input name="identity" required autoComplete="email" className={field} />
              <span className="text-xs font-normal text-muted-foreground">
                Запомните этот адрес: по нему вы будете забирать награду.
              </span>
            </label>
            <label className="flex gap-3 text-sm leading-5">
              <input type="checkbox" name="loyaltyConsent" required />
              Я согласен участвовать в программе лояльности и хранить историю начислений.
            </label>
            <label className="flex gap-3 text-sm leading-5">
              <input type="checkbox" name="marketingConsent" />
              Я отдельно согласен получать предложения. Это необязательно и отзывается в один клик.
            </label>
            <button className="min-h-12 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground">
              Присоединиться
            </button>
          </form>

          {!!rewards?.length && (
            <details className="mt-6 rounded-2xl border border-border p-4" open={Boolean(joined && remaining === 0)}>
              <summary className="cursor-pointer font-bold">Забрать награду</summary>
              <ul className="mt-3 grid gap-1.5 text-sm">
                {rewards.map((reward) => (
                  <li key={reward.id} className="flex items-center justify-between">
                    <span>{reward.name_ru}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {reward.cost_stamps ?? reward.cost_points} {reward.cost_stamps ? 'штампов' : 'баллов'}
                    </span>
                  </li>
                ))}
              </ul>
              <form action={redeemReward} className="mt-4 grid gap-3">
                <input type="hidden" name="token" value={token} />
                <input type="hidden" name="idempotencyKey" value={`redeem:${randomUUID()}`} />
                <select name="identityType" className={field}>
                  <option value="email">Email</option>
                  <option value="phone">Телефон</option>
                </select>
                <input name="identity" required placeholder="Тот же адрес, с которым присоединялись" className={field} />
                <select name="rewardId" className={field}>
                  {rewards.map((reward) => (
                    <option key={reward.id} value={reward.id}>
                      {reward.name_ru} ({reward.cost_stamps ?? reward.cost_points})
                    </option>
                  ))}
                </select>
                <button className="min-h-11 rounded-xl border border-border font-bold">Забрать</button>
              </form>
            </details>
          )}

          {!!menu?.length && (
            <details className="mt-4 rounded-2xl border border-border p-4">
              <summary className="cursor-pointer font-bold">Меню</summary>
              <ul className="mt-3 grid gap-1.5 text-sm">
                {menu.map((item) => (
                  <li key={item.name_ru} className="flex items-center justify-between">
                    <span>{item.name_ru}</span>
                    <span className="font-mono text-xs text-muted-foreground">{Number(item.price_minor).toLocaleString('ru-RU')} ₸</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <details className="mt-4 rounded-2xl border border-border p-4">
            <summary className="cursor-pointer font-bold">Мои данные</summary>
            <form action={customerPrivacyRequest} className="mt-4 grid gap-3">
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="idempotencyKey" value={`privacy:${randomUUID()}`} />
              <select name="identityType" className={field}>
                <option value="email">Email</option>
                <option value="phone">Телефон</option>
              </select>
              <input name="identity" required placeholder="Email или телефон" className={field} />
              <select name="requestType" className={field}>
                <option value="export">Запросить выгрузку</option>
                <option value="delete">Удалить данные</option>
              </select>
              <button className="min-h-11 rounded-xl border border-border font-bold">Отправить запрос</button>
            </form>
          </details>

          <p className="mt-5 text-xs leading-5 text-muted-foreground">
            В адресе страницы нет персональных данных. QR можно отозвать или заменить.
          </p>
        </section>
        <p className="mt-5 text-center text-xs text-muted-foreground">
          <Link href="/privacy" className="underline">Политика конфиденциальности</Link> ·{' '}
          <Link href="/terms" className="underline">Условия</Link>
        </p>
      </div>
    </main>
  );
}
