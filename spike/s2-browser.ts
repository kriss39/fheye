// S2, browser half: runs inside the page (spike.html) so CORS and real fetch timing apply.
import { getAbiItem } from 'viem'
import { taskManagerAbi } from '../src/abi'
import { chainById } from '../src/chains'
import { makeClients } from '../src/client'
import { scanLogs } from '../src/logs'
import { adminEventAbis } from '../src/mainnet/status'

interface Row {
  name: string
  ms: number
  logs: number
  requests: number
  ok: boolean
  error?: string
}

async function bench(name: string, fn: () => Promise<{ logs: number; requests: number }>): Promise<Row> {
  const t0 = performance.now()
  try {
    const r = await fn()
    return { name, ms: Math.round(performance.now() - t0), ...r, ok: true }
  } catch (e) {
    return { name, ms: Math.round(performance.now() - t0), logs: 0, requests: 0, ok: false, error: String((e as Error).message).slice(0, 200) }
  }
}

async function scan(chainId: number, events: Parameters<typeof scanLogs>[0]['events'], span: bigint | 'deploy', opts: { useRpc?: string; maxRange?: bigint } = {}) {
  const chain = chainById(chainId)
  const { client, logClient } = makeClients(chain, opts.useRpc)
  const head = await client.getBlockNumber()
  let requests = 0
  const logs = await scanLogs({
    client: logClient,
    address: chain.taskManager,
    events,
    fromBlock: span === 'deploy' ? chain.deployBlock : head - span,
    toBlock: head,
    maxRange: opts.maxRange ?? chain.maxLogRange,
    concurrency: 6,
    onProgress: (p) => (requests = p.requests),
  })
  return { logs: logs.length, requests }
}

const taskCreated = [getAbiItem({ abi: taskManagerAbi, name: 'TaskCreated' })]
const decryptionResult = [getAbiItem({ abi: taskManagerAbi, name: 'DecryptionResult' })]

export async function runS2(): Promise<Row[]> {
  const rows: Row[] = []
  const push = async (r: Promise<Row>) => {
    const row = await r
    rows.push(row)
    const el = document.getElementById('out')
    if (el) el.textContent += `${row.ok ? 'OK ' : 'ERR'} ${row.name}: ${row.ms} ms, ${row.logs} logs, ${row.requests} req ${row.error ?? ''}\n`
  }
  await push(bench('ethereum admin events since deploy (drpc, 10k chunks)', () => scan(1, adminEventAbis, 'deploy')))
  await push(bench('ethereum all TM logs since deploy (drpc, 10k chunks)', () => scan(1, [], 'deploy')))
  await push(bench('arbitrum admin events since deploy (arb1)', () => scan(42161, adminEventAbis, 'deploy')))
  await push(bench('arbitrum all TM logs since deploy (arb1, 1M chunks)', () => scan(42161, [], 'deploy')))
  await push(bench('sepolia TaskCreated last 1k blocks (publicnode)', () => scan(11155111, taskCreated, 1000n, { useRpc: 'https://ethereum-sepolia-rpc.publicnode.com', maxRange: 10_000n })))
  await push(bench('sepolia TaskCreated last 1k blocks (tenderly)', () => scan(11155111, taskCreated, 1000n)))
  await push(bench('sepolia DecryptionResult last 10k blocks (tenderly)', () => scan(11155111, decryptionResult, 10_000n)))
  await push(bench('arb-sepolia TaskCreated last 10k blocks', () => scan(421614, taskCreated, 10_000n)))
  await push(bench('base-sepolia TaskCreated last 50k blocks', () => scan(84532, taskCreated, 50_000n)))
  await push(
    bench('sepolia receipt of a recent FHE tx', async () => {
      const chain = chainById(11155111)
      const { client } = makeClients(chain)
      const head = await client.getBlockNumber()
      const logs = await client.getLogs({ address: chain.taskManager, event: taskCreated[0], fromBlock: head - 5n, toBlock: head })
      const r = await client.getTransactionReceipt({ hash: logs[0].transactionHash })
      return { logs: r.logs.length, requests: 3 }
    }),
  )
  return rows
}

declare global {
  interface Window {
    __s2?: Promise<Row[]>
  }
}
window.__s2 = runS2()
