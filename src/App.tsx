import { useEffect, useState } from 'react'
import { CHAINS } from './chains'
import { ContractPage } from './pages/ContractPage'
import { HandlesPage } from './pages/HandlesPage'
import { StatusPage } from './pages/StatusPage'
import { TxPage } from './pages/TxPage'
import { customRpc, setCustomRpc, useSettingsVersion } from './settings'

function useRoute(): string[] {
  const parse = () => location.hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  const [route, setRoute] = useState(parse)
  useEffect(() => {
    const on = () => setRoute(parse())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}

const TABS = [
  ['tx', 'Transaction'],
  ['contract', 'Contract'],
  ['handles', 'Handles'],
  ['status', 'Mainnet'],
] as const

export default function App() {
  const [page = 'tx', ...params] = useRoute()

  return (
    <div className="shell">
      <header className="top">
        <a className="brand" href="#/">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} width={22} height={22} alt="" />
          FHE Lens <small>CoFHE inspector</small>
        </a>
        <nav className="tabs">
          {TABS.map(([key, label]) => (
            <a key={key} href={`#/${key}`} aria-current={page === key ? 'page' : undefined}>
              {label}
            </a>
          ))}
        </nav>
      </header>
      <main>
        {page === 'status' ? (
          <StatusPage />
        ) : page === 'contract' ? (
          <ContractPage params={params} />
        ) : page === 'handles' ? (
          <HandlesPage key={params.join('/')} params={params} />
        ) : (
          <TxPage params={page === 'tx' ? params : []} />
        )}
      </main>
      <footer className="stack tight">
        <Settings />
        <span>
          FHE Lens is unofficial and not affiliated with Fhenix. It runs entirely in your browser and only reads public chain data through the RPC endpoints below. Op semantics follow TFHE-rs, the library behind CoFHE's FHE engine.
        </span>
      </footer>
    </div>
  )
}

function Settings() {
  useSettingsVersion()
  return (
    <details>
      <summary>RPC endpoints</summary>
      <p className="small">Defaults are keyless public endpoints chosen for browser access and log history. Set your own to avoid rate limits; it is stored only in this browser.</p>
      <div className="stack tight">
        {CHAINS.map((c) => (
          <label key={c.id} className="row small">
            <span style={{ width: 130 }}>{c.name}</span>
            <input
              className="grow mono"
              defaultValue={customRpc(c) ?? ''}
              placeholder={`${c.rpc} (logs: ${c.logRpcs[0]})`}
              onBlur={(e) => setCustomRpc(c, e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && setCustomRpc(c, e.currentTarget.value)}
              spellCheck={false}
            />
          </label>
        ))}
      </div>
    </details>
  )
}
