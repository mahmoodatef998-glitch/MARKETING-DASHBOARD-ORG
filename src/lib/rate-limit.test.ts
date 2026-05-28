import { describe, it, expect } from 'vitest'
import { rateLimit } from './rate-limit'

describe('rateLimit', () => {
  const ip = `test-${Math.random()}`

  it('allows requests within limit', () => {
    const r = rateLimit(ip, { limit: 5, window: 60_000 })
    expect(r.ok).toBe(true)
    expect(r.remaining).toBe(4)
  })

  it('blocks after limit exceeded', () => {
    const testIp = `block-${Math.random()}`
    for (let i = 0; i < 3; i++) rateLimit(testIp, { limit: 3, window: 60_000 })
    const r = rateLimit(testIp, { limit: 3, window: 60_000 })
    expect(r.ok).toBe(false)
    expect(r.remaining).toBe(0)
  })

  it('tracks remaining correctly', () => {
    const testIp = `track-${Math.random()}`
    const r1 = rateLimit(testIp, { limit: 10, window: 60_000 })
    expect(r1.remaining).toBe(9)
    const r2 = rateLimit(testIp, { limit: 10, window: 60_000 })
    expect(r2.remaining).toBe(8)
  })
})
