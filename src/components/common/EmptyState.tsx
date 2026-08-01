import Link from 'next/link';
import { CircleDashed, ArrowRight } from 'lucide-react';

export function EmptyState({ title, description, href = '/app/tools', action = 'Открыть инструменты' }: { title: string; description: string; href?: string; action?: string }) {
  return <section className="rounded-3xl border border-dashed border-border bg-surface p-8 sm:p-12 text-center">
    <CircleDashed className="mx-auto size-10 text-primary" aria-hidden="true" />
    <h2 className="mt-5 text-xl font-bold">{title}</h2>
    <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{description}</p>
    <Link href={href} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground">{action}<ArrowRight className="size-4" /></Link>
  </section>;
}
