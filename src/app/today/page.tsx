import Link from 'next/link';
import { ArrowRight, ShieldCheck, TrendingDown } from 'lucide-react';
import { DemoBadge } from '@/components/common/DemoBadge';
import { getTodayData } from '@/server/qadam/repository';
import { capitalise } from '@/domain/business-vocabulary';

export const dynamic = 'force-dynamic';
const money = (value: number) => new Intl.NumberFormat('ru-RU').format(value) + ' ₸';

export default async function AppTodayPage() {
  const data = await getTodayData();
  const signal = data.signal;
  const recommendation = data.recommendation;
  // `money` уже занято форматтером выше по файлу.
  const money_ = data.opportunities;
  return <div className="mx-auto max-w-6xl space-y-7">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><div className="flex flex-wrap items-center gap-3"><h1 className="text-3xl font-extrabold tracking-tight">Сегодня</h1>{data.business.mode === 'demo' && <DemoBadge label="DEMO DATA" />}</div><p className="mt-2 text-sm text-muted-foreground">{data.business.name}. Одно безопасное действие с проверяемым эффектом.</p></div>{signal && <div className="rounded-2xl bg-emerald-500/10 px-4 py-3 font-mono text-sm font-bold text-emerald-800">GOS {signal.growth_opportunity_score}/100</div>}</header>
    {/* Первое, что видит владелец, — деньги и действие, а не отчёт.
        Показатели ниже никуда не делись: они отвечают на «как дела», а этот
        блок — на «что мне сделать сегодня». Каждая сумма подписана тем, как она
        посчитана; строка без суммы честно говорит, что оценить её нечем. */}
    {money_.opportunities.length > 0 && <section aria-labelledby="money-heading" className="rounded-3xl border border-emerald-600/30 bg-emerald-500/5 p-6 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="money-heading" className="text-xs font-bold uppercase tracking-wide text-emerald-800">Деньги, которые лежат на столе</h2>
          <p className="mt-2 font-mono text-4xl font-extrabold text-foreground">
            {money_.totalMinor > 0 ? `≈ ${money(money_.totalMinor)}` : 'считаем'}
          </p>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Это сумма возможностей, которые видно в ваших данных сейчас, а не обещание выручки.
            Что из этого удалось забрать — покажет замер после запуска.
          </p>
        </div>
        {money_.peak && <p className="rounded-2xl bg-surface px-4 py-3 text-sm leading-6">
          <strong className="block font-bold">Пик заказов — {money_.peak.hour}:00</strong>
          <span className="text-muted-foreground">{Math.round(money_.peak.shareBps / 100)}% выручки приходит в этот час. Смена должна быть полной.</span>
        </p>}
      </div>

      <ul className="mt-6 grid gap-3">
        {money_.opportunities.map((item) => (
          <li key={item.kind} className="grid gap-3 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <p className="flex flex-wrap items-baseline gap-3">
                <strong className="text-base font-bold">{item.title}</strong>
                {item.amountMinor !== null && <span className="font-mono text-lg font-extrabold text-emerald-800">+{money(item.amountMinor)}</span>}
              </p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.detail}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Как посчитано: {item.basis}</p>
            </div>
            <Link href={item.actionHref} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground">
              {item.actionLabel}
            </Link>
          </li>
        ))}
      </ul>

      {money_.notes.length > 0 && <ul className="mt-4 grid gap-1.5">
        {money_.notes.map((note) => <li key={note} className="text-xs leading-5 text-muted-foreground">— {note}</li>)}
      </ul>}
    </section>}

    <section aria-label="Ключевые показатели" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[
      [capitalise(data.words.personMany),String(data.kpis.customers),'всего в базе'],
      ['Продажи',money(data.kpis.salesMinor),'за всю историю'],
      ['Повторные',data.kpis.repeatRate+'%','пришли больше одного раза'],
      ['Активные кампании',String(data.kpis.activeCampaigns),'идут прямо сейчас'],
      // «—» вместо нуля: ноль здесь читался бы как «вы ничего не заработали»,
      // хотя означал «мы ещё ничего не измеряли».
      ['Вклад-маржа за 30 дней', data.kpis.estimatedContributionMinor === null ? '—' : money(data.kpis.estimatedContributionMinor),
        data.kpis.estimatedContributionMinor === null ? 'ещё нечего измерять' : data.kpis.contributionIsEstimate ? 'оценка, не факт' : 'подтверждено'],
    ].map(([label,value,note]) => <article key={label} className="rounded-2xl border border-border bg-surface p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 font-mono text-xl font-bold">{value}</p><p className="mt-1 text-[11px] leading-4 text-muted-foreground">{note}</p></article>)}</section>
    {signal && recommendation ? <article className="rounded-3xl border border-border bg-surface p-6 shadow-xl sm:p-8"><div className="grid gap-7 lg:grid-cols-[1fr_280px]"><div><div className="flex items-center gap-2 text-xs font-bold text-rose-700"><TrendingDown className="size-4" />Что происходит</div><h2 className="mt-3 text-2xl font-extrabold">{signal.signal_type === 'quiet_hours' ? 'Тихие часы требуют действия' : signal.metric_key}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Показатель изменился на {signal.change_bps / 100}% за сопоставимый период. Источник и период сохранены в signal evidence.</p><h3 className="mt-6 text-sm font-bold">Почему</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{String((recommendation.explanation as Record<string, unknown>)?.reason ?? 'QADAM показывает гипотезу, а не утверждает причинность.')}</p><h3 className="mt-6 text-sm font-bold">Что сделать</h3><p className="mt-2 font-semibold">{recommendation.title_ru}</p></div><aside className="rounded-3xl bg-foreground p-6 text-background"><ShieldCheck className="size-6" /><p className="mt-5 text-xs opacity-60">Что это даст</p><p className="mt-2 text-lg font-bold">Проверяемый Growth Contract</p><p className="mt-3 text-xs leading-5 opacity-70">Confidence {recommendation.confidence}%. Экономика будет пересчитана сервером перед запуском.</p></aside></div><div className="mt-7 flex justify-end border-t border-border pt-5"><Link href={`/app/campaigns/new?recommendation=${recommendation.id}`} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground">Подготовить действие <ArrowRight className="size-4" /></Link></div></article> : <section className="rounded-3xl border border-dashed border-border bg-surface p-10 text-center"><h2 className="text-xl font-bold">Недостаточно данных для сигнала</h2><p className="mt-2 text-sm text-muted-foreground">Подключите источник или настройте QR-лояльность. QADAM не придумывает выводы.</p><Link href="/app/loyalty" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground">Настроить QR</Link></section>}
    <div className="grid gap-4 lg:grid-cols-3"><section className="rounded-3xl border border-border bg-surface p-5 lg:col-span-2"><h2 className="font-bold">Активные инструменты и кампании</h2>
      <p className="mt-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">Инструменты</p>
      <div className="mt-2 grid gap-2">{data.tools.length ? data.tools.map((tool) => <Link key={tool.id} href={tool.route} className="min-h-11 rounded-xl bg-primary/5 px-4 py-3 text-sm font-semibold text-primary">{tool.name}</Link>) : <p className="text-sm text-muted-foreground">Ни один инструмент не включён. <Link href="/app/tools" className="font-bold text-primary hover:underline">Каталог</Link> — там их можно активировать, и они появятся здесь.</p>}</div>
      <p className="mt-5 text-xs font-bold uppercase tracking-wide text-muted-foreground">Кампании</p>
      <div className="mt-2 grid gap-2">{data.campaigns.length ? data.campaigns.map((item) => <Link key={item.id} href={`/app/campaigns/${item.id}`} className="min-h-11 rounded-xl bg-surface-muted px-4 py-3 text-sm font-semibold">{item.name} · {item.status}</Link>) : <p className="text-sm text-muted-foreground">Активных кампаний пока нет.</p>}</div></section><section className="rounded-3xl border border-border bg-surface p-5"><h2 className="font-bold">Уведомления</h2><div className="mt-4 grid gap-3">{data.notifications.length ? data.notifications.map((item) => <p key={item.id} className="text-sm"><strong className="block">{item.title}</strong><span className="text-muted-foreground">{item.body}</span></p>) : <p className="text-sm text-muted-foreground">Новых уведомлений нет.</p>}</div></section></div>
  </div>;
}
