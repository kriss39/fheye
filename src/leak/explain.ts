// Plain-language verdict for one transaction: which value is exposed, the sum that exposes it,
// and what a developer could do about it. The tx page's verdict card renders this; the graph and
// task table below it carry the technical detail.

import type { HandleStatus } from '../acl/check'
import type { TxGraph } from '../tx/graph'
import type { Known, LeakReport } from './evaluate'
import { ASSUMPTION_TEXT } from './ops'

export type ChipKind = 'constant' | 'published' | 'computed' | 'secret'

export interface Chip {
  value: string
  kind: ChipKind
  note: string
}

/** Chips are values; strings are the operators between them. */
export type EquationPart = Chip | string

export interface Verdict {
  kind: 'exposed' | 'private' | 'none'
  headline: string
  /** Count line, e.g. "1 of 8 computed values in this transaction looks encrypted but is public." */
  detail: string
  equation?: { parts: EquationPart[]; result: Chip; handle: bigint; value: bigint }
  explanation: string
  advice?: string
  notes: string[]
}

const INFIX: Record<string, string> = { add: '+', sub: '−', mul: '×', div: '÷', rem: 'mod', and: 'AND', or: 'OR', xor: 'XOR', shl: '<<', shr: '>>', eq: '=', ne: '≠', lt: '<', lte: '≤', gt: '>', gte: '≥' }
const AS_FN: Record<string, string> = { ebool: 'asEbool', euint8: 'asEuint8', euint16: 'asEuint16', euint32: 'asEuint32', euint64: 'asEuint64', euint128: 'asEuint128', eaddress: 'asEaddress' }

const isLeak = (k?: Known) => k?.source === 'derived' || k?.source === 'identity'
const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many)

export function valueText(v: bigint, typeName?: string | null): string {
  if (typeName === 'ebool') return v === 1n ? 'true' : 'false'
  if (typeName === 'eaddress') return `0x${v.toString(16).padStart(40, '0')}`
  return v.toLocaleString('en-US')
}

