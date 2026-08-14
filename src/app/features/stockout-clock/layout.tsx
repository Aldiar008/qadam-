import { createPageMetadata } from '@/lib/metadata';
export const metadata = createPageMetadata('Часы до нуля', 'Остаток во времени и разрыв между дефицитом и сроком поставки.', '/features/stockout-clock');
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
