import type { NumberExplanation } from '@/domain/shared.ts';

/**
 * "Explain every number".
 *
 * Built on <details> so the explanation is keyboard reachable and present in the
 * DOM without JavaScript. Status is carried by a word as well as a colour, so
 * colour is never the only signal.
 */

const STATUS_LABELS: Record<string, string> = {
  observed: 'наблюдение',
  estimated: 'оценка',
  simulated: 'симуляция',
  verified: 'подтверждено',
  blocked: 'заблокировано',
};

const KIND_LABELS: Record<string, string> = {
  forecast: 'Forecast',
  influenced: 'Influenced',
  incremental_estimate: 'Incremental estimate',
  mock_actual: 'Mock result',
  verified_fact: 'Verified fact',
};

export function ExplainNumber({
  label,
  display,
  explanation,
  tone = 'default',
}: {
  label: string;
  display: string;
  explanation?: NumberExplanation;
  tone?: 'default' | 'positive' | 'warning' | 'blocked';
}) {
  const toneClass =
    tone === 'positive' ? 'text-emerald-700'
      : tone === 'warning' ? 'text-amber-800'
        : tone === 'blocked' ? 'text-rose-700'
          : '';

  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 font-mono text-lg font-bold ${toneClass}`}>{display}</p>
      {explanation ? (
        <details className="mt-1 group">
          <summary className="cursor-pointer list-none text-xs font-semibold text-primary underline decoration-dotted underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            Почему это число?
          </summary>
          <dl className="mt-2 space-y-1.5 rounded-xl bg-surface-muted p-3 text-xs leading-5">
            <div>
              <dt className="font-semibold">Что считаем</dt>
              <dd className="text-muted-foreground">{explanation.what}</dd>
            </div>
            <div>
              <dt className="font-semibold">Формула</dt>
              <dd className="font-mono text-muted-foreground">{explanation.formula}</dd>
            </div>
            <div>
              <dt className="font-semibold">Источник</dt>
              <dd className="text-muted-foreground">{explanation.source}</dd>
            </div>
            <div>
              <dt className="font-semibold">Статус и тип</dt>
              <dd className="text-muted-foreground">
                {STATUS_LABELS[explanation.status] ?? explanation.status} · {KIND_LABELS[explanation.kind] ?? explanation.kind} · уверенность {explanation.confidence}%
              </dd>
            </div>
            {explanation.assumptions.length > 0 && (
              <div>
                <dt className="font-semibold">Допущения</dt>
                <dd>
                  <ul className="list-disc pl-4 text-muted-foreground">
                    {explanation.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}
                  </ul>
                </dd>
              </div>
            )}
            <div>
              <dt className="font-semibold">Что делать дальше</dt>
              <dd className="text-muted-foreground">{explanation.nextAction}</dd>
            </div>
          </dl>
        </details>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">Расчёт недоступен для этого сценария.</p>
      )}
    </div>
  );
}

/**
 * Status pill that never relies on colour alone: it always carries a text label
 * and a leading glyph.
 */
export function StatusPill({ status }: { status: 'allowed' | 'warning' | 'blocked' }) {
  const meta = {
    allowed: { glyph: '✓', text: 'Разрешено', className: 'bg-emerald-500/10 text-emerald-800 border-emerald-600/40' },
    warning: { glyph: '!', text: 'С оговорками', className: 'bg-amber-500/10 text-amber-800 border-amber-600/40' },
    blocked: { glyph: '✕', text: 'Заблокировано', className: 'bg-rose-500/10 text-rose-800 border-rose-600/40' },
  }[status];

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${meta.className}`}>
      <span aria-hidden="true" className="font-mono">{meta.glyph}</span>
      Margin Shield: {meta.text}
    </span>
  );
}
