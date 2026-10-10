// Leak analysis: which handles in a task graph have values anyone can compute?
//
// Known leaves are trivialEncrypt outputs (the plaintext is in the event) and published decrypt
// results. Values propagate through ops whose operands are all known, and through identities
// that hold for any operand value (x - x = 0, mul by a known 0, select with equal branches …).
// Anything touching a user input or random value stays unknown unless an identity applies.
//
// A false "public" mark is the worst error this tool can make, so: every value carries the
// TFHE-rs assumptions it relies on; when a decrypt published on-chain contradicts a derived
// value, the chain wins and every value resting on the same assumptions is dropped; tasks whose
// events don't decode cleanly are never evaluated.

import type { Task } from '../tx/task'
import { evalOp, type Assumption, type EvalResult } from './ops'

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
  assumptions: Assumption[]
}

export interface LeakReport {
  known: Map<bigint, Known>
  /** Published decrypts that could also be recomputed from public leaves, one per handle. */
  checks: DecryptCheck[]
  /** Assumptions contradicted by a published decrypt; values relying on them were dropped. */
  refuted: Assumption[]
}

const uniq = <T,>(xs: T[]) => [...new Set(xs)]

interface IdentityHit {
  value: bigint
  /** Known operands the identity relies on; their assumptions and leaves carry over. */
  deps: Known[]
}

function identity(t: Task, lookup: (h: bigint) => Known | undefined): IdentityHit | null {
  const [a, b, c] = t.inputHandles
  const ka = a && lookup(a.handle)
  const kb = b && lookup(b.handle)
  const same = a && b && a.handle === b.handle
  // Operands of binary ops share a type (the TaskManager enforces it), so a's width applies.
  const mask = a?.bits ? (1n << BigInt(a.bits)) - 1n : null
  const absorbing = (v: bigint | null): IdentityHit | null => {
    if (v === null) return null
    if (ka?.value === v) return { value: v, deps: [ka] }
    if (kb?.value === v) return { value: v, deps: [kb] }
    return null
  }
  switch (t.operation) {
    case 'sub':
    case 'xor':
      return same ? { value: 0n, deps: [] } : null
    case 'eq':
    case 'lte':
    case 'gte':
      return same ? { value: 1n, deps: [] } : null
    case 'ne':
    case 'lt':
    case 'gt':
      return same ? { value: 0n, deps: [] } : null
    case 'mul':
    case 'and':
    case 'min':
      return absorbing(0n)
    case 'or':
    case 'max':
      return absorbing(mask)
    case 'select': {
      const kt = lookup(b.handle)
      const kf = lookup(c.handle)
      if (b.handle === c.handle && kt) return { value: kt.value, deps: [kt] }
      return kt && kf && kt.value === kf.value ? { value: kt.value, deps: [kt, kf] } : null
    }
    default:
      return null
  }
}

function safeEval(t: Task, ins: Known[]): EvalResult | null {
  const operandType = t.op!.kind === 'select' ? t.inputHandles[1].typeId : t.inputHandles[0].typeId
  try {
    return evalOp(t.operation, operandType, ins.map((k) => k.value), t.op!.kind === 'cast' ? Number(t.input2) : undefined)
  } catch {
    return null // unknown type id: leave the value unknown rather than guess
  }
}

/**
 * Tasks should be in creation order, but needn't be: handles are content-addressed, so a tx can
 * consume a trivialEncrypt handle stored by an earlier tx before re-creating it. Trivial values
 * are seeded first and the rest is evaluated to a fixpoint.
 */
export function analyzeLeaks(
  tasks: Task[],
  published: Map<bigint, bigint> = new Map(),
  /** Resolves trivially encrypted handles created outside `tasks` (see leak/dictionary.ts). */
  resolveTrivial?: (handle: bigint) => bigint | undefined,
): LeakReport {
  const known = new Map<bigint, Known>()
  const depth = new Map<bigint, number>()
  const checks = new Map<bigint, DecryptCheck>()
  const refuted = new Set<Assumption>()
  // Only tasks whose event decoded cleanly (handle re-derived, types consistent) are trusted.
  const clean = tasks.filter((t) => t.op && t.issues.length === 0)

  for (const t of clean) {
    if (t.op!.kind === 'trivial' && !known.has(t.ctHash)) {
      known.set(t.ctHash, { value: t.input1, source: 'trivial', assumptions: [], op: t.operation, leaves: [t.ctHash] })
      depth.set(t.ctHash, 1)
    }
  }
  const publishedLeaf = (h: bigint): Known | undefined => {
    const v = published.get(h)
    return v === undefined ? undefined : { value: v, source: 'published', assumptions: [], op: 'decrypt', leaves: [h] }
  }
  const trivialLeaf = (h: bigint): Known | undefined => {
    if (!resolveTrivial || ((h >> 15n) & 1n) !== 1n) return undefined
    const v = resolveTrivial(h)
    return v === undefined ? undefined : { value: v, source: 'trivial', assumptions: [], op: 'trivialEncrypt', leaves: [h] }
  }
  const lookup = (h: bigint) => known.get(h) ?? publishedLeaf(h) ?? trivialLeaf(h)

  let pending = clean.filter((t) => t.op!.kind !== 'trivial' && t.op!.kind !== 'random')
  for (let progress = true; progress && pending.length; ) {
    progress = false
    const still: Task[] = []
    for (const t of pending) {
      let result: Known | null = null
      const ins = t.inputHandles.map((h) => lookup(h.handle))
      if (ins.every(Boolean)) {
        const r = safeEval(t, ins as Known[])
        if (r) {
          result = {
            value: r.value,
            source: 'derived',
            assumptions: uniq([...ins.flatMap((k) => k!.assumptions), ...r.assumptions]),
            op: t.operation,
            leaves: uniq(ins.flatMap((k) => k!.leaves)),
          }
        }
      }
      if (!result) {
        const hit = identity(t, lookup)
        if (hit)
          result = {
            value: hit.value,
            source: 'identity',
            assumptions: uniq(hit.deps.flatMap((k) => k.assumptions)),
            op: t.operation,
            leaves: uniq(hit.deps.flatMap((k) => k.leaves)),
          }
      }
      if (!result) {
        still.push(t)
        continue
      }

      const d = 1 + Math.max(0, ...t.inputHandles.map((h) => depth.get(h.handle) ?? 0))
      const pub = published.get(t.ctHash)
      if (pub !== undefined && !checks.has(t.ctHash)) {
        checks.set(t.ctHash, { handle: t.ctHash, derived: result.value, published: pub, match: pub === result.value, depth: d, assumptions: result.assumptions })
      }
      if (pub !== undefined && pub !== result.value) {
        // The chain contradicts the model. Trust the chain for this handle and distrust whatever
        // assumptions the derivation used.
        result.assumptions.forEach((a) => refuted.add(a))
        result = publishedLeaf(t.ctHash)!
      }
      if (!known.has(t.ctHash)) {
        known.set(t.ctHash, result)
        depth.set(t.ctHash, d)
      }
      progress = true
    }
    pending = still
  }

  if (refuted.size) {
    for (const [h, k] of known) if (k.assumptions.some((a) => refuted.has(a))) known.delete(h)
  }

  // Published values that couldn't be derived, and resolved external trivials, are still public leaves.
  for (const t of tasks) {
    for (const h of [t.ctHash, ...t.inputHandles.map((x) => x.handle)]) {
      const leaf = !known.has(h) && (publishedLeaf(h) ?? trivialLeaf(h))
      if (leaf) known.set(h, leaf)
    }
  }
  return { known, checks: [...checks.values()], refuted: [...refuted] }
}
