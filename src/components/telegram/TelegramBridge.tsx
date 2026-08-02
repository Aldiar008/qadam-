'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * The handshake with Telegram, without Telegram's script.
 *
 * The official `telegram-web-app.js` is a cross-origin script, and loading it
 * would mean widening `script-src` for the one screen a stranger is most likely
 * to open. It is not needed: the client puts the signed payload in the page's
 * own URL fragment, and telling the client "I'm ready" is two postMessage
 * calls. Both transports are covered — a native WebView exposes
 * `TelegramWebviewProxy`, the web client listens on the parent frame.
 *
 * Nothing here is trusted. The fragment is handed to the server, which checks
 * the signature against the bot token before any card is shown.
 */

type Phase = 'checking' | 'refused' | 'redirecting';

function readInitData(): string {
  if (typeof window === 'undefined') return '';
  const hash = window.location.hash.replace(/^#/, '');
  const fromHash = new URLSearchParams(hash).get('tgWebAppData');
  if (fromHash) return fromHash;
  // Some clients pass it as a query parameter instead of a fragment.
  return new URLSearchParams(window.location.search).get('tgWebAppData') ?? '';
}

function tellTelegramWeAreReady(): void {
  const payload = (eventType: string, eventData: unknown = '') => JSON.stringify({ eventType, eventData });
  const proxy = (window as unknown as { TelegramWebviewProxy?: { postEvent: (type: string, data: string) => void } }).TelegramWebviewProxy;
  for (const eventType of ['web_app_ready', 'web_app_expand']) {
    try {
      if (proxy?.postEvent) proxy.postEvent(eventType, '');
      else if (window.parent !== window) window.parent.postMessage(payload(eventType), 'https://web.telegram.org');
    } catch {
      // A client that will not take the greeting still renders the page; there
      // is nothing to recover from and nothing worth telling the guest.
    }
  }
}

const REASONS: Record<string, string> = {
  not_configured: 'Бот не настроен на этом стенде.',
  malformed: 'Telegram не передал данные сессии. Откройте приложение кнопкой в чате с ботом.',
  bad_signature: 'Подпись Telegram не сошлась. Откройте приложение заново из чата с ботом.',
  expired: 'Сессия устарела. Откройте приложение заново из чата с ботом.',
  not_linked: 'Этот чат ещё не связан с заведением. Отсканируйте QR-код на кассе — карта заведётся сама.',
};

export function TelegramBridge() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('checking');
  const [message, setMessage] = useState('');

  useEffect(() => {
    tellTelegramWeAreReady();
    const initData = readInitData();

    let cancelled = false;
    (async () => {
      // Every outcome is reported from inside this async body, including the
      // "Telegram sent us nothing" one: setting state synchronously in an effect
      // costs a second render pass for no benefit.
      if (!initData) {
        if (!cancelled) {
          setPhase('refused');
          setMessage(REASONS.malformed);
        }
        return;
      }
      try {
        const response = await fetch('/api/tg/session', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ initData }),
        });
        const body = (await response.json()) as { error?: string; message?: string; isGuest?: boolean; isOwner?: boolean };
        if (cancelled) return;
        if (!response.ok) {
          setPhase('refused');
          setMessage(body.message ?? REASONS[body.error ?? ''] ?? 'Не получилось открыть карту.');
          return;
        }
        setPhase('redirecting');
        router.replace(body.isGuest ? '/tg/card' : '/tg/owner');
      } catch {
        if (cancelled) return;
        setPhase('refused');
        setMessage('Связь с сервером не установилась. Попробуйте ещё раз через минуту.');
      }
    })();

    return () => { cancelled = true; };
  }, [router]);

  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center px-5 text-center">
      {phase === 'refused' ? (
        <>
          <h1 className="text-xl font-extrabold">Не получилось открыть карту</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{message}</p>
        </>
      ) : (
        <p aria-live="polite" className="text-sm text-muted-foreground">Проверяем, кто вы…</p>
      )}
    </div>
  );
}
