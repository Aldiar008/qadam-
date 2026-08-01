export default function AppLoading() {
  return (
    <div className="space-y-6" role="status" aria-live="polite" aria-label="Загрузка">
      <div className="h-9 w-56 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({length:4},(_,index)=><div key={index} className="h-32 animate-pulse rounded-3xl bg-muted motion-reduce:animate-none" />)}
      </div>
      <div className="h-72 animate-pulse rounded-3xl bg-muted motion-reduce:animate-none" />
      <span className="sr-only">Загружаем данные бизнеса…</span>
    </div>
  );
}
