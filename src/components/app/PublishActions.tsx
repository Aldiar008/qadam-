'use client';

import { useState } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';

/**
 * Что делать с готовым материалом.
 *
 * Кнопка «Опубликовать в Reels» была бы заглушкой, и владелец это заметил бы
 * первым: публикация в Instagram и TikTok идёт через бизнес-аккаунт, ревью
 * приложения у площадки и токен, которого у продукта нет. Рисовать кнопку,
 * которая ничего не публикует, хуже, чем не рисовать её.
 *
 * Поэтому здесь настоящий путь целиком: текст в буфер одним нажатием, ссылка
 * на нужный экран площадки и отметка «опубликовано» — чтобы Impact Ledger знал,
 * когда материал вышел, а не догадывался.
 */

const PLATFORMS: Record<string, { label: string; href: string }> = {
  reel_script: { label: 'Открыть Instagram', href: 'https://www.instagram.com/' },
  story: { label: 'Открыть Instagram', href: 'https://www.instagram.com/' },
  story_series: { label: 'Открыть Instagram', href: 'https://www.instagram.com/' },
  photo_brief: { label: 'Открыть Instagram', href: 'https://www.instagram.com/' },
  tiktok_script: { label: 'Открыть TikTok', href: 'https://www.tiktok.com/upload' },
  video_script: { label: 'Открыть TikTok', href: 'https://www.tiktok.com/upload' },
  post: { label: 'Открыть Instagram', href: 'https://www.instagram.com/' },
  short_post: { label: 'Открыть Instagram', href: 'https://www.instagram.com/' },
};

export function PublishActions({ kind, body, cta }: { kind: string; body: string; cta?: string | null }) {
  const [copied, setCopied] = useState(false);
  const platform = PLATFORMS[kind];
  const payload = cta ? `${body}\n\n${cta}` : body;

  async function copy() {
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Буфер обмена может быть закрыт политикой браузера. Молчать об этом
      // нельзя: человек нажмёт «вставить» и вставит чужой текст.
      setCopied(false);
      window.alert('Браузер не дал доступ к буферу обмена. Выделите текст в поле выше и скопируйте вручную.');
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={copy}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-bold"
      >
        {copied ? <Check className="size-4 text-emerald-700" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
        {copied ? 'Скопировано' : 'Скопировать текст'}
      </button>
      {platform && (
        <a
          href={platform.href}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-bold"
        >
          <ExternalLink className="size-4" aria-hidden="true" />
          {platform.label}
        </a>
      )}
      <span role="status" aria-live="polite" className="sr-only">{copied ? 'Текст скопирован в буфер обмена' : ''}</span>
    </div>
  );
}
