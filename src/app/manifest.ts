import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest { return { name: 'QADAM Growth OS', short_name: 'QADAM', description: 'AI-маркетолог в кармане для локального бизнеса', start_url: '/', display: 'standalone', background_color: '#FAF9F5', theme_color: '#0F766E', icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }] }; }
