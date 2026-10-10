// Contract privacy report: its recent FHE transactions, analysed and aggregated.

import { useState, type FormEvent } from 'react'
import { isAddress, type Address } from 'viem'
import { CHAINS, type LensChain } from '../chains'
import { ASSUMPTION_TEXT } from '../leak/ops'
import { contractReport, type ReportPhase } from '../report/contract'
import { privacyGrade } from '../report/grade'
import { customRpc } from '../settings'
import { useClients } from '../ui/clients'
import { Addr, Bars, Copy, ErrorBox, Progress, Stat, TxLink } from '../ui/components'
import { ArrowIcon, ReportIcon } from '../ui/icons'
import { spotlight } from '../ui/motion'
import { fmt, pct } from '../ui/format'
import { Gauge } from '../ui/Gauge'
import { useAsync } from '../ui/useAsync'

const WINDOWS: Array<[string, number]> = [
  ['1 hour', 3600],
  ['6 hours', 21600],
  ['24 hours', 86400],
]

export function ContractPage({ params }: { params: string[] }) {
  const [chainKey, address, win] = params
  const chain = CHAINS.find((c) => c.key === chainKey)
  // Links can carry any window; the scan is capped at the largest one offered.
  const seconds = Math.min(Number(win) || 21600, 86400)
  return (
    <div className="stack">
      <div>
        <h1 style={{ fontSize: 22 }}>Contract privacy report</h1>
        <p className="lede">
          How private is a contract, really? FHEye reads its latest encrypted transactions and counts how many of its "encrypted" values anyone can work out from public data, then grades it. A high share usually means amounts or
          balances are built from plain numbers.
        </p>
      </div>
      <ReportForm key={params.join('/')} chainKey={chainKey ?? 'sepolia'} address={address ?? ''} seconds={seconds} />
      {chain && address && isAddress(address) && <Report key={`${chain.id}:${address}:${seconds}`} chain={chain} address={address} seconds={seconds} />}
      {address && !isAddress(address) && <ErrorBox error="That is not a contract address." />}
      {!address && <ContractIntro />}
    </div>
  )
}

const GRADES: Array<[string, 'ok' | 'warn' | 'danger', string]> = [
  ['A', 'ok', 'No computed value is provably public.'],
  ['B', 'warn', 'Up to 10% of computed values are public.'],
  ['C', 'warn', 'Up to a quarter are public.'],
  ['D', 'danger', 'Up to half are public.'],
  ['F', 'danger', 'Most computed values are public.'],
]

function ContractIntro() {
  return (
    <div className="grid2">
      <a className="card tile spot" href="#/contract/sepolia/0x87a3effb84cbe1e4cab6ab430139ec41d156d55a/3600" onPointerMove={spotlight}>
        <span className="tile-icon">
          <ReportIcon />
        </span>
        <h3>Try a busy Sepolia contract</h3>
        <p>One of the most active CoFHE contracts on Ethereum Sepolia: hundreds of transactions an hour, and half of its computed values come out public. Or pick a contract from “Busiest contracts” on the Mainnet page.</p>
        <span className="go">
          Grade it <ArrowIcon size={16} />
        </span>
      </a>
      <section className="card stack tight">
        <h3>How the grade works</h3>
        <p className="muted small" style={{ margin: 0 }}>
          FHEye looks at the contract's latest transactions and counts how many of the values it computed anyone can work out from public data.
        </p>
        <ul className="grade-legend">
          {GRADES.map(([g, tone, text]) => (
            <li key={g}>
              <span className={`grade sm ${tone}`}>{g}</span>
              <span>{text}</span>
            </li>
          ))}
        </ul>
        <p className="muted small" style={{ margin: 0 }}>
          An A is good news, not a proof of privacy: values built from encrypted inputs can still leak in other ways.
        </p>
      </section>
    </div>
  )
}

function ReportForm({ chainKey, address, seconds }: { chainKey: string; address: string; seconds: number }) {
  const [c, setC] = useState(chainKey)
  const [a, setA] = useState(address)
  const [s, setS] = useState(seconds)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (isAddress(a.trim())) location.hash = `#/contract/${c}/${a.trim()}/${s}`
  }
  return (
    <form className="card row" onSubmit={submit}>
      <input className="grow mono" placeholder="0x… contract address" value={a} onChange={(e) => setA(e.target.value)} aria-label="Contract address" spellCheck={false} />
      <select value={c} onChange={(e) => setC(e.target.value)} aria-label="Network">
        {CHAINS.map((x) => (
          <option key={x.key} value={x.key}>
            {x.name}
          </option>
        ))}
      </select>
      <select value={s} onChange={(e) => setS(Number(e.target.value))} aria-label="Window">
        {WINDOWS.map(([l, v]) => (
          <option key={v} value={v}>
            last {l}
          </option>
        ))}
      </select>
      <button className="primary" disabled={!isAddress(a.trim())}>
        Analyse
      </button>
    </form>
  )
}

function phaseText(p: ReportPhase | null): string {
  if (!p) return 'Starting…'
  if (p.phase === 'scan') return `Reading TaskManager events in the window (${fmt(p.logs)} so far)…`
  if (p.phase === 'match') return `Finding this address's transactions, newest first (${fmt(p.done)} of up to ${fmt(p.total)} checked)…`
  return `Analysing transactions (${p.done} of ${p.total})…`
}

