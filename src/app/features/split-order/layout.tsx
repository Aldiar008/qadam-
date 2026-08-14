import { createPageMetadata } from '@/lib/metadata';
export const metadata = createPageMetadata('Разделение заказа', 'Срочная часть у быстрого поставщика, основная — у выгодного.', '/features/split-order');
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
