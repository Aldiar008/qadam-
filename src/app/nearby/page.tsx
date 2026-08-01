import Link from 'next/link';
import { MapPin } from 'lucide-react';

import { DemoBadge } from '@/components/common/DemoBadge';
import { GlobalHeader } from '@/components/navigation/GlobalHeader';
import { Footer } from '@/components/navigation/Footer';
import { OFFER_CATEGORIES, listPublicOffers } from '@/server/qadam/nearby';

export const dynamic = 'force-dynamic';

export default async function NearbyPage({
  searchParams,
}: {
  searchParams: Promise<{ city?: string; district?: string; category?: string; lat?: string; lng?: string; radius?: string }>;
}) {
  const params = await searchParams;
  const lat = params.lat ? Number(params.lat) : undefined;
  const lng = params.lng ? Number(params.lng) : undefined;
  const radiusKm = params.radius ? Number(params.radius) : undefined;
  const hasLocation = lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng);

  let result: Awaited<ReturnType<typeof listPublicOffers>> | null = null;
  let failed = false;
  try {
    result = await listPublicOffers({
      city: params.city,
      district: params.district,
      category: params.category,
      lat: hasLocation ? lat : undefined,
      lng: hasLocation ? lng : undefined,
      radiusKm: hasLocation && radiusKm != null && Number.isFinite(radiusKm) ? radiusKm : undefined,
    });
  } catch {
    failed = true;
  }

  return (
    <div className="min-h-screen bg-background">
      <GlobalHeader />
      <main id="main-content" className="mx-auto max-w-6xl px-4 pb-20 pt-28 sm:px-6">
        <header>
          <h1 className="text-4xl font-extrabold tracking-tight">Акции рядом</h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Только опубликованные и действующие предложения ближайших заведений. Координаты заведений
            округлены, а ваше местоположение нигде не сохраняется.
          </p>
        </header>

        <form className="mt-6 grid gap-3 rounded-3xl border border-border bg-surface p-4 sm:grid-cols-4">
          <label className="grid gap-1 text-sm font-semibold">
            Город
            <input name="city" defaultValue={params.city} placeholder="Алматы" className="min-h-11 rounded-xl border border-border bg-surface-muted px-3" />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Район
            <input name="district" defaultValue={params.district} placeholder="Медеуский" className="min-h-11 rounded-xl border border-border bg-surface-muted px-3" />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Категория
            <select name="category" defaultValue={params.category ?? ''} className="min-h-11 rounded-xl border border-border bg-surface-muted px-3">
              <option value="">Все</option>
              {OFFER_CATEGORIES.map((category) => <option key={category.code} value={category.code}>{category.label}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Радиус, км
            <input name="radius" type="number" min="1" max="50" defaultValue={params.radius} placeholder="5" className="min-h-11 rounded-xl border border-border bg-surface-muted px-3" />
          </label>
          <div className="flex gap-2 sm:col-span-4">
            <button className="min-h-11 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground">Найти</button>
            <Link href="/nearby" className="inline-flex min-h-11 items-center rounded-xl border border-border px-4 text-sm font-bold">Сбросить</Link>
          </div>
        </form>

        {!hasLocation && (
          <p className="mt-4 rounded-2xl border border-border bg-surface-muted p-4 text-sm text-muted-foreground">
            <MapPin className="mr-2 inline size-4" aria-hidden="true" />
            Местоположение не передано, поэтому расстояние не рассчитывается — работает поиск по городу,
            району и категории. Это осознанный запасной путь, а не ошибка.
          </p>
        )}

        {failed ? (
          <div role="alert" className="mt-8 rounded-3xl border border-rose-500/30 bg-rose-500/5 p-10 text-center">
            <h2 className="text-lg font-bold text-rose-800">Не удалось загрузить предложения</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-rose-900">Попробуйте обновить страницу через минуту.</p>
          </div>
        ) : result && result.offers.length ? (
          <>
            <p className="mt-6 text-sm text-muted-foreground">Найдено предложений: {result.total}</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {result.offers.map((offer) => (
                <article key={offer.id} className="rounded-3xl border border-border bg-surface p-6">
                  {offer.isMock && <DemoBadge label="DEMO DATA" />}
                  <p className="mt-3 text-xs font-bold text-primary">
                    {offer.businessName}
                    {offer.district && ` · ${offer.district}`}
                    {offer.distanceKm != null && ` · ${offer.distanceKm.toFixed(1)} км`}
                  </p>
                  <h2 className="mt-2 text-xl font-bold">{offer.titleRu}</h2>
                  <p className="mt-1 text-sm text-muted-foreground" lang="kk">{offer.titleKk}</p>
                  {offer.descriptionRu && <p className="mt-3 text-sm leading-6 text-muted-foreground">{offer.descriptionRu}</p>}
                  <p className="mt-4 text-xs text-muted-foreground">
                    Действует до {offer.expiresAt ? new Date(offer.expiresAt).toLocaleDateString('ru-RU') : 'отмены'}.
                  </p>
                  {offer.publicSlug && (
                    <Link
                      href={`/nearby/${offer.publicSlug}`}
                      className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground"
                    >
                      Открыть предложение
                    </Link>
                  )}
                </article>
              ))}
            </div>
          </>
        ) : (
          <div className="mt-8 rounded-3xl border border-dashed border-border p-10 text-center">
            <h2 className="text-lg font-bold">Здесь пока нет предложений</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              По заданным условиям ничего не найдено. Попробуйте убрать фильтр района или расширить радиус.
            </p>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
