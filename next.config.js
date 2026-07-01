/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.resolve.fallback = { ...config.resolve.fallback, '@opentelemetry/api': false }
    return config
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverComponentsExternalPackages: ['@react-pdf/renderer'],
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },
  async headers() {
    return [
      {
        // Applies to every route, including pages and API routes. Pages here
        // are 'use client' components with no dynamic server data fetch, so
        // Next/Vercel can statically optimize the HTML shell — without this,
        // the CDN and browser cache that shell indefinitely, so a new deploy
        // (new JS chunk hashes, new features like Realtime) never reaches an
        // already-open tab until a hard refresh. `must-revalidate` still lets
        // the browser use a 304-validated cache hit when nothing changed, so
        // this isn't "never cache" — just "never serve without asking first."
        // The two more specific rules below override this for what SHOULD
        // be cached long-term (hashed static assets, since a new build gets
        // new filenames anyway, and sw.js, which needs its own no-store rule
        // for the service-worker update check to see changes at all).
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options',           value: 'DENY' },
          { key: 'X-Content-Type-Options',     value: 'nosniff' },
          { key: 'Referrer-Policy',            value: 'strict-origin-when-cross-origin' },
          { key: 'X-XSS-Protection',           value: '1; mode=block' },
          { key: 'Permissions-Policy',         value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Cache-Control',              value: 'no-cache, must-revalidate' },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Type',  value: 'application/javascript; charset=utf-8' },
        ],
      },
      // Dev-server chunk paths aren't content-hashed like prod build output, so
      // an immutable 1-year cache here would make the browser ignore code edits.
      ...(process.env.NODE_ENV === 'production' ? [{
        source: '/_next/static/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      }] : []),
    ]
  },
}

module.exports = nextConfig
