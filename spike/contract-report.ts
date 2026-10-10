// Runs the contract privacy report from the command line.
import type { Address } from 'viem'
import { chainById } from '../src/chains'
import { makeClients } from '../src/client'
import { contractReport } from '../src/report/contract'

const [chainId, address, seconds] = process.argv.slice(2)
const chain = chainById(Number(chainId))
const { client, logClient } = makeClients(chain)
const t0 = performance.now()
const r = await contractReport(client, logClient, chain, address as Address, { seconds: Number(seconds ?? 3600), maxTxs: 20 })
console.log(`${chain.name} ${address}: ${Math.round(performance.now() - t0)} ms, window txs ${r.windowTxs}, checked ${r.checkedTxs}, matched ${r.matchedTxs}, analysed ${r.analysed.length}`)
console.log('totals', r.totals, 'publicByOp', r.publicByOp, 'byOp', r.byOp, 'assumptions', r.assumptions)
