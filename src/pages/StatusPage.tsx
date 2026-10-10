// M1: mainnet TaskManager status (Ethereum + Arbitrum One) and recent activity on any network.

import { useState } from 'react'
import { CHAINS, chainById, type LensChain } from '../chains'
import { recentActivity } from '../mainnet/activity'
import { deserializeHistory, foldAdmin, readFlags, scanHistory, serializeHistory, verifyAccessList, type TmEvent } from '../mainnet/status'
import type { ScanProgress } from '../logs'
import { customRpc, readStorage, writeStorage } from '../settings'
import { useClients } from '../ui/clients'
import { Addr, Bars, ErrorBox, Pill, Progress, Stat, TxLink } from '../ui/components'
import { blockUrl, fmt, pct } from '../ui/format'
import { useAsync } from '../ui/useAsync'

const historyKey = (c: LensChain) => `fhelens:history:${c.id}:${c.taskManager.toLowerCase()}`

function MainnetCard({ chain }: { chain: LensChain }) {
  const { client, logClient } = useClients(chain)
  const [progress, setProgress] = useState<ScanProgress | null>(null)
  const state = useAsync(`${chain.id}:${customRpc(chain) ?? ''}`, async (signal) => {
    const cached = readStorage(historyKey(chain))
    let prior
    try {
      prior = cached ? deserializeHistory(cached) : undefined
    } catch {
      prior = undefined
    }
    const [flags, history] = await Promise.all([readFlags(client, chain.taskManager), scanHistory(logClient, chain, { prior, onProgress: setProgress, signal })])
    writeStorage(historyKey(chain), serializeHistory(history))
    const admin = foldAdmin(history.admin)
    const accessList = await verifyAccessList(client, chain.taskManager, admin.accessList)
    return { flags, history, admin: { ...admin, accessList } }
  })
  const d = state.data

  return (
    <section className="card stack tight">
      <div className="card-head">
        <h2>{chain.name}</h2>
        {d && (
          <div className="row">
            <Pill tone={d.flags.isEnabled ? 'ok' : 'warn'} title="TaskManager.isEnabled: master switch for task intake">
              intake {d.flags.isEnabled ? 'enabled' : 'disabled'}
            </Pill>
            <Pill tone={d.flags.accessListEnabled ? 'accent' : 'ok'} title="TaskManager.accessListEnabled: only allowlisted callers can create tasks">
              {d.flags.accessListEnabled ? 'allowlist only' : 'open to all'}
            </Pill>
          </div>
        )}
      </div>
      <div className="muted small">
        TaskManager <Addr chain={chain} address={chain.taskManager} /> · deployed in block{' '}
        <a href={blockUrl(chain, chain.deployBlock)} target="_blank" rel="noreferrer">
          {fmt(chain.deployBlock)}
        </a>
      </div>

      {state.loading && !d && (
        <div className="stack tight">
          <span className="muted small">Reading the contract's event history{progress ? ` (${fmt(progress.requests)} requests)` : ''}…</span>
          {progress && <Progress done={progress.doneBlocks} total={progress.totalBlocks} />}
        </div>
      )}
      {state.error !== undefined && <ErrorBox error={state.error} />}

      {d && (
        <>
          <div className="stats">
            <Stat label="allowlisted callers" value={fmt(d.admin.accessList.length)} />
            <Stat label="FHE tasks" value={fmt(d.history.taskCount)} />
            <Stat label="encrypted inputs" value={fmt(d.history.inputCount)} />
            <Stat label="published decrypts" value={fmt(d.history.decryptCount)} />
          </div>

          <h3 style={{ marginTop: 8 }}>Access list</h3>
          {d.admin.accessList.length === 0 ? (
            <p className="muted small" style={{ margin: 0 }}>
              {d.flags.accessListEnabled ? 'No contract is allowlisted yet, so no one can create FHE tasks on this chain.' : 'The access list is off: any caller not on the deny list can create tasks.'}
            </p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Caller</th>
                    <th>Added in block</th>
                    <th>Still on list</th>
                  </tr>
                </thead>
                <tbody>
                  {d.admin.accessList.map((a) => (
                    <tr key={a.account}>
                      <td>
                        <Addr chain={chain} address={a.account} />
                      </td>
                      <td>
                        <TxLink chain={chain} hash={a.grantTx} internal={false} /> <span className="muted small">#{fmt(a.grantedAt)}</span>
                      </td>
                      <td>{a.onChain ? <Pill tone="ok">yes</Pill> : <Pill tone="danger">no</Pill>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {d.admin.denyList.length > 0 && (
            <p className="small">
              Deny list: {d.admin.denyList.map((a) => <Addr key={a} chain={chain} address={a} />)}
            </p>
          )}

          <details>
            <summary>Roles and signers</summary>
            <dl className="kv" style={{ marginTop: 8 }}>
              {groupRoles(d.admin.roles).map(([account, roles]) => (
                <div key={account} style={{ display: 'contents' }}>
                  <dt>{roles.length > 2 ? `${roles.length} roles` : roles.join(', ')}</dt>
                  <dd>
                    <Addr chain={chain} address={account} />
                    {roles.length > 2 && <div className="muted small">{roles.join(', ')}</div>}
                  </dd>
                </div>
              ))}
              <dt>verifier signer</dt>
              <dd>
                <Addr chain={chain} address={d.flags.verifierSigner} />
              </dd>
              <dt>decrypt signer</dt>
              <dd>
                <Addr chain={chain} address={d.flags.decryptResultSigner} />
              </dd>
              <dt>ACL</dt>
              <dd>
                <Addr chain={chain} address={d.flags.acl} />
              </dd>
              <dt>PlaintextsStorage</dt>
              <dd>
                <Addr chain={chain} address={d.flags.plaintextsStorage} />
              </dd>
              <dt>version</dt>
              <dd>{d.flags.version}</dd>
            </dl>
          </details>

          <details>
            <summary>Admin history ({d.history.admin.length} events)</summary>
            <AdminTimeline chain={chain} events={d.history.admin} />
          </details>

          <div className="row muted small">
            Scanned through block {fmt(d.history.scannedTo)}.
            <button className="link small" onClick={state.reload} disabled={state.loading}>
              {state.loading ? 'refreshing…' : 'refresh'}
            </button>
          </div>
        </>
      )}
    </section>
  )
}

function groupRoles(roles: Array<{ role: string; account: string }>): Array<[string, string[]]> {
  const m = new Map<string, string[]>()
  for (const r of roles) m.set(r.account, [...(m.get(r.account) ?? []), r.role.replace(/_ROLE$/, '').toLowerCase().replace(/_/g, ' ')])
  return [...m]
}

function describeEvent(e: TmEvent): string {
  const a = e.args
  switch (e.name) {
    case 'EnabledSet':
      return a.enabled ? 'intake enabled' : 'intake disabled'
    case 'AccessListEnabledSet':
      return a.enabled ? 'access list turned on' : 'access list turned off'
    case 'AccessGranted':
      return `allowlisted ${a.account}`
    case 'AccessRevoked':
      return `removed from allowlist ${a.account}`
    case 'DenyListSet':
      return `${a.denied ? 'deny-listed' : 'removed from deny list'} ${a.account}`
    case 'VerifierSignerChanged':
    case 'DecryptResultSignerChanged':
      return `${e.name === 'VerifierSignerChanged' ? 'input verifier' : 'decrypt'} signer → ${a.newSigner}`
    case 'ACLContractChanged':
      return `ACL → ${a.newACL}`
    case 'PlaintextsStorageChanged':
      return `PlaintextsStorage → ${a.newStorage}`
    case 'SecurityZonesChanged':
      return `security zones ${a.newMin}..${a.newMax}`
    case 'VersionIncremented':
      return `version ${a.newVersion}`
    case 'RoleGranted':
    case 'RoleRevoked':
      return `${e.name === 'RoleGranted' ? 'granted' : 'revoked'} role to ${a.account}`
    case 'Upgraded':
      return `implementation → ${a.implementation}`
    default:
      return e.name
  }
}

function AdminTimeline({ chain, events }: { chain: LensChain; events: TmEvent[] }) {
  return (
    <div className="table-wrap" style={{ marginTop: 8 }}>
      <table>
        <tbody>
          {[...events].reverse().map((e) => (
            <tr key={`${e.txHash}:${e.logIndex}`}>
              <td className="mono small" style={{ whiteSpace: 'nowrap' }}>
                <a href={blockUrl(chain, e.blockNumber)} target="_blank" rel="noreferrer">
                  {fmt(e.blockNumber)}
                </a>
              </td>
              <td className="small" style={{ overflowWrap: 'anywhere' }}>
                {describeEvent(e)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const WINDOWS: Array<[string, number]> = [
  ['15 min', 900],
  ['1 hour', 3600],
  ['6 hours', 21600],
]

function ActivityCard() {
  const [chainId, setChainId] = useState(11155111)
  const [seconds, setSeconds] = useState(900)
  const chain = chainById(chainId)
  const { client, logClient } = useClients(chain)
  const [progress, setProgress] = useState<ScanProgress | null>(null)
  const state = useAsync(`${chainId}:${seconds}:${customRpc(chain) ?? ''}`, (signal) => {
    setProgress(null)
    return recentActivity(client, logClient, chain, { seconds, maxTxLookups: 200, onProgress: setProgress, signal })
  })
  const a = state.data
  const ops = a ? Object.entries(a.byOp).sort((x, y) => y[1] - x[1]) : []

  return (
    <section className="card stack tight">
      <div className="card-head">
        <div>
          <h2>Recent activity</h2>
          <p className="lede small">FHE tasks created on a network in a recent window. Trivially encrypted values are plaintext constants: their value is in the event data for anyone to read.</p>
        </div>
        <div className="row">
          <select value={chainId} onChange={(e) => setChainId(Number(e.target.value))} aria-label="Network">
            {CHAINS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} aria-label="Window">
            {WINDOWS.map(([l, s]) => (
              <option key={s} value={s}>
                last {l}
              </option>
            ))}
          </select>
        </div>
      </div>
      {state.loading && (
        <div className="stack tight">
          <span className="muted small">Scanning logs{progress ? ` (${fmt(progress.logs)} so far)` : ''}…</span>
          {progress && <Progress done={progress.doneBlocks} total={progress.totalBlocks} />}
        </div>
      )}
      {state.error !== undefined && <ErrorBox error={state.error} />}
      {a && !state.loading && (
        <>
          <div className="stats">
            <Stat label="FHE tasks" value={fmt(a.tasks)} />
            <Stat label="transactions" value={fmt(a.txs)} />
            <Stat label="encrypted inputs" value={fmt(a.inputs)} />
            <Stat label="published decrypts" value={fmt(a.decrypts)} />
            <Stat label="trivially encrypted" value={pct(a.trivialShare)} tone={a.trivialShare > 0 ? 'warn' : undefined} />
          </div>
          <div className="muted small">
            Blocks {fmt(a.fromBlock)}–{fmt(a.toBlock)}
          </div>
          {a.tasks === 0 ? (
            <p className="muted">No FHE tasks in this window.</p>
          ) : (
            <div className="grid2">
              <div className="stack tight">
                <h3>Operations</h3>
                <Bars data={ops} highlight={(k) => k === 'trivialEncrypt'} />
              </div>
              <div className="stack tight">
                <h3>Busiest contracts</h3>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Contract (tx target)</th>
                        <th className="num">Tasks</th>
                        <th className="num">Txs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {a.contracts.slice(0, 8).map((c) => (
                        <tr key={c.address}>
                          <td>
                            <Addr chain={chain} address={c.address} />
                          </td>
                          <td className="num">{fmt(c.tasks)}</td>
                          <td className="num">{fmt(c.txs)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {a.sampledTxs < a.txs && <span className="muted small">From the {fmt(a.sampledTxs)} busiest of {fmt(a.txs)} txs.</span>}
              </div>
            </div>
          )}
          {a.topTxs.length > 0 && (
            <details>
              <summary>Busiest transactions</summary>
              <div className="table-wrap" style={{ marginTop: 8 }}>
                <table>
                  <tbody>
                    {a.topTxs.slice(0, 12).map((t) => (
                      <tr key={t.hash}>
                        <td>
                          <TxLink chain={chain} hash={t.hash} />
                        </td>
                        <td className="num small">{t.tasks} tasks</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </>
      )}
    </section>
  )
}

export function StatusPage() {
  return (
    <div className="stack">
      <div>
        <h1 style={{ fontSize: 22 }}>CoFHE mainnet status</h1>
        <p className="lede">
          The CoFHE TaskManager is deployed on Ethereum and Arbitrum One. Until intake is enabled and contracts are allowlisted, no FHE task can run there. This page reads the contract directly: flags, the access list rebuilt from
          its events and checked against storage, role holders and signer history.
        </p>
      </div>
      <div className="grid2">
        {CHAINS.filter((c) => c.mainnet).map((c) => (
          <MainnetCard key={c.id} chain={c} />
        ))}
      </div>
      <ActivityCard />
    </div>
  )
}
