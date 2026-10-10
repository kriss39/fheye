// S5: recompute values that derive only from public leaves (trivialEncrypt) and compare them
// with decrypt results published on-chain for the same handle.
// Handles are content-addressed, so tasks from many txs can be merged into one graph.
import { getAbiItem } from 'viem'
import { taskManagerAbi } from '../src/abi'
import { chainById } from '../src/chains'
import { makeClients } from '../src/client'
import { toHex32 } from '../src/handle/decode'
import { analyzeLeaks } from '../src/leak/evaluate'
import { scanLogs } from '../src/logs'
import { decodeTask } from '../src/tx/task'

const chainId = Number(process.argv[2] ?? 11155111)
const SPAN = BigInt(process.argv[3] ?? 3000)
const chain = chainById(chainId)
const { client, logClient } = makeClients(chain)
const head = await client.getBlockNumber()
const fromBlock = head - SPAN

const t0 = performance.now()
const [taskLogs, decryptLogs] = await Promise.all([
  scanLogs({ client: logClient, address: chain.taskManager, events: [getAbiItem({ abi: taskManagerAbi, name: 'TaskCreated' })], fromBlock, toBlock: head, maxRange: chain.maxLogRange }),
  scanLogs({ client: logClient, address: chain.taskManager, events: [getAbiItem({ abi: taskManagerAbi, name: 'DecryptionResult' })], fromBlock, toBlock: head, maxRange: chain.maxLogRange }),
])
console.log(`${chain.name} blocks ${fromBlock}..${head}: ${taskLogs.length} tasks, ${decryptLogs.length} published decrypts (${Math.round(performance.now() - t0)} ms)`)

type A = { args: Record<string, any> }
const tasks = taskLogs.map((l) => {
  const { ctHash, operation, input1, input2, input3 } = (l as unknown as A).args
  return decodeTask({ ctHash, operation, input1, input2, input3, txHash: l.transactionHash!, blockNumber: l.blockNumber!, logIndex: l.logIndex! })
})
const published = new Map<bigint, bigint>()
for (const l of decryptLogs) published.set((l as unknown as A).args.ctHash, (l as unknown as A).args.result)

const report = analyzeLeaks(tasks, published)
const bySource = new Map<string, number>()
for (const k of report.known.values()) bySource.set(k.source, (bySource.get(k.source) ?? 0) + 1)
const nonTrivial = tasks.filter((t) => t.op?.kind !== 'trivial')
const publicNonTrivial = nonTrivial.filter((t) => report.known.has(t.ctHash))
console.log('known values by source', Object.fromEntries(bySource))
console.log(`computed (non-trivial) handles whose value is public: ${publicNonTrivial.length}/${nonTrivial.length}`)

const createdHere = new Set(tasks.map((t) => t.ctHash))
const decryptedHere = [...published.keys()].filter((h) => createdHere.has(h))
console.log(`published decrypts whose task is in the window: ${decryptedHere.length}/${published.size}`)

console.log(`\nS5 checks (derived value vs published decrypt): ${report.checks.length}`)
const byDepth = new Map<number, { n: number; match: number }>()
for (const c of report.checks) {
  const s = byDepth.get(c.depth) ?? { n: 0, match: 0 }
  s.n++
  if (c.match) s.match++
  byDepth.set(c.depth, s)
}
console.log('by depth', Object.fromEntries([...byDepth].map(([d, s]) => [d, `${s.match}/${s.n}`])))
for (const c of report.checks.filter((c) => !c.match).slice(0, 10)) {
  const t = tasks.find((x) => x.ctHash === c.handle)!
  console.log('MISMATCH', t.operation, t.txHash, toHex32(c.handle), 'derived', c.derived, 'published', c.published, report.known.get(c.handle)?.assumptions)
}
for (const c of report.checks.filter((c) => c.match && c.depth > 1).slice(0, 5)) {
  const t = tasks.find((x) => x.ctHash === c.handle)!
  console.log('match', t.operation, `depth=${c.depth}`, t.txHash, 'value', c.derived)
}
const assumed = [...report.known.values()].filter((k) => k.assumptions.length)
console.log(`values relying on unconfirmed TFHE-rs semantics: ${assumed.length}`, [...new Set(assumed.flatMap((k) => k.assumptions))])

// Content-addressed handles repeat across txs, so also report unique handles, and split checks
// whose leaves are all trivialEncrypt (the strict S5 criterion) from those using published leaves.
const uniqueChecks = new Map(report.checks.map((c) => [c.handle, c]))
const leafSources = (h: bigint) => (report.known.get(h)?.leaves ?? []).map((l) => report.known.get(l)?.source)
const trivialOnly = [...uniqueChecks.values()].filter((c) => leafSources(c.handle).every((s) => s === 'trivial'))
const opsCovered = new Map<string, number>()
for (const t of tasks) if (report.known.has(t.ctHash) && t.op?.kind !== 'trivial') opsCovered.set(t.operation, (opsCovered.get(t.operation) ?? 0) + 1)
console.log(`\nunique handles checked: ${uniqueChecks.size} (all match: ${[...uniqueChecks.values()].every((c) => c.match)})`)
console.log(`  of which trivial-only leaves: ${trivialOnly.length} (match ${trivialOnly.filter((c) => c.match).length}), max depth ${Math.max(0, ...trivialOnly.map((c) => c.depth))}`)
console.log('ops evaluated on public values', Object.fromEntries(opsCovered))
const apps = new Map<string, number>()
for (const c of trivialOnly) {
  const t = tasks.find((x) => x.ctHash === c.handle)!
  apps.set(t.txHash!, 1)
}
console.log(`txs containing a trivial-only verified handle: ${apps.size}`)

// Strict variant: for derived handles whose leaves are all trivial, ask PlaintextsStorage
// (via TaskManager.getDecryptResultSafe) whether a decrypt was ever published, in any block.
const strictCandidates = [...report.known.entries()].filter(([, k]) => (k.source === 'derived' || k.source === 'identity') && k.leaves.every((l) => report.known.get(l)?.source === 'trivial'))
console.log(`\ntrivial-only derived handles: ${strictCandidates.length}; querying on-chain decrypt results…`)
const onchain = await Promise.all(
  strictCandidates.map(([h]) => client.readContract({ address: chain.taskManager, abi: taskManagerAbi, functionName: 'getDecryptResultSafe', args: [h] }).catch(() => null)),
)
let found = 0
let matched = 0
strictCandidates.forEach(([h, k], i) => {
  const r = onchain[i]
  if (!r || !r[1]) return
  found++
  if (r[0] === k.value) matched++
  const t = tasks.find((x) => x.ctHash === h)!
  if (found <= 8 || r[0] !== k.value) console.log(`  ${r[0] === k.value ? 'match' : 'MISMATCH'} ${t.operation} ${toHex32(h)} derived=${k.value} onchain=${r[0]} tx=${t.txHash}`)
})
console.log(`strict S5: ${matched}/${found} on-chain published results match (of ${strictCandidates.length} trivial-only handles)`)
