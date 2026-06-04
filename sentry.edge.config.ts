import * as Sentry from '@sentry/nextjs'

const dsn = process.env.SENTRY_DSN
if (dsn && !dsn.includes('xxx')) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
  })
}
