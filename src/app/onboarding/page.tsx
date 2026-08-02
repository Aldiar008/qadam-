import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/brand/Logo';
import { requireBusinessContext } from '@/server/qadam/repository';
import { saveOnboardingStep } from './actions';

export const dynamic = 'force-dynamic';

type OnboardingDraft = Record<string, unknown> & {
  businessName?: string;
  businessType?: string;
  businessSize?: string;
  location?: {capacity?: number; name?: string; city?: string; district?: string; address?: string};
  goals?: string[];
  economics?: {averageCheckMinor?: number; marginFloorBps?: number; budgetMinor?: number};
  channels?: string[];
  brandVoice?: string;
  importMode?: string;
};

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ step?: string; saved?: string }> }) {
  // "Not signed in" and "signed in with no business" are different states, and
  // sending both to /login turned the second one into a loop: the sign-in
  // succeeds, routing sends the person back to /onboarding, and it bounces
  // again. Someone with an account but no business needs the form that creates
  // one, not the form they just used.
  const ctx = await requireBusinessContext().catch((error: unknown) => error as Error);
  if (ctx instanceof Error) {
    redirect(ctx.message === 'MEMBERSHIP_REQUIRED' ? '/signup?message=no_business' : '/login?next=/onboarding');
  }
  if (ctx.role !== 'owner') redirect('/app/today');
  let { data: session } = await ctx.supabase.from('onboarding_sessions').select('id,current_step,draft,status,optimistic_version').eq('business_id', ctx.businessId).eq('user_id', ctx.userId).maybeSingle();
  if (!session) {
    const created = await ctx.supabase.from('onboarding_sessions').insert({ business_id: ctx.businessId, user_id: ctx.userId, is_mock: false }).select('id,current_step,draft,status,optimistic_version').single();
    if (created.error) throw created.error;
    session = created.data;
  }
  if (session.status === 'completed') redirect('/app/today');
  const params = await searchParams;
  const step = Math.max(1, Math.min(6, Number(params.step ?? session.current_step)));
  const draft = session.draft as OnboardingDraft;
  const field = 'min-h-12 w-full rounded-xl border border-border bg-surface-muted px-4 text-sm outline-none focus:ring-2 focus:ring-primary';
  return <main id="main-content" className="min-h-[100dvh] bg-background px-4 py-8 sm:py-12">
    <div className="mx-auto max-w-2xl"><Logo size="md" /><div className="mt-8 flex items-center justify-between"><div><p className="font-mono text-xs text-muted-foreground">Шаг {step} из 6</p><h1 className="mt-2 text-3xl font-extrabold">Настроим QADAM под ваш бизнес</h1></div><span className="rounded-full bg-primary/10 px-3 py-2 text-xs font-bold text-primary">Автосохранение</span></div>
    <div className="mt-6 grid grid-cols-6 gap-2" aria-label={`Прогресс: шаг ${step} из 6`}>{[1,2,3,4,5,6].map((item) => <div key={item} className={'h-1.5 rounded-full ' + (item <= step ? 'bg-primary' : 'bg-border')} />)}</div>
    {params.saved && <p role="status" className="mt-4 rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800">Данные сохранены на сервере.</p>}
    <form action={saveOnboardingStep} className="mt-6 rounded-3xl border border-border bg-surface p-6 shadow-xl sm:p-8">
      <input type="hidden" name="sessionId" value={session.id} /><input type="hidden" name="step" value={step} />
      {step === 1 && <fieldset className="grid gap-5"><legend className="text-xl font-bold">Чем вы занимаетесь?</legend><label className="grid gap-2 text-sm font-semibold">Название<input name="businessName" required defaultValue={String(draft.businessName ?? ctx.business.name)} className={field} /></label><label className="grid gap-2 text-sm font-semibold">Тип бизнеса<select name="businessType" defaultValue={String(draft.businessType ?? 'cafe')} className={field}><option value="cafe">Кофейня</option><option value="beauty">Салон красоты</option><option value="retail">Магазин</option><option value="service">Сервисный центр</option></select></label></fieldset>}
      {step === 2 && <fieldset className="grid gap-5"><legend className="text-xl font-bold">Размер и точки</legend><label className="grid gap-2 text-sm font-semibold">Структура<select name="businessSize" defaultValue={String(draft.businessSize ?? 'single_location')} className={field}><option value="single_location">Одна точка</option><option value="multi_location">Несколько точек</option></select></label><label className="grid gap-2 text-sm font-semibold">Вместимость основной точки<input name="capacity" type="number" min="1" required defaultValue={draft.location?.capacity ?? 38} className={field} /></label></fieldset>}
      {step === 3 && <fieldset className="grid gap-5"><legend className="text-xl font-bold">Где вы работаете?</legend><label className="grid gap-2 text-sm font-semibold">Название точки<input name="locationName" required defaultValue={draft.location?.name ?? 'Основная точка'} className={field} /></label><div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm font-semibold">Город<input name="city" required defaultValue={draft.location?.city ?? 'Алматы'} className={field} /></label><label className="grid gap-2 text-sm font-semibold">Район<input name="district" required defaultValue={draft.location?.district ?? 'Бостандыкский'} className={field} /></label></div><label className="grid gap-2 text-sm font-semibold">Адрес<input name="address" defaultValue={draft.location?.address ?? ''} className={field} /></label></fieldset>}
      {step === 4 && <fieldset className="grid gap-4"><legend className="text-xl font-bold">Главная цель</legend>{[['reactivate','Вернуть спящих клиентов'],['acquire','Привлечь новых'],['average_check','Повысить средний чек'],['quiet_hours','Заполнить тихие часы']].map(([code,label]) => <label key={code} className="flex min-h-12 items-center gap-3 rounded-xl border border-border px-4"><input type="radio" name="goal" value={code} defaultChecked={(draft.goals?.[0] ?? 'reactivate') === code} required />{label}</label>)}</fieldset>}
      {step === 5 && <fieldset className="grid gap-5"><legend className="text-xl font-bold">Экономика и ограничения</legend><label className="grid gap-2 text-sm font-semibold">Средний чек, ₸<input name="averageCheckMinor" type="number" min="1" required defaultValue={draft.economics?.averageCheckMinor ?? 3450} className={field} /></label><label className="grid gap-2 text-sm font-semibold">Минимальная маржа, %<input name="marginFloorPercent" type="number" min="0" max="100" required defaultValue={(draft.economics?.marginFloorBps ?? 4200) / 100} className={field} /></label><label className="grid gap-2 text-sm font-semibold">Месячный бюджет, ₸<input name="budgetMinor" type="number" min="0" required defaultValue={draft.economics?.budgetMinor ?? 100000} className={field} /></label></fieldset>}
      {step === 6 && <fieldset className="grid gap-5"><legend className="text-xl font-bold">Каналы и стартовые данные</legend><div><p className="mb-2 text-sm font-semibold">Каналы</p><div className="grid grid-cols-2 gap-2">{['whatsapp','telegram','email','instagram'].map((channel) => <label key={channel} className="flex min-h-11 items-center gap-2 rounded-xl border border-border px-3"><input type="checkbox" name="channels" value={channel} defaultChecked={(draft.channels ?? ['whatsapp']).includes(channel)} />{channel}</label>)}</div></div><label className="grid gap-2 text-sm font-semibold">Тон бренда<input name="brandVoice" defaultValue={String(draft.brandVoice ?? 'дружелюбный и конкретный')} className={field} /></label><div><p className="mb-2 text-sm font-semibold">Как начнём?</p>{[['demo','Загрузить DEMO DATA TAMYR'],['csv','Импортировать CSV после настройки'],['manual','Начать вручную']].map(([code,label]) => <label key={code} className="mb-2 flex min-h-12 items-center gap-3 rounded-xl border border-border px-4"><input type="radio" name="importMode" value={code} defaultChecked={(draft.importMode ?? 'demo') === code} required />{label}</label>)}</div><input type="hidden" name="dataSources" value="onboarding" /></fieldset>}
      <div className="mt-8 flex items-center justify-between gap-3">{step > 1 ? <Link href={`/onboarding?step=${step-1}`} className="inline-flex min-h-11 items-center rounded-xl border border-border px-5 text-sm font-bold">Назад</Link> : <span /> }<button className="min-h-11 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground">{step === 6 ? 'Завершить настройку' : 'Сохранить и продолжить'}</button></div>
    </form><p className="mt-5 text-center text-xs leading-5 text-muted-foreground">QADAM хранит настройки в вашем tenant. DEMO DATA всегда маркируются отдельно.</p></div>
  </main>;
}
