import Link from 'next/link';
import { AlertTriangle, BellOff, BellRing, Check } from 'lucide-react';

import { getNotificationsData } from '@/server/qadam/repository';
import { markAllRead, markNotification, setNotificationMute } from './actions';

export const dynamic = 'force-dynamic';

const CATEGORIES = [
  { code: 'opportunity', label: 'Возможность', mutable: true },
  { code: 'approval', label: 'Требует подтверждения', mutable: false },
  { code: 'risk', label: 'Риск', mutable: false },
  { code: 'result', label: 'Результат', mutable: true },
  { code: 'connector_error', label: 'Ошибка канала', mutable: false },
] as const;

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; unread?: string; error?: string; allread?: string; muted?: string }>;
}) {
  const params = await searchParams;
  const data = await getNotificationsData({ unreadOnly: params.unread === '1', category: params.category });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Уведомления</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Возможности, запросы на подтверждение, риски, результаты и ошибки каналов в одном месте.
            Непрочитанных: <strong className="font-mono">{data.unread}</strong>.
          </p>
        </div>
        {data.unread > 0 && (
          <form action={markAllRead}>
            <button className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-bold">
              <Check className="size-4" aria-hidden="true" /> Отметить все прочитанными
            </button>
          </form>
        )}
      </header>

      {params.error && (
        <div role="alert" className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4 text-sm font-semibold text-rose-800">
          <AlertTriangle className="mr-2 inline size-4" aria-hidden="true" />{decodeURIComponent(params.error)}
        </div>
      )}
      {(params.allread || params.muted) && (
        <div role="status" className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm font-semibold text-emerald-800">
          {params.allread ? 'Все уведомления отмечены прочитанными.' : 'Настройки категорий сохранены.'}
        </div>
      )}

      <nav aria-label="Фильтр уведомлений" className="flex flex-wrap gap-2">
        <Link href="/app/notifications" className={`min-h-11 rounded-full px-4 py-2 text-sm font-bold ${!params.category && params.unread !== '1' ? 'bg-primary text-primary-foreground' : 'border border-border bg-surface'}`}>
          Все
        </Link>
        <Link href="/app/notifications?unread=1" className={`min-h-11 rounded-full px-4 py-2 text-sm font-bold ${params.unread === '1' ? 'bg-primary text-primary-foreground' : 'border border-border bg-surface'}`}>
          Непрочитанные
        </Link>
        {CATEGORIES.map((category) => (
          <Link
            key={category.code}
            href={`/app/notifications?category=${category.code}`}
            className={`min-h-11 rounded-full px-4 py-2 text-sm font-bold ${params.category === category.code ? 'bg-primary text-primary-foreground' : 'border border-border bg-surface'}`}
          >
            {category.label}
          </Link>
        ))}
      </nav>

      <section className="rounded-3xl border border-border bg-surface p-5">
        <h2 className="text-sm font-bold">Категории и звук</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Риски и ошибки каналов отключить нельзя — это сигналы безопасности, а не рассылка.
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {CATEGORIES.map((category) => {
            const muted = data.muted.has(category.code);
            return (
              <li key={category.code}>
                {category.mutable ? (
                  <form action={setNotificationMute}>
                    <input type="hidden" name="category" value={category.code} />
                    <input type="hidden" name="muted" value={muted ? '0' : '1'} />
                    <button className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-xs font-bold">
                      {muted ? <BellOff className="size-3.5" aria-hidden="true" /> : <BellRing className="size-3.5" aria-hidden="true" />}
                      {category.label}: {muted ? 'выключено' : 'включено'}
                    </button>
                  </form>
                ) : (
                  <span className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface-muted px-3 text-xs font-bold text-muted-foreground">
                    <BellRing className="size-3.5" aria-hidden="true" /> {category.label}: всегда включено
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {data.notifications.length ? (
        <ul className="grid gap-3">
          {data.notifications.map((notification) => {
            const unread = !notification.read_at;
            const label = CATEGORIES.find((item) => item.code === notification.category)?.label ?? notification.category;
            return (
              <li key={notification.id} className={`rounded-3xl border p-5 ${unread ? 'border-primary/40 bg-primary/5' : 'border-border bg-surface'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${
                    notification.category === 'risk' || notification.category === 'connector_error'
                      ? 'bg-rose-500/10 text-rose-800'
                      : notification.category === 'approval' ? 'bg-amber-500/10 text-amber-900' : 'bg-surface-muted'}`}>
                    {label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {unread && <span className="mr-2 font-bold text-primary">Новое</span>}
                    {new Date(notification.created_at).toLocaleString('ru-RU')}
                  </span>
                </div>
                <h2 className="mt-3 text-lg font-bold">{notification.title}</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{notification.body}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {notification.action_url && (
                    <Link href={notification.action_url} className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground">
                      Перейти к действию
                    </Link>
                  )}
                  <form action={markNotification}>
                    <input type="hidden" name="id" value={notification.id} />
                    <input type="hidden" name="op" value={unread ? 'read' : 'unread'} />
                    <button className="inline-flex min-h-11 items-center rounded-xl border border-border px-4 text-sm font-bold">
                      {unread ? 'Отметить прочитанным' : 'Отметить непрочитанным'}
                    </button>
                  </form>
                  <form action={markNotification}>
                    <input type="hidden" name="id" value={notification.id} />
                    <input type="hidden" name="op" value="dismiss" />
                    <button className="inline-flex min-h-11 items-center rounded-xl border border-border px-4 text-sm font-bold">Скрыть</button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <section className="rounded-3xl border border-dashed border-border p-10 text-center">
          <h2 className="text-lg font-bold">Уведомлений нет</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            Здесь появятся возможности роста, запросы на подтверждение, предупреждения о рисках,
            результаты кампаний и ошибки подключения каналов.
          </p>
        </section>
      )}
    </div>
  );
}
