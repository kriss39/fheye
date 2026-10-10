// S4: mainnet TaskManager (Ethereum + Arbitrum One): live flags and the full event history
// from deployment, folded into access list / roles / signers and re-checked against storage.
import { chainById } from '../src/chains'
import { makeClients } from '../src/client'
import { foldAdmin, readFlags, scanHistory, verifyAccessList } from '../src/mainnet/status'

const json = (v: unknown) => JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? x.toString() : x))

for (const id of [1, 42161]) {
  const chain = chainById(id)
  const { client, logClient } = makeClients(chain)
  const t0 = performance.now()
  const flags = await readFlags(client, chain.taskManager)
  const t1 = performance.now()
  const history = await scanHistory(logClient, chain)
  const t2 = performance.now()
  const state = foldAdmin(history.admin)
  const access = await verifyAccessList(client, chain.taskManager, state.accessList)

  console.log(`\n=== ${chain.name} (TM ${chain.taskManager})`)
  console.log('flags', json(flags), `(${Math.round(t1 - t0)} ms)`)
  console.log(`history ${history.scannedFrom}..${history.scannedTo}: ${history.admin.length} admin events, ${history.taskCount} tasks, ${history.inputCount} inputs, ${history.decryptCount} decrypts (${Math.round(t2 - t1)} ms)`)
  console.log('roles', state.roles.map((r) => `${r.role}=${r.account}`))
  console.log('signer changes', state.signerHistory.map((e) => `${e.blockNumber} ${e.name} -> ${e.args.newSigner}`))
  console.log(`access list: ${access.length}`, access.map((a) => `${a.account} onChain=${a.onChain}`), `deny list: ${state.denyList.length}`)
}
