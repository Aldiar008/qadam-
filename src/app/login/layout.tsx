import { createPageMetadata } from '@/lib/metadata';
export const metadata = createPageMetadata('Войти', 'Демонстрационный вход в кабинет QOR.', '/login');
// Demo tenant availability is deployment configuration read in the root layout.
// Without this the auth pages prerender at build time and keep the demo login
// button visible on installations where demo tenants are disabled.
export const dynamic = 'force-dynamic';
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
