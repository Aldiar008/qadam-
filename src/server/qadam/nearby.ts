import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Public "Акции рядом" discovery.
 *
 * PostGIS is not installed in this project, so proximity is computed from the
 * already privacy-rounded latitude/longitude on the offer with a haversine
 * distance, and district remains the primary filter. Rounded coordinates are
 * the only location data that exists here: no customer coordinate is stored,
 * requested or published anywhere in this path.
 */

export interface NearbyFilters {
  city?: string;
  district?: string;
  category?: string;
  /** Visitor-supplied and optional. Never persisted. */
  lat?: number;
  lng?: number;
  radiusKm?: number;
}

export interface PublicOffer {
  id: string;
  publicSlug: string | null;
  businessName: string;
  city: string | null;
  district: string | null;
  category: string;
  titleRu: string;
  titleKk: string;
  descriptionRu: string | null;
  descriptionKk: string | null;
  termsRu: string | null;
  termsKk: string | null;
  expiresAt: string | null;
  publishedAt: string | null;
  trackingCode: string | null;
  isMock: boolean;
  distanceKm: number | null;
}

export const OFFER_CATEGORIES = [
  { code: 'coffee', label: 'Кофе и завтраки' },
  { code: 'beauty', label: 'Красота' },
  { code: 'retail', label: 'Магазины' },
  { code: 'service', label: 'Сервис' },
  { code: 'food', label: 'Еда' },
  { code: 'other', label: 'Другое' },
] as const;

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Reads through the service client because the storefront is anonymous, and
 * then applies the publication rules explicitly. Only published, unexpired,
 * budget-valid offers from active businesses are ever returned.
 */
export async function listPublicOffers(filters: NearbyFilters): Promise<{ offers: PublicOffer[]; districts: string[]; total: number }> {
  const db = createAdminClient();
  const nowIso = new Date().toISOString();

  let query = db.from('nearby_offers')
    .select('id,business_id,location_id,public_slug,category,title_ru,title_kk,description_ru,description_kk,terms_ru,terms_kk,district,latitude_rounded,longitude_rounded,expires_at,published_at,budget_minor,budget_spent_minor,tracking_code_id,is_mock')
    .eq('status', 'published')
    .not('published_at', 'is', null)
    .order('published_at', { ascending: false })
    .limit(120);

  if (filters.district) query = query.eq('district', filters.district);
  if (filters.category) query = query.eq('category', filters.category);

  const { data: rows } = await query;
  const candidates = (rows ?? []).filter((row) => {
    if (row.expires_at && new Date(row.expires_at) <= new Date(nowIso)) return false;
    // A published offer whose budget is spent is no longer a live offer.
    if (Number(row.budget_minor) > 0 && Number(row.budget_spent_minor) >= Number(row.budget_minor)) return false;
    return true;
  });

  const businessIds = [...new Set(candidates.map((row) => row.business_id))];
  const locationIds = [...new Set(candidates.map((row) => row.location_id).filter(Boolean))] as string[];
  const trackingIds = [...new Set(candidates.map((row) => row.tracking_code_id).filter(Boolean))] as string[];

  const [{ data: businesses }, { data: locations }, { data: codes }] = await Promise.all([
    businessIds.length ? db.from('businesses').select('id,name,status').in('id', businessIds) : Promise.resolve({ data: [] }),
    locationIds.length ? db.from('business_locations').select('id,city,district').in('id', locationIds) : Promise.resolve({ data: [] }),
    trackingIds.length ? db.from('tracking_codes').select('id,public_code').in('id', trackingIds) : Promise.resolve({ data: [] }),
  ]);

  const activeBusinesses = new Map((businesses ?? []).filter((row) => row.status === 'active').map((row) => [row.id, row.name]));

  const offers = candidates
    .filter((row) => activeBusinesses.has(row.business_id))
    .map((row) => {
      const location = (locations ?? []).find((item) => item.id === row.location_id);
      const distanceKm = filters.lat != null && filters.lng != null && row.latitude_rounded != null && row.longitude_rounded != null
        ? haversineKm(filters.lat, filters.lng, Number(row.latitude_rounded), Number(row.longitude_rounded))
        : null;
      return {
        id: row.id,
        publicSlug: row.public_slug,
        businessName: activeBusinesses.get(row.business_id) ?? '',
        city: location?.city ?? null,
        district: row.district ?? location?.district ?? null,
        category: row.category,
        titleRu: row.title_ru,
        titleKk: row.title_kk,
        descriptionRu: row.description_ru,
        descriptionKk: row.description_kk,
        termsRu: row.terms_ru,
        termsKk: row.terms_kk,
        expiresAt: row.expires_at,
        publishedAt: row.published_at,
        trackingCode: (codes ?? []).find((item) => item.id === row.tracking_code_id)?.public_code ?? null,
        isMock: row.is_mock,
        distanceKm,
      } satisfies PublicOffer;
    })
    .filter((offer) => {
      if (filters.city && offer.city && offer.city.toLowerCase() !== filters.city.toLowerCase()) return false;
      if (filters.radiusKm != null && offer.distanceKm != null) return offer.distanceKm <= filters.radiusKm;
      return true;
    })
    .sort((a, b) => (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY));

  const districts = [...new Set(candidates.map((row) => row.district).filter(Boolean))] as string[];
  return { offers: offers.slice(0, 60), districts: districts.sort(), total: offers.length };
}

export async function getPublicOffer(slug: string): Promise<PublicOffer | null> {
  const { offers } = await listPublicOffers({});
  return offers.find((offer) => offer.publicSlug === slug) ?? null;
}

/**
 * Records an intent event. A view, click or save is explicitly *not* a visit:
 * a visit requires a verified QR scan or redemption, which arrives through the
 * loyalty and provider-event paths instead.
 */
export async function recordOfferIntent(offerId: string, kind: 'view' | 'click' | 'save' | 'visit_intent', requestKey: string): Promise<void> {
  const db = createAdminClient();
  const { data: offer } = await db.from('nearby_offers').select('id,business_id,district,is_mock').eq('id', offerId).maybeSingle();
  if (!offer) return;
  await db.from('nearby_offer_events').insert({
    business_id: offer.business_id,
    nearby_offer_id: offer.id,
    event_kind: kind,
    request_key: requestKey,
    coarse_district: offer.district,
    is_mock: offer.is_mock,
  });
}
