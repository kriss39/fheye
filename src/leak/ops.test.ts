import { describe, expect, it } from 'vitest'
import { evalOp } from './ops'

const U8 = 2
const U64 = 5
const BOOL = 0
const v = (op: string, t: number, args: bigint[], extra?: number) => evalOp(op, t, args, extra)?.value

describe('evalOp (TFHE-rs semantics)', () => {
  it('wraps arithmetic modulo 2^bits', () => {
    expect(v('add', U8, [250n, 10n])).toBe(4n)
    expect(v('sub', U8, [3n, 5n])).toBe(254n)
    expect(v('mul', U8, [16n, 17n])).toBe(16n)
    expect(v('square', U8, [16n])).toBe(0n)
  })

  it('div by zero gives MAX and rem by zero gives the numerator, marked as assumptions', () => {
    expect(evalOp('div', U8, [7n, 0n])).toEqual({ value: 255n, assumptions: ['div-by-zero'] })
    expect(evalOp('rem', U8, [7n, 0n])).toEqual({ value: 7n, assumptions: ['rem-by-zero'] })
    expect(evalOp('div', U8, [7n, 2n])).toEqual({ value: 3n, assumptions: [] })
  })

  it('not is bitwise for integers and logical for ebool (unlike the mocks)', () => {
    expect(v('not', U8, [5n])).toBe(250n)
    expect(v('not', BOOL, [1n])).toBe(0n)
    expect(v('not', BOOL, [0n])).toBe(1n)
  })

  it('rotates instead of shifting (unlike the mocks)', () => {
    expect(v('rol', U8, [0x81n, 1n])).toBe(0x03n)
    expect(v('ror', U8, [0x81n, 1n])).toBe(0xc0n)
    expect(v('rol', U8, [0x81n, 0n])).toBe(0x81n)
  })

  it('reduces shift amounts modulo the bit width, marked as an assumption', () => {
    expect(evalOp('shl', U8, [3n, 9n])).toEqual({ value: 6n, assumptions: ['shift-mod-bits'] })
    expect(evalOp('shr', U8, [0x80n, 7n])).toEqual({ value: 1n, assumptions: [] })
  })

  it('compares into ebool and selects', () => {
    expect(v('gte', U64, [10000n, 10000n])).toBe(1n)
    expect(v('lt', U64, [1n, 0n])).toBe(0n)
    expect(v('select', U64, [1n, 7n, 9n])).toBe(7n)
    expect(v('select', U64, [0n, 7n, 9n])).toBe(9n)
  })

  it('casts by truncation, and to ebool by != 0', () => {
    expect(v('cast', 3, [0x1234n], U8)).toBe(0x34n)
    expect(v('cast', U8, [0x34n], 3)).toBe(0x34n)
    expect(v('cast', U8, [2n], BOOL)).toBe(1n)
  })

  it('returns null for ops without a plaintext meaning', () => {
    expect(evalOp('random', U8, [])).toBeNull()
  })
})
