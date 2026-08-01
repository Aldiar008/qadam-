'use client';

import React, { useState } from 'react';
import { FileSpreadsheet, CheckCircle2, AlertTriangle, Download, ArrowRight, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { importCustomers, type ImportOutcome } from '@/app/customers/import/actions';

interface ParsedRow {
  index: number;
  raw: Record<string, string>;
  displayName?: string;
  identityType: 'email' | 'phone';
  identityValue: string;
  visits?: number;
  aovMinor?: number;
  marketingConsent: boolean;
  isValid: boolean;
  errorReason?: string;
}

const SAMPLE_CSV = `Name,Contact,IdentityType,Visits,AOV,MarketingConsent
Айбек Смагулов,aibek@example.test,email,12,3500,yes
Гульнара Касымова,+77015551234,phone,5,2800,true
Дмитрий Иванов,invalid-email-address,email,1,1000,false
Ержан Нурланов,erzhan@example.test,email,8,4200,yes
Мадина Серикова,,phone,0,0,no`;

export function CsvImportWorkflow() {
  const [csvText, setCsvText] = useState<string>(SAMPLE_CSV);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({
    displayName: 'Name',
    identityValue: 'Contact',
    identityType: 'IdentityType',
    visits: 'Visits',
    aovMinor: 'AOV',
    marketingConsent: 'MarketingConsent',
  });
  const [duplicateStrategy, setDuplicateStrategy] = useState<'skip' | 'update'>('skip');
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importResult, setImportResult] = useState<ImportOutcome | null>(null);
  // One key per prepared batch: retrying the same batch cannot double-import.
  const [batchKey, setBatchKey] = useState<string>(() => `csv-import:${crypto.randomUUID()}`);

  // Parse CSV text into headers and rows
  const handleParseCsv = () => {
    const lines = csvText.trim().split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return;

    const parsedHeaders = lines[0].split(',').map((h) => h.trim());
    const parsedRows: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(',').map((v) => v.trim());
      const rowObj: Record<string, string> = {};
      parsedHeaders.forEach((h, idx) => {
        rowObj[h] = vals[idx] || '';
      });
      parsedRows.push(rowObj);
    }

    setHeaders(parsedHeaders);
    setRawRows(parsedRows);
    setStep(2);
  };

  // Process rows with mapping & validation
  const validatedRows: ParsedRow[] = rawRows.map((raw, idx) => {
    const displayName = raw[fieldMapping.displayName] || '';
    const identityValue = raw[fieldMapping.identityValue] || '';
    const identityType: 'email' | 'phone' = (raw[fieldMapping.identityType]?.toLowerCase() === 'phone' || identityValue.startsWith('+')) ? 'phone' : 'email';
    const visits = parseInt(raw[fieldMapping.visits] || '1', 10);
    const aovMinor = parseInt(raw[fieldMapping.aovMinor] || '0', 10);
    const consentStr = (raw[fieldMapping.marketingConsent] || '').toLowerCase();
    const marketingConsent = consentStr === 'yes' || consentStr === 'true' || consentStr === '1';

    let isValid = true;
    let errorReason = '';

    if (!identityValue) {
      isValid = false;
      errorReason = 'Отсутствует контакт (email или телефон)';
    } else if (identityType === 'email' && !identityValue.includes('@')) {
      isValid = false;
      errorReason = 'Некорректный формат email';
    } else if (identityType === 'phone' && identityValue.length < 7) {
      isValid = false;
      errorReason = 'Некорректный формат телефона';
    }

    return {
      index: idx + 1,
      raw,
      displayName,
      identityType,
      identityValue,
      visits: isNaN(visits) ? 1 : visits,
      aovMinor: isNaN(aovMinor) ? 0 : aovMinor,
      marketingConsent,
      isValid,
      errorReason,
    };
  });

  const validRows = validatedRows.filter((r) => r.isValid);
  const invalidRows = validatedRows.filter((r) => !r.isValid);

  // Generate downloadable error rows CSV (handler is invoked from onClick, not during render)
  const handleDownloadErrors = () => {
    if (!invalidRows.length) return;
    const errorCsvHeader = [...headers, 'ValidationError'].join(',');
    const errorCsvBody = invalidRows
      .map((r) => [...headers.map((h) => r.raw[h] || ''), `"${r.errorReason}"`].join(','))
      .join('\n');
    const blob = new Blob([`${errorCsvHeader}\n${errorCsvBody}`], { type: 'text/csv;charset=utf-8;' });
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.setAttribute('download', 'import_errors_row_log.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);
  };

  const handleExecuteImport = async () => {
    setIsImporting(true);
    setImportResult(null);
    try {
      const outcome = await importCustomers(
        validRows.map((row) => ({
          rowNumber: row.index,
          displayName: row.displayName ?? '',
          identityType: row.identityType,
          identityValue: row.identityValue,
          visits: row.visits ?? 0,
          aovMinor: row.aovMinor ?? 0,
          marketingConsent: row.marketingConsent,
        })),
        duplicateStrategy,
        batchKey,
      );
      setImportResult(outcome);
    } catch (error) {
      setImportResult({ ok: false, error: error instanceof Error ? error.message : 'Импорт не выполнен' });
    } finally {
      setIsImporting(false);
    }
  };

  const startNewBatch = () => {
    setBatchKey(`csv-import:${crypto.randomUUID()}`);
    setImportResult(null);
    setStep(1);
  };

  return (
    <div className="space-y-6">
      {/* Steps Indicator */}
      <nav aria-label="Шаги импорта" className="flex items-center justify-between rounded-2xl border border-border bg-surface p-4">
        {[
          { num: 1, label: 'Загрузка CSV' },
          { num: 2, label: 'Маппинг колонок' },
          { num: 3, label: 'Валидация и импорт' },
        ].map((s) => (
          <div key={s.num} className="flex items-center gap-3">
            <span
              className={`grid size-8 place-items-center rounded-full text-xs font-extrabold ${
                step >= s.num ? 'bg-primary text-primary-foreground' : 'bg-surface-muted text-muted-foreground'
              }`}
            >
              {s.num}
            </span>
            <span className={`text-sm font-semibold ${step >= s.num ? 'text-foreground' : 'text-muted-foreground'}`}>
              {s.label}
            </span>
          </div>
        ))}
      </nav>

      {/* Step 1: Upload or Paste CSV */}
      {step === 1 && (
        <div className="rounded-3xl border border-border bg-surface p-6 shadow-xl space-y-5">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="size-6 text-primary" />
            <div>
              <h2 className="text-xl font-bold">Загрузка или вставка CSV-файла</h2>
              <p className="text-xs text-muted-foreground">Поддерживается стандартный CSV с заголовками в первой строке.</p>
            </div>
          </div>

          <div className="grid gap-4">
            <label className="grid gap-2 text-sm font-semibold">
              Содержимое CSV (Текст или вставка)
              <textarea
                rows={8}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                className="w-full rounded-2xl border border-border bg-surface-muted p-4 font-mono text-xs outline-none focus:ring-2 focus:ring-primary"
              />
            </label>

            <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
              <button
                type="button"
                onClick={() => setCsvText(SAMPLE_CSV)}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-xs font-bold"
              >
                <RefreshCw className="size-3.5" /> Загрузить демонстрационный пример
              </button>

              <button
                type="button"
                onClick={handleParseCsv}
                disabled={!csvText.trim()}
                className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground transition-all hover:brightness-110 disabled:opacity-50"
              >
                Далее: Маппинг колонок <ArrowRight className="size-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Interactive Mapping */}
      {step === 2 && (
        <div className="rounded-3xl border border-border bg-surface p-6 shadow-xl space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">Сопоставление колонок (Mapping)</h2>
              <p className="text-xs text-muted-foreground">Найдено {headers.length} колонок и {rawRows.length} строк.</p>
            </div>
            <button
              onClick={() => setStep(1)}
              className="inline-flex min-h-11 items-center rounded-xl border border-border px-4 text-xs font-bold"
            >
              Назад
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            {[
              { field: 'displayName', label: 'Имя клиента', required: false },
              { field: 'identityValue', label: 'Email / Телефон (Identity)', required: true },
              { field: 'identityType', label: 'Тип (Email / Phone)', required: false },
              { field: 'visits', label: 'Количество визитов', required: false },
              { field: 'aovMinor', label: 'Средний чек / Затраты (₸)', required: false },
              { field: 'marketingConsent', label: 'Маркетинговое согласие', required: false },
            ].map((target) => (
              <label key={target.field} className="grid gap-2 text-sm font-semibold">
                <span>
                  {target.label} {target.required && <span className="text-rose-500">*</span>}
                </span>
                <select
                  value={fieldMapping[target.field] || ''}
                  onChange={(e) => setFieldMapping({ ...fieldMapping, [target.field]: e.target.value })}
                  className="min-h-11 rounded-xl border border-border bg-surface-muted px-4 text-sm outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">-- Не импортировать --</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <button
              onClick={() => setStep(3)}
              className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground transition-all hover:brightness-110"
            >
              Перейти к валидации ({rawRows.length} строк) <ArrowRight className="size-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Validation Report & Import */}
      {step === 3 && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-border bg-surface p-4 flex items-center gap-4">
              <CheckCircle2 className="size-8 text-emerald-500" />
              <div>
                <p className="text-xs text-muted-foreground">Готовы к импорту</p>
                <p className="text-xl font-extrabold text-emerald-600">{validRows.length} строк</p>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-surface p-4 flex items-center gap-4">
              <AlertTriangle className="size-8 text-amber-500" />
              <div>
                <p className="text-xs text-muted-foreground">Ошибки валидации</p>
                <p className="text-xl font-extrabold text-amber-600">{invalidRows.length} строк</p>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-surface p-4 flex items-center gap-4">
              <RefreshCw className="size-8 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">Всего обработано</p>
                <p className="text-xl font-extrabold">{validatedRows.length} строк</p>
              </div>
            </div>
          </div>

          {/* Strategy & Error Download Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-4">
            <label className="flex items-center gap-3 text-sm font-semibold">
              <span>Стратегия дубликатов:</span>
              <select
                value={duplicateStrategy}
                onChange={(e) => setDuplicateStrategy(e.target.value as 'skip' | 'update')}
                className="min-h-10 rounded-xl border border-border bg-surface-muted px-3 text-xs"
              >
                <option value="skip">Пропускать существующие дубликаты</option>
                <option value="update">Обновлять имя и стадию существующих</option>
              </select>
            </label>

            {invalidRows.length > 0 && (
              <button
                onClick={handleDownloadErrors}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 text-xs font-bold text-rose-700 hover:bg-rose-500/20"
              >
                <Download className="size-3.5" /> Скачать ошибочные строки ({invalidRows.length} .csv)
              </button>
            )}
          </div>

          {/* Preview Table */}
          <div className="overflow-hidden rounded-3xl border border-border bg-surface shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-surface-muted text-xs text-muted-foreground">
                  <tr>
                    <th className="p-4">#</th>
                    <th className="p-4">Имя</th>
                    <th className="p-4">Контакт / Identity</th>
                    <th className="p-4">Тип</th>
                    <th className="p-4">Визиты</th>
                    <th className="p-4">AOV</th>
                    <th className="p-4">Consent</th>
                    <th className="p-4">Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {validatedRows.map((r) => (
                    <tr key={r.index} className="border-b border-border last:border-0 hover:bg-surface-muted/40">
                      <td className="p-4 font-mono text-xs">{r.index}</td>
                      <td className="p-4 font-bold">{r.displayName || '—'}</td>
                      <td className="p-4 font-mono text-xs">{r.identityValue}</td>
                      <td className="p-4 text-xs uppercase">{r.identityType}</td>
                      <td className="p-4 font-mono">{r.visits}</td>
                      <td className="p-4 font-mono">{r.aovMinor} ₸</td>
                      <td className="p-4">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${r.marketingConsent ? 'bg-emerald-500/10 text-emerald-700' : 'bg-surface-muted text-muted-foreground'}`}>
                          {r.marketingConsent ? 'Marketing' : 'Loyalty only'}
                        </span>
                      </td>
                      <td className="p-4">
                        {r.isValid ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600">
                            <CheckCircle2 className="size-3.5" /> Валидно
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-600" title={r.errorReason}>
                            <AlertTriangle className="size-3.5" /> {r.errorReason}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setStep(2)}
              className="inline-flex min-h-11 items-center rounded-xl border border-border px-5 text-sm font-bold"
            >
              Назад к сопоставлению
            </button>

            {!importResult?.ok ? (
              <button
                onClick={handleExecuteImport}
                disabled={isImporting || validRows.length === 0}
                aria-busy={isImporting}
                className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-8 text-sm font-bold text-primary-foreground transition-all hover:brightness-110 disabled:opacity-50"
              >
                {isImporting ? 'Выполняется импорт...' : `Импортировать ${validRows.length} клиентов`}
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={startNewBatch}
                  className="inline-flex min-h-12 items-center rounded-xl border border-border px-5 text-sm font-bold"
                >
                  Новый импорт
                </button>
                <Link
                  href="/app/customers"
                  className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground"
                >
                  Перейти в CRM <ArrowRight className="size-4" />
                </Link>
              </div>
            )}
          </div>

          {/* Server import result — honest counts straight from the database RPC */}
          {importResult && (
            <div
              role="status"
              aria-live="polite"
              className={`rounded-3xl border p-6 ${
                importResult.ok ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-rose-500/30 bg-rose-500/5'
              }`}
            >
              {importResult.ok ? (
                <>
                  <h3 className="flex items-center gap-2 text-lg font-bold text-emerald-800">
                    <CheckCircle2 className="size-5" /> Импорт записан в базу
                  </h3>
                  <dl className="mt-4 grid gap-4 sm:grid-cols-4">
                    {[
                      { label: 'Создано клиентов', value: importResult.inserted ?? 0 },
                      { label: 'Обновлено', value: importResult.updated ?? 0 },
                      { label: 'Пропущено дубликатов', value: importResult.skipped ?? 0 },
                      { label: 'Отклонено сервером', value: importResult.invalid ?? 0 },
                    ].map((item) => (
                      <div key={item.label}>
                        <dt className="text-xs text-muted-foreground">{item.label}</dt>
                        <dd className="font-mono text-2xl font-extrabold">{item.value}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-4 text-xs leading-5 text-muted-foreground">
                    Импортированы контакты, маскированные identity и заявленное маркетинговое согласие
                    (source: <code className="font-mono">csv_import</code>). История транзакций не создаётся:
                    визиты и средний чек из файла считаются заявленными владельцем и используются только для
                    первичной стадии жизненного цикла.
                    {importResult.duplicate && ' Этот батч уже был импортирован ранее — повтор не создал дублей.'}
                  </p>
                </>
              ) : (
                <>
                  <h3 className="flex items-center gap-2 text-lg font-bold text-rose-700">
                    <AlertTriangle className="size-5" /> Импорт не выполнен
                  </h3>
                  <p className="mt-2 text-sm text-rose-800">{importResult.error}</p>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
