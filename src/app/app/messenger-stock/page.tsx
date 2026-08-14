import { CheckCircle2, FlaskConical, HelpCircle, MessageSquare, Send, Store } from 'lucide-react';

import { formatQuantity } from '@/domain/inventory';
import { CONFIRM_THRESHOLD_PPM } from '@/domain/stock-message';
import { canMarket, requireBusinessContext } from '@/server/qadam/repository';
import { confirmMessage, receiveMessage, rejectMessage } from './actions';

export const dynamic = 'force-dynamic';

const field =
  'min-h-11 w-full rounded-xl border border-border bg-surface-muted px-3 text-sm outline-none focus:ring-2 focus:ring-primary';

const when = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

interface Candidate {
  itemId: string;
  itemName: string;
  matchPpm: number;
}

/**
 * Чат флориста.
 *
 * Учёт в переписке — не безалаберность, а рабочая привычка: между двумя
 * покупателями некогда открывать таблицу. Продукт встраивается в неё, но
 * сохраняет главное правило — остаток меняет человек, а не разбор.
 *
 * Живого Telegram и WhatsApp здесь нет. Это тренажёр, и он подписан как
 * тренажёр: показывать заглушку под видом интеграции — самый дешёвый способ
 * потерять доверие ровно там, где продукт просит его больше всего.
 */
