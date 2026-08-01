import { createHash } from 'node:crypto';
import Image from 'next/image';
import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import QRCode from 'qrcode';

import { DemoBadge } from '@/components/common/DemoBadge';
import { GlobalHeader } from '@/components/navigation/GlobalHeader';
import { Footer } from '@/components/navigation/Footer';
import { getPublicOffer, recordOfferIntent } from '@/server/qadam/nearby';

export const dynamic = 'force-dynamic';

/**
 * Public campaign page for one offer.
 *
 * The view is recorded as an intent event keyed on a coarse request hash. It is
 * never counted as a visit: a visit requires a verified QR scan or a redemption,
 * both of which arrive through separate, signed paths.
 */
export default async function PublicOfferPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const offer = await getPublicOffer(slug);
  if (!offer) notFound();

  const headerList = await headers();
  const ipHint = headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  const dayBucket = new Date().toISOString().slice(0, 10);
  // Coarse and salted: enough to deduplicate a refresh, not enough to identify anyone.
  const requestKey = createHash('sha256').update(`${slug}:${ipHint}:${dayBucket}`).digest('hex').slice(0, 32);
  await recordOfferIntent(offer.id, 'view', requestKey);

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const offerUrl = `${origin}/nearby/${slug}`;
  const qrImage = await QRCode.toDataURL(offerUrl, { width: 260, margin: 2, errorCorrectionLevel: 'M' });

  return (
    <div className="min-h-screen bg-background">
      <GlobalHeader />
      <main id="main-content" className="mx-auto max-w-3xl px-4 pb-20 pt-28 sm:px-6">
        <Link href="/nearby" className="inline-flex min-h-11 items-center text-sm font-bold text-primary">← Все акции рядом</Link>

        <article className="mt-6 rounded-3xl border border-border bg-surface p-6 sm:p-8">
          {offer.isMock && <DemoBadge label="DEMO DATA" />}
          <p className="mt-3 text-xs font-bold text-primary">
            {offer.businessName}
            {offer.city && ` · ${offer.city}`}
            {offer.district && ` · ${offer.district}`}
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight">{offer.titleRu}</h1>
          <p className="mt-1 text-lg text-muted-foreground" lang="kk">{offer.titleKk}</p>

          {offer.descriptionRu && <p className="mt-5 text-sm leading-6">{offer.descriptionRu}</p>}
          {offer.descriptionKk && <p className="mt-2 text-sm leading-6 text-muted-foreground" lang="kk">{offer.descriptionKk}</p>}

          <div className="mt-6 grid gap-6 sm:grid-cols-[260px_1fr]">
            <Image
              src={qrImage}
              alt={`QR-код предложения «${offer.titleRu}» в ${offer.businessName}`}
              width={260}
              height={260}
              unoptimized
              className="rounded-2xl bg-white shadow-md"
            />
            <div className="space-y-3 text-sm">
              {offer.trackingCode && (
                <p>
                  <span className="font-semibold">Код на кассе:</span>{' '}
                  <span className="font-mono text-primary">{offer.trackingCode}</span>
                </p>
              )}
              <p>
                <span className="font-semibold">Действует до:</span>{' '}
                {offer.expiresAt ? new Date(offer.expiresAt).toLocaleDateString('ru-RU') : 'отмены'}
              </p>
              <p className="text-xs text-muted-foreground">
                Посещение засчитывается только по сканированию QR или подтверждённому погашению на кассе.
                Просмотр этой страницы не считается визитом.
              </p>
            </div>
          </div>

          {(offer.termsRu || offer.termsKk) && (
            <section className="mt-6 rounded-2xl bg-surface-muted p-4">
              <h2 className="text-sm font-bold">Условия</h2>
              {offer.termsRu && <p className="mt-2 text-xs leading-5 text-muted-foreground">{offer.termsRu}</p>}
              {offer.termsKk && <p className="mt-2 text-xs leading-5 text-muted-foreground" lang="kk">{offer.termsKk}</p>}
            </section>
          )}
        </article>
      </main>
      <Footer />
    </div>
  );
}
