// S4: mainnet TaskManager (Ethereum + Arbitrum One): live flags and the admin-event history
// from deployment, folded into the access list and re-checked against storage.
import { getAbiItem } from 'viem'
import { taskManagerAbi } from '../src/abi'
import { chainById } from '../src/chains'
import { makeClients } from '../src/client'
import { scanLogs } from '../src/logs'
import { readFlags, scanAdminHistory, verifyAccessList } from '../src/mainnet/status'

for (const id of [1, 42161]) {
  const chain = chainById(id)
  const { client, logClient } = makeClients(chain)
  const t0 = performance.now()
  const flags = await readFlags(client, chain.taskManager)
  const t1 = performance.now()
  const history = await scanAdminHistory(logClient, chain)
  const t2 = performance.now()
  const verified = await verifyAccessList(client, chain.taskManager, history.accessList)
  const tasks = await scanLogs({
    client: logClient,
    address: chain.taskManager,
    events: [getAbiItem({ abi: taskManagerAbi, name: 'TaskCreated' })],
    fromBlock: chain.deployBlock,
    toBlock: history.scannedTo,
    maxRange: chain.maxLogRange,
  })
  const t3 = performance.now()

  console.log(`\n=== ${chain.name} (TM ${chain.taskManager})`)
  console.log('flags', flags, `(${Math.round(t1 - t0)} ms)`)
  console.log(`admin scan ${chain.deployBlock}..${history.scannedTo} (${history.scannedTo - chain.deployBlock} blocks): ${history.events.length} events in ${Math.round(t2 - t1)} ms`)
  const counts = new Map<string, number>()
  for (const e of history.events) counts.set(e.name, (counts.get(e.name) ?? 0) + 1)
  console.log('  by type', Object.fromEntries(counts))
  for (const e of history.events) console.log(`  ${e.blockNumber} ${e.name} ${JSON.stringify(e.args, (_, v) => (typeof v === 'bigint' ? v.toString() : v))}`)
  console.log(`access list: ${verified.length} entries`, verified.map((v) => `${v.account} onChain=${v.onChain}`))
  console.log(`deny list: ${history.denyList.length}`)
  console.log(`TaskCreated since deploy: ${tasks.length} (${Math.round(t3 - t2)} ms)`)
}

// Arbitrum: confirm nothing was logged before the recorded deploy block.
{
  const chain = chainById(42161)
  const { logClient } = makeClients(chain)
  const before = await scanLogs({
    client: logClient,
    address: chain.taskManager,
    events: [],
    fromBlock: chain.deployBlock - 5_000_000n, // expect 0
    toBlock: chain.deployBlock - 1n,
    maxRange: chain.maxLogRange,
  }).catch((e) => `ERR ${(e as Error).message.slice(0, 120)}`)
  console.log(`\nArbitrum logs in the 5M blocks before deployBlock: ${Array.isArray(before) ? before.length : before}`)
}
