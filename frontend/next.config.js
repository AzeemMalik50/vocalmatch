/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
  // lucide-react ships every icon as a discrete module; this flag lets
  // Next.js rewrite barrel imports to direct ones, trimming a few dozen
  // kB off the client bundle without any source changes.
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
};
module.exports = nextConfig;
