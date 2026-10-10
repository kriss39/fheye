// S3: read the ACL address from the TaskManager, then check isAllowed for handles created in
// recent txs against the contract that created them (tx.to), plus a negative control.
import { getAbiItem, type Address } from 'viem'
import { aclAbi, taskManagerAbi } from '../src/abi'
import { chainById } from '../src/chains'
import { makeClients } from '../src/client'
import { scanLogs } from '../src/logs'
import { buildTxGraph } from '../src/tx/graph'

const chain = chainById(11155111)
const { client } = makeClients(chain)
const acl = await client.readContract({ address: chain.taskManager, abi: taskManagerAbi, functionName: 'acl' })
console.log('ACL from TaskManager.acl():', acl)

const head = await client.getBlockNumber()
const logs = await scanLogs({
  client,
  address: chain.taskManager,
  events: [getAbiItem({ abi: taskManagerAbi, name: 'TaskCreated' })],
  fromBlock: head - 60n,
  toBlock: head - 10n,
  maxRange: 1000n,
})
const txs = [...new Set(logs.map((l) => l.transactionHash!))]
const picked: `0x${string}`[] = []
// prefer txs with different op mixes
const seenShapes = new Set<string>()
for (const h of txs) {
  const ops = logs.filter((l) => l.transactionHash === h).map((l) => (l as unknown as { args: { operation: string } }).args.operation)
  const shape = [...new Set(ops)].sort().join(',')
  if (!seenShapes.has(shape) || picked.length < 4) {
    seenShapes.add(shape)
    picked.push(h)
  }
  if (picked.length >= 8) break
}

const STRANGER: Address = '0x000000000000000000000000000000000000bEEF'
let allowedTo = 0
let total = 0
for (const hash of picked) {
  const [tx, receipt] = await Promise.all([client.getTransaction({ hash }), client.getTransactionReceipt({ hash })])
  const g = buildTxGraph(receipt.logs, chain.taskManager)
  const rows = await Promise.all(
    g.tasks.map(async (t) => {
      const [viaAcl, viaTm, sender, stranger, global] = await Promise.all([
        client.readContract({ address: acl, abi: aclAbi, functionName: 'isAllowed', args: [t.ctHash, tx.to!] }),
        client.readContract({ address: chain.taskManager, abi: taskManagerAbi, functionName: 'isAllowed', args: [t.ctHash, tx.to!] }),
        client.readContract({ address: acl, abi: aclAbi, functionName: 'isAllowed', args: [t.ctHash, tx.from] }),
        client.readContract({ address: acl, abi: aclAbi, functionName: 'isAllowed', args: [t.ctHash, STRANGER] }),
        client.readContract({ address: acl, abi: aclAbi, functionName: 'globalAllowed', args: [t.ctHash] }),
      ])
      return { op: t.operation, viaAcl, viaTm, sender, stranger, global }
    }),
  )
  total += rows.length
  allowedTo += rows.filter((r) => r.viaAcl).length
  const agree = rows.every((r) => r.viaAcl === r.viaTm)
  console.log(`\ntx ${hash} to=${tx.to} tasks=${g.tasks.length} inputsVerified=${g.inputs.size} decrypts=${g.decrypts.length} acl==tm:${agree}`)
  for (const r of rows) console.log(`  ${r.op.padEnd(15)} contract=${r.viaAcl} sender=${r.sender} stranger=${r.stranger} global=${r.global}`)
}
console.log(`\nhandles allowed for the calling contract: ${allowedTo}/${total}`)
