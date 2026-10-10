// Lists the busiest contracts on a network in a recent window: npx tsx spike/top-callers.ts <chainId> [seconds]
import { chainById } from '../src/chains'
import { makeClients } from '../src/client'
import { recentActivity } from '../src/mainnet/activity'

const chain = chainById(Number(process.argv[2] ?? 11155111))
const { client, logClient } = makeClients(chain)
const r = await recentActivity(client, logClient, chain, { seconds: Number(process.argv[3] ?? 900), maxTxLookups: 100 })
for (const c of r.contracts.slice(0, 5)) console.log(c.address, c.tasks, c.txs)
