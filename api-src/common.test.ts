import { describe, expect, it } from 'vitest'
import { rateLimited } from './common'

describe('rateLimited', () => {
  it('lets 30 requests a minute through per IP, then answers 429 with Retry-After', () => {
    const req = (ip: string) => new Request('https://x/api/tx/0x', { headers: { 'x-forwarded-for': `${ip}, 10.0.0.1` } })
    const t0 = 1_000_000
    for (let i = 0; i < 30; i++) expect(rateLimited(req('1.1.1.1'), t0 + i)).toBeNull()
    const blocked = rateLimited(req('1.1.1.1'), t0 + 100)
    expect(blocked?.status).toBe(429)
    expect(blocked?.headers.get('retry-after')).toBe('60')
    expect(rateLimited(req('2.2.2.2'), t0 + 100)).toBeNull() // other clients are unaffected
    expect(rateLimited(req('1.1.1.1'), t0 + 60_000)).toBeNull() // a new window
  })
})
