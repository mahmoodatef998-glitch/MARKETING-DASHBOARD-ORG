// In-memory rate limiter — works per-instance (suitable for single Vercel deployment)
// Key: IP address, Value: { count, resetAt }

interface RateEntry { count: number; resetAt: number }

const store = new Map<string, RateEntry>()

export interface RateLimitOptions {
  limit: number   // max requests
  window: number  // window in ms
}

export function rateLimit(ip: string, opts: RateLimitOptions): { ok: boolean; remaining: number } {
  const now = Date.now()
  const entry = store.get(ip)

  if (!entry || now > entry.resetAt) {
    store.set(ip, { count: 1, resetAt: now + opts.window })
    return { ok: true, remaining: opts.limit - 1 }
  }

  if (entry.count >= opts.limit) {
    return { ok: false, remaining: 0 }
  }

  entry.count++
  return { ok: true, remaining: opts.limit - entry.count }
}

// Purge stale entries every 5 minutes to prevent memory leak
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of store.entries()) {
      if (now > entry.resetAt) store.delete(key)
    }
  }, 5 * 60 * 1000)
}
