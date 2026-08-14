import Link from 'next/link';
import { ArrowRight, Construction } from 'lucide-react';

/**
 * Раздел, который уже есть в навигации, но ещё не имеет рабочего экрана.
 *
 * Пустая страница или заглушка «скоро» ничего не сообщает: непонятно, это сбой,
 * это забыли или так и задумано. Здесь вместо этого написано, что именно будет
 * на экране, откуда возьмутся числа и чего он делать не будет. Так раздел можно
 * показывать до того, как он заработает, ничего при этом не изображая.
 *
 * Как только у раздела появляется настоящий экран, файл страницы перестаёт
 * использовать этот компонент — сам компонент никуда не встраивается и не
 * оставляет следов в работающем разделе.
 */
export interface PlannedSectionProps {
  /** Заголовок раздела — тот же, что в меню слева. */
  title: string;
  /** Одно-два предложения: зачем этот раздел владельцу. */
  summary: string;
  /** Что будет на экране: конкретные элементы, а не обещания. */
  willShow: readonly string[];
  /** Откуда возьмутся числа: таблицы, расчёты, источники. */
  dataSource: string;
  /** Чего раздел делать не будет — граница, чтобы его не ждали не за тем. */
  outOfScope?: string;
  /** Куда пойти сейчас, пока раздела нет. */
  fallback?: { label: string; href: string };
}

export function PlannedSection({ title, summary, willShow, dataSource, outOfScope, fallback }: PlannedSectionProps) {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-3">
        <span className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 font-mono text-xs font-bold text-amber-800">
          <Construction className="size-3.5" aria-hidden="true" />
          Раздел в подготовке
        </span>
        <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{summary}</p>
      </header>

      <section className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Что будет на экране
        </h2>
        <ul className="mt-4 space-y-2 text-sm">
          {willShow.map((item) => (
            <li key={item} className="flex gap-3">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-border bg-surface-muted p-6 text-sm leading-6">
        <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Откуда числа
        </h2>
        <p className="mt-3">{dataSource}</p>
        {outOfScope && (
          <p className="mt-3 text-muted-foreground">
            <span className="font-semibold text-foreground">Чего здесь не будет: </span>
            {outOfScope}
          </p>
        )}
      </section>

      {fallback && (
        <Link
          href={fallback.href}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface px-5 text-sm font-bold transition-colors hover:bg-surface-muted"
        >
          {fallback.label}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
