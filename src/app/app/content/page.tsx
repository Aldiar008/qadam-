import Link from 'next/link';
import { AlertTriangle, WandSparkles } from 'lucide-react';
import { canMarket, getContentData } from '@/server/qadam/repository';
import { generateCampaignContent, updateContentItem } from '../actions';

export const dynamic = 'force-dynamic';

const kindLabels: Record<string, string> = {
  post: 'Основной пост',
  short_post: 'Короткая публикация',
  story: 'Stories',
  direct_message: 'Сообщение в мессенджер',
  video_script: 'Сценарий 15-сек видео',
};

const errorLabels: Record<string, string> = {
  campaign_required: 'Сначала выберите кампанию.',
  campaign_not_found: 'Кампания не найдена в этом бизнесе.',
};

export default async function ContentPage({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string; error?: string; generated?: string }>;
}) {
  const params = await searchParams;
  const data = await getContentData({ campaign: params.campaign });
  const canEdit = canMarket(data.role);
  const selected = data.campaigns.find((campaign) => campaign.id === params.campaign) ?? data.campaigns[0];

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Контент-студия</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Материалы создаются из Growth Contract кампании — с аудиторией, оффером и способом измерения.
            Тексты сохраняются в базе на русском и казахском.
          </p>
        </div>
        {canEdit && selected && (
          <form action={generateCampaignContent} className="flex flex-wrap items-end gap-2">
            <label className="grid gap-2 text-sm font-semibold">
              Кампания
              <select name="campaignId" defaultValue={selected.id} className="min-h-11 rounded-xl border border-border bg-surface-muted px-4 text-sm">
                {data.campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
                ))}
              </select>
            </label>
            <button className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground">
              <WandSparkles className="size-4" /> Сгенерировать
            </button>
          </form>
        )}
      </header>

      {params.error && (
        <div role="alert" className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4 text-sm font-semibold text-rose-800">
          <AlertTriangle className="mr-2 inline size-4" />
          {errorLabels[params.error] ?? decodeURIComponent(params.error)}
        </div>
      )}
      {params.generated && (
        <div role="status" className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm font-semibold text-emerald-800">
          Создано материалов: {params.generated}. Все черновики сохранены в базе и требуют вашего утверждения.
        </div>
      )}

      {!data.campaigns.length ? (
        <section className="rounded-3xl border border-dashed border-border p-10 text-center">
          <h2 className="text-lg font-bold">Нет кампаний для контента</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            QADAM не генерирует «просто посты». Сначала подготовьте кампанию — тогда текст будет связан
            с целью, аудиторией и метрикой.
          </p>
          <Link href="/app/campaigns/new" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground">
            Создать кампанию
          </Link>
        </section>
      ) : (
        <>
          <nav aria-label="Фильтр по кампании" className="flex gap-2 overflow-x-auto pb-2">
            <Link href="/app/content" className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold ${!params.campaign ? 'bg-primary text-primary-foreground' : 'border border-border bg-surface'}`}>
              Все кампании
            </Link>
            {data.campaigns.map((campaign) => (
              <Link
                key={campaign.id}
                href={`/app/content?campaign=${campaign.id}`}
                className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold ${params.campaign === campaign.id ? 'bg-primary text-primary-foreground' : 'border border-border bg-surface'}`}
              >
                {campaign.name}
              </Link>
            ))}
          </nav>

          {data.content.length ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {data.content.map((item) => (
                <article key={item.id} className="rounded-3xl border border-border bg-surface p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="rounded-full bg-surface-muted px-3 py-1 text-xs font-bold">
                      {kindLabels[item.content_kind] ?? item.content_kind}
                    </span>
                    <div className="flex items-center gap-2 text-xs font-bold">
                      <span className="rounded-full bg-primary/10 px-3 py-1 uppercase text-primary">{item.locale}</span>
                      <span className="rounded-full bg-surface-muted px-3 py-1">{item.status}</span>
                    </div>
                  </div>

                  {canEdit ? (
                    <form action={updateContentItem} className="mt-4 space-y-3">
                      <input type="hidden" name="id" value={item.id} />
                      <label className="grid gap-2 text-sm font-semibold">
                        <span className="sr-only">Текст материала</span>
                        <textarea name="body" defaultValue={item.body} rows={6} className="w-full rounded-2xl border border-border bg-surface-muted p-3 text-sm leading-6" />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button name="status" value="" className="min-h-11 flex-1 rounded-xl border border-border px-4 text-sm font-bold">
                          Сохранить текст
                        </button>
                        {item.status === 'draft' && (
                          <button name="status" value="approved" className="min-h-11 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground">
                            Утвердить
                          </button>
                        )}
                        {item.status === 'approved' && (
                          <button name="status" value="archived" className="min-h-11 rounded-xl border border-border px-4 text-sm font-bold">
                            В архив
                          </button>
                        )}
                      </div>
                    </form>
                  ) : (
                    <p className="mt-4 whitespace-pre-wrap text-sm leading-6">{item.body}</p>
                  )}

                  {item.cta && <p className="mt-3 text-xs font-bold text-primary">CTA: {item.cta}</p>}
                  {item.alt_text && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      <span className="font-semibold">Alt text:</span> {item.alt_text}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    Превью канала <span className="font-mono">{item.channel}</span> · {item.body.length} симв.
                    {item.locale === 'kk' && (
                      <span className="ml-2 rounded-full bg-amber-500/10 px-2 py-0.5 font-bold text-amber-800">
                        ! Требуется проверка носителем языка
                      </span>
                    )}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <section className="rounded-3xl border border-dashed border-border p-10 text-center">
              <h2 className="text-lg font-bold">Материалов для этой кампании ещё нет</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                Нажмите «Сгенерировать» — QADAM соберёт основной пост, короткую версию, три Stories,
                15-секундный сценарий и сообщение в мессенджер на русском и казахском из брифа Growth Contract.
              </p>
            </section>
          )}

          {data.content.length > 0 && (
            <section className="rounded-3xl border border-amber-500/40 bg-amber-500/5 p-5">
              <h2 className="text-sm font-bold text-amber-900">! Казахский текст требует проверки носителем языка</h2>
              <p className="mt-1 text-xs leading-5">
                Автоматически проверяется только структура пакета: наличие всех материалов, обоих языков,
                CTA, alt text и лимитов канала. Естественность казахского текста машина проверить не может,
                поэтому проверка носителем — обязательное условие релиза, а не рекомендация.
              </p>
            </section>
          )}

          {data.trackingCodes.length > 0 && (
            <section className="rounded-3xl border border-border bg-surface p-6">
              <h2 className="text-lg font-bold">Коды отслеживания</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Связывают материал → кампанию → погашение → Impact Ledger.
              </p>
              <ul className="mt-3 grid gap-2">
                {data.trackingCodes.map((code) => (
                  <li key={code.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3 text-xs">
                    <span className="font-mono font-bold text-primary">{code.public_code}</span>
                    <span className="text-muted-foreground">{code.purpose} · {new Date(code.created_at).toLocaleDateString('ru-RU')}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data.runs.length > 0 && (
            <section className="rounded-3xl border border-border bg-surface p-6">
              <h2 className="text-lg font-bold">Журнал генераций</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Провенанс каждой попытки: провайдер или встроенный шаблон, причина отката, задержка и стоимость.
              </p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <caption className="sr-only">История обращений к генератору</caption>
                  <thead className="bg-surface-muted text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className="p-3 font-semibold">Назначение</th>
                      <th scope="col" className="p-3 font-semibold">Источник</th>
                      <th scope="col" className="p-3 font-semibold">Модель</th>
                      <th scope="col" className="p-3 font-semibold">Статус</th>
                      <th scope="col" className="p-3 font-semibold">Попытки</th>
                      <th scope="col" className="p-3 font-semibold">Задержка</th>
                      <th scope="col" className="p-3 font-semibold">Причина отката</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.runs.map((run) => (
                      <tr key={run.id} className="border-t border-border">
                        <td className="p-3">{run.purpose}</td>
                        <td className="p-3">
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${run.source === 'provider' ? 'bg-primary/10 text-primary' : 'bg-surface-muted text-muted-foreground'}`}>
                            {run.source === 'provider' ? 'модель' : 'шаблон'}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-xs">{run.provider} · {run.model}</td>
                        <td className="p-3 text-xs">{run.status}{run.failure_kind ? ` (${run.failure_kind})` : ''}</td>
                        <td className="p-3 font-mono text-xs">{run.attempts}</td>
                        <td className="p-3 font-mono text-xs">{run.latency_ms} мс</td>
                        <td className="p-3 text-xs text-muted-foreground">{run.fallback_reason ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
