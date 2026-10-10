import { useEffect, useState } from 'react'
import { CHAINS } from './chains'
import { ContractPage } from './pages/ContractPage'
import { HandlesPage } from './pages/HandlesPage'
import { HomePage, Hero } from './pages/HomePage'
import { StatusPage } from './pages/StatusPage'
import { TxPage } from './pages/TxPage'
import { customRpc, setCustomRpc, useSettingsVersion } from './settings'
import { GraphIcon, HashIcon, PulseIcon, ReportIcon } from './ui/icons'
import { LaunchBar, MainnetBadge } from './ui/Launch'

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
  ['tx', 'Transaction', GraphIcon],
  ['contract', 'Contract', ReportIcon],
  ['handles', 'Handles', HashIcon],
  ['status', 'Mainnet', PulseIcon],
] as const

export default function App() {
  const [page = 'home', ...params] = useRoute()

  const known = page === 'tx' || page === 'contract' || page === 'handles' || page === 'status'
  return (
    <>
      <header className="brandbar">
        <div className="brandbar-inner">
          <a className="brand" href="#/">
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} width={28} height={28} alt="" />
            <span>
              FH<em>Eye</em>
            </span>
            <small>CoFHE inspector</small>
          </a>
          <nav className="tabs">
            {TABS.map(([key, label, Icon]) => (
              <a key={key} href={`#/${key}`} aria-current={page === key ? 'page' : undefined}>
                <Icon size={16} />
                {label}
                {key === 'status' && <MainnetBadge />}
              </a>
            ))}
          </nav>
        </div>
      </header>
      <LaunchBar />
      {!known && <Hero />}
      <div className="shell">
        <main>
          {page === 'status' ? (
            <StatusPage />
          ) : page === 'contract' ? (
            <ContractPage params={params} />
          ) : page === 'handles' ? (
            <HandlesPage key={params.join('/')} params={params} />
          ) : page === 'tx' ? (
            <TxPage params={params} />
          ) : (
            <HomePage />
          )}
        </main>
        <footer className="stack tight">
          <div className="footer-top">
            <div className="footer-brand">
              <img src={`${import.meta.env.BASE_URL}favicon.svg`} width={36} height={36} alt="" />
              <div>
                <b>
                  FH<em>Eye</em>
                </b>
                <p>See what encryption doesn't hide. An independent inspector for Fhenix CoFHE: paste a transaction and find the encrypted values anyone can compute.</p>
              </div>
            </div>
            <nav className="footer-links" aria-label="Footer">
              <a href="#/tx">Transaction</a>
              <a href="#/contract">Contract report</a>
              <a href="#/handles">Handles</a>
              <a href="#/status">Mainnet</a>
              <a href="#examples">Examples</a>
            </nav>
          </div>
          <Settings />
          <span>
            FHEye is unofficial and not affiliated with Fhenix. It runs entirely in your browser and only reads public chain data through the RPC endpoints below. Op semantics follow TFHE-rs, the library behind CoFHE's FHE engine.
          </span>
        </footer>
      </div>
    </>
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
