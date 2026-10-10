// S5+: checks derived values against the real FHE engine. For handles that are both marked
// decryptable by anyone (globalAllowed) and already known to FHEye (trivial constants or
// derived values), ask the threshold network to decrypt them and verify the signature against the
// TaskManager's decryptResultSigner. Handles whose value FHEye can't derive are never decrypted.
import { chainById } from '../src/chains'
import { makeClients } from '../src/client'
import { toHex32 } from '../src/handle/decode'
import { publicDecrypt } from '../src/acl/publicDecrypt'
import { recentActivity } from '../src/mainnet/activity'
import { loadTx } from '../src/tx/load'

const MAX_DECRYPTS = Number(process.argv[2] ?? 12)
type Candidate = { chainId: number; handle: bigint; expected: bigint; source: string; op: string; tx: string }
const candidates: Candidate[] = []

for (const [chainId, seconds] of [
  [84532, 3600],
  [11155111, 900],
  [421614, 600],
] as const) {
  const chain = chainById(chainId)
  const { client, logClient } = makeClients(chain)
  const act = await recentActivity(client, logClient, chain, { seconds, maxTxLookups: 60 })
  const txs = act.topTxs.slice(0, 25)
  for (const { hash } of txs) {
    const t = await loadTx(chain, hash, client).catch(() => null)
    if (!t) continue
    for (const task of t.graph.tasks) {
      const k = t.leaks.known.get(task.ctHash)
      const s = t.status.get(task.ctHash)
      if (!k || !s?.global || k.source === 'published') continue
      if (candidates.some((c) => c.handle === task.ctHash)) continue
      candidates.push({ chainId, handle: task.ctHash, expected: k.value, source: k.source, op: task.operation, tx: hash })
    }
  }
  console.log(`${chain.name}: ${candidates.filter((c) => c.chainId === chainId).length} candidate handles (global, value known)`)
}

// Prefer derived values (the interesting claim) over plain trivial constants.
const picked = [...candidates.filter((c) => c.source !== 'trivial'), ...candidates.filter((c) => c.source === 'trivial')].slice(0, MAX_DECRYPTS)
let match = 0
let verified = 0
for (const c of picked) {
  const chain = chainById(c.chainId)
  const { client } = makeClients(chain)
  try {
    const r = await publicDecrypt(client, chain, c.handle)
    const ok = r.value === c.expected
    if (ok) match++
    if (r.verified) verified++
    console.log(`${ok ? 'match   ' : 'MISMATCH'} ${chain.key} ${c.op}(${c.source}) ${toHex32(c.handle).slice(0, 14)}… expected=${c.expected} engine=${r.value} signature=${r.verified ? 'valid' : `INVALID (${r.signer})`}`)
  } catch (e) {
    console.log(`error    ${chain.key} ${c.op} ${toHex32(c.handle).slice(0, 14)}… ${(e as Error).message.slice(0, 120)}`)
  }
}
console.log(`\nengine agrees with FHEye on ${match}/${picked.length}; signatures valid ${verified}/${picked.length}`)
