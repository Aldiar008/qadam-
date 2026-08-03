'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Вход в приложение: гость или владелец.
 *
 * Telegram puts a signed payload in the page's own URL fragment, so the official
 * `telegram-web-app.js` — a cross-origin script — is not loaded: widening
 * `script-src` for the one screen a stranger is most likely to open would be a
 * poor trade. Telling the client «I'm ready» is two postMessage calls, covered
 * for both transports.
 *
 * A chat already tied to a card goes straight to it. Anyone else is offered the
 * owner's door: an eight-character key that changes every hour, read off the
 * cabinet. Nothing here is trusted — the fragment and the key are both checked
 * on the server.
 */

type Phase = 'checking' | 'guest_ready' | 'needs_key' | 'refused';

function readInitData(): string {
  if (typeof window === 'undefined') return '';
  const hash = window.location.hash.replace(/^#/, '');
  return new URLSearchParams(hash).get('tgWebAppData')
    ?? new URLSearchParams(window.location.search).get('tgWebAppData')
    ?? '';
}

function tellTelegramWeAreReady(): void {
  const proxy = (window as unknown as { TelegramWebviewProxy?: { postEvent: (type: string, data: string) => void } }).TelegramWebviewProxy;
  for (const eventType of ['web_app_ready', 'web_app_expand']) {
    try {
      if (proxy?.postEvent) proxy.postEvent(eventType, '');
      else if (window.parent !== window) window.parent.postMessage(JSON.stringify({ eventType, eventData: '' }), 'https://web.telegram.org');
    } catch {
      // A client that will not take the greeting still renders the page.
    }
  }
}

const REASONS: Record<string, string> = {
  not_configured: 'Бот не настроен на этом стенде.',
  malformed: 'Telegram не передал данные сессии. Откройте приложение кнопкой в чате с ботом.',
  bad_signature: 'Подпись Telegram не сошлась. Откройте приложение заново из чата с ботом.',
  expired: 'Сессия устарела. Откройте приложение заново из чата с ботом.',
};

export function TelegramBridge() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('checking');
  const [message, setMessage] = useState('');
  const [initData, setInitData] = useState('');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    tellTelegramWeAreReady();
    const payload = readInitData();
    let cancelled = false;

    (async () => {
      if (!payload) {
        if (!cancelled) { setPhase('refused'); setMessage(REASONS.malformed); }
        return;
      }
      if (!cancelled) setInitData(payload);
      try {
        const response = await fetch('/api/tg/session', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ initData: payload }),
        });
        const body = (await response.json()) as { error?: string; isGuest?: boolean; isOwner?: boolean };
        if (cancelled) return;
        if (response.ok) {
          setPhase('guest_ready');
          router.replace(body.isGuest ? '/tg/card' : '/tg/owner');
          return;
        }
        // «Этот чат не связан» is not a failure: it is the normal state of an
        // owner opening the app for the first time, and of a guest who has not
        // scanned the QR code yet. Both are offered the next step.
        if (response.status === 404) { setPhase('needs_key'); return; }
        setPhase('refused');
        setMessage(REASONS[body.error ?? ''] ?? 'Не получилось открыть приложение.');
      } catch {
        if (!cancelled) { setPhase('refused'); setMessage('Связь с сервером не установилась. Попробуйте ещё раз через минуту.'); }
      }
    })();

    return () => { cancelled = true; };
  }, [router]);

  const submitKey = useCallback(async () => {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/tg/admin', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ initData, key }),
      });
      const body = (await response.json()) as { error?: string; message?: string };
      if (response.ok) { router.replace('/tg/owner'); return; }
      setMessage(body.message ?? 'Ключ не подошёл.');
    } catch {
      setMessage('Связь с сервером не установилась.');
    } finally {
      setBusy(false);
    }
  }, [initData, key, router]);

  if (phase === 'checking' || phase === 'guest_ready') {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 text-center">
        <div className="size-8 animate-spin rounded-full border-2 border-border border-t-primary" aria-hidden />
        <p aria-live="polite" className="text-sm text-muted-foreground">Проверяем, кто вы…</p>
      </div>
    );
  }

  if (phase === 'refused') {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 text-center">
        <h1 className="text-xl font-extrabold">Не получилось открыть</h1>
        <p className="text-sm leading-6 text-muted-foreground">{message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 py-6">
      <header className="text-center">
        <h1 className="text-2xl font-extrabold">QADAM</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Этот чат ещё не связан с заведением. Выберите, кто вы.
        </p>
      </header>

      <section className="rounded-3xl border border-border bg-surface p-5">
        <h2 className="text-base font-bold">Я гость</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Отсканируйте QR-код на кассе или на столе — он откроет этот же чат, и карта заведётся сама.
          После этого здесь появятся ваши штампы, меню и персональные предложения.
        </p>
      </section>

      <section className="rounded-3xl border border-primary/30 bg-primary/5 p-5">
        <h2 className="text-base font-bold">Я владелец</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Введите ключ из кабинета — раздел «Автоматизации». Он меняется каждый час, поэтому
          записанный вчера не подойдёт.
        </p>
        <label className="mt-4 grid gap-2 text-sm font-semibold">
          Ключ доступа
          <input
            value={key}
            onChange={(event) => setKey(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 8))}
            inputMode="text"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            placeholder="ABCD2345"
            className="min-h-12 rounded-xl border border-border bg-surface px-4 text-center font-mono text-lg tracking-[0.3em] outline-none focus:ring-2 focus:ring-primary"
          />
        </label>
        {message && <p role="alert" className="mt-3 text-sm text-amber-800">{message}</p>}
        <button
          onClick={submitKey}
          disabled={busy || key.length !== 8}
          className="mt-4 min-h-12 w-full rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {busy ? 'Проверяем…' : 'Войти как владелец'}
        </button>
      </section>
    </div>
  );
}
