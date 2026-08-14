import type { MetadataRoute } from 'next';
import { siteConfig } from '@/config/site';

const routes = ['/', '/platform', '/features', '/features/decision-contract', '/features/stockout-clock', '/features/local-pulse', '/features/supplier-compare', '/features/split-order', '/features/messenger-stock', '/features/community-trust', '/features/what-if', '/features/impact-ledger', '/solutions', '/solutions/flower-shop', '/solutions/holidays', '/solutions/freshness', '/solutions/packaging', '/solutions/chain', '/pricing', '/demo', '/about', '/contact', '/login', '/signup', '/privacy', '/terms'];
export default function sitemap(): MetadataRoute.Sitemap { return routes.map((route) => ({ url: siteConfig.url + route, lastModified: new Date(), changeFrequency: route === '/' ? 'weekly' : 'monthly', priority: route === '/' ? 1 : 0.7 })); }
