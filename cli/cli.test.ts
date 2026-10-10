import type { Address, Transaction, TransactionReceipt } from 'viem'
import { describe, expect, it } from 'vitest'
import { loadFixture, type Fixture } from '../src/__fixtures__/load'
import transferRaw from '../src/__fixtures__/transfer-public-amount.json'
import decryptRaw from '../src/__fixtures__/with-decrypt.json'
import inputsRaw from '../src/__fixtures__/with-inputs.json'
import type { HandleStatus } from '../src/acl/check'
import { chainById } from '../src/chains'
import { decodeHandle } from '../src/handle/decode'
import { lookupTrivial } from '../src/leak/dictionary'
import { analyzeLeaks } from '../src/leak/evaluate'
import type { ContractReport } from '../src/report/contract'
import { estimateFheGas } from '../src/tx/gas'
import { buildTxGraph, graphDepth } from '../src/tx/graph'
import type { LoadedTx } from '../src/tx/load'
import { contractHasPublic, formatContract } from './contract'
import { ansi, plain, styleFor, table, toJson } from './format'
import { formatHandles, summarizeHandles } from './handle'
import { run, type Deps } from './run'
import { formatTx, summarizeTx, txHasPublic } from './tx'

const FROM: Address = '0xa139bcfb689926ebcf2aabdbd32fbafc250e70d9'
const TO: Address = '0xb28a3b6f48aafc754561033d101529a71ee88a87'

/** Same steps as loadTx, offline: the fixture's logs stand in for the receipt, `status` for the ACL reads. */
function fixtureTx(f: Fixture, status = new Map<bigint, HandleStatus>()): LoadedTx {
  const chain = chainById(f.chainId)
  const graph = buildTxGraph(f.logs, f.taskManager)
  const published = new Map(graph.decrypts.map((d) => [d.ctHash, d.result]))
  for (const [h, s] of status) if (s.published !== null && !published.has(h)) published.set(h, s.published)
  const tx = { hash: f.txHash, from: FROM, to: TO } as Transaction
  const receipt = { blockNumber: f.logs[0].blockNumber!, status: 'success', gasUsed: 1_000_000n, logs: f.logs } as TransactionReceipt
  return {
    chain,
    tx,
    receipt,
    graph,
    depth: graphDepth(graph),
    leaks: analyzeLeaks(graph.tasks, published, lookupTrivial),
    gas: estimateFheGas(
      graph.tasks.map((t) => t.operation),
      graph.inputs.size,
    ),
    status,
  }
}

const transfer = loadFixture(transferRaw)
const inputs = loadFixture(inputsRaw)
const decrypt = loadFixture(decryptRaw)

const status = (s: Partial<HandleStatus>): HandleStatus => ({ global: false, forDecryption: false, published: null, allowed: {}, ...s })

