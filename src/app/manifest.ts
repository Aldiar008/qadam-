import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest { return { name: 'QOR Autopilot', short_name: 'QOR', description: 'Автопилот снабжения для малого офлайн-бизнеса', start_url: '/', display: 'standalone', background_color: '#FAF9F5', theme_color: '#0F766E', icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }] }; }
