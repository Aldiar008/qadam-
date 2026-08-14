import { createPageMetadata } from '@/lib/metadata';
export const metadata = createPageMetadata('Сравнение поставщиков', 'Цена, срок, надёжность, минимальная партия и условия в одной оценке.', '/features/supplier-compare');
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
