import { describe, expect, it } from 'vitest'
import accumulatorRaw from '../__fixtures__/accumulator.json'
import transferRaw from '../__fixtures__/transfer-public-amount.json'
import inputsRaw from '../__fixtures__/with-inputs.json'
import decryptRaw from '../__fixtures__/with-decrypt.json'
import { loadFixture } from '../__fixtures__/load'
import { analyzeLeaks } from '../leak/evaluate'
import { buildTxGraph, graphDepth } from './graph'

const transfer = loadFixture(transferRaw)
const accumulator = loadFixture(accumulatorRaw)
const inputs = loadFixture(inputsRaw)
const decrypt = loadFixture(decryptRaw)

describe('buildTxGraph on real Sepolia receipts', () => {
  it('decodes every task and reproduces every handle from keccak(inputs ‖ op)', () => {
    for (const f of [transfer, accumulator, inputs]) {
      const g = buildTxGraph(f.logs, f.taskManager)
      expect(g.tasks.length).toBeGreaterThan(0)
      for (const t of g.tasks) {
        expect(t.issues).toEqual([])
        expect(t.derivationMatches).toBe(true)
      }
    }
  })

  it('builds the transfer graph: ops, external balance, depth', () => {
    const g = buildTxGraph(transfer.logs, transfer.taskManager)
    expect(g.tasks.map((t) => t.operation)).toEqual(['trivialEncrypt', 'add', 'gte', 'trivialEncrypt', 'select', 'sub', 'trivialEncrypt', 'add', 'eq', 'sub', 'sub'])
    expect(g.external.size).toBe(1) // the sender's stored balance
    expect(graphDepth(g)).toBe(4)
  })

  it('collects verified inputs and published decrypts', () => {
    const gi = buildTxGraph(inputs.logs, inputs.taskManager)
    expect(gi.inputs.size).toBe(2)
    expect(gi.external.size).toBe(2)
    const gd = buildTxGraph(decrypt.logs, decrypt.taskManager)
    expect(gd.decrypts).toHaveLength(1)
    expect(gd.decrypts[0].result).toBe(30000000000000000n)
  })
})

describe('analyzeLeaks', () => {
  it('finds the public transfer amount even when a trivial handle is used before it is re-created', () => {
    const g = buildTxGraph(transfer.logs, transfer.taskManager)
    const { known } = analyzeLeaks(g.tasks)
    const add = g.tasks[1] // add(trivial 0, trivial 10000), consumes trivial(0) from log #217 at #214
    expect(known.get(add.ctHash)).toMatchObject({ value: 10000n, source: 'derived' })
    // gte(balance, 10000) depends on the secret balance and must stay unknown
    expect(known.has(g.tasks[2].ctHash)).toBe(false)
    expect(known.has(g.tasks[4].ctHash)).toBe(false)
  })

  it('does not flag ops on secret inputs, including div(x, x) which is MAX when x = 0', () => {
    const g = buildTxGraph(inputs.logs, inputs.taskManager)
    const { known } = analyzeLeaks(g.tasks)
    expect(g.tasks.some((t) => known.has(t.ctHash))).toBe(false)
  })

  it('uses identities that hold for any value', () => {
    const g = buildTxGraph(inputs.logs, inputs.taskManager)
    const [x] = g.tasks[1].inputHandles
    const fake = { ...g.tasks[0], operation: 'sub', ctHash: 1n, inputHandles: [x, x] }
    expect(analyzeLeaks([fake]).known.get(1n)).toMatchObject({ value: 0n, source: 'identity' })
  })

  it('checks derived values against published decrypts', () => {
    const g = buildTxGraph(transfer.logs, transfer.taskManager)
    const add = g.tasks[1]
    const ok = analyzeLeaks(g.tasks, new Map([[add.ctHash, 10000n]]))
    expect(ok.checks).toEqual([expect.objectContaining({ handle: add.ctHash, match: true })])
    const bad = analyzeLeaks(g.tasks, new Map([[add.ctHash, 9999n]]))
    expect(bad.checks[0].match).toBe(false)
  })
})