function listText(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

export function explainTx(graph: TxGraph, leaks: LeakReport, status: Map<bigint, HandleStatus> = new Map()): Verdict {
  const { known } = leaks
  const typeOf = (h: bigint) => graph.byHandle.get(h)?.output.typeName ?? null
  const computed = graph.tasks.filter((t) => t.op?.kind !== 'trivial' && t.op?.kind !== 'random')
  const exposed = computed.filter((t) => isLeak(known.get(t.ctHash)))
  const trivials = graph.tasks.filter((t) => t.op?.kind === 'trivial')
  const global = [...status.values()].filter((s) => s.global).length

  const notes: string[] = []
  if (global) notes.push(`${global} ${plural(global, 'value is', 'values are')} marked readable by anyone (allowGlobal). That is a deliberate choice of the contract.`)
  if (graph.decrypts.length) notes.push(`This transaction published ${graph.decrypts.length} decrypted ${plural(graph.decrypts.length, 'value')} on-chain.`)
  const assumptions = [...new Set(exposed.flatMap((t) => known.get(t.ctHash)!.assumptions))]
  if (assumptions.length) notes.push(`This assumes CoFHE follows TFHE-rs here: ${assumptions.map((a) => ASSUMPTION_TEXT[a]).join('; ')}.`)

  if (graph.tasks.length === 0) {
    const what = graph.inputs.size ? `only verified ${graph.inputs.size} encrypted ${plural(graph.inputs.size, 'input')}` : graph.decrypts.length ? 'only published decrypt results' : 'did not interact with the CoFHE TaskManager'
    return { kind: 'none', headline: 'No encrypted computation here', detail: `This transaction ${what}.`, explanation: 'There is nothing to recompute: no FHE operation ran in this transaction.', notes }
  }

  if (exposed.length === 0) {
    if (trivials.length) notes.unshift(`${trivials.length} plain ${plural(trivials.length, 'number was', 'numbers were')} written into the transaction, readable by anyone, but mixed with encrypted data.`)
    return {
      kind: 'private',
      headline: 'Nothing here can be worked out from public data',
      detail: 'No computed value in this transaction can be derived from public data alone.',
      explanation: 'Every computed value depends on something encrypted: a user input, randomness, or an encrypted value from an earlier transaction. That does not prove the contract is private, only that FHE Lens found no shortcut in this transaction.',
      notes,
    }
  }

  // Lead with the last exposed value: usually the one the contract stores.
  const lead = exposed[exposed.length - 1]
  const k = known.get(lead.ctHash)!
  const result: Chip = { value: valueText(k.value, lead.output.typeName), kind: 'computed', note: 'stored encrypted, but anyone can work it out' }

  const chip = (h: bigint): Chip => {
    const v = known.get(h)
    const producer = graph.byHandle.get(h)
    if (!v) return { value: 'encrypted', kind: 'secret', note: graph.inputs.has(h) ? 'encrypted user input' : 'encrypted value' }
    const value = valueText(v.value, typeOf(h) ?? lead.output.typeName)
    if (v.source === 'trivial') return { value, kind: 'constant', note: producer ? 'plain number in this transaction' : 'plain number from an earlier transaction' }
    if (v.source === 'published') return { value, kind: 'published', note: 'decrypted publicly' }
    return { value, kind: 'computed', note: 'worked out from public numbers' }
  }
  const ins = lead.inputHandles.map((i) => chip(i.handle))
  const op = lead.operation
  const parts: EquationPart[] = INFIX[op]
    ? [ins[0], INFIX[op], ins[1]]
    : op === 'select'
      ? [ins[0], '?', ins[1], ':', ins[2]]
      : op === 'not'
        ? ['NOT', ins[0]]
        : op === 'square'
          ? [ins[0], '²']
          : op === 'cast'
            ? [ins[0], `as ${lead.output.typeName ?? 'type'}`]
            : [`${op}(`, ...ins.flatMap((c, i) => (i ? [',', c] : [c])), ')']

  const leafValues = (source: Known['source']) => [
    ...new Set(k.leaves.filter((h) => known.get(h)?.source === source).map((h) => valueText(known.get(h)!.value, typeOf(h) ?? lead.output.typeName))),
  ]
  const constants = leafValues('trivial')
  const published = leafValues('published')
  const sources = [
    constants.length ? `the plain ${plural(constants.length, 'number')} ${listText(constants.length > 4 ? [...constants.slice(0, 3), 'others'] : constants)} written into the transaction` : '',
    published.length ? `${plural(published.length, 'a value that was', 'values that were')} already decrypted publicly (${listText(published)})` : '',
  ].filter(Boolean)

  const explanation =
    k.source === 'identity'
      ? `This ${op} gives ${result.value} whatever the encrypted inputs are, so anyone knows the result without decrypting anything.`
      : `This value is computed only from ${listText(sources)}. The result is stored encrypted, but anyone who reads the chain can repeat the math: it's ${result.value}.`

  const lastConstant = k.leaves.filter((h) => known.get(h)?.source === 'trivial').at(-1)
  const asFn = AS_FN[(lastConstant !== undefined && typeOf(lastConstant)) || lead.output.typeName || ''] ?? 'asEuint64'
  const code = lastConstant !== undefined ? `FHE.${asFn}(${known.get(lastConstant)!.value})` : ''
  const advice =
    k.source === 'identity'
      ? 'This operation returns the same result for any input, so it hides nothing. Check the contract logic.'
      : constants.length
        ? `Fine if ${result.value} is meant to be public. If it should stay secret, don't build it from plain numbers such as ${code}: let the user encrypt the value with the CoFHE SDK and pass it in as an encrypted input.`
        : 'Anything computed only from publicly decrypted values is public too. Mix in an encrypted value if the result should stay secret.'

  if (exposed.length > 1) notes.unshift(`${exposed.length - 1} more ${plural(exposed.length - 1, 'value is', 'values are')} exposed the same way; they are highlighted under the hood.`)
  if (trivials.length) notes.push(`${trivials.length} plain ${plural(trivials.length, 'number was', 'numbers were')} written into the transaction in total.`)

  return {
    kind: 'exposed',
    headline: 'Looks encrypted, but anyone can work it out',
    detail: `${exposed.length} of ${computed.length} computed ${plural(computed.length, 'value')} in this transaction ${exposed.length === 1 ? 'looks encrypted but is' : 'look encrypted but are'} public.`,
    equation: { parts, result, handle: lead.ctHash, value: k.value },
    explanation,
    advice,
    notes,
  }
}
