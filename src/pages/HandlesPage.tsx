// M2 + M4: decode pasted handles offline, then optionally ask a chain about each one.

import { useMemo, useState } from 'react'
import { isAddress, type Address } from 'viem'
import { getAcl, handleStatus, type HandleStatus } from '../acl/check'
import { CHAINS, chainById, type LensChain } from '../chains'
import { decodeMany, type DecodedHandle } from '../handle/decode'
import { lookupTrivial } from '../leak/dictionary'
import { useClients } from '../ui/clients'
import { DecryptButton } from '../ui/DecryptButton'
import { Copy, ErrorBox, Pill } from '../ui/components'
import { errorMessage } from '../ui/format'

// From Sepolia tx 0x7d8e313f…53bb: add(trivial 0, trivial 10000), then the two constants.
const EXAMPLE = [
  '0x76c4c176dc23fd580abc40e3e30f30ee9c466e4b6adc6fbdc7c45425f1a50500',
  '0x43662edd94f2cbb937c25150b4e534c629d27a2e7f7c7b9e5d7367635dbc8500',
  '0x2d720d224cd538e53234ab8615c635e5d888f12a414fa1f67075fe6164b18500',
].join('\n')

const MAX_LOOKUPS = 50

export function HandlesPage({ params }: { params: string[] }) {
  const [text, setText] = useState(params[0] ? decodeURIComponent(params[0]).replace(/,/g, '\n') : '')
  const [chainId, setChainId] = useState(11155111)
  const [who, setWho] = useState('')
  const chain = chainById(chainId)
  const { client } = useClients(chain)
  const [lookup, setLookup] = useState<{ status: Map<bigint, HandleStatus>; chainId: number; who?: Address } | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const rows = useMemo(() => decodeMany(text), [text])
  const handles = rows.filter((r): r is DecodedHandle => !('error' in r))
  const whoAddr = isAddress(who.trim()) ? (who.trim() as Address) : undefined

  const check = async () => {
    setBusy(true)
    setErr(null)
    try {
      const acl = await getAcl(client, chain.taskManager)
      const unique = [...new Set(handles.map((h) => h.handle))].slice(0, MAX_LOOKUPS)
      const results = await Promise.all(unique.map((h) => handleStatus(client, chain.taskManager, acl, h, whoAddr ? [whoAddr] : [])))
      setLookup({ status: new Map(unique.map((h, i) => [h, results[i]])), chainId, who: whoAddr })
    } catch (e) {
      setErr(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  const status = lookup && lookup.chainId === chainId ? lookup.status : null

  return (
    <div className="stack">
      <div>
        <h1 style={{ fontSize: 22 }}>Handles</h1>
        <p className="lede">
          A CoFHE ciphertext handle is a 256-bit id. Its last two bytes say what it is: the encrypted type, whether it was trivially encrypted from a public constant, and the security zone. Decoding happens in your browser; the chain is
          only asked when you check access.
        </p>
      </div>

      <section className="card stack tight">
        <Layout />
        <textarea rows={5} placeholder="Paste handles (hex or decimal), one per line or comma-separated" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} aria-label="Handles" />
        <div className="row">
          <button className="link small" onClick={() => setText(EXAMPLE)}>
            load an example
          </button>
          <span className="muted small">{handles.length ? `${handles.length} handle${handles.length === 1 ? '' : 's'}` : ''}</span>
        </div>
      </section>

      {rows.length > 0 && (
        <section className="card stack tight">
          <div className="row">
            <select value={chainId} onChange={(e) => setChainId(Number(e.target.value))} aria-label="Network">
              {CHAINS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input className="grow mono" placeholder="optional: address to check isAllowed for" value={who} onChange={(e) => setWho(e.target.value)} spellCheck={false} aria-label="Address" />
            <button className="primary" onClick={check} disabled={busy || handles.length === 0 || (who.trim() !== '' && !whoAddr)}>
              {busy ? 'Checking…' : 'Check on chain'}
            </button>
          </div>
          {handles.length > MAX_LOOKUPS && <span className="muted small">Only the first {MAX_LOOKUPS} handles are checked on chain.</span>}
          {err && <ErrorBox error={err} />}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Handle</th>
                  <th>Type</th>
                  <th>Trivial</th>
                  <th>Zone</th>
                  {status && (
                    <>
                      <th>Anyone can decrypt</th>
                      <th>Published result</th>
                      {lookup?.who && <th>Allowed for address</th>}
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) =>
                  'error' in r ? (
                    <tr key={i}>
                      <td className="mono small">{r.token.slice(0, 40)}</td>
                      <td colSpan={status ? 6 : 3} className="small" style={{ color: 'var(--danger)' }}>
                        {r.error}
                      </td>
                    </tr>
                  ) : (
                    <HandleRow key={i} h={r} s={status?.get(r.handle)} showStatus={!!status} who={lookup?.who} chain={chain} />
                  ),
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}

function HandleRow({ h, s, showStatus, who, chain }: { h: DecodedHandle; s?: HandleStatus; showStatus: boolean; who?: Address; chain: LensChain }) {
  const trivialValue = h.isTrivial ? lookupTrivial(h.handle) : undefined
  return (
    <tr>
      <td className="mono small" style={{ overflowWrap: 'anywhere', minWidth: 220 }}>
        {h.hex} <Copy text={h.hex} />
      </td>
      <td>{h.typeName ? <span className="type">{h.typeName}</span> : <Pill tone="danger">unknown type {h.typeId}</Pill>}</td>
      <td>
        {h.isTrivial ? (
          <span>
            <Pill tone="warn" title="Created with trivialEncrypt: the plaintext was public when it was encrypted">
              yes
            </Pill>
            {trivialValue !== undefined && <span className="value"> = {trivialValue.toString()}</span>}
          </span>
        ) : (
          <span className="muted">no</span>
        )}
      </td>
      <td className="mono">{h.securityZone}</td>
      {showStatus && (
        <>
          <td>
            {s ? (
              s.global ? (
                <span className="stack tight" style={{ gap: 2 }}>
                  <Pill tone="danger">yes</Pill>
                  <DecryptButton chain={chain} handle={h.handle} expected={trivialValue ?? s.published ?? undefined} />
                </span>
              ) : (
                <span className="muted">no</span>
              )
            ) : null}
          </td>
          <td>{s ? s.published !== null ? <span className="value">{s.published.toString()}</span> : <span className="muted">none</span> : null}</td>
          {who && <td>{s ? s.allowed[who] ? <Pill tone="ok">yes</Pill> : <span className="muted">no</span> : null}</td>}
        </>
      )}
    </tr>
  )
}

function Layout() {
  const cell = (label: string, sub: string, flex: number, tone?: string) => (
    <div style={{ flex, minWidth: 0, background: tone ?? 'var(--surface-2)', borderRadius: 6, padding: '6px 8px' }}>
      <div className="small" style={{ fontWeight: 600 }}>
        {label}
      </div>
      <div className="muted small">{sub}</div>
    </div>
  )
  return (
    <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }} aria-label="Handle bit layout">
      {cell('hash', 'bytes 0–29: keccak(inputs, op)', 6)}
      {cell('trivial', '1 bit', 1.1, 'var(--warn-weak)')}
      {cell('type', '7 bits', 1.1, 'var(--accent-weak)')}
      {cell('zone', '1 byte', 1.1)}
    </div>
  )
}
