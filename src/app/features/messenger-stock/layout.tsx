import { createPageMetadata } from '@/lib/metadata';
export const metadata = createPageMetadata('Остатки из чата', 'Сообщение, голос или фото превращаются в остаток после подтверждения человеком.', '/features/messenger-stock');
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
