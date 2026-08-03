/** Shape of `public.loyalty_card`, shared by every guest screen. */
export interface GuestCard {
  business: { name: string; isDemo: boolean; currency: string };
  card: null | {
    stamps: number;
    points: number;
    reward: null | { id: string; nameRu: string; costStamps: number; costPoints: number; remainingStamps: number; reachable: boolean };
  };
  visits: { occurredAt: string; amountMinor: number }[];
  menu: { name: string; nameKk: string | null; priceMinor: number }[];
  offers: { slug: string; title: string; summary: string | null }[];
  marketingConsent: boolean;
}

export const money = (minor: number | null | undefined) =>
  minor === null || minor === undefined ? '—' : `${Number(minor).toLocaleString('ru-RU')} ₸`;

export const day = (iso: string) =>
  new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
