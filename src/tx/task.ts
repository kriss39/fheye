// A decoded `TaskCreated` event plus consistency checks against the contract's rules.

import { decodeHandle, EBOOL, isFheTypeId, type DecodedHandle } from '../handle/decode'
import { deriveHandle } from '../handle/derive'
import { getOp, handleInputs, type OpInfo } from '../ops'

export interface RawTask {
  ctHash: bigint
  operation: string
  input1: bigint
  input2: bigint
  input3: bigint
  txHash?: `0x${string}`
  blockNumber?: bigint
  logIndex?: number
}

export interface Task extends RawTask {
  op: OpInfo | null
  output: DecodedHandle
  /** Handles this task consumed, decoded. Empty for trivialEncrypt and random. */
  inputHandles: DecodedHandle[]
  /** Result type implied by the op and its inputs, or null when the inputs don't determine it (random). */
  expectedType: number | null
  expectedZone: number | null
  /** keccak preimage reproduces the event's ctHash (upper 240 bits and metadata). */
  derivationMatches: boolean
  issues: string[]
}

// The zone travels as an int32 word but the handle stores int8(zone) (TMCommon.appendMetadata).
function zoneFromWord(w: bigint): number {
  const v = Number(w & 0xffn)
  return v >= 0x80 ? v - 0x100 : v
}

export function decodeTask(raw: RawTask): Task {
  const op = getOp(raw.operation) ?? null
  const output = decodeHandle(raw.ctHash)
  const issues: string[] = []
  const inputs = [raw.input1, raw.input2, raw.input3] as const

  if (!op) {
    return { ...raw, op, output, inputHandles: [], expectedType: null, expectedZone: null, derivationMatches: false, issues: [`unknown operation "${raw.operation}"`] }
  }

  const inputHandles = handleInputs(op, inputs).map((h) => decodeHandle(h))
  let expectedType: number | null = null
  let expectedZone: number | null = inputHandles[0]?.securityZone ?? null

  switch (op.kind) {
    case 'compare':
      expectedType = EBOOL
      break
    case 'binary':
    case 'unary':
      expectedType = inputHandles[0].typeId
      break
    case 'select':
      expectedType = inputHandles[1].typeId
      if (inputHandles[0].typeId !== EBOOL) issues.push('select condition is not ebool')
      if (inputHandles[1].typeId !== inputHandles[2].typeId) issues.push('select branches differ in type')
      break
    case 'cast':
      expectedType = Number(raw.input2)
      break
    case 'trivial':
      expectedType = Number(raw.input2)
      expectedZone = zoneFromWord(raw.input3)
      break
    case 'random':
      expectedZone = zoneFromWord(raw.input2)
      break
  }

  if (op.kind === 'binary' || op.kind === 'compare') {
    const [a, b] = inputHandles
    if (a.typeId !== b.typeId || a.securityZone !== b.securityZone) issues.push('operands differ in type or zone')
  }
  if (!isFheTypeId(output.typeId)) issues.push(`output has unknown type id ${output.typeId}`)
  if (expectedType !== null && output.typeId !== expectedType) issues.push(`output type ${output.typeId} != expected ${expectedType}`)
  if (expectedZone !== null && output.securityZone !== expectedZone) issues.push(`output zone ${output.securityZone} != expected ${expectedZone}`)
  if (output.isTrivial !== (op.kind === 'trivial')) issues.push(`trivial bit ${output.isTrivial} on ${op.name}`)

  // Hash part is checked with the output's own metadata so a type mismatch above isn't double-counted.
  const derived = deriveHandle(op, inputs, output.typeId, output.securityZone)
  const derivationMatches = derived === raw.ctHash
  if (!derivationMatches) issues.push('ctHash does not match keccak(inputs ‖ op)')

  return { ...raw, op, output, inputHandles, expectedType, expectedZone, derivationMatches, issues }
}
