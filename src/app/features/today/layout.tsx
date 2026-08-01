import { createPageMetadata } from '@/lib/metadata';
export const metadata = createPageMetadata('QADAM Today', 'Одно наиболее выгодное и безопасное действие для бизнеса сегодня.', '/features/today');
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
