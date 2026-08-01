import Link from 'next/link';
import { AlertTriangle, OctagonX, Play, RefreshCw, ShieldCheck } from 'lucide-react';

import { AUTOMATION_TEMPLATES, allowedModes } from '@/automations/catalog.ts';
import { CONNECTOR_STATE_LABELS, type ConnectorState } from '@/connectors/contract.ts';
import { canManage, canMarket, getAutomationsData } from '@/server/qadam/repository';
import {
  checkConnectorHealth,
  createAutomationFromTemplate,
  runAutomationNow,
  runDemoCycle,
  toggleEmergencyStop,
  transitionAutomationRule,
} from './actions';

export const dynamic = 'force-dynamic';

const statusLabels: Record<string, string> = {
  draft: 'Черновик', active: 'Активно', paused: 'На паузе', disabled: 'Отключено',
};
const modeLabels: Record<string, string> = {
  manual: 'Ручной', assistant: 'Ассистент (предлагает, не отправляет)', autopilot: 'Автопилот',
};
const moves: Record<string, { value: string; label: string; primary?: boolean }[]> = {
  draft: [{ value: 'active', label: 'Активировать', primary: true }, { value: 'disabled', label: 'Отключить' }],
  active: [{ value: 'paused', label: 'Пауза', primary: true }, { value: 'disabled', label: 'Отключить' }],
  paused: [{ value: 'active', label: 'Возобновить', primary: true }, { value: 'disabled', label: 'Отключить' }],
};