export default async function MessengerStockPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; parsed?: string; confirmed?: string; rejected?: string; op?: string }>;
}) {
  const params = await searchParams;
  const ctx = await requireBusinessContext();
  const canEdit = canMarket(ctx.role);

  const [{ data: messages }, { data: items }, { data: locations }] = await Promise.all([
    ctx.supabase
      .from('stock_messages')
      .select('id,channel,author,body,received_at,location_id,parsed_item_id,parsed_quantity_milli,parsed_unit,confidence_ppm,candidates,status,is_simulated,confirmed_at')
      .eq('business_id', ctx.businessId)
      .order('received_at', { ascending: false })
      .limit(30),
    ctx.supabase
      .from('supply_items')
      .select('id,name_ru,unit')
      .eq('business_id', ctx.businessId)
      .order('name_ru'),
    ctx.supabase
      .from('business_locations')
      .select('id,name,city,district')
      .eq('business_id', ctx.businessId)
      .eq('is_active', true),
  ]);

  const locationById = new Map((locations ?? []).map((row) => [row.id, row]));
  // У магазина без разделения по точкам сообщение приходит «в магазин»: так и
  // подписано, чтобы не изображать выбор там, где его нет.
  const singleLocation = (locations ?? []).length === 1 ? (locations ?? [])[0] : null;

  const itemById = new Map((items ?? []).map((row) => [row.id, row]));
  const pending = (messages ?? []).filter((row) => row.status === 'proposed' || row.status === 'needs_clarification');
  const settled = (messages ?? []).filter((row) => row.status === 'confirmed' || row.status === 'rejected');

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="flex items-center gap-3 text-3xl font-extrabold tracking-tight">
          <MessageSquare className="size-7 text-primary" aria-hidden="true" />
          Остатки из чата
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Флорист пишет как обычно: «осталось 70 красных роз». Продукт разбирает сообщение в позицию,
          количество и единицу — и ждёт вашего подтверждения. До него витрина не меняется.
        </p>
      </header>

      <p className="flex items-start gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
        <FlaskConical className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden="true" />
        <span>
          <span className="font-semibold">[MOCK] Это тренажёр, а не подключённый мессенджер.</span> Живые Telegram и
          WhatsApp, распознавание голоса и фото полки не подключены — здесь работает разбор текста и настоящая
          запись остатка после подтверждения.
        </span>
      </p>

      {params.error && (
        <p role="alert" className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm">
          {params.error}
        </p>
      )}
      {params.confirmed && (
        <p className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm">
          Подтверждено: остаток изменён, событие записано в журнал.
        </p>
      )}
      {params.parsed === 'needs_clarification' && (
        <p className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          Разбор не уверен — проверьте позицию и количество перед подтверждением.
        </p>
      )}
      {params.rejected && <p className="rounded-2xl border border-border bg-surface p-4 text-sm">Предложение отклонено, витрина не тронута.</p>}

      {canEdit && (
        <section className="rounded-3xl border border-border bg-surface p-5">
          <h2 className="text-lg font-bold">Написать как в чате</h2>
          <form action={receiveMessage} className="mt-3 space-y-2">
            <input name="author" className={field} placeholder="Кто пишет" defaultValue="Айгуль (флорист)" />
            <input name="body" className={field} placeholder="осталось 70 красных роз" required minLength={2} />
            <button className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary-hover">
              <Send className="size-4" aria-hidden="true" />
              Отправить
            </button>
          </form>
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            Понимает «осталось 70 роз», «привезли 100 тюльпанов», «выбросили 12 завядших».
          </p>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Ждут подтверждения — {pending.length}</h2>
        {pending.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
            Новых сообщений нет.
          </p>
        ) : (
          <ul className="space-y-3">
            {pending.map((message) => {
              const candidates = (message.candidates ?? []) as unknown as Candidate[];
              const confident = message.confidence_ppm >= CONFIRM_THRESHOLD_PPM;
              const parsedItem = message.parsed_item_id ? itemById.get(message.parsed_item_id) : null;

              return (
                <li
                  key={message.id}
                  className={
                    'rounded-3xl border p-5 ' +
                    (confident ? 'border-border bg-surface' : 'border-amber-500/40 bg-amber-500/5')
                  }
                >
                  <div className="rounded-2xl rounded-bl-sm bg-surface-muted p-3">
                    <p className="font-mono text-xs text-muted-foreground">
                      {message.author} · {when(message.received_at)}
                      {message.is_simulated ? ' · тренажёр' : ''}
                    </p>
                    <p className="mt-1 text-base font-medium">{message.body}</p>
                  </div>

                  <p className="mt-2 flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                    <Store className="size-3.5" aria-hidden="true" />
                    {(() => {
                      const location = message.location_id ? locationById.get(message.location_id) : singleLocation;
                      if (!location) return `${ctx.business.name} · точка не указана`;
                      return `${ctx.business.name} · ${location.name}${location.district ? `, ${location.district}` : ''}`;
                    })()}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-mono text-xs text-muted-foreground">Разбор понял:</span>
                    <span className="font-semibold">{parsedItem?.name_ru ?? 'позиция не опознана'}</span>
                    {message.parsed_quantity_milli !== null && parsedItem && (
                      <span className="font-mono">
                        {formatQuantity(Number(message.parsed_quantity_milli), parsedItem.unit)}
                      </span>
                    )}
                    <span
                      className={
                        'rounded-full border px-2 py-0.5 font-mono text-[11px] font-bold ' +
                        (confident
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800'
                          : 'border-amber-500/30 bg-amber-500/10 text-amber-900')
                      }
                    >
                      уверенность {Math.round(message.confidence_ppm / 10_000)}%
                    </span>
                  </div>

                  {!confident && (
                    <p className="mt-2 flex items-start gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                      <HelpCircle className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden="true" />
                      <span>
                        Разбор не уверен — проверьте позицию и количество.
                        {candidates.length > 1 &&
                          ` Похожие: ${candidates.map((item) => item.itemName).join(', ')}.`}
                      </span>
                    </p>
                  )}

                  {canEdit && (
                    <form action={confirmMessage} className="mt-3 grid gap-2 sm:grid-cols-5">
                      <input type="hidden" name="id" value={message.id} />
                      <select
                        name="itemId"
                        className={`${field} sm:col-span-2`}
                        defaultValue={message.parsed_item_id ?? ''}
                        aria-label="Позиция"
                        required
                      >
                        <option value="">Выберите позицию</option>
                        {(items ?? []).map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name_ru}
                          </option>
                        ))}
                      </select>
                      <input
                        name="quantity"
                        className={field}
                        defaultValue={
                          message.parsed_quantity_milli !== null ? Number(message.parsed_quantity_milli) / 1000 : ''
                        }
                        placeholder="Сколько"
                        inputMode="decimal"
                        aria-label="Количество"
                        required
                      />
                      <input
                        name="unit"
                        className={field}
                        defaultValue={parsedItem?.unit ?? message.parsed_unit ?? ''}
                        placeholder="Единица"
                        aria-label="Единица измерения"
                      />
                      <select name="operation" className={field} defaultValue="adjust" aria-label="Что это">
                        <option value="adjust">Столько осталось</option>
                        <option value="receive">Привезли</option>
                        <option value="consume">Продали</option>
                        <option value="waste">Выбросили</option>
                      </select>
                      <button className="min-h-11 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground hover:bg-primary-hover sm:col-span-4">
                        Подтвердить и записать
                      </button>
                      <button
                        formAction={rejectMessage}
                        className="min-h-11 rounded-xl border border-border px-4 text-sm font-bold hover:bg-surface-muted"
                      >
                        Не то
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {settled.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-bold">Обработанные</h2>
          <ul className="space-y-2">
            {settled.slice(0, 10).map((message) => (
              <li
                key={message.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-surface px-4 py-3 text-sm"
              >
                <span className="min-w-0">
                  <span className="font-medium">{message.body}</span>
                  <span className="ml-2 font-mono text-xs text-muted-foreground">{message.author}</span>
                </span>
                <span className="flex items-center gap-2 font-mono text-xs">
                  {message.status === 'confirmed' ? (
                    <span className="flex items-center gap-1 text-emerald-700">
                      <CheckCircle2 className="size-3.5" aria-hidden="true" />
                      записано
                    </span>
                  ) : (
                    <span className="text-muted-foreground">отклонено</span>
                  )}
                  <span className="text-muted-foreground">{when(message.received_at)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
