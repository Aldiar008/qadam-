import type { MetadataRoute } from 'next';
import { siteConfig } from '@/config/site';

const routes = ['/', '/platform', '/features', '/features/qr-loyalty', '/features/today', '/features/ai-campaigns', '/features/simulator', '/features/margin-shield', '/features/growth-contract', '/features/content-studio', '/features/analytics', '/nearby', '/solutions', '/solutions/cafe', '/solutions/beauty', '/solutions/retail', '/solutions/service-center', '/pricing', '/demo', '/about', '/contact', '/login', '/signup', '/privacy', '/terms'];
export default function sitemap(): MetadataRoute.Sitemap { return routes.map((route) => ({ url: siteConfig.url + route, lastModified: new Date(), changeFrequency: route === '/' ? 'weekly' : 'monthly', priority: route === '/' ? 1 : 0.7 })); }
