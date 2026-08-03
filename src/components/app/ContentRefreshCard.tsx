import { RefreshCw } from 'lucide-react';

import { readContentSchedule } from '@/server/qadam/content-refresh';
import { requireBusinessContext } from '@/server/qadam/repository';
import { ContentRefreshTimer } from './ContentRefreshTimer';

const moment = (iso: string | null) =>
  (iso ? new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : null);

/**
 * Полоса с таймером над материалами.
 *
 * Says three things and nothing else: when the last refresh happened, whether a
 * model or the built-in template wrote it, and how long until the next one. The
 * last of those is the reason the strip exists — without it «обновляется само»
 * is a claim the screen never backs up.
 */
export async function ContentRefreshCard() {
  const ctx = await requireBusinessContext();
  const schedule = await readContentSchedule(ctx.supabase, ctx.businessId);

  if (!schedule) {
    return (
      <section className="rounded-3xl border border-dashed border-border p-5 text-sm leading-6 text-muted-foreground">
        Автообновление материалов включится, когда в каталоге появится хотя бы одна позиция меню —
        писать сценарии не о чем, пока нечего показать.
      </section>
    );
  }

  const last = moment(schedule.lastRefreshedAt);

  return (
    <section className="flex flex-col gap-4 rounded-3xl border border-primary/30 bg-primary/5 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <RefreshCw className="size-4 text-primary" aria-hidden="true" />
          Материалы обновятся сами
        </h2>
        <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">
          {last
            ? <>Последний раз — {last}, материалов {schedule.lastAssetCount}
                {schedule.lastSource === 'provider' ? ', написаны моделью' : schedule.lastSource ? ', собраны встроенным шаблоном' : ''}.
                {' '}Утверждённые тексты не трогаются: заменяются только черновики.</>
            : schedule.pending
              ? <>Первое обновление — в ближайшем цикле, он проходит каждые пять минут. Дальше раз в
                  {' '}{schedule.intervalHours} ч. Ждать не обязательно: кнопка ниже соберёт пакет прямо сейчас.</>
              : <>Первое обновление ещё не проходило. Сценарии Reels и TikTok, бриф на фото, серия сторис
                  и текст уведомления соберутся из вашего меню и действующего предложения.</>}
        </p>
      </div>
      <div className="shrink-0 sm:text-right">
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">до обновления</p>
        <ContentRefreshTimer
          nextRefreshAt={schedule.nextRefreshAt}
          intervalHours={schedule.intervalHours}
          pending={schedule.pending}
        />
      </div>
    </section>
  );
}
