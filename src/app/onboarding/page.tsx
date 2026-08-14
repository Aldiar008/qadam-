import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/brand/Logo';
import { requireBusinessContext } from '@/server/qadam/repository';
import { HOLIDAYS, TOLERANCE_LEVELS, SUPPLIER_SUGGESTIONS } from '@/domain/flower-onboarding';
import { saveOnboardingStep } from './actions';

export const dynamic = 'force-dynamic';

type OnboardingDraft = Record<string, unknown> & {
  businessName?: string;
  businessType?: string;
  location?: { name?: string; city?: string; district?: string; address?: string };
  flower?: {
    locationCount?: number;
    categories?: string[];
    holidays?: string[];
    suppliers?: string[];
    spoilageToleranceBps?: number;
  };
  importMode?: string;
};

/**
 * Регистрация цветочного магазина.
 *
 * Шесть шагов спрашивают ровно то, без чего продукт не сможет сказать ничего
 * полезного в первый же день: чем торгуете, где стоите, к каким праздникам
 * готовитесь, у кого покупаете и сколько списаний считаете нормой. Средний чек,
 * тон бренда и каналы рассылки отсюда ушли — они относились к другому продукту.
 */
export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ step?: string; saved?: string; error?: string }> }) {
  // «Не вошёл» и «вошёл, но заведения нет» — разные состояния, и отправлять оба
  // на /login означало зациклить второе.
  const ctx = await requireBusinessContext().catch((error: unknown) => error as Error);
  if (ctx instanceof Error) {
    redirect(ctx.message === 'MEMBERSHIP_REQUIRED' ? '/signup?message=no_business' : '/login?next=/onboarding');
  }
  if (ctx.role !== 'owner') redirect('/app/today');

  let { data: session } = await ctx.supabase
    .from('onboarding_sessions')
    .select('id,current_step,draft,status,optimistic_version')
    .eq('business_id', ctx.businessId)
    .eq('user_id', ctx.userId)
    .maybeSingle();

  if (!session) {
    const created = await ctx.supabase
      .from('onboarding_sessions')
      .insert({ business_id: ctx.businessId, user_id: ctx.userId, is_mock: false })
      .select('id,current_step,draft,status,optimistic_version')
      .single();
    if (created.error) throw created.error;
    session = created.data;
  }
  if (session.status === 'completed') redirect('/app/tools?onboarding=complete');

  const params = await searchParams;
  const step = Math.max(1, Math.min(6, Number(params.step ?? session.current_step)));
  const draft = session.draft as OnboardingDraft;
  const flower = draft.flower ?? {};

  // Справочник категорий приходит с платформы, а не из константы в коде:
  // администратор добавляет категорию — она появляется в анкете.
  const { data: categories } = await ctx.supabase
    .from('flower_categories')
    .select('code,name_ru')
    .eq('status', 'published')
    .order('sort_order');

  const chosenCategories = flower.categories ?? ['roses', 'tulips', 'greenery', 'packaging'];
  const chosenHolidays = flower.holidays ?? ['march_8', 'february_14'];
  const chosenSuppliers = flower.suppliers ?? [];

  const field = 'min-h-12 w-full rounded-xl border border-border bg-surface-muted px-4 text-sm outline-none focus:ring-2 focus:ring-primary';
  const check = 'flex min-h-12 items-center gap-3 rounded-xl border border-border px-4 text-sm font-semibold';

  return (
    <main id="main-content" className="min-h-[100dvh] bg-background px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-2xl">
        <Logo size="md" />

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-xs text-muted-foreground">Шаг {step} из 6</p>
            <h1 className="mt-2 text-3xl font-extrabold">Настроим {ctx.business.name} под цветы</h1>
          </div>
          <span className="rounded-full bg-primary/10 px-3 py-2 text-xs font-bold text-primary">Автосохранение</span>
        </div>

        <div className="mt-6 grid grid-cols-6 gap-2" aria-label={`Прогресс: шаг ${step} из 6`}>
          {[1, 2, 3, 4, 5, 6].map((item) => (
            <div key={item} className={'h-1.5 rounded-full ' + (item <= step ? 'bg-primary' : 'bg-border')} />
          ))}
        </div>

        {params.saved && (
          <p role="status" className="mt-4 rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800">
            Данные сохранены на сервере.
          </p>
        )}
        {params.error && (
          <p role="alert" className="mt-4 rounded-xl bg-rose-500/10 px-4 py-3 text-sm text-rose-800">
            {params.error}
          </p>
        )}

        <form action={saveOnboardingStep} className="mt-6 rounded-3xl border border-border bg-surface p-6 shadow-xl sm:p-8">
          <input type="hidden" name="sessionId" value={session.id} />
          <input type="hidden" name="step" value={step} />

          {step === 1 && (
            <fieldset className="grid gap-5">
              <legend className="text-xl font-bold">Магазин или сеть?</legend>
              <label className="grid gap-2 text-sm font-semibold">
                Название
                <input name="businessName" required defaultValue={String(draft.businessName ?? ctx.business.name)} className={field} />
              </label>
              {/* Тип — не размер. У сети иначе считается покрытие: излишек на
                  одной точке закрывает дефицит на другой, если между ними
                  полчаса, и не закрывает, если полтора. */}
              {([
                ['flower_shop', 'Цветочный магазин', 'Одна точка. Весь запас на одной витрине, и решение по нему одно.'],
                ['flower_chain', 'Сеть цветочных', 'От двух до пяти точек. Излишек на одной может закрыть дефицит на другой.'],
              ] as const).map(([code, label, hint]) => (
                <label key={code} className="grid min-h-12 grid-cols-[auto_1fr] items-start gap-3 rounded-xl border border-border p-4">
                  <input type="radio" name="businessType" value={code} required defaultChecked={(draft.businessType ?? 'flower_shop') === code} className="mt-1" />
                  <span>
                    <span className="block text-sm font-semibold">{label}</span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">{hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}

          {step === 2 && (
            <fieldset className="grid gap-5">
              <legend className="text-xl font-bold">Где вы стоите?</legend>
              <label className="grid gap-2 text-sm font-semibold">
                Название точки
                <input name="locationName" required defaultValue={draft.location?.name ?? 'Основная точка'} className={field} />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-semibold">
                  Город
                  <input name="city" required defaultValue={draft.location?.city ?? 'Алматы'} className={field} />
                </label>
                <label className="grid gap-2 text-sm font-semibold">
                  Район
                  <input name="district" required defaultValue={draft.location?.district ?? 'Бостандыкский'} className={field} />
                </label>
              </div>
              <label className="grid gap-2 text-sm font-semibold">
                Адрес
                <input name="address" defaultValue={draft.location?.address ?? ''} className={field} />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Сколько у вас точек
                <input name="locationCount" type="number" min="1" max="200" required defaultValue={flower.locationCount ?? 1} className={field} />
                <span className="text-xs font-normal leading-5 text-muted-foreground">
                  Район важен не для карточки: восьмое марта в центре и в спальном районе — разные всплески.
                </span>
              </label>
            </fieldset>
          )}

          {step === 3 && (
            <fieldset className="grid gap-4">
              <legend className="text-xl font-bold">Чем вы торгуете?</legend>
              <p className="text-sm leading-6 text-muted-foreground">
                Отметьте всё, что закупаете регулярно. Продукт будет следить за остатком и сроком по каждой отмеченной
                категории — и молчать про остальные.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {(categories ?? []).map((category) => (
                  <label key={category.code} className={check}>
                    <input type="checkbox" name="categories" value={category.code} defaultChecked={chosenCategories.includes(category.code)} />
                    {category.name_ru}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {step === 4 && (
            <fieldset className="grid gap-4">
              <legend className="text-xl font-bold">Какие праздники и сезоны у вас главные?</legend>
              <p className="text-sm leading-6 text-muted-foreground">
                Отмеченные поводы попадут в календарь как предложения с отраслевым коэффициентом. Прогноз они начнут
                двигать только после вашего одобрения — до него это гипотеза, а не измерение.
              </p>
              <div className="grid gap-2">
                {HOLIDAYS.map((holiday) => (
                  <label key={holiday.code} className="grid min-h-12 grid-cols-[auto_1fr] items-start gap-3 rounded-xl border border-border p-4">
                    <input type="checkbox" name="holidays" value={holiday.code} defaultChecked={chosenHolidays.includes(holiday.code)} className="mt-1" />
                    <span>
                      <span className="block text-sm font-semibold">{holiday.nameRu}</span>
                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">{holiday.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {step === 5 && (
            <fieldset className="grid gap-4">
              <legend className="text-xl font-bold">У кого вы покупаете?</legend>
              <p className="text-sm leading-6 text-muted-foreground">
                Сравнение и дробление заказа начинают работать, когда поставщиков больше одного. Отметьте знакомых или
                впишите своих — списком через запятую.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {SUPPLIER_SUGGESTIONS.map((supplier) => (
                  <label key={supplier} className={check}>
                    <input type="checkbox" name="suppliers" value={supplier} defaultChecked={chosenSuppliers.includes(supplier)} />
                    {supplier}
                  </label>
                ))}
              </div>
              <label className="grid gap-2 text-sm font-semibold">
                Свои поставщики
                <input
                  name="suppliersFree"
                  placeholder="Например: Роза Кордай, Тюльпан Астана"
                  defaultValue={chosenSuppliers.filter((name) => !SUPPLIER_SUGGESTIONS.includes(name)).join(', ')}
                  className={field}
                />
              </label>
            </fieldset>
          )}

          {step === 6 && (
            <fieldset className="grid gap-4">
              <legend className="text-xl font-bold">Сколько списаний вы считаете нормой?</legend>
              <p className="text-sm leading-6 text-muted-foreground">
                Ноль недостижим: магазин без списаний — это магазин с пустой витриной. Продукт поднимет тревогу, когда
                риск увядания выйдет за выбранную вами долю, и не будет дёргать вас раньше.
              </p>
              {TOLERANCE_LEVELS.map((level) => (
                <label key={level.bps} className="grid min-h-12 grid-cols-[auto_1fr] items-start gap-3 rounded-xl border border-border p-4">
                  <input
                    type="radio"
                    name="spoilageToleranceBps"
                    value={level.bps}
                    required
                    defaultChecked={(flower.spoilageToleranceBps ?? 800) === level.bps}
                    className="mt-1"
                  />
                  <span>
                    <span className="block text-sm font-semibold">{level.title}</span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">{level.hint}</span>
                  </span>
                </label>
              ))}

              <div className="mt-2">
                <p className="mb-1 text-sm font-semibold">С каких данных начнём?</p>
                <p className="mb-3 text-xs leading-5 text-muted-foreground">
                  По умолчанию магазин создаётся пустым: свои остатки, свои поставщики, своя история. Ничего чужого в нём
                  не появится.
                </p>
                {([
                  ['manual', 'Начать с чистого листа', 'Пустая витрина, пустой журнал. Всё наполнится вашими данными.'],
                  ['demo', 'Заполнить демонстрационными данными', 'Скопирует витрину демо-магазина — чужие остатки и чужих поставщиков. Только чтобы посмотреть продукт: магазин будет помечен DEMO, и это не ваши цифры.'],
                ] as const).map(([code, label, hint]) => (
                  <label key={code} className="mb-2 grid min-h-12 grid-cols-[auto_1fr] items-start gap-3 rounded-xl border border-border p-4">
                    <input type="radio" name="importMode" value={code} defaultChecked={(draft.importMode ?? 'manual') === code} required className="mt-1" />
                    <span>
                      <span className="block text-sm font-semibold">{label}</span>
                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">{hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <div className="mt-8 flex items-center justify-between gap-3">
            {step > 1 ? (
              <Link href={`/onboarding?step=${step - 1}`} className="inline-flex min-h-11 items-center rounded-xl border border-border px-5 text-sm font-bold">
                Назад
              </Link>
            ) : (
              <span />
            )}
            <button className="min-h-11 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground">
              {step === 6 ? 'Завершить настройку' : 'Сохранить и продолжить'}
            </button>
          </div>
        </form>

        <p className="mt-5 text-center text-xs leading-5 text-muted-foreground">
          Настройки хранятся в вашем магазине и не видны другим. Демонстрационные данные всегда помечены отдельно.
        </p>
      </div>
    </main>
  );
}
