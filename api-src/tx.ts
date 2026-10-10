// GET /api/tx/<hash>[?chain=<key>]: the transaction's verdict and task list as JSON.

import type { Hash } from 'viem'
import { makeClients } from '../src/client'
import { explainTx } from '../src/leak/explain'
import { findTxChain, loadTx } from '../src/tx/load'
import { summarizeTx } from '../cli/tx'
import { BadRequest, chainParam, handle, json, preflight, SITE } from './common'

export const OPTIONS = preflight

export function GET(request: Request) {
  return handle(async () => {
    const url = new URL(request.url)
    const hash = url.searchParams.get('hash') ?? url.pathname.split('/').pop() ?? ''
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new BadRequest('Expected a transaction hash: 0x followed by 64 hex characters.')
    const chain = chainParam(url) ?? (await findTxChain(hash as Hash))
    if (!chain) return json({ error: 'No supported network knows this transaction.' }, 404, 60)
    const t = await loadTx(chain, hash as Hash, makeClients(chain).client)
    // A mined transaction never changes; ACL and decrypt status can, so cache for an hour.
    return json({ verdict: explainTx(t.graph, t.leaks, t.status), ...summarizeTx(t), url: `${SITE}/#/tx/${chain.key}/${hash}` }, 200, 3600)
  })
}
