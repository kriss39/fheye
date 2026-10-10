// Prints the task graph of one tx: ops, handles (short), decoded inputs, ACL-free view.
import { chainById } from '../src/chains'
import { makeClients } from '../src/client'
import { buildTxGraph, graphDepth } from '../src/tx/graph'

const [hash, chainArg] = process.argv.slice(2)
const chain = chainById(Number(chainArg ?? 11155111))
const { client } = makeClients(chain)
const receipt = await client.getTransactionReceipt({ hash: hash as `0x${string}` })
const tx = await client.getTransaction({ hash: hash as `0x${string}` })
const g = buildTxGraph(receipt.logs, chain.taskManager)
const short = (h: bigint) => `0x${h.toString(16).padStart(64, '0').slice(0, 6)}…${h.toString(16).slice(-4)}`
console.log(`tx ${hash} to=${tx.to} gasUsed=${receipt.gasUsed} tasks=${g.tasks.length} depth=${graphDepth(g)} inputs=${g.inputs.size} decrypts=${g.decrypts.length}`)
for (const t of g.tasks) {
  const ins = t.op?.kind === 'trivial' ? `value=${t.input1} type=${t.input2}` : t.inputHandles.map((h) => `${short(h.handle)}${g.byHandle.has(h.handle) ? '' : g.inputs.has(h.handle) ? '(input)' : '(external)'}`).join(', ')
  console.log(`  #${t.logIndex} ${short(t.ctHash)} = ${t.operation}(${ins}) : ${t.output.typeName}`)
}
for (const d of g.decrypts) console.log(`  decrypt published ${short(d.ctHash)} = ${d.result}`)
