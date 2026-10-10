import { encodeEventTopics, encodeAbiParameters, getAbiItem, zeroAddress, type Address, type Log } from 'viem'
import { describe, expect, it } from 'vitest'
import { taskManagerAbi } from '../abi'
import { deriveHandle } from '../handle/derive'
import { analyzeLeaks } from '../leak/evaluate'
import { getOp } from '../ops'
import { decodeTask, type Task } from '../tx/task'
import { analyzeWindow, publicComputedValues } from './contract'

const U64 = 5
function task(operation: string, inputs: [bigint, bigint, bigint], typeId = U64): Task {
  const ctHash = deriveHandle(getOp(operation)!, inputs, typeId, 0)
  return decodeTask({ ctHash, operation, input1: inputs[0], input2: inputs[1], input3: inputs[2] })
}
const trivial = (v: bigint) => task('trivialEncrypt', [v, BigInt(U64), 0n])

describe('publicComputedValues', () => {
  it('flags a value that builds on an earlier transaction, and says so', () => {
    // tx 1: balance = 0 + 10000 (the first-mint pattern); tx 2: balance += 5000
    const zero = trivial(0n)
    const tenK = trivial(10000n)
    const first = task('add', [zero.ctHash, tenK.ctHash, 0n])
    const fiveK = trivial(5000n)
    const second = task('add', [first.ctHash, fiveK.ctHash, 0n])

    const tx2 = analyzeLeaks([fiveK, second])
    expect(tx2.known.has(second.ctHash)).toBe(false) // invisible from tx 2 alone

    const window = analyzeLeaks([zero, tenK, first, fiveK, second])
    const found = publicComputedValues([second], tx2, window)
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ viaEarlier: true, known: { value: 15000n, source: 'derived' } })

    const tx1 = analyzeLeaks([zero, tenK, first])
    expect(publicComputedValues([first], tx1, window)[0].viaEarlier).toBe(false)
  })
})

const TM: Address = '0xeA30c4B8b44078Bbf8a6ef5b9f1eC1626C7848D9'
let logIndex = 0
function taskLog(t: Task, block: bigint): Log {
  const ev = getAbiItem({ abi: taskManagerAbi, name: 'TaskCreated' })
  const data = encodeAbiParameters(ev.inputs, [t.ctHash, t.operation, t.input1, t.input2, t.input3])
  return { address: TM, topics: encodeEventTopics({ abi: taskManagerAbi, eventName: 'TaskCreated' }), data, blockNumber: block, logIndex: logIndex++ } as unknown as Log
}
function decryptLog(ctHash: bigint, result: bigint, block: bigint): Log {
  const data = encodeAbiParameters([{ type: 'uint256' }, { type: 'uint256' }], [ctHash, result])
  return { address: TM, topics: encodeEventTopics({ abi: taskManagerAbi, eventName: 'DecryptionResult', args: { requestor: zeroAddress } }), data, blockNumber: block, logIndex: logIndex++ } as unknown as Log
}

describe('analyzeWindow', () => {
  it('follows a root back through producer events, out of order, and uses published decrypts', () => {
    const zero = trivial(0n)
    const tenK = trivial(10000n)
    const first = task('add', [zero.ctHash, tenK.ctHash, 0n])
    const fiveK = trivial(5000n)
    const second = task('add', [first.ctHash, fiveK.ctHash, 0n])
    const secret = 0xabcdn << 16n
    const fromSecret = task('add', [secret | (5n << 8n), fiveK.ctHash, 0n])

    // newest chunk first, as a concurrent scan can return them
    const logs = [taskLog(fiveK, 9n), taskLog(second, 9n), taskLog(fromSecret, 9n), taskLog(zero, 3n), taskLog(tenK, 3n), taskLog(first, 3n)]
    const w = analyzeWindow(logs, TM, [second.ctHash, fromSecret.ctHash])
    expect(w.known.get(second.ctHash)).toMatchObject({ value: 15000n, source: 'derived' })
    expect(w.known.has(fromSecret.ctHash)).toBe(false)

    // a published decrypt of the secret's sum makes it a leaf
    const withDecrypt = analyzeWindow([...logs, decryptLog(fromSecret.ctHash, 7n, 10n)], TM, [fromSecret.ctHash])
    expect(withDecrypt.known.get(fromSecret.ctHash)).toMatchObject({ value: 7n, source: 'published' })
  })
})
