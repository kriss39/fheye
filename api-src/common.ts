// Shared bits of the public API: JSON responses with CORS and caching, and error mapping.

import { CHAINS, type LensChain } from '../src/chains'
import { errorText } from '../cli/run'
import { toJson } from '../cli/format'

export const SITE = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL ?? 'fheye.vercel.app'}`

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'content-type',
}

/** A JSON response; bigints become decimal strings. `cache` is the CDN lifetime in seconds. */
export function json(data: unknown, status = 200, cache = 0): Response {
  return new Response(toJson(data), {
    status,
    headers: {
      ...CORS,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': cache ? `public, s-maxage=${cache}, stale-while-revalidate=${cache * 10}` : 'no-store',
    },
  })
}

export const preflight = () => new Response(null, { status: 204, headers: CORS })

export class BadRequest extends Error {}

export function chainParam(url: URL): LensChain | undefined {
  const key = url.searchParams.get('chain')
  if (!key) return undefined
  const chain = CHAINS.find((c) => c.key === key || String(c.id) === key)
  if (!chain) throw new BadRequest(`Unknown chain "${key}". Use one of: ${CHAINS.map((c) => c.key).join(', ')}.`)
  return chain
}

// A best-effort limit per client IP and function instance: cached responses never reach the
// function, so this only throttles clients hammering uncached lookups.
const LIMIT = 30
const WINDOW_MS = 60_000
const hits = new Map<string, { start: number; count: number }>()

export function rateLimited(request: Request, now = Date.now()): Response | null {
  const ip = (request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? 'unknown').split(',')[0].trim()
  const h = hits.get(ip)
  if (!h || now - h.start >= WINDOW_MS) {
    hits.set(ip, { start: now, count: 1 })
    if (hits.size > 10_000) hits.clear()
    return null
  }
  if (++h.count <= LIMIT) return null
  const retry = Math.ceil((h.start + WINDOW_MS - now) / 1000)
  const r = json({ error: `Too many requests: up to ${LIMIT} per minute. Try again in ${retry} s.` }, 429)
  r.headers.set('retry-after', String(retry))
  return r
}

/** Runs a handler (after the rate limit) and turns failures into JSON errors. */
export async function handle(fn: () => Promise<Response>, request?: Request): Promise<Response> {
  const limited = request && rateLimited(request)
  if (limited) return limited
  try {
    return await fn()
  } catch (e) {
    if (e instanceof BadRequest) return json({ error: e.message }, 400)
    const message = errorText(e)
    return json({ error: message }, /not found/i.test(message) ? 404 : 502)
  }
}
