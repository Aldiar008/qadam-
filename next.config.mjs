/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Do not advertise the framework and its version to every visitor.
  poweredByHeader: false,
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  env: {
    QADAM_DEMO_TENANTS_ENABLED: process.env.QADAM_DEMO_TENANTS_ENABLED ?? 'true',
  },
};

export default nextConfig;