export default async function AutomationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const data = await getAutomationsData();
  const canEdit = canMarket(data.role);
  const isManager = canManage(data.role);
  const isDemo = data.business.mode === 'demo';
  const stopped = Boolean(data.executionState?.emergency_stopped_at);
  const existingCodes = new Set(data.automations.map((row) => row.automation_type));

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Автоматизации</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Правило наблюдает за сигналом и готовит действие. В режиме «Ассистент» оно ничего не отправляет
            само — отправка всегда требует подтверждённого Growth Contract, действующего согласия и подключённого канала.
          </p>
        </div>
        {isDemo && isManager && (
          <form action={runDemoCycle}>
            <button className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-bold">
              <RefreshCw className="size-4" aria-hidden="true" /> Прогнать demo-цикл
            </button>
          </form>
        )}
      </header>

      {params.error && (
        <div role="alert" className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4 text-sm font-semibold text-rose-800">
          <AlertTriangle className="mr-2 inline size-4" aria-hidden="true" />{decodeURIComponent(params.error)}
        </div>
      )}
      {(params.created || params.updated || params.ran || params.cycle || params.stopped || params.resumed || params.connector) && (
        <div role="status" className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm font-semibold text-emerald-800">
          {params.created && 'Правило создано как черновик — оно ещё ничего не делает.'}
          {params.updated && 'Статус правила обновлён.'}
          {params.ran && 'Правило выполнено. Результат записан в журнал запусков.'}
          {params.cycle && `Demo-цикл выполнен: правил ${params.cycle.split('_')[0]}, отправок ${params.cycle.split('_')[1]}.`}
          {params.stopped && 'Аварийная остановка включена: очередь заморожена, активные правила на паузе.'}
          {params.resumed && 'Работа возобновлена.'}
          {params.connector && `Проверка канала завершена: ${decodeURIComponent(params.connector)}.`}
        </div>
      )}

      {/* Emergency stop --------------------------------------------------- */}
      <section className={`rounded-3xl border p-6 ${stopped ? 'border-rose-500/40 bg-rose-500/5' : 'border-border bg-surface'}`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <OctagonX className="size-5" aria-hidden="true" />
              {stopped ? 'Аварийная остановка активна' : 'Аварийная остановка'}
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {stopped
                ? `Причина: ${data.executionState?.emergency_stop_reason ?? '—'}. Очередь отправок заморожена, активные правила переведены на паузу. Возобновить может только владелец или менеджер.`
                : 'Одно действие останавливает все отправки и правила этого бизнеса. Возобновление — только вручную.'}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Тихие часы: {data.executionState?.quiet_hours_start ?? '21:00'}–{data.executionState?.quiet_hours_end ?? '09:00'}
              {' '}({data.executionState?.timezone ?? 'Asia/Almaty'}) · дневной лимит отправок: {data.executionState?.daily_send_cap ?? 500}
            </p>
          </div>
          {isManager && (
            <form action={toggleEmergencyStop} className="flex items-end gap-2">
              <input type="hidden" name="stop" value={stopped ? '0' : '1'} />
              {!stopped && (
                <label className="grid gap-1 text-xs font-semibold">
                  Причина
                  <input name="reason" placeholder="Например: жалобы клиентов" className="min-h-11 rounded-xl border border-border bg-surface-muted px-3 text-sm" />
                </label>
              )}
              <button className={`inline-flex min-h-11 items-center rounded-xl px-5 text-sm font-bold ${stopped ? 'bg-primary text-primary-foreground' : 'border border-rose-500/40 bg-rose-500/10 text-rose-800'}`}>
                {stopped ? 'Возобновить работу' : 'Остановить всё'}
              </button>
            </form>
          )}
        </div>
      </section>

      {/* Connectors ------------------------------------------------------- */}
      <section className="rounded-3xl border border-border bg-surface p-6">
        <h2 className="text-lg font-bold">Каналы отправки</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Состояние «Подключён» присваивается только после успешной проверки связи, доказательство которой
          сохраняется в базе. Без него максимум — «Песочница».
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <caption className="sr-only">Состояние каналов отправки</caption>
            <thead className="bg-surface-muted text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="p-3 font-semibold">Канал</th>
                <th scope="col" className="p-3 font-semibold">Адаптер</th>
                <th scope="col" className="p-3 font-semibold">Состояние</th>
                <th scope="col" className="p-3 font-semibold">Проверка</th>
                <th scope="col" className="p-3 font-semibold">Действие</th>
              </tr>
            </thead>
            <tbody>
              {['whatsapp', 'telegram', 'email', 'webhook'].map((channel) => {
                const row = data.channels.find((item) => item.channel_type === channel);
                const state = (row?.connector_state ?? 'not_configured') as ConnectorState;
                const meta = CONNECTOR_STATE_LABELS[state];
                return (
                  <tr key={channel} className="border-t border-border">
                    <th scope="row" className="p-3 text-left font-semibold uppercase">{channel}</th>
                    <td className="p-3 font-mono text-xs">{row?.adapter ?? '—'}</td>
                    <td className="p-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        state === 'connected' ? 'bg-emerald-500/10 text-emerald-800'
                          : state === 'sandbox' ? 'bg-amber-500/10 text-amber-800'
                            : state === 'error' ? 'bg-rose-500/10 text-rose-800'
                              : 'bg-surface-muted text-muted-foreground'}`}>
                        {meta.label}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">{meta.hint}</span>
                      {row?.last_error && <span className="mt-1 block text-xs text-rose-700">{row.last_error}</span>}
                    </td>
                    <td className="p-3 font-mono text-xs">
                      {row?.last_health_check_at ? new Date(row.last_health_check_at).toLocaleString('ru-RU') : 'не выполнялась'}
                    </td>
                    <td className="p-3">
                      {isManager && (
                        <form action={checkConnectorHealth} className="flex flex-wrap items-end gap-2">
                          <input type="hidden" name="channel" value={channel} />
                          <label className="sr-only" htmlFor={`adapter-${channel}`}>Адаптер для {channel}</label>
                          <select id={`adapter-${channel}`} name="adapter" defaultValue={row?.adapter ?? 'mock'} className="min-h-11 rounded-xl border border-border bg-surface-muted px-2 text-xs">
                            <option value="mock">mock</option>
                            <option value="webhook">webhook</option>
                            <option value="vendor">vendor (не реализован)</option>
                          </select>
                          <button className="min-h-11 rounded-xl border border-border px-3 text-xs font-bold">Проверить связь</button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Dead letters ----------------------------------------------------- */}
      {data.deadLetters.length > 0 && (
        <section className="rounded-3xl border border-rose-500/40 bg-rose-500/5 p-6">
          <h2 className="text-lg font-bold text-rose-900">Не доставлено после всех попыток ({data.deadLetters.length})</h2>
          <p className="mt-1 text-xs">Эти события не потеряны — они ждут вашего решения и не будут отправлены сами.</p>
          <ul className="mt-3 grid gap-2">
            {data.deadLetters.map((row) => (
              <li key={row.id} className="rounded-xl border border-border bg-surface p-3 text-xs">
                <span className="font-mono font-bold">{row.event_type}</span> · попыток {row.attempts}/{row.attempts_max}
                <span className="mt-1 block text-muted-foreground">{row.last_error ?? 'без описания'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
        {/* Template catalogue --------------------------------------------- */}
        {canEdit && (
          <section className="rounded-3xl border border-border bg-surface p-6">
            <h2 className="text-xl font-bold">Каталог правил</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Каждое правило версионируется: в кампании сохраняется та версия шаблона, которую вы подтвердили.
            </p>
            <ul className="mt-4 grid gap-3">
              {AUTOMATION_TEMPLATES.map((template) => {
                const already = existingCodes.has(template.code);
                const modes = allowedModes(template);
                return (
                  <li key={template.code} className="rounded-2xl border border-border p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-bold">{template.nameRu}</h3>
                      <span className="font-mono text-xs text-muted-foreground">{template.version}</span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{template.descriptionRu}</p>
                    {template.blockedReason && (
                      <p className="mt-2 rounded-xl bg-amber-500/10 p-2 text-xs text-amber-900">! {template.blockedReason}</p>
                    )}
                    {!modes.includes('autopilot') && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Автопилот выключен до выполнения условий: {template.autopilotGates.join('; ')}.
                      </p>
                    )}
                    <form action={createAutomationFromTemplate} className="mt-3 flex flex-wrap items-end gap-2">
                      <input type="hidden" name="code" value={template.code} />
                      <label className="grid gap-1 text-xs font-semibold">
                        Режим
                        <select name="mode" defaultValue={template.defaultMode} className="min-h-11 rounded-xl border border-border bg-surface-muted px-2 text-xs">
                          {modes.map((mode) => <option key={mode} value={mode}>{modeLabels[mode]}</option>)}
                        </select>
                      </label>
                      <button disabled={already} className="min-h-11 rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground disabled:opacity-50">
                        {already ? 'Уже добавлено' : 'Добавить правило'}
                      </button>
                    </form>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Live automations ------------------------------------------------ */}
        <section className="space-y-4">
          {data.automations.length ? data.automations.map((automation) => {
            const trigger = (automation.trigger_rules ?? {}) as Record<string, unknown>;
            const guardrails = (automation.guardrails ?? {}) as Record<string, unknown>;
            const runs = data.runs.filter((run) => run.automation_id === automation.id);
            const available = moves[automation.status] ?? [];
            return (
              <article key={automation.id} className="rounded-3xl border border-border bg-surface p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Play className="size-5 text-primary" aria-hidden="true" />
                    <h2 className="mt-3 text-xl font-bold">{automation.name}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {automation.automation_type} · v{automation.rule_version}
                      {automation.approved_template_version && ` · шаблон ${automation.approved_template_version}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-surface-muted px-3 py-1 text-xs font-bold">{statusLabels[automation.status] ?? automation.status}</span>
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${automation.mode === 'autopilot' ? 'bg-amber-500/10 text-amber-900' : 'bg-primary/10 text-primary'}`}>
                      {modeLabels[automation.mode] ?? automation.mode}
                    </span>
                  </div>
                </div>

                <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
                  <div><dt className="font-semibold">Триггер</dt><dd className="font-mono text-muted-foreground">{JSON.stringify(trigger)}</dd></div>
                  <div><dt className="font-semibold">Ограничения</dt><dd className="font-mono text-muted-foreground">{JSON.stringify(guardrails)}</dd></div>
                  <div><dt className="font-semibold">Следующий запуск</dt><dd className="text-muted-foreground">{automation.next_run_at ? new Date(automation.next_run_at).toLocaleString('ru-RU') : '—'}</dd></div>
                  <div><dt className="font-semibold">Последний запуск</dt><dd className="text-muted-foreground">{automation.last_run_at ? new Date(automation.last_run_at).toLocaleString('ru-RU') : 'ещё не запускалось'}</dd></div>
                </dl>

                {automation.mode !== 'autopilot' && (
                  <p className="mt-3 flex gap-2 rounded-xl bg-surface-muted p-3 text-xs">
                    <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                    В этом режиме правило только предлагает действие и создаёт уведомление. Ни одно сообщение не уходит без вашего подтверждения.
                  </p>
                )}

                {runs.length > 0 && (
                  <div className="mt-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Последние запуски</h3>
                    <ul className="mt-2 grid gap-1">
                      {runs.slice(0, 4).map((run) => {
                        const result = (run.result ?? {}) as { outcome?: string; candidates?: number; eligible?: number; reason?: string };
                        return (
                          <li key={run.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-2 text-xs">
                            <span className="font-mono font-bold text-primary">{run.status}</span>
                            <span className="text-muted-foreground">
                              {result.outcome ?? '—'}
                              {result.eligible != null && ` · подходящих ${result.eligible} из ${result.candidates ?? 0}`}
                              {result.reason && ` · ${result.reason}`}
                            </span>
                            <span className="text-muted-foreground">{run.trigger_source} · {new Date(run.scheduled_at).toLocaleString('ru-RU')}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {canEdit && (
                  <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
                    {available.map((move) => (
                      <form key={move.value} action={transitionAutomationRule}>
                        <input type="hidden" name="id" value={automation.id} />
                        <input type="hidden" name="toStatus" value={move.value} />
                        <input type="hidden" name="expectedVersion" value={automation.optimistic_version} />
                        <button className={`inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-bold ${move.primary ? 'bg-primary text-primary-foreground' : 'border border-border'}`}>
                          {move.label}
                        </button>
                      </form>
                    ))}
                    {automation.status === 'active' && (
                      <form action={runAutomationNow}>
                        <input type="hidden" name="id" value={automation.id} />
                        <button className="inline-flex min-h-11 items-center rounded-xl border border-border px-4 text-sm font-bold">
                          Запустить сейчас
                        </button>
                      </form>
                    )}
                  </div>
                )}
              </article>
            );
          }) : (
            <div className="rounded-3xl border border-dashed border-border p-10 text-center">
              <h2 className="text-lg font-bold">Правил пока нет</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                Добавьте правило из каталога слева. Оно появится как черновик и не будет ничего делать,
                пока вы его не активируете.
              </p>
              <Link href="/app/today" className="mt-6 inline-flex min-h-11 items-center rounded-xl border border-border px-5 text-sm font-bold">
                Вернуться на «Сегодня»
              </Link>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
