// S1: pull real TaskCreated events from Eth Sepolia, decode every handle and check that
// type / zone / trivial bit agree with the op, and that keccak(inputs ‖ op) reproduces ctHash.
import { createPublicClient, http } from 'viem'
import { sepolia } from 'viem/chains'
import { taskManagerAbi } from '../src/abi'
import { chainById } from '../src/chains'
import { decodeTask } from '../src/tx/task'

const chain = chainById(11155111)
const client = createPublicClient({ chain: sepolia, transport: http(chain.rpc) })
const SPAN = BigInt(process.argv[2] ?? 300)
const BACK = BigInt(process.argv[3] ?? 0)

const head = (await client.getBlockNumber()) - BACK
const logs = await client.getContractEvents({
  address: chain.taskManager,
  abi: taskManagerAbi,
  eventName: 'TaskCreated',
  fromBlock: head - SPAN,
  toBlock: head,
})

const tasks = logs.map((l) =>
  decodeTask({
    ctHash: l.args.ctHash!,
    operation: l.args.operation!,
    input1: l.args.input1!,
    input2: l.args.input2!,
    input3: l.args.input3!,
    txHash: l.transactionHash,
    blockNumber: l.blockNumber,
    logIndex: l.logIndex,
  }),
)

const byOp = new Map<string, { n: number; bad: number; derivOk: number; types: Map<number, number> }>()
for (const t of tasks) {
  const s = byOp.get(t.operation) ?? { n: 0, bad: 0, derivOk: 0, types: new Map() }
  s.n++
  if (t.issues.length) s.bad++
  if (t.derivationMatches) s.derivOk++
  s.types.set(t.output.typeId, (s.types.get(t.output.typeId) ?? 0) + 1)
  byOp.set(t.operation, s)
}

console.log(`blocks ${head - SPAN}..${head}: ${tasks.length} TaskCreated in ${new Set(tasks.map((t) => t.txHash)).size} txs`)
console.log('op'.padEnd(16), 'count', 'issues', 'derivOK', 'output types')
for (const [op, s] of [...byOp].sort((a, b) => b[1].n - a[1].n)) {
  console.log(op.padEnd(16), String(s.n).padStart(5), String(s.bad).padStart(6), String(s.derivOk).padStart(7), [...s.types].map(([k, v]) => `${k}:${v}`).join(' '))
}

const bad = tasks.filter((t) => t.issues.length)
console.log(`\ntasks with issues: ${bad.length}/${tasks.length}`)
for (const t of bad.slice(0, 10)) console.log(t.operation, t.txHash, t.output.hex, t.issues)

// The spike criterion asks for 50: take a stratified sample (every op type represented) and show it.
const sample: typeof tasks = []
const perOp = new Map<string, number>()
for (const t of tasks) {
  if (sample.length >= 50) break
  const c = perOp.get(t.operation) ?? 0
  if (c < Math.max(2, Math.ceil(50 / byOp.size))) {
    sample.push(t)
    perOp.set(t.operation, c + 1)
  }
}
for (const t of tasks) if (sample.length < 50 && !sample.includes(t)) sample.push(t)
const sampleOk = sample.filter((t) => t.issues.length === 0).length
console.log(`\nstratified sample: ${sampleOk}/${sample.length} consistent`)
for (const t of sample.slice(0, 12)) {
  console.log(`${t.operation.padEnd(15)} out=${t.output.typeName}${t.output.isTrivial ? '(trivial)' : ''} zone=${t.output.securityZone} inputs=[${t.inputHandles.map((h) => h.typeName).join(',')}] deriv=${t.derivationMatches}`)
}
