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

/** Runs a handler and turns failures into JSON errors. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof BadRequest) return json({ error: e.message }, 400)
    const message = errorText(e)
    return json({ error: message }, /not found/i.test(message) ? 404 : 502)
  }
}
