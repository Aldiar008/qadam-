import { DemoBadge } from './DemoBadge';
import { EmptyState } from './EmptyState';

export function RoutePlaceholder({ title, description, backend }: { title: string; description: string; backend: string }) {
  return <div className="mx-auto max-w-6xl space-y-6">
    <header className="space-y-3"><DemoBadge label="Frontend ready" /><h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1><p className="max-w-2xl text-muted-foreground">{description}</p></header>
    <EmptyState title="Интерфейс подготовлен" description={backend} />
  </div>;
}
