// Builds the FHE task graph for one transaction from its receipt logs.

import { decodeEventLog, isAddressEqual, type Address, type Log } from 'viem'
import { taskManagerAbi } from '../abi'
import { decodeHandle, type DecodedHandle } from '../handle/decode'
import { decodeTask, type Task } from './task'

export interface PublishedDecrypt {
  ctHash: bigint
  result: bigint
  requestor: Address
  logIndex: number
}

export interface TxGraph {
  tasks: Task[]
  /** Tasks by output handle. A handle can only be produced once per graph. */
  byHandle: Map<bigint, Task>
  /** Handles verified as user inputs in this tx (InputVerified). */
  inputs: Map<bigint, { handle: DecodedHandle; commitment: `0x${string}` }>
  decrypts: PublishedDecrypt[]
  /** Handles consumed in this tx but created elsewhere (earlier tx, or a verified input). */
  external: Map<bigint, DecodedHandle>
}

export function buildTxGraph(logs: readonly Log[], taskManager: Address): TxGraph {
  const tasks: Task[] = []
  const inputs: TxGraph['inputs'] = new Map()
  const decrypts: PublishedDecrypt[] = []

  for (const log of logs) {
    if (!isAddressEqual(log.address, taskManager)) continue
    let ev
    try {
      ev = decodeEventLog({ abi: taskManagerAbi, data: log.data, topics: log.topics as [`0x${string}`, ...`0x${string}`[]] })
    } catch {
      continue // AccessControl / proxy events
    }
    if (ev.eventName === 'TaskCreated') {
      const { ctHash, operation, input1, input2, input3 } = ev.args
      tasks.push(decodeTask({ ctHash, operation, input1, input2, input3, txHash: log.transactionHash ?? undefined, blockNumber: log.blockNumber ?? undefined, logIndex: log.logIndex ?? undefined }))
    } else if (ev.eventName === 'InputVerified') {
      inputs.set(ev.args.ctHash, { handle: decodeHandle(ev.args.ctHash), commitment: ev.args.commitment })
    } else if (ev.eventName === 'DecryptionResult') {
      decrypts.push({ ctHash: ev.args.ctHash, result: ev.args.result, requestor: ev.args.requestor, logIndex: log.logIndex ?? 0 })
    }
  }

  const byHandle = new Map<bigint, Task>()
  for (const t of tasks) if (!byHandle.has(t.ctHash)) byHandle.set(t.ctHash, t)

  const external = new Map<bigint, DecodedHandle>()
  for (const t of tasks) for (const h of t.inputHandles) if (!byHandle.has(h.handle)) external.set(h.handle, h)

  return { tasks, byHandle, inputs, decrypts, external }
}

/** Longest chain of dependent tasks inside the tx; a proxy for off-chain latency. */
export function graphDepth(g: TxGraph): number {
  const memo = new Map<bigint, number>()
  const depth = (h: bigint): number => {
    const t = g.byHandle.get(h)
    if (!t) return 0
    const cached = memo.get(h)
    if (cached !== undefined) return cached
    memo.set(h, 0) // guards against malformed cycles
    const d = 1 + Math.max(0, ...t.inputHandles.map((i) => depth(i.handle)))
    memo.set(h, d)
    return d
  }
  return Math.max(0, ...g.tasks.map((t) => depth(t.ctHash)))
}
