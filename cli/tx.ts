// `fhe-lens tx`: one transaction's tasks and what they make public, as plain data (for --json)
// and as text. Wording follows the web transaction view.

import type { Address, Hash } from 'viem'
import { toHex32 } from '../src/handle/decode'
import { lookupTrivial } from '../src/leak/dictionary'
import type { KnownSource } from '../src/leak/evaluate'
import { ASSUMPTION_TEXT, type Assumption } from '../src/leak/ops'
import type { LoadedTx } from '../src/tx/load'
import { fmt, shortHex } from '../src/ui/format'
import { plain, plural, table, type Style } from './format'

/** Where a task input comes from. `task` is the 1-based row of the task producing the handle. */
export type TxInput =
  | { kind: 'task'; task: number; handle: `0x${string}`; later: boolean }
  | { kind: 'input'; handle: `0x${string}` }
  | { kind: 'external'; handle: `0x${string}`; trivialValue: bigint | null }

export interface TxTaskRow {
  index: number
  operation: string
  output: `0x${string}`
  type: string | null
  /** Plaintext of a trivialEncrypt. */
  plaintext: bigint | null
  inputs: TxInput[]
  value: bigint | null
  source: KnownSource | null
  /** Looks encrypted but anyone can recompute it (derived from public leaves, or an identity). */
  public: boolean
  /** How the value was obtained, as in the web view's "Public value" column. */
  how: string | null
  assumptions: Assumption[]
  /** Published decrypt result for the output, if any. */
  published: bigint | null
  global: boolean
  issues: string[]
}

export interface TxReport {
  chain: { key: string; id: number; name: string }
  hash: Hash
  block: bigint
  status: 'success' | 'reverted'
  from: Address
  to: Address | null
  counts: { tasks: number; computed: number; publicComputed: number; trivial: number; inputs: number; decrypts: number; global: number; depth: number }
  tasks: TxTaskRow[]
  /** Handles anyone may decrypt (allowGlobal), among those the tx produced or consumed. */
  globalHandles: `0x${string}`[]
  decrypts: Array<{ handle: `0x${string}`; result: bigint; requestor: Address }>
  assumptions: Assumption[]
  /** Published decrypts that contradict the recomputation, and the assumptions this refutes. */
  mismatches: Array<{ handle: `0x${string}`; derived: bigint; published: bigint }>
  refuted: Assumption[]
}

const LEAK_SOURCES = new Set<KnownSource>(['derived', 'identity'])

export function summarizeTx(t: LoadedTx): TxReport {
  const { chain, tx, receipt, graph, leaks, status } = t
  const rowOf = new Map<bigint, number>()
  graph.tasks.forEach((task, i) => {
    if (!rowOf.has(task.ctHash)) rowOf.set(task.ctHash, i)
  })
  const isLeak = (h: bigint) => {
    const src = leaks.known.get(h)?.source
    return src !== undefined && LEAK_SOURCES.has(src)
  }

  const tasks: TxTaskRow[] = graph.tasks.map((task, i) => {
    const k = leaks.known.get(task.ctHash)
    const inputs: TxInput[] = task.inputHandles.map(({ handle }) => {
      const row = rowOf.get(handle)
      if (row !== undefined) return { kind: 'task', task: row + 1, handle: toHex32(handle), later: row >= i }
      if (graph.inputs.has(handle)) return { kind: 'input', handle: toHex32(handle) }
      return { kind: 'external', handle: toHex32(handle), trivialValue: lookupTrivial(handle) ?? null }
    })
    let how: string | null = null
    if (task.op?.kind === 'trivial') how = 'plaintext constant'
    else if (k?.source === 'published') how = 'disclosed by a published decrypt'
    else if (k?.source === 'identity') how = `${task.operation} has the same result for any input`
    else if (k?.source === 'derived') {
      const leaves = k.leaves
        .map((l) => {
          const leaf = leaks.known.get(l)
          const row = rowOf.get(l)
          const where = row !== undefined ? `#${row + 1}` : 'earlier tx'
          return leaf ? `${leaf.source === 'published' ? 'published decrypt' : 'constant'} ${leaf.value} (${where})` : ''
        })
        .filter(Boolean)
      how = leaves.length ? `from ${leaves.join(', ')}` : null
    }
    const s = status.get(task.ctHash)
    return {
      index: i + 1,
      operation: task.operation,
      output: toHex32(task.ctHash),
      type: task.output.typeName,
      plaintext: task.op?.kind === 'trivial' ? task.input1 : null,
      inputs,
      value: k?.value ?? null,
      source: k?.source ?? null,
      public: isLeak(task.ctHash),
      how,
      assumptions: k?.assumptions ?? [],
      published: s?.published ?? null,
      global: s?.global ?? false,
      issues: task.issues,
    }
  })

  const computed = graph.tasks.filter((x) => x.op?.kind !== 'trivial' && x.op?.kind !== 'random')
  const publicComputed = computed.filter((x) => isLeak(x.ctHash))
  const globalHandles = [...status].filter(([, s]) => s.global).map(([h]) => toHex32(h))
  return {
    chain: { key: chain.key, id: chain.id, name: chain.name },
    hash: tx.hash,
    block: receipt.blockNumber,
    status: receipt.status,
    from: tx.from,
    to: tx.to ?? null,
    counts: {
      tasks: graph.tasks.length,
      computed: computed.length,
      publicComputed: publicComputed.length,
      trivial: graph.tasks.filter((x) => x.op?.kind === 'trivial').length,
      inputs: graph.inputs.size,
      decrypts: graph.decrypts.length,
      global: globalHandles.length,
      depth: t.depth,
    },
    tasks,
    globalHandles,
    decrypts: graph.decrypts.map((d) => ({ handle: toHex32(d.ctHash), result: d.result, requestor: d.requestor })),
    assumptions: [...new Set(publicComputed.flatMap((x) => leaks.known.get(x.ctHash)!.assumptions))],
    mismatches: leaks.checks.filter((c) => !c.match).map((c) => ({ handle: toHex32(c.handle), derived: c.derived, published: c.published })),
    refuted: leaks.refuted,
  }
}

