import Link from 'next/link';
import { AlertTriangle, ShieldCheck } from 'lucide-react';

import { refreshAdminReauth } from '@/app/admin/actions';

/** Shared chrome for the console: nav, banners and the re-auth control. */

// Порядок повторяет то, как справочник влияет на магазин: сначала чем он
// торгует, потом сколько это стоит и живёт, потом когда заказывать, потом чем
// он это делает. Служебные разделы платформы — в конце.
const ADMIN_NAV = [
  { href: '/admin', label: 'Обзор' },
  { href: '/admin/flower-categories', label: 'Категории цветов' },
  { href: '/admin/policies', label: 'Товарная политика' },
  { href: '/admin/rules', label: 'Правила автозаказа' },
  { href: '/admin/calendar', label: 'Календарь поводов' },
  { href: '/admin/templates', label: 'Шаблоны поставщиков' },
  { href: '/admin/tools', label: 'Инструменты' },
  { href: '/admin/bundles', label: 'Наборы' },
  { href: '/admin/categories', label: 'Категории каталога' },
  { href: '/admin/business-types', label: 'Типы бизнеса' },
];

export function AdminNav({ current }: { current: string }) {
  return (
    <nav aria-label="Разделы Admin Console" className="flex flex-wrap gap-2">
      {ADMIN_NAV.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={current === item.href ? 'page' : undefined}
          className={`min-h-11 rounded-xl px-4 py-2 text-sm font-bold ${
            current === item.href ? 'bg-primary text-primary-foreground' : 'border border-border bg-surface'
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function AdminBanners({ params }: { params: Record<string, string | undefined> }) {
  const success = params.saved || params.status || params.created || params.published
    || params.rolledback || params.archived || params.reauth;
  return (
    <>
      {params.error && (
        <div role="alert" className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4 text-sm font-semibold text-rose-800">
          <AlertTriangle className="mr-2 inline size-4" aria-hidden="true" />{decodeURIComponent(params.error)}
        </div>
      )}
      {success && (
        <div role="status" className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm font-semibold text-emerald-800">
          {params.reauth && 'Личность подтверждена. Чувствительные операции доступны 15 минут.'}
          {params.saved && 'Изменения сохранены и записаны в журнал аудита.'}
          {params.status && `Статус изменён на «${decodeURIComponent(params.status)}» и записан в журнал.`}
          {params.created && `Создана версия v${params.created} в статусе черновика.`}
          {params.published && 'Версия опубликована. Она стала неизменяемой.'}
          {params.rolledback && 'Откат выполнен. Более новые версии остались опубликованными в истории.'}
          {params.archived && 'Версия архивирована.'}
        </div>
      )}
    </>
  );
}

/**
 * Sensitive operations need a credential check no older than 15 minutes; the
 * database refuses them otherwise, so this control is the way to satisfy it.
 */
export function ReauthControl({ next }: { next: string }) {
  return (
    <form action={refreshAdminReauth} className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4">
      <input type="hidden" name="next" value={next} />
      <ShieldCheck className="size-5 text-amber-800" aria-hidden="true" />
      <p className="flex-1 text-xs leading-5">
        Архивирование и откат считаются чувствительными операциями: база данных требует подтверждения
        личности не старше 15 минут и записывает время проверки рядом с действием.
      </p>
      <button className="min-h-11 rounded-xl border border-amber-600/40 bg-surface px-4 text-xs font-bold">
        Подтвердить личность
      </button>
    </form>
  );
}

/** Every mutating form carries a reason: the audit row will not exist without one. */
export function ReasonField({ id, defaultValue = '' }: { id: string; defaultValue?: string }) {
  return (
    <label className="grid gap-1 text-xs font-semibold" htmlFor={id}>
      Причина изменения <span className="font-normal text-muted-foreground">(записывается в аудит)</span>
      <input
        id={id}
        name="reason"
        required
        minLength={3}
        defaultValue={defaultValue}
        placeholder="Например: добавили инструмент по просьбе владельцев кофеен"
        className="min-h-11 rounded-xl border border-border bg-surface-muted px-3 text-sm font-normal"
      />
    </label>
  );
}

export function AuditTrail({ rows }: { rows: { id: string; action: string; resource_code?: string | null; reason: string; occurred_at: string; actor_role?: string }[] }) {
  if (!rows.length) return null;
  return (
    <section className="rounded-3xl border border-border bg-surface p-6">
      <h2 className="text-lg font-bold">Журнал аудита</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Записи только добавляются: изменить или удалить их нельзя даже администратору платформы.
      </p>
      <ul className="mt-3 grid gap-2">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3 text-xs">
            <span className="font-mono font-bold text-primary">{row.action}</span>
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              {row.resource_code ? `${row.resource_code} · ` : ''}{row.reason}
            </span>
            <span className="text-muted-foreground">
              {row.actor_role ? `${row.actor_role} · ` : ''}{new Date(row.occurred_at).toLocaleString('ru-RU')}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
