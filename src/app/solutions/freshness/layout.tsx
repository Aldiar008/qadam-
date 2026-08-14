import { createPageMetadata } from '@/lib/metadata';
export const metadata = createPageMetadata('QOR для скоропортящегося ассортимента', 'Радар считает, сколько из партии успеет продаться до срока, и режет заказ до того, что доживёт.', '/solutions/freshness');
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
