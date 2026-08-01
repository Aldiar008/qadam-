import { createPageMetadata } from '@/lib/metadata';
export const metadata = createPageMetadata('Войти', 'Демонстрационный вход в кабинет QADAM.', '/login');
// QADAM_APP_MODE is deploy-time configuration read in the root layout. Without this
// the auth pages prerender at build time and keep the demo login button visible in
// PRODUCTION_MODE, where the action itself is refused.
export const dynamic = 'force-dynamic';
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
