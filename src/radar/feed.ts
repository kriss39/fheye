// The leak radar: the latest CoFHE transactions on a network and which of them give away an
// encrypted value. Verdicts come from the scanned window alone (TaskCreated and DecryptionResult
// logs), so a refresh costs one log scan plus a `to` lookup for the rows shown.

import { getAbiItem, toEventSelector, type Address, type Hash, type Log, type PublicClient } from 'viem'
import { taskManagerAbi } from '../abi'
import type { LensChain } from '../chains'
import { lookupTrivial } from '../leak/dictionary'
import { analyzeLeaks } from '../leak/evaluate'
import { scanLogs } from '../logs'
import { analyzeWindow, publicComputedValues } from '../report/contract'
import { buildTxGraph } from '../tx/graph'

export interface RadarRow {
  hash: Hash
  block: bigint
  tasks: number
  computed: number
  /** Computed values anyone can work out. */
  exposed: number
  /** Of those, how many only through earlier transactions in the window. */
  viaEarlier: number
  trivial: number
  to?: Address | null
}

export interface Radar {
  fromBlock: bigint
  toBlock: bigint
  rows: RadarRow[]
  txs: number
  exposedTxs: number
}

const TASK_CREATED = getAbiItem({ abi: taskManagerAbi, name: 'TaskCreated' })
const DECRYPTION_RESULT = getAbiItem({ abi: taskManagerAbi, name: 'DecryptionResult' })
const TASK_TOPIC = toEventSelector(TASK_CREATED)

/** Per-transaction verdicts for a window of TaskManager logs, newest first. */
export function radarFromLogs(logs: readonly Log[], taskManager: Address): RadarRow[] {
  const byTx = new Map<Hash, Log[]>()
  for (const l of logs) {
    if (l.topics[0] !== TASK_TOPIC || !l.transactionHash) continue
    const list = byTx.get(l.transactionHash) ?? []
    list.push(l)
    byTx.set(l.transactionHash, list)
  }
  const graphs = [...byTx].map(([hash, txLogs]) => ({ hash, block: txLogs[0].blockNumber ?? 0n, graph: buildTxGraph(txLogs, taskManager) }))
  const window = analyzeWindow(
    logs,
    taskManager,
    graphs.flatMap((g) => g.graph.tasks.map((t) => t.ctHash)),
  )
  const published = new Map<bigint, bigint>()
  for (const [h, k] of window.known) if (k.source === 'published') published.set(h, k.value)

  return graphs
    .map(({ hash, block, graph }) => {
      const computed = graph.tasks.filter((t) => t.op?.kind !== 'trivial' && t.op?.kind !== 'random')
      const own = analyzeLeaks(graph.tasks, published, lookupTrivial)
      const exposed = publicComputedValues(computed, own, window)
      return {
        hash,
        block,
        tasks: graph.tasks.length,
        computed: computed.length,
        exposed: exposed.length,
        viaEarlier: exposed.filter((x) => x.viaEarlier).length,
        trivial: graph.tasks.filter((t) => t.op?.kind === 'trivial').length,
      }
    })
    .sort((a, b) => Number(b.block - a.block))
}

export async function loadRadar(client: PublicClient, logClient: PublicClient, chain: LensChain, opts: { seconds: number; rows?: number; signal?: AbortSignal }): Promise<Radar> {
  const toBlock = await logClient.getBlockNumber()
  const span = BigInt(Math.max(1, Math.round(opts.seconds / chain.blockTime)))
  const earliest = chain.mainnet ? chain.deployBlock : 0n
  const fromBlock = toBlock - span + 1n > earliest ? toBlock - span + 1n : earliest
  const logs = await scanLogs({ client: logClient, address: chain.taskManager, events: [TASK_CREATED, DECRYPTION_RESULT], fromBlock, toBlock, maxRange: chain.maxLogRange, signal: opts.signal })
  const all = radarFromLogs(logs, chain.taskManager)
  const rows = all.slice(0, opts.rows ?? 30)
  const txs = await Promise.all(rows.map((r) => client.getTransaction({ hash: r.hash }).catch(() => null)))
  rows.forEach((r, i) => (r.to = txs[i]?.to ?? null))
  return { fromBlock, toBlock, rows, txs: all.length, exposedTxs: all.filter((r) => r.exposed > 0).length }
}
