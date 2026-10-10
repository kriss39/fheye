import { describe, expect, it } from 'vitest'
import { loadFixture, type Fixture } from '../__fixtures__/load'
import transferRaw from '../__fixtures__/transfer-public-amount.json'
import inputsRaw from '../__fixtures__/with-inputs.json'
import { buildTxGraph } from '../tx/graph'
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
    expect(v.explanation).toContain('the plain numbers 0 and 10,000 written into the transaction')
    expect(v.advice).toContain('FHE.asEuint64(10000)')
  })

  it('says when nothing can be worked out', () => {
    const v = verdictOf(inputsRaw)
    expect(v.kind).toBe('private')
    expect(v.equation).toBeUndefined()
  })
})

describe('valueText', () => {
  it('formats booleans, addresses and numbers for people', () => {
    expect(valueText(1n, 'ebool')).toBe('true')
    expect(valueText(5000000n, 'euint64')).toBe('5,000,000')
    expect(valueText(0xabn, 'eaddress')).toBe(`0x${'0'.repeat(38)}ab`)
  })
})
