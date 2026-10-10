// Splits the contract report's cost into log scan and window analysis: npx tsx spike/window-cost.ts <chainId> [seconds]
import { getAbiItem, toEventSelector } from 'viem'
import { taskManagerAbi } from '../src/abi'
import { chainById } from '../src/chains'
import { makeClients } from '../src/client'
import { scanLogs } from '../src/logs'
import { analyzeWindow } from '../src/report/contract'

const chain = chainById(Number(process.argv[2] ?? 11155111))
const seconds = Number(process.argv[3] ?? 3600)
const { logClient } = makeClients(chain)
const toBlock = await logClient.getBlockNumber()
const fromBlock = toBlock - BigInt(Math.round(seconds / chain.blockTime)) + 1n
const TC = getAbiItem({ abi: taskManagerAbi, name: 'TaskCreated' })
const DR = getAbiItem({ abi: taskManagerAbi, name: 'DecryptionResult' })
const variants = { 'TaskCreated only': [TC], 'TaskCreated+DecryptionResult': [TC, DR], 'topic-less': [] }
for (const [label, events] of Object.entries(variants)) {
  const t0 = performance.now()
  let requests = 0
  const logs = await scanLogs({ client: logClient, address: chain.taskManager, events, fromBlock, toBlock, maxRange: chain.maxLogRange, onProgress: (p) => (requests = p.requests) })
  const t1 = performance.now()
  // worst case for the closure walk: every task in the window is a root
  const roots = logs.filter((l) => l.topics[0] === toEventSelector(TC)).map((l) => BigInt(l.data.slice(0, 66)))
  const leaks = analyzeWindow(logs, chain.taskManager, roots)
  const t2 = performance.now()
  console.log(`${label}: ${logs.length} logs in ${requests} requests, scan ${Math.round(t1 - t0)} ms, analysis of all ${roots.length} tasks ${Math.round(t2 - t1)} ms (${leaks.known.size} known)`)
}
