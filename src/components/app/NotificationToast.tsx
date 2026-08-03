'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell, X } from 'lucide-react';

/**
 * Всплывающее окно о новом уведомлении.
 *
 * The bell carried a count and nothing came forward on its own, so a risk
 * notification — a campaign paused for losing money — waited politely until
 * somebody thought to look. This surfaces the newest unread one.
 *
 * Dismissal is remembered per notification for the session, so it appears once
 * and does not follow the owner from page to page. Nothing is marked read here:
 * seeing a toast is not the same as reading, and the notifications screen is
 * where that decision belongs.
 */

export interface ToastNotification {
  id: string;
  title: string;
  body: string;
  category: string;
  actionUrl: string | null;
}

const TONE: Record<string, string> = {
  risk: 'border-rose-500/30 bg-rose-500/10 text-rose-900',
  connector_error: 'border-rose-500/30 bg-rose-500/10 text-rose-900',
  approval: 'border-amber-500/30 bg-amber-500/10 text-amber-900',
  result: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-900',
  opportunity: 'border-primary/30 bg-primary/10 text-foreground',
};

const KEY = 'qadam.toast.dismissed';

export function NotificationToast({ notification, unread }: { notification: ToastNotification | null; unread: number }) {
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (!notification) return;
    // Reading storage and revealing the toast happens after paint, not
    // synchronously in the effect body: the first render deliberately shows
    // nothing, so a notification already dismissed never flashes.
    const timer = setTimeout(() => {
      let dismissed: string[] = [];
      try {
        dismissed = JSON.parse(sessionStorage.getItem(KEY) ?? '[]') as string[];
      } catch {
        dismissed = [];
      }
      setHidden(dismissed.includes(notification.id));
    }, 0);
    return () => clearTimeout(timer);
  }, [notification]);

  if (!notification || hidden) return null;

  const dismiss = () => {
    setHidden(true);
    try {
      const dismissed = JSON.parse(sessionStorage.getItem(KEY) ?? '[]') as string[];
      sessionStorage.setItem(KEY, JSON.stringify([...dismissed, notification.id].slice(-30)));
    } catch {
      // A browser that refuses storage still gets the dismissal for this view.
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-4 right-4 z-50 w-[min(24rem,calc(100vw-2rem))] rounded-2xl border p-4 shadow-xl backdrop-blur ${TONE[notification.category] ?? TONE.opportunity}`}
    >
      <div className="flex items-start gap-3">
        <Bell className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">{notification.title}</p>
          <p className="mt-1 text-xs leading-5 opacity-90">{notification.body}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Link href={notification.actionUrl ?? '/app/notifications'} onClick={dismiss} className="text-xs font-bold underline">
              Открыть
            </Link>
            {unread > 1 && (
              <Link href="/app/notifications" onClick={dismiss} className="text-xs opacity-80">
                ещё {unread - 1}
              </Link>
            )}
          </div>
        </div>
        <button onClick={dismiss} aria-label="Скрыть уведомление" className="grid size-8 shrink-0 place-items-center rounded-lg hover:bg-black/5">
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
