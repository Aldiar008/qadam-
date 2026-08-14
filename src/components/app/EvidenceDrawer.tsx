import { FlaskConical, Sigma } from 'lucide-react';

import type { NumberExplanation } from '@/domain/shared';

/**
 * Раскрытие числа: формула, источник, версия, уверенность, допущения.
 *
 * Число без происхождения владелец либо принимает на веру, либо игнорирует —
 * и то и другое одинаково плохо, когда по нему собираются тратить деньги.
 * Поэтому у каждой величины на экране есть эта шторка, а не только у тех, где
 * расчёт получился красивым.
 *
 * Свёрнутый `details` выбран вместо модального окна намеренно: он работает без
 * JavaScript, доступен с клавиатуры и печатается вместе со страницей, если
 * владелец решит распечатать список.
 */
export interface EvidenceDrawerProps {
  /** Пояснение из доменного слоя — единственный источник этих полей. */
  explanation: NumberExplanation;
  /** Версия формулы: без неё старый снимок нельзя отличить от нового. */
  modelVersion?: string;
  /** Отображаемое значение — как его читает человек, а не как хранит база. */
  displayValue: string;
  label?: string;
  /** Демонстрационные данные помечаются явно и всегда. */
  isMock?: boolean;
}

const percent = (rate: number) => `${Math.round(rate * 100)}%`;

export function EvidenceDrawer({ explanation, modelVersion, displayValue, label, isMock = false }: EvidenceDrawerProps) {
  return (
    <details className="group rounded-2xl border border-border bg-surface-muted/60 open:bg-surface-muted">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm">
        <span className="flex min-w-0 items-center gap-2">
          <Sigma className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate font-semibold">{label ?? explanation.what}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="font-mono font-bold">{displayValue}</span>
          <span className="font-mono text-[11px] text-muted-foreground group-open:hidden">откуда</span>
        </span>
      </summary>

      <div className="space-y-3 border-t border-border px-4 py-3 text-sm">
        <dl className="grid gap-2 sm:grid-cols-2">
          <div>
            <dt className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Формула</dt>
            <dd className="mt-0.5">{explanation.formula}</dd>
          </div>
          <div>
            <dt className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Источник</dt>
            <dd className="mt-0.5">{explanation.source}</dd>
          </div>
          <div>
            <dt className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Уверенность</dt>
            <dd className="mt-0.5 font-mono">{percent(explanation.confidence)}</dd>
          </div>
          <div>
            <dt className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Период</dt>
            <dd className="mt-0.5 font-mono text-xs">
              {explanation.period.start.slice(0, 10)} — {explanation.period.end.slice(0, 10)}
            </dd>
          </div>
          {modelVersion && (
            <div>
              <dt className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Версия расчёта</dt>
              <dd className="mt-0.5 font-mono text-xs">{modelVersion}</dd>
            </div>
          )}
          <div>
            <dt className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Статус</dt>
            <dd className="mt-0.5 font-mono text-xs">{explanation.status}</dd>
          </div>
        </dl>

        {explanation.assumptions.length > 0 && (
          <div>
            <p className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Допущения</p>
            <ul className="mt-1 space-y-1">
              {explanation.assumptions.map((line) => (
                <li key={line} className="flex gap-2 text-muted-foreground">
                  <span className="mt-2 size-1 shrink-0 rounded-full bg-border" aria-hidden="true" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-muted-foreground">{explanation.nextAction}</p>

        {isMock && (
          <p className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 font-mono text-[11px] text-amber-800">
            <FlaskConical className="size-3.5 shrink-0" aria-hidden="true" />
            [MOCK] Данные демонстрационные. Расчёт настоящий, наблюдения синтетические.
          </p>
        )}
      </div>
    </details>
  );
}