describe('tx summary and text', () => {
  it('flags add(0, 10000) in the transfer with a public amount', () => {
    const r = summarizeTx(fixtureTx(transfer))
    expect(r.counts).toMatchObject({ tasks: 11, computed: 8, publicComputed: 1, trivial: 3, inputs: 0, decrypts: 0 })
    const pub = r.tasks.filter((t) => t.public)
    expect(pub).toHaveLength(1)
    expect(pub[0]).toMatchObject({ index: 2, operation: 'add', value: 10000n, source: 'derived', type: 'euint64' })
    // The zero is re-created by task 4, after task 2 consumed the stored copy.
    expect(pub[0].inputs).toMatchObject([
      { kind: 'task', task: 4, later: true },
      { kind: 'task', task: 1, later: false },
    ])
    expect(txHasPublic(r)).toBe(true)

    const text = formatTx(r)
    expect(text).toContain('Ethereum Sepolia')
    expect(text).toMatch(/^2 +add +#4↓, #1 +euint64 +10000 PUBLIC +from constant 0 \(#4\), constant 10000 \(#1\)$/m)
    expect(text).toMatch(/^1 +trivialEncrypt +10000 +euint64 +plaintext constant$/m)
    expect(text).toContain('1 of 8 computed values in this transaction looks encrypted but is public.')
    expect(text).toContain('3 plaintext constants were trivially encrypted')
    expect(text).not.toContain('\x1b[')
  })

  it('reports nothing public for arithmetic on encrypted inputs', () => {
    const r = summarizeTx(fixtureTx(inputs))
    expect(r.counts.inputs).toBeGreaterThan(0)
    expect(r.counts.publicComputed).toBe(0)
    expect(txHasPublic(r)).toBe(false)
    expect(r.tasks.some((t) => t.inputs.some((i) => i.kind === 'input'))).toBe(true)
    expect(formatTx(r)).toContain('No computed value in this transaction can be derived from public data alone.')
  })

  it('lists published decrypts of a tx without tasks', () => {
    const r = summarizeTx(fixtureTx(decrypt))
    expect(r.counts).toMatchObject({ tasks: 0, decrypts: 1 })
    expect(r.decrypts[0]).toMatchObject({ result: 30000000000000000n })
    expect(r.decrypts[0].handle).toMatch(/^0x[0-9a-f]{64}$/)
    const text = formatTx(r)
    expect(text).toContain('Decrypt results published in this transaction:')
    expect(text).toContain(`${r.decrypts[0].handle}  30000000000000000`)
    expect(text).not.toContain('did not interact')
    expect(txHasPublic(r)).toBe(false)
  })

  it('marks handles anyone can decrypt and checks values against published results', () => {
    const add = 0x76c4c176dc23fd580abc40e3e30f30ee9c466e4b6adc6fbdc7c45425f1a50500n
    const r = summarizeTx(fixtureTx(transfer, new Map([[add, status({ global: true, published: 10000n })]])))
    expect(r.counts.global).toBe(1)
    expect(r.globalHandles).toEqual(['0x76c4c176dc23fd580abc40e3e30f30ee9c466e4b6adc6fbdc7c45425f1a50500'])
    const text = formatTx(r)
    expect(text).toContain('matches published decrypt  anyone can decrypt')
    expect(text).toContain('1 handle is marked decryptable by anyone (allowGlobal).')
  })

  it('colours only when asked', () => {
    expect(formatTx(summarizeTx(fixtureTx(transfer)), ansi)).toContain('\x1b[33m')
    expect(styleFor({ isTTY: true }, {})).toBe(ansi)
    expect(styleFor({ isTTY: true }, { NO_COLOR: '1' })).toBe(plain)
    expect(styleFor({ isTTY: false }, {})).toBe(plain)
  })
})

describe('JSON output', () => {
  it('writes bigints as decimal strings and handles as 32-byte hex', () => {
    const doc = JSON.parse(toJson(summarizeTx(fixtureTx(transfer))))
    expect(doc.block).toBe(String(transfer.logs[0].blockNumber))
    const add = doc.tasks[1]
    expect(add).toMatchObject({ operation: 'add', value: '10000', public: true })
    expect(add.output).toMatch(/^0x[0-9a-f]{64}$/)
    expect(doc.tasks[0].plaintext).toBe('10000')
    expect(toJson({ m: new Map([[1n, 2n]]) })).toBe('{\n  "m": [\n    [\n      "1",\n      "2"\n    ]\n  ]\n}')
  })
})

describe('table', () => {
  it('pads by visible width, ignoring colour codes', () => {
    expect(table([[ansi.warn('ab'), 'x'], ['abcd', 'y']])).toEqual([`${ansi.warn('ab')}    x`, 'abcd  y'])
  })
})

describe('handle', () => {
  it('names common trivially encrypted constants and shows status when asked', () => {
    const ten = decodeHandle('0x2d720d224cd538e53234ab8615c635e5d888f12a414fa1f67075fe6164b18500')
    const add = decodeHandle('0x76c4c176dc23fd580abc40e3e30f30ee9c466e4b6adc6fbdc7c45425f1a50500')
    const offline = summarizeHandles([ten, add])
    expect(offline[0]).toMatchObject({ type: 'euint64', trivial: true, trivialValue: 10000n, zone: 0 })
    expect(offline[1]).toMatchObject({ type: 'euint64', trivial: false, trivialValue: null })
    expect(offline[0].global).toBeUndefined()
    expect(formatHandles(offline)).toMatch(/yes = 10000/)
    expect(formatHandles(offline)).not.toContain('anyone can decrypt')

    const online = summarizeHandles([ten, add], new Map([[add.handle, status({ global: true, published: 10000n })]]))
    expect(online[1]).toMatchObject({ global: true, published: 10000n })
    expect(formatHandles(online)).toContain('anyone can decrypt')
  })
})

describe('contract', () => {
  const base: ContractReport = {
    address: TO,
    fromBlock: 100n,
    toBlock: 400n,
    checkedTxs: 10,
    windowTxs: 10,
    matchedTxs: 2,
    analysed: [
      { hash: `0x${'1'.repeat(64)}`, block: 390n, tasks: 6, computed: 4, publicComputed: 3, publicViaEarlier: 2, trivial: 2, global: 0, outputs: 6, decrypts: 0 },
      { hash: `0x${'2'.repeat(64)}`, block: 380n, tasks: 3, computed: 3, publicComputed: 0, publicViaEarlier: 0, trivial: 0, global: 1, outputs: 3, decrypts: 0 },
    ],
    byOp: { add: 4, trivialEncrypt: 2, sub: 3 },
    publicByOp: { add: 3 },
    assumptions: ['div-by-zero'],
    totals: { tasks: 9, computed: 7, publicComputed: 3, publicViaEarlier: 2, trivial: 2, global: 1, outputs: 9, decrypts: 0 },
  }

  it('prints totals, per-tx rows and the via-earlier count', () => {
    const text = formatContract(base, chainById(11155111))
    expect(text).toMatch(/computed values public +42\.9% \(3 of 7\)/)
    expect(text).toContain('3 / 4 (2 via earlier txs)')
    expect(text).toContain('2 of the public values build on results of earlier transactions')
    expect(text).toContain('division by zero returns the type maximum')
    expect(contractHasPublic(base)).toBe(true)
  })

  it('passes when nothing is public, and says when no tx matched', () => {
    const clean = { ...base, totals: { ...base.totals, publicComputed: 0, publicViaEarlier: 0 } }
    expect(contractHasPublic(clean)).toBe(false)
    expect(formatContract({ ...base, analysed: [], matchedTxs: 0 }, chainById(11155111))).toContain('No FHE transaction targeting this contract')
  })
})

function io(stdoutTTY = false) {
  const out: string[] = []
  const err: string[] = []
  return {
    io: { stdout: { write: (s: string) => out.push(s), isTTY: stdoutTTY }, stderr: { write: (s: string) => err.push(s), isTTY: false }, env: {} },
    out: () => out.join(''),
    err: () => err.join(''),
  }
}

const fixtures: Record<string, Fixture> = { [transfer.txHash]: transfer, [inputs.txHash]: inputs }
const offline: Deps = {
  loadTx: async (_chain, hash) => {
    const f = fixtures[hash]
    if (!f) throw Object.assign(new Error('Transaction receipt with hash "…" could not be found.'), { name: 'TransactionReceiptNotFoundError' })
    return fixtureTx(f)
  },
}

describe('run: exit codes and stdout', () => {
  it('--fail-on-public exits 1 when a computed value is public, and --json prints only JSON', async () => {
    const t = io()
    expect(await run(['tx', transfer.txHash, '--chain', 'sepolia', '--json', '--fail-on-public'], t.io, offline)).toBe(1)
    expect(JSON.parse(t.out()).counts.publicComputed).toBe(1)
    expect(t.err()).toBe('')
  })

  it('exits 0 without --fail-on-public, or when nothing is public', async () => {
    expect(await run(['tx', transfer.txHash, '--chain', 'sepolia'], io().io, offline)).toBe(0)
    const t = io()
    expect(await run(['tx', inputs.txHash, '--chain', 'sepolia', '--fail-on-public'], t.io, offline)).toBe(0)
    expect(t.out()).toContain('No computed value')
  })

  it('exits 2 with usage on bad invocations', async () => {
    for (const argv of [[], ['nope'], ['tx'], ['tx', '0x1234'], ['tx', transfer.txHash, '--bogus'], ['tx', transfer.txHash, '--chain', 'mars'], ['contract', TO], ['contract', TO, '--chain', 'sepolia', '--hours', '0'], ['status', '--chain', 'sepolia'], ['handle', 'xyz']]) {
      const t = io()
      expect(await run(argv, t.io, offline), argv.join(' ')).toBe(2)
      expect(t.out(), argv.join(' ')).toBe('')
      expect(t.err(), argv.join(' ')).toMatch(/Usage:/)
    }
  })

  it('exits 2 with a readable message on errors', async () => {
    const t = io()
    expect(await run(['tx', `0x${'ab'.repeat(32)}`, '--chain', 'sepolia', '--json'], t.io, offline)).toBe(2)
    expect(t.out()).toBe('')
    expect(t.err()).toBe('fhe-lens: This transaction was not found on the selected network.\n')
  })

  it('prints help to stdout with exit 0', async () => {
    const t = io()
    expect(await run(['--help'], t.io, offline)).toBe(0)
    expect(t.out()).toMatch(/^fhe-lens: command-line inspector/)
    expect(await run(['tx', '-h'], io().io, offline)).toBe(0)
  })

  it('decodes handles offline', async () => {
    const t = io()
    expect(await run(['handle', '0x2d720d224cd538e53234ab8615c635e5d888f12a414fa1f67075fe6164b18500', '--json'], t.io, offline)).toBe(0)
    expect(JSON.parse(t.out()).handles[0]).toMatchObject({ type: 'euint64', trivial: true, trivialValue: '10000' })
  })
})
