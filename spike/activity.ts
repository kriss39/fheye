// Prints recent CoFHE activity for each chain.
import { CHAINS } from '../src/chains'
import { makeClients } from '../src/client'
import { recentActivity } from '../src/mainnet/activity'

const seconds = Number(process.argv[2] ?? 900)
for (const chain of CHAINS) {
  const { client, logClient } = makeClients(chain)
  const t0 = performance.now()
  try {
    const a = await recentActivity(client, logClient, chain, { seconds, maxTxLookups: 200 })
    console.log(`${chain.name.padEnd(17)} ${Math.round(performance.now() - t0)} ms  blocks ${a.toBlock - a.fromBlock + 1n}  tasks ${a.tasks}  txs ${a.txs}  inputs ${a.inputs}  decrypts ${a.decrypts}  trivial ${(a.trivialShare * 100).toFixed(1)}%  contracts ${a.contracts.length} (top: ${a.contracts.slice(0, 3).map((c) => `${c.address.slice(0, 8)}…:${c.tasks}`).join(', ')})`)
    console.log('   ops', JSON.stringify(a.byOp))
  } catch (e) {
    console.log(chain.name, 'ERR', (e as Error).message.slice(0, 150))
  }
}
