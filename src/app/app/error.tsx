'use client';

export default function AppError({reset}:{reset:()=>void}) {
  return (
    <section className="mx-auto max-w-xl rounded-3xl border border-border bg-card p-8 text-center" role="alert">
      <h1 className="text-2xl font-semibold">Не удалось загрузить данные</h1>
      <p className="mt-3 text-muted-foreground">Проверьте соединение и повторите запрос. Уже сохранённые данные не потеряны.</p>
      <button type="button" onClick={reset} className="mt-6 min-h-11 rounded-xl bg-primary px-5 py-3 font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Повторить</button>
    </section>
  );
}
