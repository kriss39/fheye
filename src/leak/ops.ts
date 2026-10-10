// Plaintext semantics of CoFHE ops, following TFHE-rs (the production FHE engine), not the
// mock contracts, which differ for not/rol/ror/shl/rem (see notes in the README).
//
// Cases not yet confirmed on a live CoFHE network are reported as assumptions, so the UI can
// say what a result relies on:
// - div-by-zero / rem-by-zero: TFHE-rs documents MAX and the numerator respectively.
// - shift-mod-bits: TFHE-rs up to 1.6 truncates the shift amount (a true modulo for the
//   power-of-two widths CoFHE uses); tfhe-rs#53d1737 (June 2026, released in 1.7) returns 0
//   on overshift instead. The SDK pins tfhe 1.5.3, but the engine's version isn't public.

import { EBOOL, TYPE_BITS, isFheTypeId } from '../handle/decode'

export type Assumption = 'div-by-zero' | 'rem-by-zero' | 'shift-mod-bits'

export interface EvalResult {
  value: bigint
  assumptions: Assumption[]
}

export function bitsOf(typeId: number): number {
  if (!isFheTypeId(typeId)) throw new Error(`unknown type ${typeId}`)
  return TYPE_BITS[typeId]
}

const maskOf = (bits: number) => (1n << BigInt(bits)) - 1n

/**
 * Evaluates `op` on known plaintext operands. `typeId` is the operand type (for select, the
 * branch type; for cast, the source type) and `extra` carries cast's target type.
 * Returns null for ops whose value can't be derived from operands (random, inputs).
 */
export function evalOp(op: string, typeId: number, args: bigint[], extra?: number): EvalResult | null {
  const bits = bitsOf(typeId)
  const mask = maskOf(bits)
  const n = BigInt(bits)
  const [a, b, c] = args
  const ok = (value: bigint, ...assumptions: Assumption[]): EvalResult => ({ value, assumptions })
  const bool = (x: boolean) => ok(x ? 1n : 0n)

  switch (op) {
    case 'add':
      return ok((a + b) & mask)
    case 'sub':
      return ok((a - b) & mask)
    case 'mul':
      return ok((a * b) & mask)
    case 'square':
      return ok((a * a) & mask)
    case 'div':
      return b === 0n ? ok(mask, 'div-by-zero') : ok(a / b)
    case 'rem':
      return b === 0n ? ok(a, 'rem-by-zero') : ok(a % b)
    case 'and':
      return ok(a & b)
    case 'or':
      return ok(a | b)
    case 'xor':
      return ok(a ^ b)
    case 'not':
      return ok(typeId === EBOOL ? a ^ 1n : ~a & mask)
    case 'shl':
    case 'shr':
    case 'rol':
    case 'ror': {
      const s = b % n
      const assumptions: Assumption[] = b >= n ? ['shift-mod-bits'] : []
      if (op === 'shl') return { value: (a << s) & mask, assumptions }
      if (op === 'shr') return { value: a >> s, assumptions }
      if (op === 'rol') return { value: ((a << s) | (a >> ((n - s) % n))) & mask, assumptions }
      return { value: ((a >> s) | (a << ((n - s) % n))) & mask, assumptions }
    }
    case 'min':
      return ok(a < b ? a : b)
    case 'max':
      return ok(a > b ? a : b)
    case 'eq':
      return bool(a === b)
    case 'ne':
      return bool(a !== b)
    case 'lt':
      return bool(a < b)
    case 'lte':
      return bool(a <= b)
    case 'gt':
      return bool(a > b)
    case 'gte':
      return bool(a >= b)
    case 'select':
      return ok(a === 1n ? b : c)
    case 'cast': {
      if (extra === undefined) throw new Error('cast needs a target type')
      if (extra === EBOOL) return bool(a !== 0n)
      return ok(a & maskOf(bitsOf(extra)))
    }
    default:
      return null
  }
}
