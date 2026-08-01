export function MetricCard({ label, value, note, tone = 'default' }: { label: string; value: string; note?: string; tone?: 'default' | 'success' | 'warning' }) {
  return <article className="rounded-2xl border border-border bg-surface p-5">
    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className={'mt-3 font-mono text-2xl font-bold tabular-nums ' + (tone === 'success' ? 'text-primary' : tone === 'warning' ? 'text-warning' : '')}>{value}</p>
    {note && <p className="mt-2 text-xs leading-5 text-muted-foreground">{note}</p>}
  </article>;
}
