import { encodeAbiParameters, encodeEventTopics, type Address, type Hash, type Log } from 'viem'
import { describe, expect, it } from 'vitest'
import { taskManagerAbi } from '../abi'
import { deriveHandle } from '../handle/derive'
import { getOp } from '../ops'
import { decodeTask, type Task } from '../tx/task'
import { radarFromLogs } from './feed'

const TM: Address = '0xeA30c4B8b44078Bbf8a6ef5b9f1eC1626C7848D9'
const U64 = 5
const task = (operation: string, inputs: [bigint, bigint, bigint]): Task => {
  const ctHash = deriveHandle(getOp(operation)!, inputs, U64, 0)
  return decodeTask({ ctHash, operation, input1: inputs[0], input2: inputs[1], input3: inputs[2] })
}
const trivial = (v: bigint) => task('trivialEncrypt', [v, BigInt(U64), 0n])
let i = 0
const log = (t: Task, tx: string, block: bigint): Log =>
  ({
    address: TM,
    topics: encodeEventTopics({ abi: taskManagerAbi, eventName: 'TaskCreated' }),
    data: encodeAbiParameters([{ type: 'uint256' }, { type: 'string' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }], [t.ctHash, t.operation, t.input1, t.input2, t.input3]),
    blockNumber: block,
    logIndex: i++,
    transactionHash: tx.padEnd(66, '0') as Hash,
  }) as unknown as Log

describe('radarFromLogs', () => {
  it('gives each transaction a verdict, newest first, following values across transactions', () => {
    const zero = trivial(0n)
    const amount = trivial(5000n)
    const mint = task('add', [zero.ctHash, amount.ctHash, 0n])
    const more = trivial(7n)
    const topUp = task('add', [mint.ctHash, more.ctHash, 0n])
    const secret = (0xbeefn << 16n) | (5n << 8n)
    const hidden = task('add', [secret, more.ctHash, 0n])
    const rows = radarFromLogs([log(zero, '0xa1', 10n), log(amount, '0xa1', 10n), log(mint, '0xa1', 10n), log(more, '0xb2', 12n), log(topUp, '0xb2', 12n), log(hidden, '0xc3', 11n)], TM)
    expect(rows.map((r) => [r.hash.slice(0, 4), r.exposed, r.viaEarlier, r.computed])).toEqual([
      ['0xb2', 1, 1, 1], // builds on the earlier mint
      ['0xc3', 0, 0, 1], // an encrypted input: nothing to see
      ['0xa1', 1, 0, 1], // 0 + 5000
    ])
  })
})
