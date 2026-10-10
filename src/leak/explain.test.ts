import { describe, expect, it } from 'vitest'
import { loadFixture, type Fixture } from '../__fixtures__/load'
import transferRaw from '../__fixtures__/transfer-public-amount.json'
import inputsRaw from '../__fixtures__/with-inputs.json'
import { deriveHandle } from '../handle/derive'
import { getOp } from '../ops'
import { buildTxGraph, type TxGraph } from '../tx/graph'
import { decodeTask, type Task } from '../tx/task'
import { lookupTrivial } from './dictionary'
import { analyzeLeaks } from './evaluate'
import { explainTx, valueText, type Chip } from './explain'

function verdictOf(raw: unknown) {
  const f: Fixture = loadFixture(raw)
  const graph = buildTxGraph(f.logs, f.taskManager)
  const published = new Map(graph.decrypts.map((d) => [d.ctHash, d.result]))
  return explainTx(graph, analyzeLeaks(graph.tasks, published, lookupTrivial))
}

describe('explainTx', () => {
  it('spells out the sum that exposes the transfer amount', () => {
    const v = verdictOf(transferRaw)
    expect(v.kind).toBe('exposed')
    expect(v.detail).toBe('1 of 8 computed values in this transaction looks encrypted but is public.')
    const chips = v.equation!.parts.filter((p): p is Chip => typeof p !== 'string')
    expect(chips.map((c) => [c.value, c.kind])).toEqual([
      ['0', 'constant'],
      ['10,000', 'constant'],
    ])
    expect(v.equation!.parts[1]).toBe('+')
    expect(v.equation!.result.value).toBe('10,000')
    expect(v.explanation).toContain('the plain numbers 0 and 10,000 written into this transaction')
    expect(v.advice).toContain('FHE.asEuint64(10000)')
  })

  it('says when nothing can be worked out', () => {
    const v = verdictOf(inputsRaw)
    expect(v.kind).toBe('private')
    expect(v.equation).toBeUndefined()
  })
})

const graphOf = (tasks: Task[]): TxGraph => ({ tasks, byHandle: new Map(tasks.map((t) => [t.ctHash, t])), inputs: new Map(), decrypts: [], external: new Map() })

describe('explainTx edge cases', () => {
  it('reads the type of constants from earlier transactions from their own handle', () => {
    // gt(5,000,000, 100) on two euint64 constants stored by an earlier transaction
    const triv = getOp('trivialEncrypt')!
    const a = deriveHandle(triv, [5000000n, 5n, 0n], 5, 0)
    const b = deriveHandle(triv, [100n, 5n, 0n], 5, 0)
    const out = deriveHandle(getOp('gt')!, [a, b, 0n], 0, 0)
    const gt = decodeTask({ ctHash: out, operation: 'gt', input1: a, input2: b, input3: 0n })
    const v = explainTx(graphOf([gt]), analyzeLeaks([gt], new Map(), lookupTrivial))
    expect(v.equation!.parts.map((p) => (typeof p === 'string' ? p : p.value))).toEqual(['5,000,000', '>', '100'])
    expect(v.equation!.result.value).toBe('true')
    expect(v.explanation).toContain('written into an earlier transaction')
    expect(v.advice).toContain('FHE.asEuint64(100)')
  })

  it('explains values that rest only on identities', () => {
    const x = (0x1234n << 16n) | (5n << 8n) // an encrypted euint64 from elsewhere
    const z = deriveHandle(getOp('sub')!, [x, x, 0n], 5, 0)
    const w = deriveHandle(getOp('add')!, [z, z, 0n], 5, 0)
    const tasks = [decodeTask({ ctHash: z, operation: 'sub', input1: x, input2: x, input3: 0n }), decodeTask({ ctHash: w, operation: 'add', input1: z, input2: z, input3: 0n })]
    const v = explainTx(graphOf(tasks), analyzeLeaks(tasks))
    expect(v.explanation).not.toContain('computed only from .')
    expect(v.explanation).toContain('whatever the encrypted inputs are')
  })
})

describe('valueText', () => {
  it('formats booleans, addresses and numbers for people', () => {
    expect(valueText(1n, 'ebool')).toBe('true')
    expect(valueText(5000000n, 'euint64')).toBe('5,000,000')
    expect(valueText(0xabn, 'eaddress')).toBe(`0x${'0'.repeat(38)}ab`)
  })
})
