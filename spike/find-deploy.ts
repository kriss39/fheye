// Lists the earliest TaskManager logs on a chain, to pin deployBlock in src/chains.ts.
import { decodeEventLog } from 'viem'
import { taskManagerAbi } from '../src/abi'
import { chainById } from '../src/chains'
import { makeClients } from '../src/client'
import { scanLogs } from '../src/logs'
const chain = chainById(42161)
const { logClient } = makeClients(chain)
const logs = await scanLogs({ client: logClient, address: chain.taskManager, events: [], fromBlock: chain.deployBlock - 30_000_000n, toBlock: chain.deployBlock + 10n, maxRange: 1_000_000n })
console.log('total', logs.length, 'first block', logs[0]?.blockNumber)
for (const l of logs.slice(0, 50)) {
  let name = l.topics[0]
  try { const d = decodeEventLog({ abi: taskManagerAbi, data: l.data, topics: l.topics as any }); name = `${d.eventName} ${JSON.stringify(d.args, (_, v) => typeof v === 'bigint' ? v.toString() : v)}` } catch {}
  console.log(l.blockNumber, name)
}
