import Link from 'next/link';
import { ArrowRight, Heart, Search } from 'lucide-react';
import { getToolsData } from '@/server/qadam/repository';
import { toggleFavorite, toggleToolActivation } from '../actions';

export const dynamic = 'force-dynamic';

const filterLabels: Record<string, string> = {
  marketing: 'Маркетинг', sales: 'Продажи', retention: 'Удержание', analytics: 'Аналитика', automation: 'Автоматизация',
};

/**
 * Где именно живёт инструмент.
 *
 * The catalogue used to offer «Использовать», which navigated to a section and
 * left the person looking for the thing they had just switched on — «AI-досье
 * гостя» opened the customer list, where the button is one click further in.
 * Naming the destination and the step is the difference between a catalogue and
 * a wall of cards.
 */
const WHERE: Record<string, { action: string; hint: string }> = {
  signal_today: { action: 'Открыть «Сегодня»', hint: 'Сигнал дня и одно предложенное действие — на главном экране.' },
  campaign_studio: { action: 'Открыть студию', hint: 'Семь шагов: цель, аудитория, механика, симулятор, контракт.' },
  content_studio: { action: 'Открыть контент', hint: 'Выберите кампанию и нажмите «Сгенерировать» — тексты появятся на двух языках.' },
  margin_shield: { action: 'Открыть шаг «Симулятор»', hint: 'Работает автоматически на пятом шаге студии: небезопасный вариант не собирается в контракт.' },
  simulator: { action: 'Открыть шаг «Симулятор»', hint: 'Осторожный, базовый и оптимистичный сценарий — до запуска.' },
  qr_loyalty: { action: 'Открыть лояльность', hint: 'Программа, награды и QR-коды для кассы, стола и чека.' },
  segments: { action: 'Открыть сегменты', hint: 'Правило вместо списка: конструктор считает аудиторию по вашей базе.' },
  winback: { action: 'Показать спящих', hint: 'Кто не приходил дольше 30 дней и кому можно написать по закону.' },
  impact_ledger: { action: 'Открыть аналитику', hint: 'Прогноз, влияние и прирост — тремя разными строками.' },
  customer_brief: { action: 'Открыть клиентов', hint: 'Откройте карточку гостя — кнопка «Собрать досье AI» под заметками.' },
  automations: { action: 'Открыть автоматизации', hint: 'Правила, аварийная остановка и проверка связи каналов.' },
  telegram_bot: { action: 'Открыть автоматизации', hint: 'Там код привязки чата: бот пришлёт сводку и примет подтверждение.' },
};

export default async function ToolsPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string; favorites?: string }> }) {
  const params = await searchParams;
  const data = await getToolsData({ q: params.q, category: params.category, favorites: params.favorites === '1' });

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Инструменты</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Это указатель по продукту: что он умеет и где именно это лежит. Включённые инструменты
            появляются на «Сегодня», чтобы до них был один клик.
          </p>
        </div>
        <Link href="/app/tools?favorites=1" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-bold">
          <Heart className="size-4" /> Избранное
        </Link>
      </header>

      <form className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Поиск инструментов</span>
          <Search className="absolute left-4 top-3.5 size-4 text-muted-foreground" />
          <input name="q" defaultValue={params.q} placeholder="Поиск по названию и описанию" className="min-h-11 w-full rounded-xl bg-surface-muted pl-11 pr-4 text-sm outline-none focus:ring-2 focus:ring-primary" />
        </label>
        <button className="min-h-11 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground">Найти</button>
        <Link href="/app/tools" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-5 text-sm font-bold">Сбросить</Link>
      </form>

      <nav aria-label="Категории инструментов" className="flex gap-2 overflow-x-auto pb-2">
        <Link href="/app/tools" className={'whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold ' + (!params.category ? 'bg-primary text-primary-foreground' : 'border border-border bg-surface')}>Все</Link>
        {data.categories.slice(0, 5).map((category) => (
          <Link key={category.id} href={`/app/tools?category=${category.code}`} className={'whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold ' + (params.category === category.code ? 'bg-primary text-primary-foreground' : 'border border-border bg-surface')}>
            {filterLabels[category.code] ?? category.name_ru}
          </Link>
        ))}
      </nav>

      {data.tools.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {data.tools.map((tool) => {
            const active = tool.activationStatus === 'active';
            const where = WHERE[tool.code];
            return (
              <article key={tool.id} className="flex flex-col rounded-3xl border border-border bg-surface p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold text-primary">{filterLabels[tool.category?.code ?? ''] ?? tool.category?.name_ru}</p>
                    <h2 className="mt-2 text-xl font-bold">{tool.name_ru}</h2>
                  </div>
                  <span className={'rounded-full px-3 py-1 text-xs font-bold ' + (active ? 'bg-primary/10 text-primary' : 'bg-surface-muted')}>
                    {active ? 'На «Сегодня»' : 'Доступен'}
                  </span>
                </div>

                <p className="mt-3 text-sm leading-6 text-muted-foreground">{tool.description_ru}</p>
                {where && <p className="mt-2 text-xs leading-5 text-muted-foreground"><strong>Где:</strong> {where.hint}</p>}

                <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
                  <form action={toggleFavorite}>
                    <input type="hidden" name="toolId" value={tool.id} />
                    <button aria-label={tool.favorite ? 'Убрать из избранного' : 'Добавить в избранное'} className={'grid size-11 place-items-center rounded-xl border ' + (tool.favorite ? 'border-primary bg-primary/10 text-primary' : 'border-border')}>
                      <Heart className={'size-4 ' + (tool.favorite ? 'fill-current' : '')} />
                    </button>
                  </form>

                  {/* The destination is always offered. Hiding it until the tool
                      was «activated» made activation look like a gate it never
                      was — everything here works whether or not it is pinned. */}
                  <Link href={tool.route} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground">
                    {where?.action ?? 'Открыть'} <ArrowRight className="size-4" />
                  </Link>

                  <form action={toggleToolActivation}>
                    <input type="hidden" name="toolId" value={tool.id} />
                    <button className="min-h-11 rounded-xl border border-border px-4 text-sm font-bold">
                      {active ? 'Убрать с «Сегодня»' : 'Закрепить на «Сегодня»'}
                    </button>
                  </form>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <section className="rounded-3xl border border-dashed border-border p-10 text-center">
          <h2 className="font-bold">Инструменты не найдены</h2>
          <p className="mt-2 text-sm text-muted-foreground">Измените запрос или очистите фильтры.</p>
        </section>
      )}
    </div>
  );
}
