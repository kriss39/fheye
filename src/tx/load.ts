// Loads one transaction: receipt → task graph → leak analysis → per-output ACL/decrypt status.

import type { Address, Hash, PublicClient, Transaction, TransactionReceipt } from 'viem'
import { getAcl, handleStatus, type HandleStatus } from '../acl/check'
import { CHAINS, type LensChain } from '../chains'
import { makeClients } from '../client'
import { lookupTrivial } from '../leak/dictionary'
import { analyzeLeaks, type LeakReport } from '../leak/evaluate'
import { estimateFheGas, type GasEstimate } from './gas'
import { buildTxGraph, graphDepth, type TxGraph } from './graph'

export interface LoadedTx {
  chain: LensChain
  tx: Transaction
  receipt: TransactionReceipt
  graph: TxGraph
  depth: number
  leaks: LeakReport
  gas: GasEstimate
  /** Status of every handle the tx produced or consumed, keyed by handle. */
  status: Map<bigint, HandleStatus>
}

/** Tries every supported chain and returns the first that knows the tx. */
export async function findTxChain(hash: Hash, rpcFor: (c: LensChain) => string | undefined = () => undefined): Promise<LensChain | null> {
  const attempts = CHAINS.map(async (chain) => {
    const { client } = makeClients(chain, rpcFor(chain))
    await client.getTransactionReceipt({ hash })
    return chain
  })
  try {
    return await Promise.any(attempts)
  } catch {
    return null
  }
}

export async function loadTx(chain: LensChain, hash: Hash, client: PublicClient = makeClients(chain).client): Promise<LoadedTx> {
  const [tx, receipt] = await Promise.all([client.getTransaction({ hash }), client.getTransactionReceipt({ hash })])
  const graph = buildTxGraph(receipt.logs, chain.taskManager)

  const published = new Map(graph.decrypts.map((d) => [d.ctHash, d.result]))
  const handles = new Set<bigint>([...graph.tasks.map((t) => t.ctHash), ...graph.external.keys(), ...graph.inputs.keys(), ...graph.decrypts.map((d) => d.ctHash)])
  const status = new Map<bigint, HandleStatus>()
  if (handles.size) {
    const acl = await getAcl(client, chain.taskManager)
    const who = [tx.to, tx.from].filter(Boolean) as Address[]
    const rows = await Promise.all([...handles].map((h) => handleStatus(client, chain.taskManager, acl, h, who)))
    ;[...handles].forEach((h, i) => status.set(h, rows[i]))
    for (const [h, s] of status) if (s.published !== null && !published.has(h)) published.set(h, s.published)
  }

  const leaks = analyzeLeaks(graph.tasks, published, lookupTrivial)
  const gas = estimateFheGas(
    graph.tasks.map((t) => t.operation),
    graph.inputs.size,
  )
  return { chain, tx, receipt, graph, depth: graphDepth(graph), leaks, gas, status }
}
