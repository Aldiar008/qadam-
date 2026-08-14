import { createPageMetadata } from '@/lib/metadata';
export const metadata = createPageMetadata('Рейтинг поставщиков', 'Обезличенная статистика поставок: кто привозит вовремя и полностью.', '/nearby');
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
