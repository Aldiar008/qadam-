import type { Metadata } from 'next';
import { siteConfig } from '@/config/site';
export function createPageMetadata(title: string, description: string, path: string): Metadata {
  const url = siteConfig.url + path;
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, url, siteName: siteConfig.name, locale: 'ru_RU', type: 'website' }, twitter: { card: 'summary_large_image', title, description } };
}
