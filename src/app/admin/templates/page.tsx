import { AdminBanners, AdminNav, AuditTrail, ReasonField, ReauthControl } from '@/components/admin/AdminShell';
import { getAdminTemplates } from '@/server/qadam/admin';
import { archiveTemplateVersion, createTemplateVersion, publishTemplateVersion, rollbackTemplate } from '../actions';

export const dynamic = 'force-dynamic';

const statusLabels: Record<string, string> = { draft: 'Черновик', published: 'Опубликована', archived: 'В архиве' };

export default async function AdminTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const data = await getAdminTemplates();
  const canWrite = data.ctx.canWrite;
  const isAdmin = data.ctx.role === 'platform_admin';

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight">Шаблоны</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Опубликованная версия неизменяема. Исправление — это новая версия, поэтому Growth Contract,
          собранный на v1, навсегда остаётся на v1, а новый черновик берёт текущую версию.
        </p>
      </header>

      <AdminNav current="/admin/templates" />
      <AdminBanners params={params} />
      {isAdmin && <ReauthControl next="/admin/templates" />}

      {data.templates.map((template) => {
        const versions = data.versions.filter((version) => version.template_id === template.id);
        const published = versions.filter((version) => version.status === 'published');
        return (
          <section key={template.id} className="rounded-3xl border border-border bg-surface p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">{template.name}</h2>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {template.code} · активная версия v{template.current_version} · статус {template.status}
                </p>
                {template.business_type_codes?.length > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Совместим с типами: {template.business_type_codes.join(', ')}
                  </p>
                )}
              </div>
              {isAdmin && published.length > 1 && (
                <form action={rollbackTemplate} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="templateId" value={template.id} />
                  <label className="grid gap-1 text-xs font-semibold">
                    Откатить на версию
                    <select name="targetVersion" className="min-h-11 rounded-xl border border-border bg-surface-muted px-2 text-xs">
                      {published.filter((version) => version.version !== template.current_version)
                        .map((version) => <option key={version.id} value={version.version}>v{version.version}</option>)}
                    </select>
                  </label>
                  <input type="hidden" name="reason" value={`Откат шаблона ${template.code}`} />
                  <button className="min-h-11 rounded-xl border border-amber-600/40 bg-amber-500/10 px-4 text-xs font-bold text-amber-900">
                    Откатить
                  </button>
                </form>
              )}
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <caption className="sr-only">Версии шаблона {template.code}</caption>
                <thead className="bg-surface-muted text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="p-3 font-semibold">Версия</th>
                    <th scope="col" className="p-3 font-semibold">Схема</th>
                    <th scope="col" className="p-3 font-semibold">Языки</th>
                    <th scope="col" className="p-3 font-semibold">Совместимость</th>
                    <th scope="col" className="p-3 font-semibold">Статус</th>
                    <th scope="col" className="p-3 font-semibold">Миграция</th>
                    <th scope="col" className="p-3 font-semibold">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {versions.map((version) => (
                    <tr key={version.id} className={`border-t border-border ${version.version === template.current_version ? 'bg-primary/5' : ''}`}>
                      <td className="p-3 font-mono font-bold">
                        v{version.version}
                        {version.version === template.current_version && (
                          <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">активна</span>
                        )}
                      </td>
                      <td className="p-3 font-mono text-xs">{version.schema_version}</td>
                      <td className="p-3 text-xs uppercase">{version.locales?.join(' + ')}</td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {version.compatible_business_types?.length ? version.compatible_business_types.join(', ') : 'все типы'}
                      </td>
                      <td className="p-3">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          version.status === 'published' ? 'bg-emerald-500/10 text-emerald-800'
                            : version.status === 'archived' ? 'bg-surface-muted text-muted-foreground'
                              : 'bg-amber-500/10 text-amber-900'}`}>
                          {statusLabels[version.status] ?? version.status}
                        </span>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {version.migrates_from_version ? `из v${version.migrates_from_version}` : '—'}
                        {version.migration_notes && <span className="mt-1 block">{version.migration_notes}</span>}
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-2">
                          {version.status === 'draft' && (
                            <details className="w-full">
                              <summary className="cursor-pointer text-xs font-semibold text-primary underline decoration-dotted">Предпросмотр</summary>
                              <pre className="mt-2 max-h-48 overflow-auto rounded-xl bg-surface-muted p-3 text-xs">{JSON.stringify(version.content, null, 2)}</pre>
                            </details>
                          )}
                          {canWrite && version.status === 'draft' && (
                            <form action={publishTemplateVersion}>
                              <input type="hidden" name="versionId" value={version.id} />
                              <input type="hidden" name="reason" value={`Публикация ${template.code} v${version.version}`} />
                              <button className="min-h-11 rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground">Опубликовать</button>
                            </form>
                          )}
                          {canWrite && version.status !== 'archived' && version.version !== template.current_version && (
                            <form action={archiveTemplateVersion}>
                              <input type="hidden" name="versionId" value={version.id} />
                              <input type="hidden" name="reason" value={`Архивирование ${template.code} v${version.version}`} />
                              <button className="min-h-11 rounded-xl border border-border px-3 text-xs font-bold">В архив</button>
                            </form>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {canWrite && (
              <form action={createTemplateVersion} className="mt-5 grid gap-3 border-t border-border pt-5 sm:grid-cols-2">
                <input type="hidden" name="templateId" value={template.id} />
                <label className="grid gap-1 text-sm font-semibold">
                  Клонировать из версии
                  <select name="cloneFromVersionId" className="min-h-11 rounded-xl border border-border bg-surface-muted px-3 font-normal">
                    <option value="">Пустой черновик</option>
                    {versions.map((version) => <option key={version.id} value={version.id}>v{version.version}</option>)}
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-semibold">
                  Совместимые типы бизнеса
                  <input name="compatibleBusinessTypes" placeholder="cafe, beauty" className="min-h-11 rounded-xl border border-border bg-surface-muted px-3 font-normal" />
                </label>
                <label className="grid gap-1 text-sm font-semibold sm:col-span-2">
                  Содержимое (JSON, обязательно поле mechanics)
                  <textarea name="content" rows={3} placeholder='{"mechanics":[],"copy":{"ru":{},"kk":{}}}' className="rounded-xl border border-border bg-surface-muted p-3 font-mono text-xs font-normal" />
                </label>
                <label className="grid gap-1 text-sm font-semibold sm:col-span-2">
                  Путь миграции <span className="font-normal text-muted-foreground">(как переносить контракты с прошлой версии)</span>
                  <input name="migrationNotes" className="min-h-11 rounded-xl border border-border bg-surface-muted px-3 font-normal" />
                </label>
                <div className="sm:col-span-2"><ReasonField id={`tv-reason-${template.id}`} /></div>
                <div className="sm:col-span-2">
                  <button className="min-h-12 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground">Создать новую версию</button>
                </div>
              </form>
            )}
          </section>
        );
      })}

      {!data.templates.length && (
        <section className="rounded-3xl border border-dashed border-border p-10 text-center">
          <h2 className="text-lg font-bold">Шаблонов пока нет</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            Шаблоны создаются вместе с наборами механик по типу бизнеса.
          </p>
        </section>
      )}

      <AuditTrail rows={data.audit} />
    </div>
  );
}
