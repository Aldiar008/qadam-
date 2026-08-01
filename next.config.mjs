/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Do not advertise the framework and its version to every visitor.
  poweredByHeader: false,
  images: {
    formats: ['image/avif', 'image/webp'],
  },
};

export default nextConfig;
