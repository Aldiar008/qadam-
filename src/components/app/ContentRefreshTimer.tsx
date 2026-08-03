'use client';

import { useEffect, useState } from 'react';

/**
 * Сколько осталось до следующего обновления материалов.
 *
 * The moment matters: it is when the Reels scripts and the photo brief on this
 * screen are replaced by new ones. Rendering it as a countdown rather than a
 * timestamp is the difference between «через 3 ч 12 мин» and making the owner
 * subtract dates in their head.
 *
 * The clock is only read in an effect. Reading it while rendering would make
 * the server's markup and the browser's disagree by exactly the request's
 * latency, and React would replace the whole subtree to fix it.
 */
export function ContentRefreshTimer({ nextRefreshAt, intervalHours }: { nextRefreshAt: string; intervalHours: number }) {
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setLeft(Math.max(0, new Date(nextRefreshAt).getTime() - Date.now()));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [nextRefreshAt]);

  const hours = left === null ? null : Math.floor(left / 3_600_000);
  const minutes = left === null ? null : Math.floor((left % 3_600_000) / 60_000);
  const seconds = left === null ? null : Math.floor((left % 60_000) / 1000);
  const pad = (value: number) => String(value).padStart(2, '0');

  return (
    <p className="font-mono text-2xl font-extrabold tabular-nums" aria-live="off">
      {left === null ? (
        <span className="text-muted-foreground">··:··:··</span>
      ) : left === 0 ? (
        <span className="text-emerald-700">обновляется…</span>
      ) : (
        <>
          {pad(hours ?? 0)}:{pad(minutes ?? 0)}:{pad(seconds ?? 0)}
          <span className="ml-2 align-middle text-xs font-semibold text-muted-foreground">
            каждые {intervalHours} ч
          </span>
        </>
      )}
    </p>
  );
}
