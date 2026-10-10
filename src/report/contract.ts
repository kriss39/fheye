// Privacy report for one contract: analyse its recent FHE transactions and aggregate how many
// computed values are provably public, how much is trivially encrypted, and how many handles
// anyone may decrypt.
//
// Handles are content-addressed, so a value proven public anywhere is public everywhere. Each
// analysed value is therefore followed back through the window's earlier transactions, which
// catches values that build on earlier results (a balance that started from a trivial zero, say).

import { getAbiItem, isAddressEqual, toEventSelector, type Address, type Hash, type Log, type PublicClient } from 'viem'
import { taskManagerAbi } from '../abi'
import type { LensChain } from '../chains'
import { lookupTrivial } from '../leak/dictionary'
import { analyzeLeaks, type Known, type LeakReport } from '../leak/evaluate'
import type { Assumption } from '../leak/ops'
import { scanLogs } from '../logs'
import { buildTxGraph } from '../tx/graph'
import { loadTx } from '../tx/load'
import type { Task } from '../tx/task'

export interface TxSummary {
  hash: Hash
  block: bigint
  tasks: number
  computed: number
  publicComputed: number
  /** Public only because of values computed in earlier transactions in the window. */
  publicViaEarlier: number
  trivial: number
  global: number
  outputs: number
  decrypts: number
}

export interface ContractReport {
  address: Address
  fromBlock: bigint
  toBlock: bigint
  /** FHE txs in the window whose target was checked. */
  checkedTxs: number
  /** FHE txs in the window, all contracts. */
  windowTxs: number
  /** Txs targeting the contract (may exceed analysed). */
  matchedTxs: number
  analysed: TxSummary[]
  byOp: Record<string, number>
  publicByOp: Record<string, number>
  assumptions: Assumption[]
  totals: { tasks: number; computed: number; publicComputed: number; publicViaEarlier: number; trivial: number; global: number; outputs: number; decrypts: number }
}

export type ReportPhase = { phase: 'scan'; logs: number } | { phase: 'match'; done: number; total: number } | { phase: 'analyse'; done: number; total: number }

const LEAK_SOURCES = new Set<Known['source']>(['derived', 'identity'])
const TASK_CREATED = getAbiItem({ abi: taskManagerAbi, name: 'TaskCreated' })
const DECRYPTION_RESULT = getAbiItem({ abi: taskManagerAbi, name: 'DecryptionResult' })
const TASK_CREATED_TOPIC = toEventSelector(TASK_CREATED)
const DECRYPTION_RESULT_TOPIC = toEventSelector(DECRYPTION_RESULT)

// Both events start their data with the (non-indexed) ctHash; DecryptionResult follows it with the result.
const word = (data: `0x${string}`, i: number) => BigInt(`0x${data.slice(2 + i * 64, 2 + (i + 1) * 64)}`)

/**
 * Leak analysis for `roots` using a window of TaskManager events. Busy testnets put ~100k tasks in
 * a day, so instead of decoding all of them this indexes producers by handle (a slice of the event
 * data) and only decodes the tasks the roots transitively depend on.
 */
export function analyzeWindow(logs: readonly Log[], taskManager: Address, roots: Iterable<bigint>, published: Map<bigint, bigint> = new Map()): LeakReport {
  const producer = new Map<bigint, Log>()
  const known = new Map(published)
  for (const log of logs) {
    if (!isAddressEqual(log.address, taskManager)) continue
    if (log.topics[0] === TASK_CREATED_TOPIC) {
      const h = word(log.data, 0)
      if (!producer.has(h)) producer.set(h, log)
    } else if (log.topics[0] === DECRYPTION_RESULT_TOPIC) {
      const h = word(log.data, 0)
      if (!known.has(h)) known.set(h, word(log.data, 1))
    }
  }

  const needed: Task[] = []
  const seen = new Set<bigint>()
  const stack = [...roots]
  while (stack.length) {
    const h = stack.pop()!
    if (seen.has(h)) continue
    seen.add(h)
    const log = producer.get(h)
    if (!log) continue
    for (const t of buildTxGraph([log], taskManager).tasks) {
      needed.push(t)
      for (const input of t.inputHandles) stack.push(input.handle)
    }
  }
  // Creation order lets the fixpoint settle in one pass.
  needed.sort((a, b) => Number((a.blockNumber ?? 0n) - (b.blockNumber ?? 0n)) || (a.logIndex ?? 0) - (b.logIndex ?? 0))
  return analyzeLeaks(needed, known, lookupTrivial)
}

/** Computed values the tx proves public on its own, or that the window proves through earlier txs. */
export function publicComputedValues(computed: Task[], own: LeakReport, window: LeakReport): Array<{ task: Task; known: Known; viaEarlier: boolean }> {
  const out: Array<{ task: Task; known: Known; viaEarlier: boolean }> = []
  for (const task of computed) {
    const mine = own.known.get(task.ctHash)
    if (mine && LEAK_SOURCES.has(mine.source)) {
      out.push({ task, known: mine, viaEarlier: false })
      continue
    }
    const theirs = window.known.get(task.ctHash)
    if (theirs && LEAK_SOURCES.has(theirs.source)) out.push({ task, known: theirs, viaEarlier: true })
  }
  return out
}

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>, signal?: AbortSignal): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        signal?.throwIfAborted()
        const i = next++
        out[i] = await fn(items[i])
      }
    }),
  )
  return out
}

