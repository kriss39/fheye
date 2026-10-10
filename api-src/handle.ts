// GET /api/handle/<handle>[,<handle>…][?chain=<key>]: decode handles; with a chain, also who may decrypt them.

import { getAcl, handleStatus, type HandleStatus } from '../src/acl/check'
import { makeClients } from '../src/client'
import { decodeMany, type DecodedHandle } from '../src/handle/decode'
import { summarizeHandles } from '../cli/handle'
import { BadRequest, chainParam, handle, json, preflight } from './common'

export const OPTIONS = preflight
const MAX = 20

export function GET(request: Request) {
  return handle(async () => {
    const url = new URL(request.url)
    let text = url.searchParams.get('handle') ?? ''
    if (!text) {
      try {
        text = decodeURIComponent(url.pathname.split('/').pop() ?? '')
      } catch {
        throw new BadRequest('Malformed handle in the URL.')
      }
    }
    const rows = decodeMany(text.replace(/,/g, '\n'))
    const bad = rows.find((r) => 'error' in r)
    if (!rows.length || bad) throw new BadRequest(bad && 'error' in bad ? `${bad.token}: ${bad.error}` : 'Expected one or more handles.')
    if (rows.length > MAX) throw new BadRequest(`Up to ${MAX} handles per request.`)
    const handles = rows as DecodedHandle[]
    const chain = chainParam(url)
    let status: Map<bigint, HandleStatus> | undefined
    if (chain) {
      const { client } = makeClients(chain)
      const acl = await getAcl(client, chain.taskManager)
      const results = await Promise.all(handles.map((h) => handleStatus(client, chain.taskManager, acl, h.handle, [])))
      status = new Map(handles.map((h, i) => [h.handle, results[i]]))
    }
    return json({ chain: chain?.key ?? null, handles: summarizeHandles(handles, status) }, 200, chain ? 300 : 86400)
  }, request)
}
