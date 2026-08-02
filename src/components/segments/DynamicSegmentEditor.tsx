'use client';

import React, { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { ArrowRight, Filter, Users, ShieldCheck, Save, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { previewSegmentAudience, saveCustomSegment } from '@/app/app/actions';
import { STAGE_OPTIONS, type SegmentRule } from '@/lib/segment-rules';

interface EditorRule {
  stage: string;
  minVisits: number;
  minAov: number;
  daysInactive: number;
  consentFilter: 'any' | 'loyalty_only' | 'marketing_required';
}

interface DynamicSegmentEditorProps {
  canEdit?: boolean;
}

const toRule = (rule: EditorRule): SegmentRule => ({
  stage: rule.stage,
  daysInactive: rule.daysInactive > 0 ? rule.daysInactive : undefined,
  minVisits: rule.minVisits > 0 ? rule.minVisits : undefined,
  minAovMinor: rule.minAov > 0 ? rule.minAov : undefined,
  consentFilter: rule.consentFilter,
  channel: 'telegram',
});

const field = 'min-h-11 rounded-xl border border-border bg-surface-muted px-4 text-sm outline-none focus:ring-2 focus:ring-primary';

export function DynamicSegmentEditor({ canEdit = true }: DynamicSegmentEditorProps) {
  const [rule, setRule] = useState<EditorRule>({
    stage: 'inactive',
    minVisits: 0,
    minAov: 0,
    daysInactive: 30,
    consentFilter: 'marketing_required',
  });
  const [preview, setPreview] = useState<{ matched: number; eligible: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  // A slow answer to an old rule must not overwrite a fresh one: the number on
  // screen has to belong to the settings on screen.
  const request = useRef(0);

  const recount = useCallback((next: EditorRule) => {
    const ticket = (request.current += 1);
    startTransition(async () => {
      try {
        const result = await previewSegmentAudience(toRule(next));
        if (ticket === request.current) {
          setPreview({ matched: result.matched, eligible: result.eligible });
          setFailed(false);
        }
      } catch {
        if (ticket === request.current) {
          setPreview(null);
          setFailed(true);
        }
      }
    });
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => recount(rule), 350);
    return () => clearTimeout(timer);
  }, [rule, recount]);

  const excluded = preview ? preview.matched - preview.eligible : 0;
  const consentSentence =
    rule.consentFilter === 'any'
      ? 'Фильтр согласий выключен: такой сегмент годится для аналитики, но рассылать по нему нельзя.'
      : rule.consentFilter === 'loyalty_only'
        ? 'Считаются те, кто дал согласие на программу лояльности.'
        : 'Считаются те, у кого сейчас активно согласие на рассылку в Telegram.';

  return (
    <div className="grid gap-6 rounded-3xl border border-border bg-surface p-6 shadow-xl lg:grid-cols-[1fr_380px]">
      <div className="space-y-5">
        <div className="flex items-center gap-2 text-sm font-bold text-primary">
          <Filter className="size-4" />
          <span>Конструктор сегмента</span>
        </div>
        <h2 className="text-2xl font-extrabold tracking-tight">Кому вы хотите написать</h2>
        <p className="text-sm leading-6 text-muted-foreground">
          Задайте условия — справа посчитается, сколько человек им отвечает и скольким из них можно
          написать по закону. Числа считаются в базе по вашим данным, а не оцениваются на глаз.
        </p>

        <form action={saveCustomSegment} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold">
              Кто нас интересует
              <select
                name="stage"
                value={rule.stage}
                onChange={(e) => setRule({ ...rule, stage: e.target.value })}
                className={field}
              >
                <option value="all">Все клиенты</option>
                {STAGE_OPTIONS.map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm font-semibold">
              Не приходили дней (0 — не важно)
              <input
                type="number"
                name="daysInactive"
                min="0"
                max="365"
                value={rule.daysInactive}
                onChange={(e) => setRule({ ...rule, daysInactive: Number(e.target.value) })}
                className={field}
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold">
              Минимум визитов (0 — не важно)
              <input
                type="number"
                name="minVisits"
                min="0"
                value={rule.minVisits}
                onChange={(e) => setRule({ ...rule, minVisits: Number(e.target.value) })}
                className={field}
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold">
              Средний чек от, ₸ (0 — не важно)
              <input
                type="number"
                name="minAov"
                min="0"
                step="500"
                value={rule.minAov}
                onChange={(e) => setRule({ ...rule, minAov: Number(e.target.value) })}
                className={field}
              />
            </label>
          </div>

          <label className="grid gap-2 text-sm font-semibold">
            Согласие
            <select
              name="consentFilter"
              value={rule.consentFilter}
              onChange={(e) => setRule({ ...rule, consentFilter: e.target.value as EditorRule['consentFilter'] })}
              className={field}
            >
              <option value="marketing_required">Есть согласие на рассылку — можно писать</option>
              <option value="loyalty_only">Достаточно согласия на лояльность</option>
              <option value="any">Без фильтра — только для аналитики</option>
            </select>
          </label>

          <div className="grid gap-4 pt-2 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold">
              Название сегмента (RU)
              <input name="nameRu" required placeholder="Например: Спящие постоянные 30+" className={field} />
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              Название сегмента (KK)
              <input name="nameKk" required placeholder="Мысалы: Ұйықтап жатқан тұрақтылар" className={field} />
            </label>
          </div>

          {canEdit && (
            <button
              type="submit"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground transition-all hover:brightness-110 active:scale-[0.98]"
            >
              <Save className="size-4" />
              Сохранить сегмент
            </button>
          )}
        </form>
      </div>

      <div className="flex flex-col justify-between space-y-6 rounded-2xl border border-primary/30 bg-primary/5 p-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
            <Sparkles className="size-4" />
            Подсчёт по базе
          </div>
          <h3 className="mt-2 text-xl font-extrabold">Сколько человек попадёт</h3>
          <p className="mt-1 text-xs text-muted-foreground" aria-live="polite">
            {pending ? 'Считаю по вашим данным…' : failed ? 'Посчитать не удалось' : 'Обновляется при изменении условий'}
          </p>

          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between rounded-xl border border-border bg-surface p-4">
              <div className="flex items-center gap-3">
                <Users className="size-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Подходят по условиям</p>
                  <p className="text-lg font-bold">{preview ? `${preview.matched} чел.` : '—'}</p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
              <div className="flex items-center gap-3">
                <ShieldCheck className="size-5 text-emerald-600" />
                <div>
                  <p className="text-xs font-semibold text-emerald-700">Можно написать по закону</p>
                  <p className="text-lg font-extrabold text-emerald-900">{preview ? `${preview.eligible} чел.` : '—'}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-border bg-surface/80 p-3 text-xs leading-5 text-muted-foreground">
            {failed ? (
              <>Подсчёт не выполнен, поэтому здесь ничего не показано. Обновите страницу — придумывать число вместо ответа базы мы не будем.</>
            ) : preview ? (
              <>
                <strong>Почему меньше:</strong> условиям отвечают {preview.matched} чел., из них {excluded} исключены —
                {' '}у них нет действующего согласия или оно отозвано. Остаётся {preview.eligible}. {consentSentence}
              </>
            ) : (
              <>{consentSentence}</>
            )}
          </div>
        </div>

        {/* An unsaved rule is not a segment yet, so this cannot start a campaign
            without lying about which audience it would use. It shows the people
            instead; the campaign starts from a saved segment below. */}
        <Link
          href={`/app/customers?segment=${rule.stage === 'all' ? '' : rule.stage}`}
          className={
            'inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold transition-all ' +
            (preview && preview.matched > 0
              ? 'bg-primary text-primary-foreground hover:brightness-110 active:scale-[0.98]'
              : 'pointer-events-none bg-surface-muted text-muted-foreground')
          }
        >
          {preview && preview.matched > 0 ? `Посмотреть этих клиентов (${preview.matched})` : 'Под эти условия никто не попадает'}
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </div>
  );
}