export async function contractReport(
  client: PublicClient,
  logClient: PublicClient,
  chain: LensChain,
  address: Address,
  opts: { seconds: number; maxTxs?: number; maxLookups?: number; onPhase?: (p: ReportPhase) => void; signal?: AbortSignal },
): Promise<ContractReport> {
  const maxTxs = opts.maxTxs ?? 25
  const toBlock = await logClient.getBlockNumber()
  const span = BigInt(Math.max(1, Math.round(opts.seconds / chain.blockTime)))
  const earliest = chain.mainnet ? chain.deployBlock : 0n
  const fromBlock = toBlock - span + 1n > earliest ? toBlock - span + 1n : earliest

  // Published decrypts matter too: they make every value derived from them public.
  const logs = await scanLogs({ client: logClient, address: chain.taskManager, events: [TASK_CREATED, DECRYPTION_RESULT], fromBlock, toBlock, maxRange: chain.maxLogRange, signal: opts.signal, onProgress: (p) => opts.onPhase?.({ phase: 'scan', logs: p.logs }) })
  const blockOf = new Map<Hash, bigint>()
  for (const l of logs) if (l.topics[0] === TASK_CREATED_TOPIC) blockOf.set(l.transactionHash!, l.blockNumber!)

  // Newest first, so the analysed sample is the contract's latest behaviour.
  const candidates = [...blockOf].sort((a, b) => Number(b[1] - a[1])).slice(0, opts.maxLookups ?? 800)
  let checked = 0
  const targets = await pool(
    candidates,
    8,
    async ([hash]) => {
      const tx = await client.getTransaction({ hash }).catch(() => null)
      opts.onPhase?.({ phase: 'match', done: ++checked, total: candidates.length })
      return tx?.to ?? null
    },
    opts.signal,
  )
  const matched = candidates.filter((_, i) => targets[i] && isAddressEqual(targets[i]!, address)).map(([hash]) => hash)

  let analysedCount = 0
  const sample = matched.slice(0, maxTxs)
  const loaded = await pool(
    sample,
    4,
    async (hash) => {
      const t = await loadTx(chain, hash, client)
      opts.onPhase?.({ phase: 'analyse', done: ++analysedCount, total: sample.length })
      return t
    },
    opts.signal,
  )

  const published = new Map<bigint, bigint>()
  for (const t of loaded) for (const [h, st] of t.status) if (st.published !== null) published.set(h, st.published)
  const roots = loaded.flatMap((t) => t.graph.tasks.map((x) => x.ctHash))
  const window = analyzeWindow(logs, chain.taskManager, roots, published)

  const byOp: Record<string, number> = {}
  const publicByOp: Record<string, number> = {}
  const assumptions = new Set<Assumption>()
  const analysed: TxSummary[] = loaded.map((t) => {
    const tasks = t.graph.tasks
    const computed = tasks.filter((x) => x.op?.kind !== 'trivial' && x.op?.kind !== 'random')
    const publicComputed = publicComputedValues(computed, t.leaks, window)
    for (const x of tasks) byOp[x.operation] = (byOp[x.operation] ?? 0) + 1
    for (const { task, known } of publicComputed) {
      publicByOp[task.operation] = (publicByOp[task.operation] ?? 0) + 1
      known.assumptions.forEach((a) => assumptions.add(a))
    }
    const outputs = [...new Set(tasks.map((x) => x.ctHash))]
    return {
      hash: t.tx.hash,
      block: t.receipt.blockNumber,
      tasks: tasks.length,
      computed: computed.length,
      publicComputed: publicComputed.length,
      publicViaEarlier: publicComputed.filter((x) => x.viaEarlier).length,
      trivial: tasks.filter((x) => x.op?.kind === 'trivial').length,
      global: outputs.filter((h) => t.status.get(h)?.global).length,
      outputs: outputs.length,
      decrypts: t.graph.decrypts.length,
    }
  })

  const sum = (k: keyof TxSummary) => analysed.reduce((a, s) => a + (s[k] as number), 0)
  return {
    address,
    fromBlock,
    toBlock,
    checkedTxs: candidates.length,
    windowTxs: blockOf.size,
    matchedTxs: matched.length,
    analysed,
    byOp,
    publicByOp,
    assumptions: [...assumptions],
    totals: { tasks: sum('tasks'), computed: sum('computed'), publicComputed: sum('publicComputed'), publicViaEarlier: sum('publicViaEarlier'), trivial: sum('trivial'), global: sum('global'), outputs: sum('outputs'), decrypts: sum('decrypts') },
  }
}
