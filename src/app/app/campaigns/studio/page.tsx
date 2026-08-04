import Link from 'next/link';
import { AlertTriangle, ArrowLeft, ArrowRight, ShieldCheck, Sparkles, WandSparkles } from 'lucide-react';

import { ExplainNumber, StatusPill } from '@/components/product/ExplainNumber';
import { MECHANIC_LABELS, getStudioViewData, type VariantEvaluation } from '@/server/qadam/campaign-studio-data';
import { STUDIO_STEPS, validateStep } from '@/server/qadam/campaign-studio';
import { canMarket } from '@/server/qadam/repository';
import { approveStudioContract, launchStudioCampaign, transitionStudioContract } from './launch-actions';
import { adoptStudioMechanic, compileStudioContract, generateStudioIdeas, gotoStudioStep, saveStudioStep } from './actions';

export const dynamic = 'force-dynamic';

const money = (minor: number | string | null | undefined) => `${Number(minor ?? 0).toLocaleString('ru-RU')} ₸`;
const pct = (bps: number | null | undefined) => (bps == null ? '—' : `${Math.round(Number(bps) / 100)}%`);

const GOAL_OPTIONS = [
  { value: 'reactivate', label: 'Вернуть клиентов' },
  { value: 'new_customers', label: 'Привлечь новых' },
  { value: 'increase_aov', label: 'Увеличить средний чек' },
  { value: 'fill_quiet_hours', label: 'Заполнить тихие часы' },
  { value: 'repeat_visit', label: 'Вернуть на второй визит' },
];

