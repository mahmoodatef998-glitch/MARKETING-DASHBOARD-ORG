import type { NextConfig } from 'next'

const securityHeaders = [
  { key: 'X-Content-Type-Options',   value: 'nosniff' },
  { key: 'X-Frame-Options',          value: 'DENY' },
  { key: 'X-XSS-Protection',         value: '1; mode=block' },
  { key: 'Referrer-Policy',          value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',       value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self'",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.cloudinary.com https://res.cloudinary.com",
      "frame-ancestors 'none'",
    ].join('; '),
  },
]

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
}

// Only wrap with Sentry when properly configured — prevents build/runtime failures
// when SENTRY_ORG / SENTRY_PROJECT env vars are absent (e.g. local dev, new deploys)
const hasSentry =
  process.env.SENTRY_ORG &&
  !process.env.SENTRY_ORG.includes('your-') &&
  process.env.SENTRY_PROJECT &&
  !process.env.SENTRY_PROJECT.includes('your-')

if (hasSentry) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { withSentryConfig } = require('@sentry/nextjs')
  module.exports = withSentryConfig(nextConfig, {
    silent: true,
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    disableLogger: true,
    tunnelRoute: '/monitoring',
  })
} else {
  module.exports = nextConfig
}
