// Privacy report for one contract: analyse its recent FHE transactions and aggregate how many
// computed values are provably public, how much is trivially encrypted, and how many handles
// anyone may decrypt.

import { getAbiItem, isAddressEqual, type Address, type Hash, type PublicClient } from 'viem'
import { taskManagerAbi } from '../abi'
import type { LensChain } from '../chains'
import type { Assumption } from '../leak/ops'
import { scanLogs } from '../logs'
import { loadTx } from '../tx/load'

export interface TxSummary {
  hash: Hash
  block: bigint
  tasks: number
  computed: number
  publicComputed: number
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
  totals: { tasks: number; computed: number; publicComputed: number; trivial: number; global: number; outputs: number; decrypts: number }
}

export type ReportPhase = { phase: 'scan'; logs: number } | { phase: 'match'; done: number; total: number } | { phase: 'analyse'; done: number; total: number }

const TASK_CREATED = getAbiItem({ abi: taskManagerAbi, name: 'TaskCreated' })

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

  const logs = await scanLogs({ client: logClient, address: chain.taskManager, events: [TASK_CREATED], fromBlock, toBlock, maxRange: chain.maxLogRange, signal: opts.signal, onProgress: (p) => opts.onPhase?.({ phase: 'scan', logs: p.logs }) })
  const blockOf = new Map<Hash, bigint>()
  for (const l of logs) blockOf.set(l.transactionHash!, l.blockNumber!)

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

  const byOp: Record<string, number> = {}
  const publicByOp: Record<string, number> = {}
  const assumptions = new Set<Assumption>()
  const analysed: TxSummary[] = loaded.map((t) => {
    const tasks = t.graph.tasks
    const computed = tasks.filter((x) => x.op?.kind !== 'trivial' && x.op?.kind !== 'random')
    const isLeak = (h: bigint) => {
      const src = t.leaks.known.get(h)?.source
      return src === 'derived' || src === 'identity'
    }
    const publicComputed = computed.filter((x) => isLeak(x.ctHash))
    for (const x of tasks) byOp[x.operation] = (byOp[x.operation] ?? 0) + 1
    for (const x of publicComputed) {
      publicByOp[x.operation] = (publicByOp[x.operation] ?? 0) + 1
      t.leaks.known.get(x.ctHash)!.assumptions.forEach((a) => assumptions.add(a))
    }
    const outputs = [...new Set(tasks.map((x) => x.ctHash))]
    return {
      hash: t.tx.hash,
      block: t.receipt.blockNumber,
      tasks: tasks.length,
      computed: computed.length,
      publicComputed: publicComputed.length,
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
    totals: { tasks: sum('tasks'), computed: sum('computed'), publicComputed: sum('publicComputed'), trivial: sum('trivial'), global: sum('global'), outputs: sum('outputs'), decrypts: sum('decrypts') },
  }
}
