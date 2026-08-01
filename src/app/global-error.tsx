'use client';

/**
 * Last-resort boundary: catches a failure in the root layout itself, where no
 * application chrome exists yet. It has to render its own <html> and <body>,
 * and it must not depend on anything that might be the thing that broke.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ru">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0, background: '#FAF9F5', color: '#0F172A' }}>
        <main
          role="alert"
          style={{ maxWidth: '32rem', margin: '0 auto', padding: '4rem 1rem', textAlign: 'center' }}
        >
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Приложение не запустилось</h1>
          <p style={{ marginTop: '0.75rem', lineHeight: 1.6, color: '#52606E' }}>
            Ничего не было изменено и не отправлено. Попробуйте перезагрузить страницу.
          </p>
          {error.digest && (
            <p style={{ marginTop: '0.75rem', fontFamily: 'monospace', fontSize: '0.75rem', color: '#52606E' }}>
              Код для поддержки: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{ marginTop: '1.5rem', minHeight: '3rem', padding: '0 1.5rem', borderRadius: '0.75rem', border: 'none', background: '#0F766E', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
          >
            Перезагрузить
          </button>
        </main>
      </body>
    </html>
  );
}