/** `--fail-on-public`: any computed value that looks encrypted but is public. */
export const txHasPublic = (r: TxReport) => r.counts.publicComputed > 0

const short = (h: string) => shortHex(h, 8, 4)

function inputText(x: TxInput): string {
  if (x.kind === 'task') return x.later ? `#${x.task}↓` : `#${x.task}`
  if (x.kind === 'input') return 'input'
  return x.trivialValue !== null ? `${short(x.handle)}=${x.trivialValue}` : short(x.handle)
}

export function formatTx(r: TxReport, st: Style = plain): string {
  const c = r.counts
  const out: string[] = []
  out.push(`${st.bold(r.chain.name)} · block ${fmt(r.block)} · ${r.status === 'success' ? st.ok(r.status) : st.danger(r.status)}`)
  out.push(
    ...table([
      ['tx', r.hash],
      ['from', r.from],
      ['to', r.to ?? 'contract creation'],
    ]).map((l) => st.dim(l)),
  )
  out.push(
    `${fmt(c.tasks)} FHE ${plural(c.tasks, 'task')} (longest chain ${c.depth}), ${fmt(c.inputs)} encrypted ${plural(c.inputs, 'input')}, ${fmt(c.decrypts)} published ${plural(c.decrypts, 'decrypt')}`,
  )

  if (c.tasks === 0 && c.inputs === 0 && c.decrypts === 0) {
    out.push('', 'This transaction did not interact with the CoFHE TaskManager.')
    return out.join('\n')
  }

  if (r.tasks.length) {
    const rows = [['#', 'operation', 'inputs', 'output', 'public value'].map((h) => st.dim(h))]
    for (const t of r.tasks) {
      const inputs = t.plaintext !== null ? String(t.plaintext) : t.operation === 'random' ? 'random' : t.inputs.map(inputText).join(', ')
      let value = ''
      if (t.plaintext !== null) value = st.dim('plaintext constant')
      else if (t.public) value = `${st.warn(String(t.value))} ${st.warn(st.bold('PUBLIC'))}${t.how ? st.dim(`  ${t.how}`) : ''}`
      else if (t.source === 'published') value = `${t.value} ${st.dim('disclosed by a published decrypt')}`
      if (t.public && t.published !== null) value += t.published === t.value ? st.ok('  matches published decrypt') : st.danger(`  published decrypt says ${t.published}`)
      if (t.assumptions.length) value += st.warn(`  assumes ${t.assumptions.map((a) => ASSUMPTION_TEXT[a]).join('; ')}`)
      if (t.global) value += st.danger('  anyone can decrypt')
      if (t.issues.length) value += st.danger(`  ${t.issues.join('; ')}`)
      rows.push([String(t.index), t.operation, inputs, t.type ?? 'unknown', value.trimStart()])
    }
    out.push('', ...table(rows))
    const refs = r.tasks.flatMap((t) => t.inputs).filter((x) => x.kind === 'task')
    if (refs.length)
      out.push(st.dim(`#n refers to the task that produced a handle${refs.some((x) => x.later) ? '; #n↓ is a handle stored by an earlier tx that a later task re-creates' : ''}.`))
  }

  if (r.decrypts.length) {
    out.push('', 'Decrypt results published in this transaction:')
    out.push(...table(r.decrypts.map((d) => [`  ${d.handle}`, String(d.result), st.dim(`by ${d.requestor}`)])))
  }

  if (r.tasks.length) {
    out.push('')
    if (c.publicComputed > 0) {
      const one = c.publicComputed === 1
      out.push(st.warn(st.bold(`${c.publicComputed} of ${c.computed} computed ${plural(c.computed, 'value')} in this transaction ${one ? 'looks encrypted but is' : 'look encrypted but are'} public.`)))
      out.push(`${one ? 'It derives' : 'They derive'} only from trivially encrypted constants or published decrypt results, so anyone can recompute ${one ? 'it' : 'them'}.`)
    } else {
      out.push(st.bold('No computed value in this transaction can be derived from public data alone.'))
    }
    if (c.trivial > 0)
      out.push(`${c.trivial} plaintext ${c.trivial === 1 ? 'constant was' : 'constants were'} trivially encrypted; the ${c.trivial === 1 ? 'value is' : 'values are'} readable in the transaction's event data.`)
    if (c.global > 0) out.push(`${c.global} ${c.global === 1 ? 'handle is' : 'handles are'} marked decryptable by anyone (allowGlobal).`)
    if (r.assumptions.length) out.push(`Some values assume CoFHE follows TFHE-rs here: ${r.assumptions.map((a) => ASSUMPTION_TEXT[a]).join('; ')}.`)
    out.push(st.dim('This shows what is provably public. It says nothing about values derived from encrypted inputs or randomness.'))
  }

  if (r.mismatches.length) {
    out.push('', st.danger(st.bold("A decrypt result published on-chain contradicts FHE Lens' recomputation.")))
    out.push(
      r.refuted.length
        ? `CoFHE does not behave as assumed here: ${r.refuted.map((a) => ASSUMPTION_TEXT[a]).join('; ')}. FHE Lens uses the on-chain value and ignores every value that relied on this assumption.`
        : 'FHE Lens uses the on-chain value for that handle. Please report this transaction; it points to a gap in the op model.',
    )
  }
  return out.join('\n')
}
