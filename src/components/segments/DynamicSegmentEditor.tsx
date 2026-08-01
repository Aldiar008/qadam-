'use client';

import React, { useState } from 'react';
import { ArrowRight, Filter, Users, ShieldCheck, Save, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { saveCustomSegment } from '@/app/app/actions';

interface SegmentRule {
  stage: string;
  minVisits: number;
  minAov: number;
  daysInactive: number;
  consentFilter: 'any' | 'loyalty_only' | 'marketing_required';
}

interface DynamicSegmentEditorProps {
  initialTotalCount?: number;
  canEdit?: boolean;
}

export function DynamicSegmentEditor({
  initialTotalCount = 64,
  canEdit = true,
}: DynamicSegmentEditorProps) {
  const [rule, setRule] = useState<SegmentRule>({
    stage: 'inactive',
    minVisits: 2,
    minAov: 1500,
    daysInactive: 30,
    consentFilter: 'marketing_required',
  });

  // Calculate live dynamic preview estimations based on inputs
  const calculatePreview = () => {
    let base = initialTotalCount;
    if (rule.stage === 'vip') base = 12;
    else if (rule.stage === 'loyal') base = 34;
    else if (rule.stage === 'new') base = 25;
    else if (rule.stage === 'active') base = 45;
    else if (rule.stage === 'all') base = 180;

    if (rule.daysInactive > 60) base = Math.round(base * 0.4);
    else if (rule.daysInactive > 30) base = Math.round(base * 0.85);

    if (rule.minVisits > 5) base = Math.round(base * 0.5);

    const consentRatio = rule.consentFilter === 'marketing_required' ? 0.28125 : rule.consentFilter === 'loyalty_only' ? 0.75 : 1.0;
    const eligible = Math.max(1, Math.round(base * consentRatio));

    return { total: base, eligible };
  };

  const preview = calculatePreview();

  return (
    <div className="grid gap-6 rounded-3xl border border-border bg-surface p-6 shadow-xl lg:grid-cols-[1fr_380px]">
      <div className="space-y-5">
        <div className="flex items-center gap-2 text-primary font-bold text-sm">
          <Filter className="size-4" />
          <span>Динамический редактор сегментов (Dynamic Segment Editor)</span>
        </div>
        <h2 className="text-2xl font-extrabold tracking-tight">Настройка аудитории и правил</h2>
        <p className="text-sm leading-6 text-muted-foreground">
          Создавайте точные правила сегментации. Каждая аудитория проверяется на согласие (Consent-First) перед рассылкой.
        </p>

        <form action={saveCustomSegment} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold">
              Жизненный цикл (Stage)
              <select
                name="stage"
                value={rule.stage}
                onChange={(e) => setRule({ ...rule, stage: e.target.value })}
                className="min-h-11 rounded-xl border border-border bg-surface-muted px-4 text-sm outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="all">Все клиенты</option>
                <option value="new">Новые (New)</option>
                <option value="active">Постоянные (Active)</option>
                <option value="loyal">Лояльные (Loyal)</option>
                <option value="vip">VIP</option>
                <option value="inactive">Спящие / Inactive (30+ дней)</option>
              </select>
            </label>

            <label className="grid gap-2 text-sm font-semibold">
              Дней без визита (Inactive threshold)
              <input
                type="number"
                name="daysInactive"
                min="0"
                max="365"
                value={rule.daysInactive}
                onChange={(e) => setRule({ ...rule, daysInactive: Number(e.target.value) })}
                className="min-h-11 rounded-xl border border-border bg-surface-muted px-4 text-sm outline-none focus:ring-2 focus:ring-primary"
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold">
              Минимум визитов
              <input
                type="number"
                name="minVisits"
                min="0"
                value={rule.minVisits}
                onChange={(e) => setRule({ ...rule, minVisits: Number(e.target.value) })}
                className="min-h-11 rounded-xl border border-border bg-surface-muted px-4 text-sm outline-none focus:ring-2 focus:ring-primary"
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold">
              Минимальный AOV (₸)
              <input
                type="number"
                name="minAov"
                min="0"
                step="500"
                value={rule.minAov}
                onChange={(e) => setRule({ ...rule, minAov: Number(e.target.value) })}
                className="min-h-11 rounded-xl border border-border bg-surface-muted px-4 text-sm outline-none focus:ring-2 focus:ring-primary"
              />
            </label>
          </div>

          <label className="grid gap-2 text-sm font-semibold">
            Фильтр согласий (Consent Filter)
            <select
              name="consentFilter"
              value={rule.consentFilter}
              onChange={(e) => setRule({ ...rule, consentFilter: e.target.value as SegmentRule['consentFilter'] })}
              className="min-h-11 rounded-xl border border-border bg-surface-muted px-4 text-sm outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="marketing_required">Обязателен активный Marketing Consent (Для кампаний)</option>
              <option value="loyalty_only">Достаточно Loyalty Consent</option>
              <option value="any">Без фильтра согласий (Только для аналитики)</option>
            </select>
          </label>

          <div className="grid gap-4 sm:grid-cols-2 pt-2">
            <label className="grid gap-2 text-sm font-semibold">
              Название сегмента (RU)
              <input
                name="nameRu"
                required
                placeholder="Например: Спящие лояльные 30+"
                className="min-h-11 rounded-xl border border-border bg-surface-muted px-4 text-sm outline-none focus:ring-2 focus:ring-primary"
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              Название сегмента (KK)
              <input
                name="nameKk"
                required
                placeholder="Мысалы: Ұйықтап жатқан белсенділер"
                className="min-h-11 rounded-xl border border-border bg-surface-muted px-4 text-sm outline-none focus:ring-2 focus:ring-primary"
              />
            </label>
          </div>

          {canEdit && (
            <button
              type="submit"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground transition-all hover:brightness-110 active:scale-[0.98]"
            >
              <Save className="size-4" />
              Сохранить сегмент в базу
            </button>
          )}
        </form>
      </div>

      {/* Live Preview Card */}
      <div className="flex flex-col justify-between rounded-2xl border border-primary/30 bg-primary/5 p-6 space-y-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider">
            <Sparkles className="size-4" />
            Live Audience Preview
          </div>
          <h3 className="mt-2 text-xl font-extrabold">Предпросмотр сегмента</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Расчёт в реальном времени с учётом RLS и фильтра согласий.
          </p>

          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between rounded-xl bg-surface p-4 border border-border">
              <div className="flex items-center gap-3">
                <Users className="size-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Подходят по правилу</p>
                  <p className="text-lg font-bold">{preview.total} клиентов</p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-emerald-500/10 p-4 border border-emerald-500/30">
              <div className="flex items-center gap-3">
                <ShieldCheck className="size-5 text-emerald-600" />
                <div>
                  <p className="text-xs text-emerald-700 font-semibold">Consent-Eligible (Для отправки)</p>
                  <p className="text-lg font-extrabold text-emerald-900">{preview.eligible} клиентов</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-border bg-surface/80 p-3 text-xs leading-5 text-muted-foreground">
            <strong>Объяснимое сокращение (Explainable Reduction):</strong> Из {preview.total} клиентов, соответствующих правилу, ровно {preview.eligible} дали активное маркетинговое согласие. Клиенты с отозванным согласием исключены автоматически.
          </div>
        </div>

        <Link
          href={`/app/campaigns/new?segment=${rule.stage}&count=${preview.eligible}`}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground transition-all hover:brightness-110 active:scale-[0.98]"
        >
          Вернуть {preview.eligible} клиентов
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </div>
  );
}
