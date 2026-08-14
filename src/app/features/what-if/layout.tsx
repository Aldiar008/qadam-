import { createPageMetadata } from '@/lib/metadata';
export const metadata = createPageMetadata('Симулятор сценариев', 'Что будет с остатком, если спрос вырастет или поставка опоздает.', '/features/what-if');
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
