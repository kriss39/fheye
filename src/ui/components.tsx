import { useState, type ReactNode } from 'react'
import type { LensChain } from '../chains'
import { decodeHandle, toHex32 } from '../handle/decode'
import { addressUrl, errorMessage, shortHex, txUrl } from './format'

export function Copy({ text, label = 'copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      className="link small"
      title={`Copy ${text}`}
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setDone(true)
          setTimeout(() => setDone(false), 1200)
        })
      }}
    >
      {done ? 'copied' : label}
    </button>
  )
}

export function HandleBadge({ handle, copy = true }: { handle: bigint; copy?: boolean }) {
  const d = decodeHandle(handle)
  const hex = toHex32(handle)
  return (
    <span className="handle" title={hex}>
      <span className={d.isTrivial ? 'type trivial' : 'type'} title={d.isTrivial ? 'trivially encrypted: the plaintext is public' : undefined}>
        {d.typeName ?? `type ${d.typeId}`}
        {d.isTrivial ? ' · trivial' : ''}
      </span>
      {shortHex(hex, 8, 4)}
      {d.securityZone !== 0 && <span className="pill">zone {d.securityZone}</span>}
      {copy && <Copy text={hex} />}
    </span>
  )
}

export function Addr({ chain, address, label }: { chain: LensChain; address: string; label?: string }) {
  return (
    <span className="mono">
      <a href={addressUrl(chain, address)} target="_blank" rel="noreferrer" title={address}>
        {label ?? shortHex(address, 8, 6)}
      </a>{' '}
      <Copy text={address} />
    </span>
  )
}

export function TxLink({ chain, hash, internal = true }: { chain: LensChain; hash: string; internal?: boolean }) {
  return (
    <span className="mono">
      {internal ? <a href={`#/tx/${chain.key}/${hash}`}>{shortHex(hash, 10, 6)}</a> : <a href={txUrl(chain, hash)} target="_blank" rel="noreferrer">{shortHex(hash, 10, 6)}</a>}
      {internal && (
        <>
          {' '}
          <a className="small muted" href={txUrl(chain, hash)} target="_blank" rel="noreferrer" title="Open in block explorer">
            ↗
          </a>
        </>
      )}
    </span>
  )
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: 'warn' }) {
  return (
    <div className={tone ? `stat ${tone}` : 'stat'}>
      <b>{value}</b>
      <span>{label}</span>
    </div>
  )
}

export function Pill({ tone, children, title }: { tone?: 'ok' | 'warn' | 'danger' | 'accent'; children: ReactNode; title?: string }) {
  return (
    <span className={tone ? `pill ${tone}` : 'pill'} title={title}>
      {children}
    </span>
  )
}

export function ErrorBox({ error }: { error: unknown }) {
  return <div className="notice danger">{errorMessage(error)}</div>
}

export function Progress({ done, total }: { done: bigint | number; total: bigint | number }) {
  const ratio = Number(total) > 0 ? Math.min(1, Number(done) / Number(total)) : 0
  return (
    <div className="progress" role="progressbar" aria-valuenow={Math.round(ratio * 100)}>
      <div style={{ width: `${ratio * 100}%` }} />
    </div>
  )
}

export function Bars({ data, highlight }: { data: Array<[string, number]>; highlight?: (key: string) => boolean }) {
  const max = Math.max(1, ...data.map(([, v]) => v))
  const total = data.reduce((a, [, v]) => a + v, 0)
  return (
    <div className="bars">
      {data.map(([k, v]) => (
        <div className="bar-row" key={k}>
          <span className="mono">{k}</span>
          <div className="bar-track">
            <div className={highlight?.(k) ? 'bar trivial' : 'bar'} style={{ width: `${(v / max) * 100}%` }} />
          </div>
          <span className="muted num" style={{ textAlign: 'right' }}>
            {total ? `${((v / total) * 100).toFixed(1)}%` : ''}
          </span>
        </div>
      ))}
    </div>
  )
}
