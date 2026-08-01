import Link from 'next/link';
import { AlertTriangle, ArrowLeft, ShieldAlert, ShieldCheck, Sparkles } from 'lucide-react';
import { getCampaignStudioData } from '@/server/qadam/repository';
import { compileCampaignDraft, launchCampaign, transitionContract } from '../actions';

export const dynamic = 'force-dynamic';

// KZT minor unit is the tenge itself in this schema — no division.
const money = (minor: number | string | null | undefined) => `${Number(minor ?? 0).toLocaleString('ru-RU')} ₸`;

interface ScenarioShape {
  incrementalOrders?: number;
  incrementalRevenueMinor?: number;
  incrementalContributionMinor?: number;
  campaignCostMinor?: number;
  roiBps?: number | null;
  costPerReturnMinor?: number | null;
}

export default async function CampaignStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ segment?: string; recommendation?: string; channel?: string; contract?: string; error?: string; compiled?: string; transitioned?: string }>;
}) {
  const params = await searchParams;
  const data = await getCampaignStudioData({
    segment: params.segment,
    recommendation: params.recommendation,
    channel: params.channel,
    contract: params.contract,
  });

  const contract = data.contract;
  const snapshot = (contract?.accepted_snapshot ?? null) as Record<string, unknown> | null;
  const simulator = (contract?.simulator_result ?? null) as { scenarios?: Record<string, ScenarioShape> } | null;
  const decision = (contract?.margin_decision ?? null) as { status?: string; reasons?: string[]; alternatives?: { titleRu?: string; title?: string }[] } | null;
  const consent = (contract?.consent_summary ?? null) as { granted?: number; excluded?: number; scope?: string } | null;
  const gos = (snapshot?.gos ?? null) as { score?: number } | null;

  const signal = data.signals[0];
  const recommendation = data.selectedRecommendation;
  const aovDefault = data.profile?.average_check_minor ?? 3450;
  const blocked = decision?.status === 'blocked';

  return (
    <div className="mx-auto max-w-5xl space-y-7">
      <Link href="/app/campaigns" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-primary">
        <ArrowLeft className="size-4" /> Все кампании
      </Link>

      <header>
        <h1 className="text-3xl font-extrabold tracking-tight">Campaign Studio</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Задайте цель, аудиторию и механику — сервер пересчитает экономику, проверит Margin Shield и
          соберёт Growth Contract. Запуск возможен только после вашего подтверждения.
        </p>
      </header>

      {params.error && (
        <div role="alert" className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4 text-sm font-semibold text-rose-800">
          <AlertTriangle className="mr-2 inline size-4" />
          {decodeURIComponent(params.error)}
        </div>
      )}

      {!data.signals.length || !data.recommendations.length ? (
        <section className="rounded-3xl border border-dashed border-border p-10 text-center">
          <h2 className="text-lg font-bold">Нет открытого сигнала для кампании</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            QADAM создаёт кампанию только из обнаруженного сигнала и рекомендации. Загрузите данные о
            клиентах или подключите demo-набор, чтобы движок нашёл возможность роста.
          </p>
          <Link href="/app/today" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground">
            Открыть «Сегодня»
          </Link>
        </section>
      ) : (
        <form action={compileCampaignDraft} className="space-y-5">
          <input type="hidden" name="signalId" value={signal?.id ?? ''} />
          <input type="hidden" name="audienceCustomerIds" value={data.eligibleIds.join(',')} />
          <input type="hidden" name="aovMinor" value={aovDefault} />

          <fieldset className="rounded-3xl border border-border bg-surface p-6">
            <legend className="px-2 text-xs font-bold uppercase tracking-wider text-primary">Шаг 1 · Цель и сигнал</legend>
            <div className="mt-3 rounded-2xl bg-surface-muted p-4">
              <p className="text-sm font-bold">{signal?.signal_type} · {signal?.metric_key}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Изменение {(Number(signal?.change_bps ?? 0) / 100).toFixed(1)}% · GOS {signal?.growth_opportunity_score} ·
                уверенность {signal?.confidence}%
              </p>
            </div>
            <label className="mt-4 grid gap-2 text-sm font-semibold">
              Рекомендация
              <select name="recommendationId" defaultValue={recommendation?.id} className="min-h-11 rounded-xl border border-border bg-surface-muted px-4 text-sm">
                {data.recommendations.map((item) => (
                  <option key={item.id} value={item.id}>{item.title_ru}</option>
                ))}
              </select>
            </label>
          </fieldset>

          <fieldset className="rounded-3xl border border-border bg-surface p-6">
            <legend className="px-2 text-xs font-bold uppercase tracking-wider text-primary">Шаг 2 · Аудитория и канал</legend>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold">
                Сегмент
                <select name="segment" defaultValue={data.selectedSegment?.code} className="min-h-11 rounded-xl border border-border bg-surface-muted px-4 text-sm">
                  {data.segments.map((segment) => (
                    <option key={segment.id} value={segment.code}>{segment.name_ru}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Канал
                <select name="channel" defaultValue={data.channel} className="min-h-11 rounded-xl border border-border bg-surface-muted px-4 text-sm">
                  {['whatsapp', 'telegram', 'sms', 'email', 'push', 'in_app'].map((channel) => (
                    <option key={channel} value={channel}>{channel}</option>
                  ))}
                </select>
              </label>
            </div>
            <p className="mt-4 rounded-2xl bg-surface-muted p-4 text-sm">
              В сегменте <strong className="font-mono">{data.segmentCustomerIds.length}</strong> клиентов →
              согласие для канала <code className="font-mono">marketing.{data.channel}</code> есть у{' '}
              <strong className="font-mono text-primary">{data.eligibleIds.length}</strong>.
              <span className="mt-1 block text-xs text-muted-foreground">
                Разница объяснима: отзыв согласия и отсутствие согласия исключают клиента из аудитории на уровне базы.
                Смена сегмента или канала применяется после пересчёта экономики.
              </span>
            </p>
          </fieldset>

          <fieldset className="rounded-3xl border border-border bg-surface p-6">
            <legend className="px-2 text-xs font-bold uppercase tracking-wider text-primary">Шаг 3 · Механика</legend>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold">
                Тип механики
                <select name="mechanic" defaultValue="gift_with_threshold" className="min-h-11 rounded-xl border border-border bg-surface-muted px-4 text-sm">
                  <option value="gift_with_threshold">Подарок при пороге чека</option>
                  <option value="percentage_discount">Скидка в процентах</option>
                  <option value="fixed_discount">Фиксированная скидка</option>
                  <option value="2_plus_1">2+1</option>
                  <option value="happy_hours">Счастливые часы</option>
                  <option value="return_coupon">Купон на возврат</option>
                  <option value="bonus_points">Бонусные баллы</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Стоимость выгоды, ₸ (или bps для скидок)
                <input name="mechanicAmount" type="number" min="0" defaultValue="600" className="min-h-11 rounded-xl border border-border bg-surface-muted px-4 text-sm" />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Минимальный чек, ₸
                <input name="thresholdMinor" type="number" min="1" defaultValue="3500" className="min-h-11 rounded-xl border border-border bg-surface-muted px-4 text-sm" />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Длительность, дней
                <input name="durationDays" type="number" min="1" max="90" defaultValue="7" className="min-h-11 rounded-xl border border-border bg-surface-muted px-4 text-sm" />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Себестоимость заказа, ₸
                <input name="unitCostMinor" type="number" min="0" defaultValue="1400" className="min-h-11 rounded-xl border border-border bg-surface-muted px-4 text-sm" />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Стоимость контакта, ₸
                <input name="channelCostMinor" type="number" min="0" defaultValue="20" className="min-h-11 rounded-xl border border-border bg-surface-muted px-4 text-sm" />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Базовая конверсия, bps
                <input name="baselineConversionBps" type="number" min="0" max="10000" defaultValue="1200" className="min-h-11 rounded-xl border border-border bg-surface-muted px-4 text-sm" />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Каннибализация, bps
                <input name="cannibalizationBps" type="number" min="0" max="10000" defaultValue="1500" className="min-h-11 rounded-xl border border-border bg-surface-muted px-4 text-sm" />
              </label>
            </div>

            <fieldset className="mt-5 rounded-2xl bg-surface-muted p-4">
              <legend className="px-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Допущение о приросте отклика, bps
              </legend>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Это ваша гипотеза, а не прогноз системы. Три значения задают осторожный, базовый и
                оптимистичный сценарии симулятора.
              </p>
              <div className="mt-3 grid gap-4 sm:grid-cols-3">
                <label className="grid gap-2 text-sm font-semibold">
                  Осторожный
                  <input name="upliftLowBps" type="number" min="0" max="10000" defaultValue="400" className="min-h-11 rounded-xl border border-border bg-background px-4 text-sm" />
                </label>
                <label className="grid gap-2 text-sm font-semibold">
                  Базовый
                  <input name="upliftBaseBps" type="number" min="0" max="10000" defaultValue="900" className="min-h-11 rounded-xl border border-border bg-background px-4 text-sm" />
                </label>
                <label className="grid gap-2 text-sm font-semibold">
                  Оптимистичный
                  <input name="upliftHighBps" type="number" min="0" max="10000" defaultValue="1500" className="min-h-11 rounded-xl border border-border bg-background px-4 text-sm" />
                </label>
              </div>
            </fieldset>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold">
                Текст-бриф RU
                <textarea name="briefRu" rows={2} defaultValue="Вернуть спящих клиентов в тихие часы будней." className="rounded-xl border border-border bg-surface-muted p-3 text-sm" />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Текст-бриф KK
                <textarea name="briefKk" rows={2} defaultValue="Ұйықтап қалған клиенттерді тыныш сағаттарда қайтару." className="rounded-xl border border-border bg-surface-muted p-3 text-sm" />
              </label>
            </div>
          </fieldset>

          <div className="flex flex-wrap justify-end gap-3">
            <button className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground">
              <Sparkles className="size-4" /> Рассчитать экономику и Margin Shield
            </button>
          </div>
        </form>
      )}

      {contract && (
        <section className="space-y-5 rounded-3xl border border-border bg-surface p-6" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">Шаг 4 · Growth Contract v{contract.version}</h2>
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                hash {String(contract.content_hash).slice(0, 16)}… · статус {contract.status}
              </p>
            </div>
            <span
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${
                decision?.status === 'allowed'
                  ? 'bg-emerald-500/10 text-emerald-700'
                  : decision?.status === 'warning'
                    ? 'bg-amber-500/10 text-amber-800'
                    : 'bg-rose-500/10 text-rose-700'
              }`}
            >
              {decision?.status === 'allowed' ? <ShieldCheck className="size-4" /> : <ShieldAlert className="size-4" />}
              Margin Shield: {decision?.status ?? 'n/a'}
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {(['pessimistic', 'base', 'optimistic'] as const).map((name) => {
              const scenario = simulator?.scenarios?.[name];
              return (
                <div key={name} className={`rounded-2xl p-4 ${name === 'base' ? 'bg-foreground text-background' : 'bg-surface-muted'}`}>
                  <p className="text-xs font-bold uppercase tracking-wider opacity-70">
                    {name === 'pessimistic' ? 'Осторожный' : name === 'base' ? 'Базовый' : 'Оптимистичный'}
                  </p>
                  <p className="mt-3 font-mono text-2xl font-extrabold">{money(scenario?.incrementalContributionMinor)}</p>
                  <p className="text-xs opacity-70">вклад-маржа (forecast)</p>
                  <dl className="mt-3 space-y-1 text-xs">
                    <div className="flex justify-between"><dt className="opacity-70">Доп. заказы</dt><dd className="font-mono">{scenario?.incrementalOrders ?? 0}</dd></div>
                    <div className="flex justify-between"><dt className="opacity-70">Затраты</dt><dd className="font-mono">{money(scenario?.campaignCostMinor)}</dd></div>
                    <div className="flex justify-between"><dt className="opacity-70">ROI</dt><dd className="font-mono">{scenario?.roiBps == null ? '—' : `${Math.round(scenario.roiBps / 100)}%`}</dd></div>
                  </dl>
                </div>
              );
            })}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl bg-surface-muted p-4">
              <p className="text-xs text-muted-foreground">Согласие ({consent?.scope})</p>
              <p className="mt-1 font-mono text-xl font-bold">{consent?.granted ?? 0}</p>
              <p className="text-xs text-muted-foreground">исключено: {consent?.excluded ?? 0}</p>
            </div>
            <div className="rounded-2xl bg-surface-muted p-4">
              <p className="text-xs text-muted-foreground">Growth Opportunity Score</p>
              <p className="mt-1 font-mono text-xl font-bold">{gos?.score ?? '—'}</p>
            </div>
            <div className="rounded-2xl bg-surface-muted p-4">
              <p className="text-xs text-muted-foreground">Прогноз, не гарантия</p>
              <p className="mt-1 text-xs leading-5">Фактический результат появится в Impact Ledger после запуска.</p>
            </div>
          </div>

          {Boolean(decision?.reasons?.length) && (
            <div className={`rounded-2xl border p-4 ${blocked ? 'border-rose-500/30 bg-rose-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
              <h3 className="text-sm font-bold">{blocked ? 'Margin Shield остановил кампанию' : 'Предупреждения Margin Shield'}</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                {decision?.reasons?.map((reason) => <li key={reason}>{reason}</li>)}
              </ul>
              {Boolean(decision?.alternatives?.length) && (
                <p className="mt-3 text-xs">
                  Безопасная альтернатива: {decision?.alternatives?.map((alt) => alt.titleRu ?? alt.title).filter(Boolean).join('; ')}
                </p>
              )}
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-3 border-t border-border pt-5">
            {contract.status === 'compiled' && (
              <form action={transitionContract}>
                <input type="hidden" name="contractId" value={contract.id} />
                <input type="hidden" name="toStatus" value="awaiting_approval" />
                <input type="hidden" name="expectedVersion" value={contract.optimistic_version} />
                <button className="inline-flex min-h-12 items-center rounded-xl border border-border px-5 text-sm font-bold disabled:opacity-50" disabled={blocked}>
                  Отправить на подтверждение
                </button>
              </form>
            )}
            {contract.status === 'awaiting_approval' && (
              <form action={transitionContract}>
                <input type="hidden" name="contractId" value={contract.id} />
                <input type="hidden" name="toStatus" value="approved" />
                <input type="hidden" name="expectedVersion" value={contract.optimistic_version} />
                <button className="inline-flex min-h-12 items-center rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground disabled:opacity-50" disabled={blocked}>
                  Подтвердить как владелец
                </button>
              </form>
            )}
            {contract.status === 'approved' && (
              <form action={launchCampaign} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="contractId" value={contract.id} />
                <input type="hidden" name="expectedVersion" value={contract.optimistic_version} />
                <input type="hidden" name="channel" value={data.channel} />
                <input type="hidden" name="audienceCustomerIds" value={data.eligibleIds.join(',')} />
                <label className="grid gap-2 text-sm font-semibold">
                  Название кампании
                  <input name="name" required defaultValue={recommendation?.title_ru ?? 'Кампания QADAM'} className="min-h-11 rounded-xl border border-border bg-surface-muted px-4 text-sm" />
                </label>
                <button className="inline-flex min-h-12 items-center rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground">
                  Запустить кампанию
                </button>
              </form>
            )}
            <Link href="/app/campaigns" className="inline-flex min-h-12 items-center rounded-xl border border-border px-5 text-sm font-bold">
              К списку кампаний
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
