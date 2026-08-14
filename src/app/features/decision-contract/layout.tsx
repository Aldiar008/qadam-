import { createPageMetadata } from '@/lib/metadata';
export const metadata = createPageMetadata('Карточка решения', 'Готовое решение с количеством, поставщиком, доказательствами и одним подтверждением.', '/features/decision-contract');
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
