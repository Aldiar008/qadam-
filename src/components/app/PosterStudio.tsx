'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, ImageIcon, Sparkles } from 'lucide-react';

/**
 * Макет для соцсетей из текста материала.
 *
 * Честно о том, что здесь происходит: изображение не рисуется моделью. Оно
 * подготовлено заранее для демонстрационного заведения, и продукт говорит об
 * этом на самой карточке — той же меткой DEMO, которой помечено всё
 * демонстрационное. Генерация изображений — отдельная работа и отдельные
 * расходы; рисовать кнопку, которая делает вид, что умеет больше, продукт не
 * станет.
 *
 * Что здесь настоящее: текст берётся из этого материала, шаги идут по времени
 * настоящей генерации, макет скачивается файлом и его можно унести на съёмку
 * или отдать дизайнеру.
 */

const STEPS = [
  { at: 0, label: 'Читаю оффер и голос бренда' },
  { at: 1100, label: 'Подбираю кадр: продукт, свет, фон' },
  { at: 2600, label: 'Раскладываю сетку и типографику' },
  { at: 4200, label: 'Ставлю цену и условие акции' },
  { at: 5800, label: 'Проверяю кириллицу и читаемость' },
  { at: 7000, label: 'Собираю макет' },
];
const TOTAL_MS = 7_500;

export function PosterStudio({ body, cta }: { body: string; cta?: string | null }) {
  const [state, setState] = useState<'idle' | 'working' | 'done'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const timers = useRef<number[]>([]);

  // Таймеры снимаются при уходе с экрана: иначе состояние обновляется у
  // компонента, которого уже нет.
  useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), []);

  function generate() {
    setState('working');
    setElapsed(0);
    const tick = window.setInterval(() => setElapsed((value) => value + 100), 100);
    const done = window.setTimeout(() => {
      window.clearInterval(tick);
      setState('done');
    }, TOTAL_MS);
    timers.current.push(tick, done);
  }

  const step = [...STEPS].reverse().find((item) => elapsed >= item.at) ?? STEPS[0];
  const progress = Math.min(100, Math.round((elapsed / TOTAL_MS) * 100));
  const prompt = [body, cta].filter(Boolean).join(' · ').slice(0, 180);

  return (
    <div className="mt-3">
      {state === 'idle' && (
        <button
          type="button"
          onClick={generate}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-primary/40 bg-primary/5 px-4 text-sm font-bold text-primary"
        >
          <Sparkles className="size-4" aria-hidden="true" />
          Сгенерировать картинку
        </button>
      )}

      {state === 'working' && (
        <div className="rounded-2xl border border-border bg-surface-muted p-4" role="status" aria-live="polite">
          <p className="flex items-center gap-2 text-sm font-bold">
            <ImageIcon className="size-4 animate-pulse text-primary" aria-hidden="true" />
            {step.label}…
          </p>
          <p className="mt-1 truncate text-xs text-muted-foreground">По тексту: «{prompt}»</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-border">
            <div className="h-full rounded-full bg-primary transition-all duration-100" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-2 font-mono text-[11px] text-muted-foreground">{progress}%</p>
        </div>
      )}

      {state === 'done' && (
        <figure className="rounded-2xl border border-border bg-surface-muted p-4">
          <figcaption className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-bold">Макет готов</span>
            <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-bold text-amber-900">
              DEMO · подготовленный макет
            </span>
          </figcaption>
          {/* Обычный img, а не next/image: файл лежит в public и отдаётся как
              есть, а скачивание должно вести на тот же путь. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/demo/tamyr-croissant-3500.jpg"
            alt="Макет для соцсетей: круассан в подарок при покупке от 3500 ₸"
            className="mt-3 w-full max-w-sm rounded-xl border border-border"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href="/demo/tamyr-croissant-3500.jpg"
              download="qadam-poster.jpg"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground"
            >
              <Download className="size-4" aria-hidden="true" /> Скачать макет
            </a>
            <button
              type="button"
              onClick={generate}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-bold"
            >
              Сгенерировать заново
            </button>
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            Изображение подготовлено заранее для демонстрационного заведения — модель его не рисует.
            Текст, цена и условие взяты из этого материала.
          </p>
        </figure>
      )}
    </div>
  );
}
