import { createPageMetadata } from '@/lib/metadata';
export const metadata = createPageMetadata('Демо', 'Откройте QADAM на демонстрационных данных.', '/demo');
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
