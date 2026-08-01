import { createPageMetadata } from '@/lib/metadata';
export const metadata = createPageMetadata('Создать аккаунт', 'Демонстрационная регистрация бизнеса в QADAM.', '/signup');
// See src/app/login/layout.tsx: keeps demo affordances out of PRODUCTION_MODE.
export const dynamic = 'force-dynamic';
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
