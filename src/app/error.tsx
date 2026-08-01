'use client';

import Link from 'next/link';

/**
 * Root error boundary.
 *
 * A segment's own `error.tsx` does not catch an error thrown by that segment's
 * layout — that error travels up to the parent. Without this file the cabinet
 * layout failing meant a bare 500 with no way back and nothing to retry.
 */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const transient = error.message.startsWith('DATA_UNAVAILABLE');
  return (
    <main id="main-content" className="mx-auto flex min-h-[60vh] max-w-xl flex-col justify-center px-4">
      <section role="alert" className="rounded-3xl border border-border bg-surface p-8 text-center">
        <h1 className="text-2xl font-extrabold">
          {transient ? 'Данные сейчас недоступны' : 'Что-то пошло не так'}
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {transient
            ? 'Не удалось получить ответ от базы данных. Это временно: уже сохранённые данные не потеряны и ничего не отправлено.'
            : 'Страница не загрузилась. Ничего не было изменено и не отправлено.'}
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-xs text-muted-foreground">
            Код для поддержки: {error.digest}
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="min-h-12 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground"
          >
            Повторить
          </button>
          <Link href="/app/today" className="inline-flex min-h-12 items-center rounded-xl border border-border px-6 text-sm font-bold">
            В кабинет
          </Link>
        </div>
      </section>
    </main>
  );
}
