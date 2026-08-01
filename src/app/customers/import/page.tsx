import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { CsvImportWorkflow } from '@/components/customers/CsvImportWorkflow';

export const dynamic = 'force-dynamic';

export default function CsvImportPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/app/customers" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-primary">
        <ArrowLeft className="size-4" /> Назад в Mini-CRM
      </Link>
      <header className="rounded-3xl border border-border bg-surface p-6 sm:p-8">
        <h1 className="text-3xl font-extrabold tracking-tight">Импорт клиентской базы из CSV</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Загрузка внешних списков с интерактивным маппингом, отчётом валидации, обработкой дубликатов и экспортом ошибок.
        </p>
      </header>

      <CsvImportWorkflow />
    </div>
  );
}
