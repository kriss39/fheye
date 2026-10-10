// Exercises the mainnet card's data path on Sepolia by pretending the TaskManager was deployed
// 50 blocks ago (mainnet has no tasks yet).
import { chainById } from '../src/chains'
import { makeClients } from '../src/client'
import { attributeTasks } from '../src/mainnet/activity'
import { deserializeHistory, foldAdmin, scanHistory, serializeHistory } from '../src/mainnet/status'

const base = chainById(11155111)
const { client, logClient } = makeClients(base)
const head = await client.getBlockNumber()
const chain = { ...base, deployBlock: head - 50n }
const h1 = await scanHistory(logClient, chain, { toBlock: head - 20n })
const roundTrip = deserializeHistory(serializeHistory(h1))
const h2 = await scanHistory(logClient, chain, { prior: roundTrip, toBlock: head })
const full = await scanHistory(logClient, chain, { toBlock: head })
console.log(`incremental: ${h1.taskCount} + more = ${h2.taskCount}; one-shot: ${full.taskCount}; equal=${h2.taskCount === full.taskCount && h2.decryptCount === full.decryptCount}`)
const { contracts } = await attributeTasks(client, new Map(Object.entries(h2.tasksByTx) as Array<[`0x${string}`, number]>), 150)
console.log('top callers', contracts.slice(0, 3).map((c) => `${c.address}:${c.tasks}`), 'admin events', foldAdmin(h2.admin).accessList.length)