function Report({ chain, address, seconds }: { chain: LensChain; address: Address; seconds: number }) {
  const { client, logClient } = useClients(chain)
  const [phase, setPhase] = useState<ReportPhase | null>(null)
  const state = useAsync(`${chain.id}:${address}:${seconds}:${customRpc(chain) ?? ''}`, (signal) => contractReport(client, logClient, chain, address, { seconds, onPhase: setPhase, signal }))

  if (state.loading)
    return (
      <section className="card stack tight">
        <span className="muted small">{phaseText(phase)}</span>
        {phase && phase.phase !== 'scan' && <Progress done={phase.done} total={phase.total} />}
      </section>
    )
  if (state.error !== undefined) return <ErrorBox error={state.error} />
  const r = state.data
  if (!r) return null
  const t = r.totals

  if (r.analysed.length === 0)
    return (
      <section className="card">
        <p className="muted" style={{ margin: 0 }}>
          {r.wallet ? (
            <>
              <Addr chain={chain} address={address} /> is a wallet, not a contract, so FHEye looked for encrypted transactions it <b>sent</b>. None were found
            </>
          ) : (
            <>
              No FHE transaction called <Addr chain={chain} address={address} />
            </>
          )}{' '}
          among the {fmt(r.checkedTxs)} most recent of {fmt(r.windowTxs)} FHE transactions on {chain.name} in this window. Try a longer window, or check the network.
        </p>
      </section>
    )

  const publicShare = t.computed ? t.publicComputed / t.computed : 0
  const grade = privacyGrade(t.publicComputed, t.computed)
  const opBars = Object.entries(r.byOp).sort((a, b) => b[1] - a[1])
  const leakBars = Object.entries(r.publicByOp).sort((a, b) => b[1] - a[1])

  return (
    <>
      <section className="card stack tight">
        <div className="card-head">
          <h2>
            <Addr chain={chain} address={address} /> <span className="muted small">{r.wallet ? 'wallet ' : ''}on {chain.name}</span>
          </h2>
          <Copy text={location.href} label="Copy report link" className="sm" />
        </div>
        <div className="score">
          <Gauge share={publicShare} tone={grade.tone} label="of computed values are public" />
          <div className={`grade ${grade.tone}`} aria-label={`Grade ${grade.grade}`}>
            {grade.grade}
          </div>
          <div className="score-text">
            <b>
              {pct(publicShare)} of computed values are public ({fmt(t.publicComputed)} of {fmt(t.computed)})
            </b>
            <span>{grade.text} Public means anyone can recompute the value from plaintext constants or published decrypts; the rest is not proven private, just not provably public.</span>
          </div>
        </div>
        <div className="stats">
          <Stat label="plaintext constants" value={fmt(t.trivial)} />
          <Stat label={`outputs anyone can decrypt (of ${fmt(t.outputs)})`} value={fmt(t.global)} />
          <Stat label="published decrypts" value={fmt(t.decrypts)} />
          <Stat label="FHE tasks" value={fmt(t.tasks)} />
        </div>
        <span className="muted small">
          The {fmt(r.analysed.length)} most recent {r.wallet ? 'transactions this wallet sent' : 'transactions to this contract'} in blocks {fmt(r.fromBlock)}–{fmt(r.toBlock)}
          {r.checkedTxs < r.windowTxs ? `, found among the ${fmt(r.checkedTxs)} newest of ${fmt(r.windowTxs)} FHE transactions` : ''}.
        </span>
        {t.publicViaEarlier > 0 && (
          <span className="small">
            {fmt(t.publicViaEarlier)} of the public values build on results of earlier transactions in this window, so the single-transaction view can't flag them.
          </span>
        )}
        {r.assumptions.length > 0 && <span className="small" style={{ color: 'var(--warn)' }}>Some public values assume: {r.assumptions.map((a) => ASSUMPTION_TEXT[a]).join('; ')}.</span>}
      </section>

      <div className="grid2">
        <section className="card stack tight">
          <h3>Operations</h3>
          <Bars data={opBars} highlight={(k) => k === 'trivialEncrypt'} />
        </section>
        <section className="card stack tight">
          <h3>Public values by operation</h3>
          {leakBars.length ? <Bars data={leakBars} highlight={() => true} /> : <p className="muted small">No computed value could be derived from public data.</p>}
        </section>
      </div>

      <section className="card">
        <h3 style={{ marginBottom: 8 }}>Transactions</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Transaction</th>
                <th className="num">Tasks</th>
                <th className="num">Public / computed</th>
                <th className="num">Constants</th>
                <th className="num">Anyone can decrypt</th>
              </tr>
            </thead>
            <tbody>
              {r.analysed.map((s) => (
                <tr key={s.hash} className={s.publicComputed ? 'public' : ''}>
                  <td>
                    <TxLink chain={chain} hash={s.hash} />
                  </td>
                  <td className="num">{s.tasks}</td>
                  <td className="num">
                    {s.publicComputed} / {s.computed}
                    {s.publicViaEarlier > 0 && (
                      <span className="muted small" title="Public through values computed in earlier transactions">
                        {' '}
                        ({s.publicViaEarlier} via earlier txs)
                      </span>
                    )}
                  </td>
                  <td className="num">{s.trivial}</td>
                  <td className="num">{s.global}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
