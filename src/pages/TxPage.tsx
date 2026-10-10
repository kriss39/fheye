// M3 + M5: one transaction's FHE task graph, per-handle access status, gas estimate and the
// values that look encrypted but can be recomputed from public data.

import { useEffect, useState, type FormEvent } from 'react'
import type { Hash } from 'viem'
import { CHAINS, type LensChain } from '../chains'
import { lookupTrivial } from '../leak/dictionary'
import type { Known } from '../leak/evaluate'
import { customRpc } from '../settings'
import type { HandleStatus } from '../acl/check'
import { findTxChain, loadTx, type LoadedTx } from '../tx/load'
import type { Task } from '../tx/task'
import { useClients } from '../ui/clients'
import { Addr, ErrorBox, HandleBadge, Pill, Stat } from '../ui/components'
import { fmt, pct, txUrl } from '../ui/format'
import { useAsync } from '../ui/useAsync'

const isTxHash = (s: string) => /^0x[0-9a-fA-F]{64}$/.test(s)

const ASSUMPTION_TEXT: Record<string, string> = {
  'div-by-zero': 'division by zero returns the type maximum',
  'rem-by-zero': 'remainder by zero returns the numerator',
  'shift-mod-bits': 'shift amounts wrap modulo the bit width',
}

export function TxPage({ params }: { params: string[] }) {
  const [chainKey, hash] = params.length === 2 ? params : [undefined, params[0]]
  const chain = CHAINS.find((c) => c.key === chainKey)

  return (
    <div className="stack">
      <div>
        <h1 style={{ fontSize: 22 }}>Transaction</h1>
        <p className="lede">Every FHE task a transaction created, how the encrypted values flow between them, and which of those values anyone can compute without decrypting anything.</p>
      </div>
      <TxForm key={`${chainKey}:${hash}`} initialHash={hash ?? ''} initialChain={chainKey ?? 'auto'} />
      {!hash && <Examples />}
      {hash && !isTxHash(hash) && <ErrorBox error="That is not a transaction hash (0x followed by 64 hex characters)." />}
      {hash && isTxHash(hash) && !chain && <FindChain hash={hash as Hash} />}
      {hash && isTxHash(hash) && chain && <TxView key={`${chain.id}:${hash}`} chain={chain} hash={hash as Hash} />}
    </div>
  )
}

function TxForm({ initialHash, initialChain }: { initialHash: string; initialChain: string }) {
  const [input, setInput] = useState(initialHash)
  const [pickChain, setPickChain] = useState(initialChain)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const h = input.trim()
    if (!isTxHash(h)) return
    location.hash = pickChain === 'auto' ? `#/tx/${h}` : `#/tx/${pickChain}/${h}`
  }
  return (
    <form className="card row" onSubmit={submit}>
      <input className="grow mono" placeholder="0x… transaction hash" value={input} onChange={(e) => setInput(e.target.value)} aria-label="Transaction hash" spellCheck={false} />
      <select value={pickChain} onChange={(e) => setPickChain(e.target.value)} aria-label="Network">
        <option value="auto">Find network</option>
        {CHAINS.map((c) => (
          <option key={c.key} value={c.key}>
            {c.name}
          </option>
        ))}
      </select>
      <button className="primary" disabled={!isTxHash(input.trim())}>
        Inspect
      </button>
    </form>
  )
}

const EXAMPLES: Array<[string, string, string]> = [
  ['base-sepolia', '0x5fc67cd8d581d33a6ce246d253d6bf9ec07b675f1068f1716a9c81a99e9962a3', 'first mint: an encrypted zero plus a public amount gives a balance anyone can compute'],
  ['sepolia', '0x7d8e313f60bff6680df9d5db638f265fa1d9bbf5dee34dc4eede8cb0721753bb', 'confidential transfer whose amount is a public constant'],
  ['sepolia', '0xc870ea914edbf425386f49fbc5e879ad9e4219312c3946cce0e6e73b46054a9e', 'running totals built from trivially encrypted values'],
  ['sepolia', '0x538d54bd2e959fee8620c7a5bbde3237ea77056b484e88ffe67837174a7874b5', 'arithmetic on two encrypted user inputs'],
]

function Examples() {
  return (
    <section className="card stack tight">
      <h3>Try a testnet transaction</h3>
      {EXAMPLES.map(([key, hash, label]) => (
        <div key={hash} className="row small">
          <a className="mono" href={`#/tx/${key}/${hash}`}>
            {hash.slice(0, 14)}…
          </a>
          <span className="muted">{label}</span>
        </div>
      ))}
    </section>
  )
}

