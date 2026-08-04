import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { canManage, getSettingsData } from '@/server/qadam/repository';
import { saveBusinessLimits, saveBusinessSettings } from '../actions';

export const dynamic = 'force-dynamic';


export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const params = await searchParams;
  const data = await getSettingsData();
  const canEdit = canManage(data.role);
  const location = data.locations[0];

  return (
    <div className="mx-auto max-w-4xl space-y-7">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight">Настройки бизнеса</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Эти значения напрямую влияют на расчёты: средний чек и порог маржи используются Margin Shield,
          бюджет — лимитом на запуск кампаний.
        </p>
      </header>

      {params.error && (
        <div role="alert" className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4 text-sm font-semibold text-rose-800">
          <AlertTriangle className="mr-2 inline size-4" />{decodeURIComponent(params.error)}
        </div>
      )}
      {params.saved && (
        <div role="status" className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm font-semibold text-emerald-800">
          Настройки сохранены в базе.
        </div>
      )}

      {!canEdit && (
        <p className="rounded-2xl border border-border bg-surface-muted p-4 text-sm text-muted-foreground">
          Ваша роль ({data.role}) даёт доступ только на чтение. Изменять настройки может владелец или менеджер.
        </p>
      )}

      <form action={saveBusinessSettings} id="business-profile" className="scroll-mt-24 rounded-3xl border border-border bg-surface p-6 sm:p-8">
        <fieldset disabled={!canEdit} className="grid gap-5 sm:grid-cols-2">
          <legend className="sr-only">Профиль бизнеса</legend>
          <input type="hidden" name="locationId" value={location?.id ?? ''} />

          <label className="grid gap-2 text-sm font-bold">
            Название бизнеса
            <input name="name" defaultValue={data.business.name} className="min-h-11 rounded-xl border border-border bg-background px-4 font-normal outline-none focus:ring-2 focus:ring-primary" />
          </label>
          <label className="grid gap-2 text-sm font-bold">
            Валюта
            <input value={`${data.business.currency} · ₸`} readOnly className="min-h-11 rounded-xl border border-border bg-surface-muted px-4 font-normal" />
          </label>
          <label className="grid gap-2 text-sm font-bold">
            Город
            <input name="city" defaultValue={location?.city ?? ''} className="min-h-11 rounded-xl border border-border bg-background px-4 font-normal outline-none focus:ring-2 focus:ring-primary" />
          </label>
          <label className="grid gap-2 text-sm font-bold">
            Район
            <input name="district" defaultValue={location?.district ?? ''} className="min-h-11 rounded-xl border border-border bg-background px-4 font-normal outline-none focus:ring-2 focus:ring-primary" />
          </label>
          <label className="grid gap-2 text-sm font-bold sm:col-span-2">
            Адрес точки
            <input name="addressText" defaultValue={location?.address_text ?? ''} className="min-h-11 rounded-xl border border-border bg-background px-4 font-normal outline-none focus:ring-2 focus:ring-primary" />
          </label>

          {/* Empty, not prefilled. These two numbers drive Margin Shield, and a
              form that suggests 3450 ₸ and 42% writes them into the profile the
              moment the owner saves anything — after which the product treats
              somebody else's economics as their decision. */}
          <label className="grid gap-2 text-sm font-bold">
            Средний чек, ₸
            <input name="averageCheckMinor" type="number" min="1" placeholder="например, 3450" defaultValue={data.profile?.average_check_minor ?? ''} className="min-h-11 rounded-xl border border-border bg-background px-4 font-normal outline-none focus:ring-2 focus:ring-primary" />
            <span className="text-xs font-normal text-muted-foreground">Ваш собственный, из кассы. От него считается вклад-маржа.</span>
          </label>
          <label className="grid gap-2 text-sm font-bold">
            Порог маржи, bps (4200 = 42%)
            <input name="marginFloorBps" type="number" min="0" max="10000" placeholder="например, 4200" defaultValue={data.profile?.margin_floor_bps ?? ''} className="min-h-11 rounded-xl border border-border bg-background px-4 font-normal outline-none focus:ring-2 focus:ring-primary" />
            <span className="text-xs font-normal text-muted-foreground">Ниже этого порога Margin Shield запретит запуск.</span>
          </label>
          <label className="grid gap-2 text-sm font-bold sm:col-span-2">
            Маркетинговый бюджет в месяц, ₸
            <input name="monthlyMarketingBudgetMinor" type="number" min="0" defaultValue={data.profile?.monthly_marketing_budget_minor ?? 0} className="min-h-11 rounded-xl border border-border bg-background px-4 font-normal outline-none focus:ring-2 focus:ring-primary" />
          </label>
        </fieldset>

        {canEdit && (
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button className="min-h-12 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground">
              Сохранить настройки
            </button>
            {/* Подтверждение рядом с кнопкой, а не только в шапке страницы:
                после сохранения владелец остаётся здесь и должен увидеть ответ
                там, где нажал. */}
            {params.saved === 'profile' && (
              <p role="status" className="rounded-xl bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-800">
                Сохранено. Margin Shield считает по этим числам с этой секунды.
              </p>
            )}
          </div>
        )}
      </form>

      {/* «меняются владельцем отдельно» was true of the sentence and false of
          the product: there was no screen anywhere that edited these. */}
      <form action={saveBusinessLimits} id="business-limits" className="scroll-mt-24 rounded-3xl border border-border bg-surface p-6">
        <h2 className="text-xl font-bold">Лимиты запуска</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Проверяются в базе при каждом запуске кампании. Превысить их из интерфейса нельзя.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-bold">
            Месячный бюджет, ₸
            <input name="monthlyBudgetMinor" type="number" min="0" defaultValue={data.limits?.monthly_budget_minor ?? ''} placeholder="не задан" disabled={!canEdit} className="min-h-11 rounded-xl border border-border bg-background px-4 font-normal outline-none focus:ring-2 focus:ring-primary" />
          </label>
          <label className="grid gap-2 text-sm font-bold">
            Порог обязательного подтверждения, ₸
            <input name="approvalThresholdMinor" type="number" min="0" defaultValue={data.limits?.approval_threshold_minor ?? ''} placeholder="не задан" disabled={!canEdit} className="min-h-11 rounded-xl border border-border bg-background px-4 font-normal outline-none focus:ring-2 focus:ring-primary" />
          </label>
          <label className="grid gap-2 text-sm font-bold">
            Кампаний в месяц
            <input name="maxCampaignsPerMonth" type="number" min="0" defaultValue={data.limits?.max_campaigns_per_month ?? ''} placeholder="не задано" disabled={!canEdit} className="min-h-11 rounded-xl border border-border bg-background px-4 font-normal outline-none focus:ring-2 focus:ring-primary" />
          </label>
          <label className="grid gap-2 text-sm font-bold">
            Контактов в месяц
            <input name="maxContactsPerMonth" type="number" min="0" defaultValue={data.limits?.max_contacts_per_month ?? ''} placeholder="не задано" disabled={!canEdit} className="min-h-11 rounded-xl border border-border bg-background px-4 font-normal outline-none focus:ring-2 focus:ring-primary" />
          </label>
        </div>
        {canEdit && (
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button className="min-h-12 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground">
              Сохранить лимиты
            </button>
            {params.saved === 'limits' && (
              <p role="status" className="rounded-xl bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-800">
                Лимиты сохранены. База проверяет их при каждом запуске.
              </p>
            )}
          </div>
        )}
      </form>

      <section className="rounded-3xl border border-border bg-surface p-6">
        <h2 className="text-xl font-bold">Каналы и доступ</h2>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <div>
            <h3 className="text-sm font-bold">Каналы связи</h3>
            {data.channels.length ? (
              <ul className="mt-3 grid gap-2">
                {data.channels.map((channel) => (
                  <li key={channel.id} className="flex items-center justify-between rounded-xl border border-border p-3 text-xs">
                    <span className="font-bold uppercase">{channel.channel_type}</span>
                    <span className="text-muted-foreground">{channel.status}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                Провайдеры не подключены. Кампании остаются на этапе подготовки, пока канал не настроен.
              </p>
            )}
          </div>
          <div>
            <h3 className="text-sm font-bold">Команда</h3>
            <ul className="mt-3 grid gap-2">
              {data.members.map((member) => (
                <li key={member.id} className="flex items-center justify-between rounded-xl border border-border p-3 text-xs">
                  <span className="font-mono">{member.user_id === data.userId ? 'вы' : member.user_id.slice(0, 8)}</span>
                  <span className="font-bold">{member.role} · {member.status}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <Link href="/app/loyalty" className="mt-6 inline-flex min-h-11 items-center rounded-xl border border-border px-5 text-sm font-bold">
          Настроить QR-лояльность
        </Link>
      </section>
    </div>
  );
}
