// Recent CoFHE activity on a chain: op mix, share of trivially encrypted (public) values, and
// which contracts create the tasks. TaskCreated doesn't carry the caller, so tasks are attributed
// to the tx's `to` address, which is the caller unless the tx goes through a router.

import type { Address, Hash, PublicClient } from 'viem'
import type { LensChain } from '../chains'
import { scanLogs, type ScanProgress } from '../logs'
import { decodeTmLog } from './status'

export interface ContractActivity {
  address: Address
  tasks: number
  txs: number
}

export interface Activity {
  fromBlock: bigint
  toBlock: bigint
  tasks: number
  txs: number
  inputs: number
  decrypts: number
  byOp: Record<string, number>
  /** trivialEncrypt tasks / all tasks. */
  trivialShare: number
  contracts: ContractActivity[]
  /** Txs whose `to` was looked up; contract counts cover only these. */
  sampledTxs: number
  /** Busiest txs first. */
  topTxs: Array<{ hash: Hash; tasks: number; to: Address | null }>
}

export async function recentActivity(
  client: PublicClient,
  logClient: PublicClient,
  chain: LensChain,
  opts: { seconds: number; maxTxLookups?: number; onProgress?: (p: ScanProgress) => void; signal?: AbortSignal },
): Promise<Activity> {
  const toBlock = await logClient.getBlockNumber()
  const span = BigInt(Math.max(1, Math.round(opts.seconds / chain.blockTime)))
  const earliest = chain.mainnet ? chain.deployBlock : 0n
  const fromBlock = toBlock - span + 1n > earliest ? toBlock - span + 1n : earliest
  const logs = await scanLogs({ client: logClient, address: chain.taskManager, events: [], fromBlock, toBlock, maxRange: chain.maxLogRange, onProgress: opts.onProgress, signal: opts.signal })

  const byOp: Record<string, number> = {}
  const tasksByTx = new Map<Hash, number>()
  let tasks = 0
  let inputs = 0
  let decrypts = 0
  for (const l of logs) {
    const ev = decodeTmLog(l)
    if (!ev) continue
    if (ev.name === 'TaskCreated') {
      tasks++
      const op = ev.args.operation as string
      byOp[op] = (byOp[op] ?? 0) + 1
      tasksByTx.set(ev.txHash, (tasksByTx.get(ev.txHash) ?? 0) + 1)
    } else if (ev.name === 'InputVerified') inputs++
    else if (ev.name === 'DecryptionResult') decrypts++
  }

  // Look up the busiest txs first so the sample covers most tasks.
  const ranked = [...tasksByTx].sort((a, b) => b[1] - a[1]).slice(0, opts.maxTxLookups ?? 300)
  const txs = await Promise.all(ranked.map(([hash]) => client.getTransaction({ hash }).catch(() => null)))
  const contracts = new Map<Address, ContractActivity>()
  ranked.forEach(([, n], i) => {
    const to = txs[i]?.to
    if (!to) return
    const c = contracts.get(to) ?? { address: to, tasks: 0, txs: 0 }
    c.tasks += n
    c.txs++
    contracts.set(to, c)
  })

  return {
    fromBlock,
    toBlock,
    tasks,
    txs: tasksByTx.size,
    inputs,
    decrypts,
    byOp,
    trivialShare: tasks ? (byOp.trivialEncrypt ?? 0) / tasks : 0,
    contracts: [...contracts.values()].sort((a, b) => b.tasks - a.tasks),
    sampledTxs: ranked.length,
    topTxs: ranked.slice(0, 25).map(([hash, n], i) => ({ hash, tasks: n, to: txs[i]?.to ?? null })),
  }
}
