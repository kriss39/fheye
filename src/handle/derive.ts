// Recomputes a task's output handle the way TaskManager does (TMCommon.calcPlaceholderKey):
// keccak256(input_0 ‖ … ‖ input_n ‖ functionId) with the low 16 bits replaced by metadata.
// If the recomputed handle equals the one in the event, the event was decoded correctly.

import { keccak256 } from 'viem'
import { EBOOL, HASH_MASK } from './decode'
import { MUL_ID, type OpInfo } from '../ops'

export function appendMetadata(preHash: bigint, zone: number, typeId: number, isTrivial: boolean): bigint {
  const meta = ((isTrivial ? 0x80n : 0n) << 8n) | ((BigInt(typeId) & 0x7fn) << 8n) | BigInt(zone & 0xff)
  return (preHash & HASH_MASK) | meta
}

function preimage(words: bigint[], opId: number): Uint8Array {
  const out = new Uint8Array(words.length * 32 + 1)
  words.forEach((w, i) => {
    for (let b = 0; b < 32; b++) out[i * 32 + b] = Number((w >> BigInt(8 * (31 - b))) & 0xffn)
  })
  out[out.length - 1] = opId
  return out
}

/** The operand words the contract hashed, recovered from the event's input1..input3. */
export function preimageWords(op: OpInfo, inputs: readonly [bigint, bigint, bigint]): bigint[] {
  switch (op.kind) {
    case 'binary':
    case 'compare':
    case 'cast':
      return [inputs[0], inputs[1]]
    case 'unary':
      // square is hashed as mul(x, x)
      return op.name === 'square' ? [inputs[0], inputs[0]] : [inputs[0]]
    case 'select':
    case 'trivial':
      return [inputs[0], inputs[1], inputs[2]]
    case 'random':
      // createRandomTask hashes [seed, caller]; the event carries the zone in between
      return [inputs[0], inputs[2]]
  }
}

/**
 * Expected output handle for a task. `typeId` is the result type the caller asked for; for
 * comparisons the contract forces ebool, for trivialEncrypt/cast it is in the inputs.
 */
export function deriveHandle(op: OpInfo, inputs: readonly [bigint, bigint, bigint], typeId: number, zone: number): bigint {
  const opId = op.name === 'square' ? MUL_ID : op.id
  const hash = BigInt(keccak256(preimage(preimageWords(op, inputs), opId)))
  const resultType = op.kind === 'compare' ? EBOOL : typeId
  return appendMetadata(hash, zone, resultType, op.kind === 'trivial')
}
