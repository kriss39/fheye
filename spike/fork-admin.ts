// Prints the TaskManager admin events FHEye collects on a chain, optionally through another RPC:
// npx tsx spike/fork-admin.ts <chainId> [rpcUrl]
import { chainById } from '../src/chains'
import { makeClients } from '../src/client'
import { foldAdmin, scanHistory } from '../src/mainnet/status'

const chain = chainById(Number(process.argv[2] ?? 1))
const { logClient } = makeClients(chain, process.argv[3])
const h = await scanHistory(logClient, chain, {})
const counts: Record<string, number> = {}
for (const e of h.admin) counts[e.name] = (counts[e.name] ?? 0) + 1
console.log(chain.name, 'admin events', h.admin.length, counts, 'tasks', h.taskCount, 'through', h.scannedTo)
console.log('access list', foldAdmin(h.admin).accessList)
