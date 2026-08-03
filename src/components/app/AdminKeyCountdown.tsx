'use client';

import { useEffect, useState } from 'react';

/**
 * Показывает ключ и сколько ему осталось жить.
 *
 * A key with no visible expiry is a key somebody writes on a sticker. The
 * countdown is the whole point: when it runs out the page says so instead of
 * letting the owner type something that will be refused.
 */
export function AdminKeyCountdown({ value, validUntil }: { value: string; validUntil: string }) {
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setLeft(Math.max(0, new Date(validUntil).getTime() - Date.now()));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [validUntil]);

  const minutes = left === null ? null : Math.floor(left / 60_000);
  const seconds = left === null ? null : Math.floor((left % 60_000) / 1000);

  return (
    <div className="mt-4 rounded-2xl bg-surface p-5">
      <p className="text-center font-mono text-3xl font-extrabold tracking-[0.25em]">{value}</p>
      <p className="mt-3 text-center text-xs text-muted-foreground" aria-live="polite">
        {left === null
          ? 'Проверяем срок…'
          : left === 0
            ? 'Ключ истёк — обновите страницу, чтобы получить новый.'
            : `Действует ещё ${minutes} мин ${String(seconds).padStart(2, '0')} с`}
      </p>
    </div>
  );
}