function StepNav({ current }: { current: number }) {
  return (
    <nav aria-label="Шаги Студия кампаний">
      <ol className="flex flex-wrap gap-2">
        {STUDIO_STEPS.map((step) => (
          <li key={step.slug}>
            <form action={gotoStudioStep}>
              <input type="hidden" name="step" value={step.index} />
              <button
                aria-current={current === step.index ? 'step' : undefined}
                className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold ${
                  current === step.index ? 'bg-primary text-primary-foreground' : 'border border-border bg-surface'
                }`}
              >
                <span className="font-mono text-xs">{step.index}</span>
                <span className={current === step.index ? '' : 'hidden sm:inline'}>{step.title}</span>
              </button>
            </form>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function FieldError({ field, invalid }: { field: string; invalid: Set<string> }) {
  if (!invalid.has(field)) return null;
  return <span role="alert" className="text-xs font-semibold text-rose-700">Проверьте это поле.</span>;
}

function ScenarioGrid({ evaluation }: { evaluation: VariantEvaluation }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {(['pessimistic', 'base', 'optimistic'] as const).map((name) => {
        const scenario = evaluation.simulator.scenarios[name];
        const heading = name === 'pessimistic' ? 'Осторожный' : name === 'base' ? 'Базовый' : 'Оптимистичный';
        return (
          <section key={name} className={`rounded-2xl p-4 ${name === 'base' ? 'border-2 border-primary bg-primary/5' : 'border border-border bg-surface'}`}>
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{heading}</h4>
            <div className="mt-3 space-y-3">
              <ExplainNumber label="Доп. заказы" display={String(scenario.incrementalOrders)} explanation={scenario.numbers.incrementalOrders} />
              <ExplainNumber label="Выручка" display={money(scenario.revenueMinor)} explanation={scenario.numbers.revenueMinor} />
              <ExplainNumber label="Доп. выручка" display={money(scenario.incrementalRevenueMinor)} explanation={scenario.numbers.incrementalRevenueMinor} />
              <ExplainNumber
                label="Вклад-маржа"
                display={money(scenario.incrementalContributionMinor)}
                explanation={scenario.numbers.incrementalContributionMinor}
                tone={scenario.incrementalContributionMinor > 0 ? 'positive' : 'blocked'}
              />
              <ExplainNumber label="Затраты" display={money(scenario.campaignCostMinor)} explanation={scenario.numbers.campaignCostMinor} />
              <ExplainNumber label="ROI" display={pct(scenario.roiBps)} explanation={scenario.numbers.roiBps} />
              <ExplainNumber label="Точка окупаемости" display={scenario.breakEvenOrders == null ? '—' : `${scenario.breakEvenOrders} заказов`} explanation={scenario.numbers.breakEvenOrders} />
              <ExplainNumber label="Стоимость возврата" display={scenario.costPerReturnMinor == null ? '—' : money(scenario.costPerReturnMinor)} explanation={scenario.numbers.costPerReturnMinor} />
            </div>
          </section>
        );
      })}
    </div>
  );
}

export default async function CampaignStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string; error?: string; invalid?: string; generated?: string; adopted?: string; compiled?: string; approved?: string; mechanic?: string }>;
}) {
  const params = await searchParams;
  const data = await getStudioViewData();
  const draft = data.session.draft;
  const step = Math.min(7, Math.max(1, Number(params.step ?? data.session.currentStep) || 1));
  const invalid = new Set((params.invalid ?? '').split(',').filter(Boolean));
  const canEdit = canMarket(data.session.ctx.role);
  const contract = data.contract;
  const decision = (contract?.margin_decision ?? null) as { status?: string; reasons?: string[] } | null;
  const consent = (contract?.consent_summary ?? null) as { granted?: number; excluded?: number; scope?: string } | null;
  const snapshot = (contract?.accepted_snapshot ?? null) as Record<string, unknown> | null;
  const isDemo = data.session.ctx.business.mode === 'demo';

  const stepIssues = validateStep(step, draft);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/app/campaigns" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-primary">
        <ArrowLeft className="size-4" /> Все кампании
      </Link>

      <header>
        <h1 className="text-3xl font-extrabold tracking-tight">Студия кампаний</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Семь шагов от цели до запуска. Черновик сохраняется на сервере после каждого шага, поэтому
          обновление страницы, кнопка «назад» и ошибка не теряют ваш ввод.
        </p>
      </header>

      <StepNav current={step} />

      {params.error && (
        <div role="alert" className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4 text-sm font-semibold text-rose-800">
          <AlertTriangle className="mr-2 inline size-4" aria-hidden="true" />{decodeURIComponent(params.error)}
        </div>
      )}
      {stepIssues.length > 0 && invalid.size > 0 && (
        <div role="alert" className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4 text-sm text-rose-800">
          <p className="font-bold">Проверьте поля перед переходом дальше:</p>
          <ul className="mt-2 list-disc pl-5">
            {stepIssues.map((issue) => <li key={issue.field}>{issue.message}</li>)}
          </ul>
        </div>
      )}
      {(params.generated || params.adopted || params.compiled || params.approved) && (
        <div role="status" className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm font-semibold text-emerald-800">
          {params.generated && 'Варианты подготовлены. Экономика каждого пересчитана сервером.'}
          {params.adopted && 'Механика принята и перенесена в симулятор.'}
          {params.compiled && 'Growth Contract собран и готов к проверке.'}
          {params.approved && 'Growth Contract подтверждён. Снимок зафиксирован.'}
        </div>
      )}

      {/* ---------------------------------------------------------------- 1 */}
      {step === 1 && (
        <form action={saveStudioStep} className="space-y-5 rounded-3xl border border-border bg-surface p-6">
          <input type="hidden" name="step" value={1} />
          <h2 className="text-xl font-bold">Шаг 1 · Какая у вас цель?</h2>
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="sr-only">Бизнес-цель</legend>
            {GOAL_OPTIONS.map((option) => (
              <label key={option.value} className="flex min-h-16 cursor-pointer items-center gap-3 rounded-2xl border border-border p-4 text-sm font-bold has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                <input type="radio" name="goal" value={option.value} defaultChecked={draft.goal === option.value} className="size-4" />
                {option.label}
              </label>
            ))}
          </fieldset>
          <div className="flex flex-wrap justify-end gap-3">
            <button name="direction" value="next" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground">
              Далее <ArrowRight className="size-4" aria-hidden="true" />
            </button>
          </div>
        </form>
      )}

      {/* ---------------------------------------------------------------- 2 */}
      {step === 2 && (
        <form action={saveStudioStep} className="space-y-5 rounded-3xl border border-border bg-surface p-6">
          <input type="hidden" name="step" value={2} />
          <h2 className="text-xl font-bold">Шаг 2 · Кому отправляем?</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold">
              Сегмент <FieldError field="segmentCode" invalid={invalid} />
              <select name="segmentCode" defaultValue={draft.segmentCode} className="min-h-11 rounded-xl border border-border bg-surface-muted px-4 text-sm">
                {data.audience.segments.map((segment) => <option key={segment.id} value={segment.code}>{segment.name_ru}</option>)}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              Канал <FieldError field="channel" invalid={invalid} />
              <select name="channel" defaultValue={draft.channel} className="min-h-11 rounded-xl border border-border bg-surface-muted px-4 text-sm">
                {['telegram', 'sms', 'email', 'push', 'in_app'].map((channel) => <option key={channel} value={channel}>{channel}</option>)}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              Частотный лимит на клиента <FieldError field="frequencyCap" invalid={invalid} />
              <input name="frequencyCap" type="number" min="1" max="10" defaultValue={draft.frequencyCap} className="min-h-11 rounded-xl border border-border bg-surface-muted px-4 text-sm" />
            </label>
            <label className="flex items-center gap-3 self-end text-sm font-semibold">
              <input type="checkbox" name="weekdayOnly" defaultChecked={draft.weekdayOnly} className="size-4" />
              Только будни
            </label>
          </div>
          <p className="rounded-2xl bg-surface-muted p-4 text-sm">
            В сегменте «{data.audience.segmentLabel}» — <strong className="font-mono">{data.audience.segmentSize}</strong> клиентов.
            Согласие для канала <code className="font-mono">marketing.{draft.channel}</code> есть у{' '}
            <strong className="font-mono text-primary">{data.audience.eligibleIds.length}</strong>.
            <span className="mt-1 block text-xs text-muted-foreground">
              Разница объяснима: отсутствие или отзыв согласия исключает клиента из аудитории на уровне базы данных.
            </span>
          </p>
          <div className="flex flex-wrap justify-between gap-3">
            <button name="direction" value="back" className="inline-flex min-h-12 items-center rounded-xl border border-border px-5 text-sm font-bold">Назад</button>
            <button name="direction" value="next" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground">
              Далее <ArrowRight className="size-4" aria-hidden="true" />
            </button>
          </div>
        </form>
      )}

      {/* ---------------------------------------------------------------- 3 */}
      {step === 3 && (
        <div className="space-y-5">
          <section className="rounded-3xl border border-border bg-surface p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold">Шаг 3 · Предложение</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  AI предлагает 2–3 разные механики. Тексты — от модели или шаблона, все числа — от сервера.
                </p>
              </div>
              {canEdit && (
                <form action={generateStudioIdeas}>
                  <input type="hidden" name="goal" value={draft.goal} />
                  <button className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground">
                    <WandSparkles className="size-4" aria-hidden="true" /> Подобрать акции
                  </button>
                </form>
              )}
            </div>

            {data.aiIdeas ? (
              <>
                <p className="mt-4 rounded-2xl bg-surface-muted p-3 text-xs leading-5">
                  <strong>Источник:</strong>{' '}
                  {data.aiIdeas.source === 'provider'
                    ? `языковая модель (${data.aiIdeas.providerLabel})`
                    : `встроенный детерминированный шаблон QADAM — ${data.aiIdeas.fallbackReason ?? 'модель недоступна'}`}
                  <span className="mt-1 block text-muted-foreground">
                    Экономика и решение Margin Shield в любом случае рассчитаны сервером, а не моделью.
                  </span>
                </p>
                <div className="mt-4 grid gap-4">
                  {data.aiIdeas.mechanics.map((idea) => {
                    const evaluated = data.comparison.find((variant) => variant.kind === idea.kind);
                    return (
                      <article key={idea.kind} className="rounded-2xl border border-border p-5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <h3 className="text-lg font-bold">{MECHANIC_LABELS[idea.kind]}</h3>
                          {evaluated && <StatusPill status={evaluated.decision.status} />}
                        </div>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">{idea.hypothesis}</p>
                        <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
                          <div><dt className="font-semibold">Почему подходит</dt><dd className="text-muted-foreground">{idea.whyFit}</dd></div>
                          <div><dt className="font-semibold">Аудитория</dt><dd className="text-muted-foreground">{idea.audienceSummary}</dd></div>
                          <div>
                            <dt className="font-semibold">Риски</dt>
                            <dd><ul className="list-disc pl-4 text-muted-foreground">{idea.risks.map((risk) => <li key={risk}>{risk}</li>)}</ul></dd>
                          </div>
                          <div>
                            <dt className="font-semibold">Допущения</dt>
                            <dd><ul className="list-disc pl-4 text-muted-foreground">{idea.requiredAssumptions.map((item) => <li key={item}>{item}</li>)}</ul></dd>
                          </div>
                        </dl>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          {(['ru', 'kk'] as const).map((locale) => (
                            <div key={locale} className="rounded-xl bg-surface-muted p-3">
                              <p className="text-xs font-bold uppercase text-primary">{locale}</p>
                              <p className="mt-1 text-sm font-bold">{idea.copy[locale]?.title}</p>
                              <p className="mt-1 text-xs leading-5 text-muted-foreground">{idea.copy[locale]?.body}</p>
                              <p className="mt-1 text-xs font-bold">{idea.copy[locale]?.cta}</p>
                            </div>
                          ))}
                        </div>
                        {canEdit && (
                          <form action={adoptStudioMechanic} className="mt-4">
                            <input type="hidden" name="mechanic" value={idea.kind} />
                            <input type="hidden" name="benefitValue" value={idea.benefitValue} />
                            <input type="hidden" name="thresholdMinor" value={idea.thresholdMinor} />
                            <input type="hidden" name="durationDays" value={idea.durationDays} />
                            <input type="hidden" name="ideaSource" value={data.aiIdeas?.source === 'provider' ? 'ai_provider' : 'ai_template'} />
                            <button className="inline-flex min-h-11 items-center rounded-xl border border-border px-4 text-sm font-bold">
                              Взять этот вариант
                            </button>
                          </form>
                        )}
                      </article>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="mt-4 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Нажмите «Подобрать акции», чтобы получить варианты под вашу цель, или задайте механику вручную ниже.
              </p>
            )}
          </section>

          <form action={saveStudioStep} className="space-y-5 rounded-3xl border border-border bg-surface p-6">
            <input type="hidden" name="step" value={3} />
            <h3 className="text-lg font-bold">Или настройте механику вручную</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold">
                Механика
                {/* Механика может прийти из подбора в каталоге инструментов —
                    поле просто заполнено заранее, решение всё равно за владельцем. */}
                <select
                  name="mechanic"
                  defaultValue={params.mechanic && params.mechanic in MECHANIC_LABELS ? params.mechanic : draft.mechanic}
                  className="min-h-11 rounded-xl border border-border bg-surface-muted px-4 text-sm"
                >
                  {Object.entries(MECHANIC_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Размер выгоды (₸ или bps) <FieldError field="benefitValue" invalid={invalid} />
                <input name="benefitValue" type="number" min="0" defaultValue={draft.benefitValue} className="min-h-11 rounded-xl border border-border bg-surface-muted px-4 text-sm" />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Минимальный чек, ₸ <FieldError field="thresholdMinor" invalid={invalid} />
                <input name="thresholdMinor" type="number" min="0" defaultValue={draft.thresholdMinor} className="min-h-11 rounded-xl border border-border bg-surface-muted px-4 text-sm" />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Себестоимость заказа, ₸ <FieldError field="unitCostMinor" invalid={invalid} />
                <input name="unitCostMinor" type="number" min="0" defaultValue={draft.unitCostMinor} className="min-h-11 rounded-xl border border-border bg-surface-muted px-4 text-sm" />
              </label>
            </div>
            <div className="flex flex-wrap justify-between gap-3">
              <button name="direction" value="back" className="inline-flex min-h-12 items-center rounded-xl border border-border px-5 text-sm font-bold">Назад</button>
              <button name="direction" value="next" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground">
                Далее <ArrowRight className="size-4" aria-hidden="true" />
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ---------------------------------------------------------------- 4 */}
      {step === 4 && (
        <form action={saveStudioStep} className="space-y-5 rounded-3xl border border-border bg-surface p-6">
          <input type="hidden" name="step" value={4} />
          <h2 className="text-xl font-bold">Шаг 4 · Время, канал и бриф</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold">
              Длительность, дней <FieldError field="durationDays" invalid={invalid} />
              <input name="durationDays" type="number" min="1" max="90" defaultValue={draft.durationDays} className="min-h-11 rounded-xl border border-border bg-surface-muted px-4 text-sm" />
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              Канал
              <select name="channel" defaultValue={draft.channel} className="min-h-11 rounded-xl border border-border bg-surface-muted px-4 text-sm">
                {['telegram', 'sms', 'email', 'push', 'in_app'].map((channel) => <option key={channel} value={channel}>{channel}</option>)}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              Стоимость контакта, ₸
              <input name="channelCostMinor" type="number" min="0" defaultValue={draft.channelCostMinor} className="min-h-11 rounded-xl border border-border bg-surface-muted px-4 text-sm" />
            </label>
            <fieldset className="grid gap-2 text-sm font-semibold">
              <legend>Языки контента</legend>
              <div className="flex gap-4">
                {(['ru', 'kk'] as const).map((locale) => (
                  <label key={locale} className="flex items-center gap-2 font-normal">
                    <input type="checkbox" name="locales" value={locale} defaultChecked={draft.locales.includes(locale)} className="size-4" />
                    {locale.toUpperCase()}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="grid gap-2 text-sm font-semibold sm:col-span-2">
              Бриф RU <FieldError field="briefRu" invalid={invalid} />
              <textarea name="briefRu" rows={2} defaultValue={draft.briefRu} className="rounded-xl border border-border bg-surface-muted p-3 text-sm" />
            </label>
            <label className="grid gap-2 text-sm font-semibold sm:col-span-2">
              Бриф KK <FieldError field="briefKk" invalid={invalid} />
              <textarea name="briefKk" rows={2} defaultValue={draft.briefKk} className="rounded-xl border border-border bg-surface-muted p-3 text-sm" />
            </label>
          </div>
          <div className="flex flex-wrap justify-between gap-3">
            <button name="direction" value="back" className="inline-flex min-h-12 items-center rounded-xl border border-border px-5 text-sm font-bold">Назад</button>
            <button name="direction" value="next" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground">
              Далее <ArrowRight className="size-4" aria-hidden="true" />
            </button>
          </div>
        </form>
      )}

      {/* ---------------------------------------------------------------- 5 */}
      {step === 5 && (
        <div className="space-y-5">
          {data.evaluationError && (
            <div role="alert" className="rounded-3xl border border-rose-500/40 bg-rose-500/5 p-6">
              <h2 className="text-lg font-bold text-rose-800">Сценарии не рассчитаны</h2>
              <p className="mt-2 text-sm leading-6 text-rose-900">{data.evaluationError}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Ваши значения сохранены и показаны в форме ниже — исправьте их и нажмите «Пересчитать».
              </p>
            </div>
          )}

          {data.current && (
          <section className="rounded-3xl border border-border bg-surface p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-bold">Шаг 5 · Симулятор: {MECHANIC_LABELS[draft.mechanic]}</h2>
              <StatusPill status={data.current.decision.status} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Все значения — прогноз на {data.audience.eligibleIds.length} получателей с согласием. Раскройте «Почему это число?»,
              чтобы увидеть формулу, источник и допущения.
            </p>
            <div className="mt-5"><ScenarioGrid evaluation={data.current} /></div>

            {data.current.decision.reasons.length > 0 && (
              <div className={`mt-5 rounded-2xl border p-4 ${data.current.blocked ? 'border-rose-500/40 bg-rose-500/5' : 'border-amber-500/40 bg-amber-500/5'}`}>
                <h3 className="text-sm font-bold">
                  {data.current.blocked ? '✕ Margin Shield запрещает запуск этого варианта' : '! Margin Shield предупреждает'}
                </h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                  {data.current.decision.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                </ul>
              </div>
            )}

            {data.safeAlternative && canEdit && (
              <div className="mt-4 rounded-2xl border-2 border-emerald-600/40 bg-emerald-500/5 p-4">
                <h3 className="text-sm font-bold text-emerald-900">✓ Безопасная альтернатива в одно действие</h3>
                <p className="mt-1 text-sm">
                  {data.safeAlternative.label}
                  {data.safeAlternative.kind === 'gift_with_threshold'
                    ? `: подарок себестоимостью ${money(data.safeAlternative.benefitValue)} при чеке от ${money(data.safeAlternative.thresholdMinor)}`
                    : `: выгода ${money(data.safeAlternative.benefitValue)}`}
                  {' — '}вклад-маржа {money(data.safeAlternative.evaluation.simulator.scenarios.base.incrementalContributionMinor)} в базовом сценарии.
                </p>
                <form action={adoptStudioMechanic} className="mt-3">
                  <input type="hidden" name="mechanic" value={data.safeAlternative.kind} />
                  <input type="hidden" name="benefitValue" value={data.safeAlternative.benefitValue} />
                  <input type="hidden" name="thresholdMinor" value={data.safeAlternative.thresholdMinor} />
                  <input type="hidden" name="durationDays" value={draft.durationDays} />
                  <input type="hidden" name="ideaSource" value="safe_alternative" />
                  <button className="inline-flex min-h-12 items-center rounded-xl bg-emerald-700 px-5 text-sm font-bold text-white">
                    Принять безопасный вариант
                  </button>
                </form>
              </div>
            )}
          </section>
          )}

          {data.comparison.length > 0 && (
          <section className="rounded-3xl border border-border bg-surface p-6">
            <h3 className="text-lg font-bold">Сравнение механик на одних допущениях</h3>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[840px] text-left text-sm">
                <caption className="sr-only">Сравнение всех механик по базовому сценарию</caption>
                <thead className="bg-surface-muted text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="p-3 font-semibold">Механика</th>
                    <th scope="col" className="p-3 font-semibold">Статус</th>
                    <th scope="col" className="p-3 font-semibold">Доп. заказы</th>
                    <th scope="col" className="p-3 font-semibold">Доп. выручка</th>
                    <th scope="col" className="p-3 font-semibold">Вклад-маржа</th>
                    <th scope="col" className="p-3 font-semibold">Затраты</th>
                    <th scope="col" className="p-3 font-semibold">ROI</th>
                    <th scope="col" className="p-3 font-semibold">Действие</th>
                  </tr>
                </thead>
                <tbody>
                  {data.comparison.map((variant) => {
                    const base = variant.simulator.scenarios.base;
                    return (
                      <tr key={variant.kind} className={`border-t border-border ${variant.selected ? 'bg-primary/5' : ''}`}>
                        <th scope="row" className="p-3 text-left font-semibold">
                          {variant.label}
                          {variant.selected && <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">выбрано</span>}
                        </th>
                        <td className="p-3"><StatusPill status={variant.decision.status} /></td>
                        <td className="p-3 font-mono">{base.incrementalOrders}</td>
                        <td className="p-3 font-mono">{money(base.incrementalRevenueMinor)}</td>
                        <td className="p-3 font-mono font-bold">{money(base.incrementalContributionMinor)}</td>
                        <td className="p-3 font-mono">{money(base.campaignCostMinor)}</td>
                        <td className="p-3 font-mono">{pct(base.roiBps)}</td>
                        <td className="p-3">
                          {variant.blocked ? (
                            <span className="text-xs font-bold text-rose-700">✕ Запуск недоступен</span>
                          ) : canEdit ? (
                            <form action={adoptStudioMechanic}>
                              <input type="hidden" name="mechanic" value={variant.kind} />
                              <input type="hidden" name="benefitValue" value={
                                variant.mechanic.type === 'gift_with_threshold' ? variant.mechanic.giftCostMinor
                                  : variant.mechanic.type === 'return_coupon' ? variant.mechanic.couponMinor
                                    : variant.mechanic.type === 'fixed_discount' ? variant.mechanic.discountMinor
                                      : variant.mechanic.type === '2_plus_1' ? variant.mechanic.freeUnitCostMinor
                                        : variant.mechanic.type === 'bonus_points' ? variant.mechanic.liabilityBps
                                          : variant.mechanic.discountBps
                              } />
                              <input type="hidden" name="thresholdMinor" value={variant.mechanic.type === 'gift_with_threshold' ? variant.mechanic.thresholdMinor : 0} />
                              <input type="hidden" name="durationDays" value={draft.durationDays} />
                              <input type="hidden" name="ideaSource" value="owner" />
                              <button className="min-h-11 rounded-xl border border-border px-3 text-xs font-bold">Выбрать</button>
                            </form>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
          )}

          <form action={saveStudioStep} className="space-y-5 rounded-3xl border border-border bg-surface p-6">
            <input type="hidden" name="step" value={5} />
            <h3 className="text-lg font-bold">Допущения (ваша гипотеза, а не прогноз системы)</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="grid gap-2 text-sm font-semibold">
                Базовая конверсия, bps <FieldError field="baselineConversionBps" invalid={invalid} />
                <input name="baselineConversionBps" type="number" min="0" max="10000" defaultValue={draft.baselineConversionBps} className="min-h-11 rounded-xl border border-border bg-surface-muted px-4 text-sm" />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Каннибализация, bps <FieldError field="cannibalizationBps" invalid={invalid} />
                <input name="cannibalizationBps" type="number" min="0" max="10000" defaultValue={draft.cannibalizationBps} className="min-h-11 rounded-xl border border-border bg-surface-muted px-4 text-sm" />
              </label>
              <div />
              <label className="grid gap-2 text-sm font-semibold">
                Прирост · осторожный <FieldError field="upliftLowBps" invalid={invalid} />
                <input name="upliftLowBps" type="number" min="0" max="10000" defaultValue={draft.upliftLowBps} className="min-h-11 rounded-xl border border-border bg-surface-muted px-4 text-sm" />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Прирост · базовый <FieldError field="upliftBaseBps" invalid={invalid} />
                <input name="upliftBaseBps" type="number" min="0" max="10000" defaultValue={draft.upliftBaseBps} className="min-h-11 rounded-xl border border-border bg-surface-muted px-4 text-sm" />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Прирост · оптимистичный <FieldError field="upliftHighBps" invalid={invalid} />
                <input name="upliftHighBps" type="number" min="0" max="10000" defaultValue={draft.upliftHighBps} className="min-h-11 rounded-xl border border-border bg-surface-muted px-4 text-sm" />
              </label>
            </div>
            <div className="flex flex-wrap justify-between gap-3">
              <button name="direction" value="back" className="inline-flex min-h-12 items-center rounded-xl border border-border px-5 text-sm font-bold">Назад</button>
              <button name="direction" value="next" className="inline-flex min-h-12 items-center rounded-xl border border-border px-5 text-sm font-bold">Пересчитать</button>
            </div>
          </form>

          {canEdit && (
            <form action={compileStudioContract} className="flex justify-end">
              <button
                disabled={!data.current || data.current.blocked}
                className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Sparkles className="size-4" aria-hidden="true" />
                {!data.current ? 'Исправьте допущения' : data.current.blocked ? 'Запуск заблокирован Margin Shield' : 'Собрать Growth Contract'}
              </button>
            </form>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------------- 6 */}
      {step === 6 && (
        contract ? (
          <section className="space-y-5 rounded-3xl border border-border bg-surface p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">Шаг 6 · Growth Contract v{contract.version}</h2>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  hash {String(contract.content_hash).slice(0, 16)}… · статус {contract.status}
                  {contract.approved_at && ` · подтверждён ${new Date(contract.approved_at).toLocaleString('ru-RU')}`}
                </p>
              </div>
              <StatusPill status={(decision?.status as 'allowed' | 'warning' | 'blocked') ?? 'blocked'} />
            </div>

            <ol className="grid gap-3 sm:grid-cols-2">
              {[
                { n: 1, title: 'Сигнал и доказательства', body: JSON.stringify((snapshot?.signal as Record<string, unknown>)?.signal_type ?? 'сигнал сохранён в снимке') },
                { n: 2, title: 'Причина и уверенность', body: `Confidence сигнала зафиксирован в снимке контракта.` },
                { n: 3, title: 'Бизнес-цель', body: GOAL_OPTIONS.find((option) => option.value === draft.goal)?.label ?? draft.goal },
                { n: 4, title: 'Аудитория и исключения', body: `${data.audience.segmentLabel}: ${data.audience.segmentSize} в сегменте, ${consent?.granted ?? 0} допущены, ${consent?.excluded ?? 0} исключены` },
                { n: 5, title: 'Проверка согласия', body: `Scope ${consent?.scope ?? '—'}; проверка выполняется повторно при запуске` },
                { n: 6, title: 'Предложение и экономика', body: `${MECHANIC_LABELS[draft.mechanic]}, выгода ${money(draft.benefitValue)}${draft.mechanic === 'gift_with_threshold' ? `, порог ${money(draft.thresholdMinor)}` : ''}` },
                { n: 7, title: 'Три сценария', body: 'Осторожный, базовый и оптимистичный зафиксированы в снимке' },
                { n: 8, title: 'Guardrails', body: `Порог маржи ${(data.marginFloorBps / 100).toFixed(0)}%, бюджет ${money(data.budgetMinor)}, каннибализация ≤ 25%` },
                { n: 9, title: 'Контент и канал', body: `${draft.locales.join(' + ').toUpperCase()} через ${draft.channel}` },
                { n: 10, title: 'Измерение и stop-rule', body: 'Promo code + QR, остановка при отрицательной вклад-марже' },
              ].map((part) => (
                <li key={part.n} className="rounded-2xl bg-surface-muted p-4">
                  <p className="text-xs font-bold text-primary">{part.n}. {part.title}</p>
                  <p className="mt-1 text-sm leading-6">{part.body}</p>
                </li>
              ))}
            </ol>

            <div className="rounded-2xl border border-border p-4">
              <h3 className="text-sm font-bold">Три сценария</h3>
              <div className="mt-3">
                {data.current ? <ScenarioGrid evaluation={data.current} /> : <p className="text-sm text-muted-foreground">Сценарии зафиксированы в снимке контракта.</p>}
              </div>
            </div>

            {canEdit && (
              <div className="flex flex-wrap justify-end gap-3 border-t border-border pt-5">
                <form action={gotoStudioStep}>
                  <input type="hidden" name="step" value={3} />
                  <button className="inline-flex min-h-12 items-center rounded-xl border border-border px-5 text-sm font-bold">Изменить</button>
                </form>
                <form action={transitionStudioContract}>
                  <input type="hidden" name="contractId" value={contract.id} />
                  <input type="hidden" name="toStatus" value="draft" />
                  <input type="hidden" name="expectedVersion" value={contract.optimistic_version} />
                  <button className="inline-flex min-h-12 items-center rounded-xl border border-border px-5 text-sm font-bold">Отложить</button>
                </form>
                <form action={transitionStudioContract}>
                  <input type="hidden" name="contractId" value={contract.id} />
                  <input type="hidden" name="toStatus" value="cancelled" />
                  <input type="hidden" name="expectedVersion" value={contract.optimistic_version} />
                  <button className="inline-flex min-h-12 items-center rounded-xl border border-rose-500/40 px-5 text-sm font-bold text-rose-700">Отклонить</button>
                </form>
                {contract.status !== 'approved' && (
                  <form action={approveStudioContract}>
                    <input type="hidden" name="contractId" value={contract.id} />
                    <button
                      disabled={decision?.status === 'blocked'}
                      className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground disabled:opacity-50"
                    >
                      <ShieldCheck className="size-4" aria-hidden="true" /> Подтвердить
                    </button>
                  </form>
                )}
                {contract.status === 'approved' && (
                  <form action={gotoStudioStep}>
                    <input type="hidden" name="step" value={7} />
                    <button className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground">
                      К запуску <ArrowRight className="size-4" aria-hidden="true" />
                    </button>
                  </form>
                )}
              </div>
            )}
          </section>
        ) : (
          <section className="rounded-3xl border border-dashed border-border p-10 text-center">
            <h2 className="text-lg font-bold">Growth Contract ещё не собран</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              Вернитесь на шаг «Симулятор» и нажмите «Собрать Growth Contract». Заблокированный Margin Shield
              вариант контракт не создаёт.
            </p>
            <form action={gotoStudioStep} className="mt-6 inline-block">
              <input type="hidden" name="step" value={5} />
              <button className="inline-flex min-h-11 items-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground">К симулятору</button>
            </form>
          </section>
        )
      )}

      {/* ---------------------------------------------------------------- 7 */}
      {step === 7 && (
        contract?.status === 'approved' ? (
          <form action={launchStudioCampaign} className="space-y-5 rounded-3xl border border-border bg-surface p-6">
            <input type="hidden" name="contractId" value={contract.id} />
            <input type="hidden" name="expectedVersion" value={contract.optimistic_version} />
            <input type="hidden" name="channel" value={draft.channel} />
            <input type="hidden" name="audienceCustomerIds" value={data.audience.eligibleIds.join(',')} />
            <h2 className="text-xl font-bold">Шаг 7 · Финальное подтверждение</h2>

            <dl className="grid gap-3 sm:grid-cols-2">
              {[
                ['Аудитория', `${data.audience.eligibleIds.length} получателей`],
                ['Согласие', `${consent?.scope ?? '—'} · ${consent?.granted ?? 0} подтверждено`],
                ['Стоимость кампании', money(data.current?.simulator.scenarios.base.campaignCostMinor ?? 0)],
                ['Бюджет владельца', money(data.budgetMinor)],
                ['Решение Margin Shield', decision?.status === 'allowed' ? '✓ Разрешено' : decision?.status === 'warning' ? '! С оговорками' : '✕ Заблокировано'],
                ['Частотный лимит', `${draft.frequencyCap} на клиента`],
                ['Stop-rule', 'Остановка при отрицательной вклад-марже'],
                ['Канал', draft.channel],
              ].map(([term, value]) => (
                <div key={term} className="rounded-2xl bg-surface-muted p-4">
                  <dt className="text-xs text-muted-foreground">{term}</dt>
                  <dd className="mt-1 text-sm font-bold">{value}</dd>
                </div>
              ))}
            </dl>

            <div className={`rounded-2xl border p-4 ${isDemo ? 'border-amber-500/40 bg-amber-500/5' : 'border-rose-500/40 bg-rose-500/5'}`}>
              <h3 className="text-sm font-bold">Коннектор канала</h3>
              <p className="mt-1 text-sm leading-6">
                {isDemo
                  ? 'DEMO_MODE: провайдер не подключён. Кампания перейдёт в состояние SIMULATED — сообщения не отправляются, отклики не выдумываются.'
                  : 'PRODUCTION_MODE: провайдер канала не подключён, поэтому запуск будет отклонён. Подключите канал в настройках — фальшивый успех не показывается.'}
              </p>
            </div>

            <label className="grid gap-2 text-sm font-semibold">
              Название кампании <FieldError field="campaignName" invalid={invalid} />
              <input name="campaignName" required defaultValue={draft.campaignName} className="min-h-11 rounded-xl border border-border bg-surface-muted px-4 text-sm" />
            </label>

            {/* `formAction` rather than a nested form element: the HTML parser
                drops an inner one, which broke hydration and — far worse — made
                «Назад к контракту» a second submit button for the launch. */}
            <div className="flex flex-wrap justify-between gap-3">
              <button
                formAction={gotoStudioStep}
                formNoValidate
                name="step"
                value={6}
                className="inline-flex min-h-12 items-center rounded-xl border border-border px-5 text-sm font-bold"
              >
                Назад к контракту
              </button>
              <button
                disabled={decision?.status === 'blocked'}
                className="inline-flex min-h-12 items-center rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground disabled:opacity-50"
              >
                {isDemo ? 'Запустить (симуляция)' : 'Запустить кампанию'}
              </button>
            </div>
          </form>
        ) : (
          <section className="rounded-3xl border border-dashed border-border p-10 text-center">
            <h2 className="text-lg font-bold">Сначала подтвердите Growth Contract</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              Запуск доступен только после явного подтверждения владельцем на шаге 6.
            </p>
            <form action={gotoStudioStep} className="mt-6 inline-block">
              <input type="hidden" name="step" value={6} />
              <button className="inline-flex min-h-11 items-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground">К контракту</button>
            </form>
          </section>
        )
      )}
    </div>
  );
}