function FindChain({ hash }: { hash: Hash }) {
  const state = useAsync(hash, () => findTxChain(hash, customRpc))
  useEffect(() => {
    if (state.data) location.replace(`#/tx/${state.data.key}/${hash}`)
  }, [state.data, hash])
  if (state.loading) return <p className="muted">Looking for this transaction on {CHAINS.map((c) => c.name).join(', ')}…</p>
  if (state.data === null) return <ErrorBox error="No supported network knows this transaction." />
  if (state.error !== undefined) return <ErrorBox error={state.error} />
  return null
}

function TxView({ chain, hash }: { chain: LensChain; hash: Hash }) {
  const { client } = useClients(chain)
  const state = useAsync(`${chain.id}:${hash}:${customRpc(chain) ?? ''}`, () => loadTx(chain, hash, client))
  if (state.loading) return <p className="muted">Loading receipt and handle status from {chain.name}…</p>
  if (state.error !== undefined) return <ErrorBox error={state.error} />
  if (!state.data) return null
  return <TxDetails t={state.data} />
}

function TxDetails({ t }: { t: LoadedTx }) {
  const { chain, tx, receipt, graph, leaks, gas, status } = t
  const [focus, setFocus] = useState<number | null>(null)

  const rowOf = new Map<bigint, number>()
  graph.tasks.forEach((task, i) => {
    if (!rowOf.has(task.ctHash)) rowOf.set(task.ctHash, i)
  })
  const computed = graph.tasks.filter((x) => x.op?.kind !== 'trivial' && x.op?.kind !== 'random')
  // A published decrypt makes a value public on purpose; only values recomputable from public
  // leaves count as "looks encrypted but isn't".
  const isLeak = (h: bigint) => {
    const src = leaks.known.get(h)?.source
    return src === 'derived' || src === 'identity'
  }
  const publicComputed = computed.filter((x) => isLeak(x.ctHash))
  const trivials = graph.tasks.filter((x) => x.op?.kind === 'trivial')
  const globalHandles = [...status].filter(([, s]) => s.global).map(([h]) => h)
  const assumptions = [...new Set(publicComputed.flatMap((x) => leaks.known.get(x.ctHash)!.assumptions))]
  const fheShare = Number(receipt.gasUsed) > 0 ? gas.total / Number(receipt.gasUsed) : 0

  const jump = (i: number) => {
    setFocus(i)
    document.getElementById(`task-${i}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  return (
    <>
      <section className="card stack tight">
        <div className="card-head">
          <h2>{chain.name}</h2>
          <div className="row">
            <Pill tone={receipt.status === 'success' ? 'ok' : 'danger'}>{receipt.status}</Pill>
            <a className="small" href={txUrl(chain, tx.hash)} target="_blank" rel="noreferrer">
              explorer ↗
            </a>
          </div>
        </div>
        <dl className="kv">
          <dt>block</dt>
          <dd>{fmt(receipt.blockNumber)}</dd>
          <dt>from</dt>
          <dd>
            <Addr chain={chain} address={tx.from} />
          </dd>
          <dt>to</dt>
          <dd>{tx.to ? <Addr chain={chain} address={tx.to} /> : 'contract creation'}</dd>
        </dl>
        <div className="stats">
          <Stat label="FHE tasks" value={fmt(graph.tasks.length)} />
          <Stat label="longest chain" value={fmt(t.depth)} />
          <Stat label="encrypted inputs" value={fmt(graph.inputs.size)} />
          <Stat label="published decrypts" value={fmt(graph.decrypts.length)} />
          <Stat label={`est. FHE gas of ${fmt(receipt.gasUsed)}`} value={graph.tasks.length || graph.inputs.size ? `~${pct(fheShare)}` : '–'} />
        </div>
      </section>

      {graph.tasks.length > 0 && (
        <section className={publicComputed.length ? 'notice warn' : 'notice'}>
          {publicComputed.length > 0 ? (
            <>
              <b>
                {publicComputed.length} of {computed.length} computed value{computed.length === 1 ? '' : 's'} in this transaction look encrypted but are public.
              </b>
              <p>They derive only from trivially encrypted constants or published decrypt results, so anyone can recompute them. They are highlighted below.</p>
            </>
          ) : (
            <b>No computed value in this transaction can be derived from public data alone.</b>
          )}
          {trivials.length > 0 && (
            <p>
              {trivials.length} plaintext constant{trivials.length === 1 ? ' was' : 's were'} trivially encrypted; the value{trivials.length === 1 ? ' is' : 's are'} readable in the transaction's event data.
            </p>
          )}
          {globalHandles.length > 0 && (
            <p>
              {globalHandles.length} handle{globalHandles.length === 1 ? ' is' : 's are'} marked decryptable by anyone (<code>allowGlobal</code>).
            </p>
          )}
          {assumptions.length > 0 && <p className="small">Some values assume CoFHE follows TFHE-rs here: {assumptions.map((a) => ASSUMPTION_TEXT[a]).join('; ')}.</p>}
          <p className="small muted">This shows what is provably public. It says nothing about values derived from encrypted inputs or randomness.</p>
        </section>
      )}

      {graph.tasks.length === 0 && graph.decrypts.length === 0 && graph.inputs.size === 0 && <p className="muted">This transaction did not interact with the CoFHE TaskManager.</p>}

      {graph.tasks.length > 0 && (
        <section className="card">
          <div className="card-head">
            <h2>FHE tasks</h2>
            <span className="muted small">In execution order. #n refers to the task that produced a handle.</span>
          </div>
          <div className="table-wrap">
            <table className="cards">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Operation</th>
                  <th>Inputs</th>
                  <th>Output handle</th>
                  <th>Public value</th>
                  <th>Access</th>
                </tr>
              </thead>
              <tbody>
                {graph.tasks.map((task, i) => {
                  const k = leaks.known.get(task.ctHash)
                  const isPublic = isLeak(task.ctHash)
                  return (
                    <tr key={i} id={`task-${i}`} className={[isPublic ? 'public' : '', focus === i ? 'focus' : ''].join(' ')}>
                      <td className="mono muted">{i + 1}</td>
                      <td data-label="Operation">
                        <code>{task.operation}</code>
                        <div className="muted small" title="Estimated from the gas table in the Fhenix docs">
                          ~{fmt(gas.perTask[i])} gas
                        </div>
                      </td>
                      <td data-label="Inputs">
                        <Inputs task={task} at={i} t={t} rowOf={rowOf} jump={jump} />
                      </td>
                      <td data-label="Output handle">
                        <HandleBadge handle={task.ctHash} />
                        {task.issues.length > 0 && <div className="small" style={{ color: 'var(--danger)' }}>{task.issues.join('; ')}</div>}
                      </td>
                      <td data-label="Public value">{k && <PublicValue k={k} task={task} t={t} rowOf={rowOf} />}</td>
                      <td data-label="Access">
                        <Access s={status.get(task.ctHash)} t={t} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {(graph.external.size > 0 || graph.inputs.size > 0) && (
        <section className="card">
          <div className="card-head">
            <h2>Handles from outside the task list</h2>
            <span className="muted small">User inputs verified in this tx, and handles created by earlier transactions.</span>
          </div>
          <div className="table-wrap">
            <table className="cards">
              <thead>
                <tr>
                  <th>Handle</th>
                  <th>Origin</th>
                  <th>Public value</th>
                  <th>Access</th>
                </tr>
              </thead>
              <tbody>
                {[...new Set([...graph.inputs.keys(), ...graph.external.keys()])].map((h) => {
                  const k = leaks.known.get(h)
                  return (
                    <tr key={h.toString()}>
                      <td>
                        <HandleBadge handle={h} />
                      </td>
                      <td className="small" data-label="Origin">
                        {graph.inputs.has(h) ? 'encrypted user input' : 'earlier transaction'}
                      </td>
                      <td data-label="Public value">{k && <span className="value">{k.value.toString()}</span>}</td>
                      <td data-label="Access">
                        <Access s={status.get(h)} t={t} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {graph.decrypts.length > 0 && (
        <section className="card">
          <h2 style={{ marginBottom: 8 }}>Decrypt results published in this transaction</h2>
          <div className="table-wrap">
            <table>
              <tbody>
                {graph.decrypts.map((d) => (
                  <tr key={`${d.logIndex}`}>
                    <td>
                      <HandleBadge handle={d.ctHash} />
                    </td>
                    <td>
                      <span className="value">{d.result.toString()}</span>
                    </td>
                    <td className="small muted">
                      by <Addr chain={chain} address={d.requestor} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  )
}

function Ref({ h, at, t, rowOf, jump }: { h: bigint; at: number; t: LoadedTx; rowOf: Map<bigint, number>; jump: (i: number) => void }) {
  const row = rowOf.get(h)
  if (row !== undefined && row < at)
    return (
      <button type="button" className="ref" onClick={() => jump(row)} title="Go to the task that produced this handle">
        #{row + 1}
      </button>
    )
  if (row !== undefined)
    // Handles are content-addressed: this one was stored by an earlier tx and a later task here re-creates it.
    return (
      <button type="button" className="ref" onClick={() => jump(row)} title={`Stored by an earlier transaction. Task #${row + 1} below produces the same handle again.`}>
        #{row + 1}↓
      </button>
    )
  if (t.graph.inputs.has(h)) return <Pill tone="accent">input</Pill>
  const trivial = lookupTrivial(h)
  return (
    <span className="small" title="Created by an earlier transaction">
      <HandleBadge handle={h} copy={false} />
      {trivial !== undefined && <span className="value"> = {trivial.toString()}</span>}
    </span>
  )
}

function Inputs({ task, at, t, rowOf, jump }: { task: Task; at: number; t: LoadedTx; rowOf: Map<bigint, number>; jump: (i: number) => void }) {
  if (!task.op) return <span className="muted small">unknown op</span>
  if (task.op.kind === 'trivial') return <span className="value">{task.input1.toString()}</span>
  if (task.op.kind === 'random') return <span className="muted small">random</span>
  return (
    <span className="row" style={{ gap: 6 }}>
      {task.inputHandles.map((h, i) => (
        <Ref key={i} h={h.handle} at={at} t={t} rowOf={rowOf} jump={jump} />
      ))}
      {task.op.kind === 'cast' && <span className="muted small">→ {task.output.typeName}</span>}
    </span>
  )
}

function PublicValue({ k, task, t, rowOf }: { k: Known; task: Task; t: LoadedTx; rowOf: Map<bigint, number> }) {
  if (task.op?.kind === 'trivial') return <span className="muted small">plaintext constant</span>
  if (k.source === 'published') return <span className="muted small">disclosed by a published decrypt</span>
  const leaves = k.leaves
    .map((l) => {
      const leaf = t.leaks.known.get(l)
      const row = rowOf.get(l)
      const where = row !== undefined ? `#${row + 1}` : 'earlier tx'
      return leaf ? `${leaf.source === 'published' ? 'published decrypt' : 'constant'} ${leaf.value} (${where})` : ''
    })
    .filter(Boolean)
  const how = k.source === 'identity' ? `${task.operation} has the same result for any input` : leaves.length ? `from ${leaves.join(', ')}` : ''
  const published = t.status.get(task.ctHash)?.published
  return (
    <span title={how}>
      <span className="value">{k.value.toString()}</span>
      <div className="muted small">{how}</div>
      {published !== undefined && published !== null && (
        <div className="small" style={{ color: published === k.value ? 'var(--ok)' : 'var(--danger)' }}>
          {published === k.value ? '✓ matches the decrypt result published on-chain' : `published decrypt says ${published}`}
        </div>
      )}
      {k.assumptions.length > 0 && <div className="small" style={{ color: 'var(--warn)' }}>assumes {k.assumptions.map((a) => ASSUMPTION_TEXT[a]).join('; ')}</div>}
    </span>
  )
}

function Access({ s, t }: { s: HandleStatus | undefined; t: LoadedTx }) {
  if (!s) return null
  const to = t.tx.to
  if (!s.global && s.published === null && !(to && s.allowed[to]) && !s.allowed[t.tx.from]) return null
  return (
    <span className="row" style={{ gap: 4 }}>
      {s.global && (
        <Pill tone="danger" title="ACL.globalAllowed: anyone can request a decryption">
          anyone can decrypt
        </Pill>
      )}
      {s.published !== null && (
        <Pill tone="warn" title="A decrypt result for this handle is stored on-chain">
          decrypted: {s.published.toString()}
        </Pill>
      )}
      {to && s.allowed[to] && <Pill title="ACL.isAllowed(handle, tx target)">contract ✓</Pill>}
      {s.allowed[t.tx.from] && <Pill title="ACL.isAllowed(handle, tx sender)">sender ✓</Pill>}
    </span>
  )
}
