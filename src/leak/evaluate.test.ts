import { describe, expect, it } from 'vitest'
import { appendMetadata, deriveHandle } from '../handle/derive'
import { getOp } from '../ops'
import { decodeTask, type Task } from '../tx/task'
import { analyzeLeaks } from './evaluate'

const U8 = 2

// Builds a task whose ctHash is derived exactly like the TaskManager would, so it passes the
// "decoded cleanly" filter.
function task(operation: string, inputs: [bigint, bigint, bigint], typeId: number): Task {
  const op = getOp(operation)!
  const ctHash = deriveHandle(op, inputs, typeId, 0)
  const t = decodeTask({ ctHash, operation, input1: inputs[0], input2: inputs[1], input3: inputs[2] })
  expect(t.issues).toEqual([])
  return t
}
const trivial = (v: bigint) => task('trivialEncrypt', [v, BigInt(U8), 0n], U8)
const secret = appendMetadata(0x1234n << 16n, 0, U8, false) // stands in for an encrypted user input

describe('analyzeLeaks safety', () => {
  it('carries assumptions through identities (or with an all-ones operand)', () => {
    const ff = trivial(0xffn)
    const eight = trivial(8n)
    const k = task('shl', [ff.ctHash, eight.ctHash, 0n], U8) // 255 only if shifts wrap mod 8
    const o = task('or', [secret, k.ctHash, 0n], U8)
    const { known } = analyzeLeaks([ff, eight, k, o])
    expect(known.get(k.ctHash)).toMatchObject({ value: 0xffn, assumptions: ['shift-mod-bits'] })
    expect(known.get(o.ctHash)).toMatchObject({ value: 0xffn, source: 'identity', assumptions: ['shift-mod-bits'] })
  })

  it('carries assumptions through max with a div-by-zero operand', () => {
    const five = trivial(5n)
    const zero = trivial(0n)
    const q = task('div', [five.ctHash, zero.ctHash, 0n], U8)
    const m = task('max', [secret, q.ctHash, 0n], U8)
    expect(analyzeLeaks([five, zero, q, m]).known.get(m.ctHash)?.assumptions).toEqual(['div-by-zero'])
  })

  it('lets a contradicting published decrypt win and drops values resting on the refuted assumption', () => {
    const ff = trivial(0xffn)
    const eight = trivial(8n)
    const k = task('shl', [ff.ctHash, eight.ctHash, 0n], U8)
    const o = task('or', [secret, k.ctHash, 0n], U8)
    const ff2 = trivial(0xf0n)
    const nine = trivial(9n)
    const k2 = task('shl', [ff2.ctHash, nine.ctHash, 0n], U8) // another overshift elsewhere
    const report = analyzeLeaks([ff, eight, k, o, ff2, nine, k2], new Map([[k.ctHash, 0n]]))
    expect(report.checks).toEqual([expect.objectContaining({ handle: k.ctHash, derived: 0xffn, published: 0n, match: false })])
    expect(report.refuted).toEqual(['shift-mod-bits'])
    expect(report.known.get(k.ctHash)).toMatchObject({ value: 0n, source: 'published' })
    // or(secret, 0) is the secret: must not be marked public
    expect(report.known.has(o.ctHash)).toBe(false)
    expect(report.known.has(k2.ctHash)).toBe(false)
  })

  it('never evaluates tasks whose event did not decode cleanly', () => {
    const t = trivial(7n)
    const bad = { ...t, issues: ['output type 2 != expected 3'] }
    expect(analyzeLeaks([bad]).known.size).toBe(0)
  })

  it('leaves values of unknown types unknown instead of throwing', () => {
    const odd = appendMetadata(0x99n << 16n, 0, 8, false) // euint256 id, rejected by the TaskManager
    const t = { ...task('add', [secret, secret, 0n], U8), inputHandles: [{ ...decodeTask({ ctHash: odd, operation: 'add', input1: 0n, input2: 0n, input3: 0n }).output }, { ...decodeTask({ ctHash: odd, operation: 'add', input1: 0n, input2: 0n, input3: 0n }).output }] }
    expect(() => analyzeLeaks([t], new Map([[odd, 1n]]))).not.toThrow()
  })

  it('records one check per handle even when the handle is produced twice', () => {
    const a = trivial(1n)
    const b = trivial(2n)
    const s1 = task('add', [a.ctHash, b.ctHash, 0n], U8)
    const s2 = { ...s1 }
    expect(analyzeLeaks([a, b, s1, s2], new Map([[s1.ctHash, 3n]])).checks).toHaveLength(1)
  })
})
