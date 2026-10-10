// The leak radar: CoFHE transactions as they happen, each with FHEye's verdict.

import { useEffect, useRef, useState } from 'react'
import { CHAINS, chainById, type LensChain } from '../chains'
import { loadRadar, type RadarRow } from '../radar/feed'
import { customRpc } from '../settings'
import { useClients } from '../ui/clients'
import { Addr, ErrorBox, Stat } from '../ui/components'
import { fmt, pct, shortHex } from '../ui/format'
import { ArrowIcon, ShieldIcon, UnlockIcon } from '../ui/icons'
import { useAsync } from '../ui/useAsync'

const WINDOW = 900
const REFRESH = 30_000

function Verdict({ r }: { r: RadarRow }) {
  if (r.exposed > 0)
    return (
      <span className="badge exposed">
        <UnlockIcon size={13} /> Exposed · {r.exposed} of {r.computed}
      </span>
    )
  if (r.computed === 0) return <span className="badge neutral">Constants only</span>
  return (
    <span className="badge private">
      <ShieldIcon size={13} /> Nothing found
    </span>
  )
}

function Feed({ chain }: { chain: LensChain }) {
  const { client, logClient } = useClients(chain)
  const state = useAsync(`radar:${chain.id}:${customRpc(chain) ?? ''}`, (signal) => loadRadar(client, logClient, chain, { seconds: WINDOW, signal }))
  const { reload, loading } = state
  const seen = useRef<Set<string> | null>(null)
  const [fresh, setFresh] = useState<Set<string>>(new Set())

  // Wait for a load to finish before scheduling the next, so a slow RPC is never interrupted.
  useEffect(() => {
    if (loading) return
    const id = setTimeout(reload, REFRESH)
    return () => clearTimeout(id)
  }, [loading, reload])

  // Rows that weren't there on the previous refresh slide in.
  const data = state.data
  useEffect(() => {
    if (!data) return
    const hashes = data.rows.map((r) => r.hash)
    if (seen.current) {
      const prev = seen.current
      const raf = requestAnimationFrame(() => setFresh(new Set(hashes.filter((h) => !prev.has(h)))))
      seen.current = new Set(hashes)
      return () => cancelAnimationFrame(raf)
    }
    seen.current = new Set(hashes)
  }, [data])

  if (state.error !== undefined && !data) return <ErrorBox error={state.error} />
  if (!data) return <p className="muted">Reading the last 15 minutes of CoFHE activity on {chain.name}…</p>

  const leakers = new Map<string, { exposed: number; txs: number }>()
  for (const r of data.rows) {
    if (!r.to) continue
    const e = leakers.get(r.to) ?? { exposed: 0, txs: 0 }
    e.txs++
    if (r.exposed) e.exposed++
    leakers.set(r.to, e)
  }
  const top = [...leakers].filter(([, e]) => e.exposed).sort((a, b) => b[1].exposed - a[1].exposed).slice(0, 5)

  return (
    <>
      <div className="stats">
        <Stat label="transactions with encrypted operations" value={fmt(data.txs)} />
        <Stat label="of them expose a value" value={data.txs ? pct(data.exposedTxs / data.txs) : '–'} tone={data.exposedTxs ? 'warn' : undefined} />
        <Stat label="window" value="15 min" />
      </div>
      <div className="radar-grid">
        <section className="card radar-feed">
          <div className="card-head">
            <h2>
              <span className="live-dot inline" aria-hidden="true" /> Latest transactions
            </h2>
            <span className="muted small">refreshes every 30 s · blocks {fmt(data.fromBlock)}–{fmt(data.toBlock)}</span>
          </div>
          {data.rows.length === 0 ? (
            <p className="muted">No encrypted operations in the last 15 minutes.</p>
          ) : (
            <ul className="radar-list">
              {data.rows.map((r) => (
                <li key={r.hash} className={fresh.has(r.hash) ? 'fresh' : undefined}>
                  <a href={`#/tx/${chain.key}/${r.hash}`} className="radar-row">
                    <Verdict r={r} />
                    <span className="mono small">{shortHex(r.hash, 10, 6)}</span>
                    <span className="muted small">
                      {r.tasks} {r.tasks === 1 ? 'operation' : 'operations'}
                      {r.viaEarlier ? ' · via earlier txs' : ''}
                    </span>
                    <span className="muted small radar-to">{r.to ? `to ${shortHex(r.to, 6, 4)}` : ''}</span>
                    <ArrowIcon size={15} />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card stack tight">
          <h3>Leaking most right now</h3>
          {top.length === 0 ? (
            <p className="muted small">No contract exposed a value in the rows shown.</p>
          ) : (
            <ul className="leakers">
              {top.map(([address, e]) => (
                <li key={address}>
                  <Addr chain={chain} address={address as `0x${string}`} />
                  <span className="muted small">
                    {e.exposed} of {e.txs} txs exposed
                  </span>
                  <a className="small" href={`#/contract/${chain.key}/${address}/3600`}>
                    report
                  </a>
                </li>
              ))}
            </ul>
          )}
          <p className="muted small" style={{ margin: 0 }}>
            “Exposed” means at least one computed value in the transaction can be worked out from public data. Open a row for the sum that gives it away.
          </p>
        </section>
      </div>
    </>
  )
}

export function RadarPage({ params }: { params: string[] }) {
  const [chainId, setChainId] = useState(() => CHAINS.find((c) => c.key === params[0])?.id ?? 11155111)
  const chain = chainById(chainId)
  return (
    <div className="stack">
      <div>
        <h1>Leak radar</h1>
        <p className="lede">The latest CoFHE transactions as they happen, and which of them give away a value that looks encrypted. Verdicts come from the chain alone; nothing is decrypted.</p>
      </div>
      <div className="row">
        <select
          value={chainId}
          onChange={(e) => {
            setChainId(Number(e.target.value))
            location.hash = `#/radar/${chainById(Number(e.target.value)).key}`
          }}
          aria-label="Network"
        >
          {CHAINS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <Feed key={chain.id} chain={chain} />
    </div>
  )
}
