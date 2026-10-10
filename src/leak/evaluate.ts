// Leak analysis: which handles in a task graph have values anyone can compute?
//
// Known leaves are trivialEncrypt outputs (the plaintext is in the event) and published decrypt
// results. Values propagate through ops whose operands are all known, and through identities
// that hold for any operand value (x - x = 0, mul by a known 0, select with equal branches …).
// Anything touching a user input or random value stays unknown unless an identity applies.

import type { Task } from '../tx/task'
import { evalOp, type Assumption } from './ops'

export type KnownSource = 'trivial' | 'published' | 'derived' | 'identity'

export interface Known {
  value: bigint
  source: KnownSource
  assumptions: Assumption[]
  /** Op of the task that produced the handle, for explanations. */
  op: string
  /** Leaf handles (trivial / published) this value was computed from. */
  leaves: bigint[]
}

export interface DecryptCheck {
  handle: bigint
  derived: bigint
  published: bigint
  match: boolean
  depth: number
}

export interface LeakReport {
  known: Map<bigint, Known>
  /** Published decrypts that could also be recomputed from public leaves. */
  checks: DecryptCheck[]
}

const uniq = (xs: bigint[]) => [...new Set(xs)]

function identity(t: Task, known: Map<bigint, Known>): bigint | null {
  const [a, b, c] = t.inputHandles
  const ka = a && known.get(a.handle)
  const kb = b && known.get(b.handle)
  const same = a && b && a.handle === b.handle
  const mask = a?.bits ? (1n << BigInt(a.bits)) - 1n : null
  switch (t.operation) {
    case 'sub':
    case 'xor':
      return same ? 0n : null
    case 'eq':
    case 'lte':
    case 'gte':
      return same ? 1n : null
    case 'ne':
    case 'lt':
    case 'gt':
      return same ? 0n : null
    case 'mul':
    case 'and':
      return ka?.value === 0n || kb?.value === 0n ? 0n : null
    case 'min':
      return ka?.value === 0n || kb?.value === 0n ? 0n : null
    case 'or':
    case 'max':
      return mask !== null && (ka?.value === mask || kb?.value === mask) ? mask : null
    case 'select': {
      if (b.handle === c.handle && known.get(b.handle)) return known.get(b.handle)!.value
      const kt = known.get(b.handle)
      const kf = known.get(c.handle)
      return kt && kf && kt.value === kf.value ? kt.value : null
    }
    default:
      return null
  }
}

/**
 * Tasks should be in creation order, but needn't be: handles are content-addressed, so a tx can
 * consume a trivialEncrypt handle stored by an earlier tx before re-creating it. Trivial values
 * are seeded first and the rest is evaluated to a fixpoint.
 */
export function analyzeLeaks(tasks: Task[], published: Map<bigint, bigint> = new Map()): LeakReport {
  const known = new Map<bigint, Known>()
  const depth = new Map<bigint, number>()
  const checks: DecryptCheck[] = []

  for (const t of tasks) {
    if (t.op?.kind === 'trivial' && !known.has(t.ctHash)) {
      known.set(t.ctHash, { value: t.input1, source: 'trivial', assumptions: [], op: t.operation, leaves: [t.ctHash] })
      depth.set(t.ctHash, 1)
    }
  }
  const publishedLeaf = (h: bigint): Known | undefined => {
    const v = published.get(h)
    return v === undefined ? undefined : { value: v, source: 'published', assumptions: [], op: 'decrypt', leaves: [h] }
  }
  const lookup = (h: bigint) => known.get(h) ?? publishedLeaf(h)
  const view = { get: lookup } as Map<bigint, Known>

  let pending = tasks.filter((t) => t.op && t.op.kind !== 'trivial' && t.op.kind !== 'random')
  for (let progress = true; progress && pending.length; ) {
    progress = false
    const still: Task[] = []
    for (const t of pending) {
      let result: Known | null = null
      const ins = t.inputHandles.map((h) => lookup(h.handle))
      if (ins.every(Boolean)) {
        const operandType = t.op!.kind === 'select' ? t.inputHandles[1].typeId : t.inputHandles[0].typeId
        const r = evalOp(t.operation, operandType, ins.map((k) => k!.value), t.op!.kind === 'cast' ? Number(t.input2) : undefined)
        if (r) {
          result = {
            value: r.value,
            source: 'derived',
            assumptions: [...new Set([...ins.flatMap((k) => k!.assumptions), ...r.assumptions])],
            op: t.operation,
            leaves: uniq(ins.flatMap((k) => k!.leaves)),
          }
        }
      }
      if (!result) {
        const v = identity(t, view)
        if (v !== null) result = { value: v, source: 'identity', assumptions: [], op: t.operation, leaves: [] }
      }
      if (!result) {
        still.push(t)
        continue
      }

      const d = 1 + Math.max(0, ...t.inputHandles.map((h) => depth.get(h.handle) ?? 0))
      const pub = published.get(t.ctHash)
      if (pub !== undefined) checks.push({ handle: t.ctHash, derived: result.value, published: pub, match: pub === result.value, depth: d })
      if (!known.has(t.ctHash)) {
        known.set(t.ctHash, result)
        depth.set(t.ctHash, d)
      }
      progress = true
    }
    pending = still
  }

  // Published values that couldn't be derived are still public leaves.
  for (const t of tasks) {
    for (const h of [t.ctHash, ...t.inputHandles.map((x) => x.handle)]) {
      const leaf = !known.has(h) && publishedLeaf(h)
      if (leaf) known.set(h, leaf)
    }
  }
  return { known, checks }
}
