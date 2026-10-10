// FHE operations as they appear in TaskManager `TaskCreated(…, string operation, …)` events.
// Function ids mirror `enum FunctionId` in cofhe-contracts `ICofhe.sol`; the id is the last
// byte of the handle preimage, so it must match the contract exactly.

export type OpKind =
  | 'binary' // input1, input2 are handles
  | 'unary' // input1 is a handle
  | 'compare' // binary, result is ebool
  | 'select' // input1 = ebool condition, input2 / input3 = branches
  | 'cast' // input1 = handle, input2 = target type
  | 'trivial' // input1 = plaintext value, input2 = type, input3 = security zone
  | 'random' // input1 = seed, input2 = zone, input3 = caller address

export interface OpInfo {
  name: string
  id: number
  kind: OpKind
}

const table: OpInfo[] = [
  { name: 'cast', id: 2, kind: 'cast' },
  { name: 'select', id: 4, kind: 'select' },
  { name: 'sub', id: 7, kind: 'binary' },
  { name: 'add', id: 8, kind: 'binary' },
  { name: 'xor', id: 9, kind: 'binary' },
  { name: 'and', id: 10, kind: 'binary' },
  { name: 'or', id: 11, kind: 'binary' },
  { name: 'not', id: 12, kind: 'unary' },
  { name: 'div', id: 13, kind: 'binary' },
  { name: 'rem', id: 14, kind: 'binary' },
  { name: 'mul', id: 15, kind: 'binary' },
  { name: 'shl', id: 16, kind: 'binary' },
  { name: 'shr', id: 17, kind: 'binary' },
  { name: 'gte', id: 18, kind: 'compare' },
  { name: 'lte', id: 19, kind: 'compare' },
  { name: 'lt', id: 20, kind: 'compare' },
  { name: 'gt', id: 21, kind: 'compare' },
  { name: 'min', id: 22, kind: 'binary' },
  { name: 'max', id: 23, kind: 'binary' },
  { name: 'eq', id: 24, kind: 'compare' },
  { name: 'ne', id: 25, kind: 'compare' },
  { name: 'trivialEncrypt', id: 26, kind: 'trivial' },
  { name: 'random', id: 27, kind: 'random' },
  { name: 'rol', id: 28, kind: 'binary' },
  { name: 'ror', id: 29, kind: 'binary' },
  { name: 'square', id: 30, kind: 'unary' },
]

export const OPS: ReadonlyMap<string, OpInfo> = new Map(table.map((op) => [op.name, op]))

export const MUL_ID = 15

export function getOp(name: string): OpInfo | undefined {
  return OPS.get(name)
}

/** Handles consumed by a task, in order, as encoded in the event's input1..input3. */
export function handleInputs(op: OpInfo, inputs: readonly [bigint, bigint, bigint]): bigint[] {
  switch (op.kind) {
    case 'binary':
    case 'compare':
      return [inputs[0], inputs[1]]
    case 'unary':
    case 'cast':
      return [inputs[0]]
    case 'select':
      return [inputs[0], inputs[1], inputs[2]]
    case 'trivial':
    case 'random':
      return []
  }
}
