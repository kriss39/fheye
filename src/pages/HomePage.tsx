// Landing page: what FHEye finds, in one picture, and where to start.

import { useState, type FormEvent } from 'react'
import { ExampleTiles } from '../ui/ExampleTiles'
import { ArrowIcon, GraphIcon, HashIcon, PulseIcon, ReportIcon, SearchIcon } from '../ui/icons'
import { LensReveal } from '../ui/LensReveal'
import { LivePulse } from '../ui/LivePulse'
import { spotlight } from '../ui/motion'

const isTxHash = (s: string) => /^0x[0-9a-fA-F]{64}$/.test(s)

export function Hero() {
  const [input, setInput] = useState('')
  const [bad, setBad] = useState(false)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const h = input.trim()
    if (!isTxHash(h)) return setBad(true)
    location.hash = `#/tx/${h}`
  }
  return (
    <section className="hero">
      <div className="hero-inner">
        <div>
          <span className="eyebrow">See what encryption doesn't hide · for Fhenix CoFHE · unofficial</span>
          <h1>
            Encrypted isn't always <em>private.</em>
          </h1>
          <p className="sub">FHEye reads a CoFHE transaction and shows which encrypted values anyone can work out from public data, and why. No wallet, nothing to install.</p>
          <form className="hero-search" onSubmit={submit}>
            <SearchIcon size={20} />
            <input
              placeholder="Paste a transaction hash (0x…)"
              value={input}
              onChange={(e) => {
                setInput(e.target.value)
                setBad(false)
              }}
              aria-label="Transaction hash"
              spellCheck={false}
            />
            <button className="primary lg">Inspect</button>
          </form>
          <p className="hero-note">
            {bad ? (
              "That isn't a transaction hash: it should be 0x followed by 64 hex characters."
            ) : (
              <>
                No hash at hand? <a href="#examples">Try an example</a>. The network is found automatically.
              </>
            )}
          </p>
          <LivePulse />
        </div>
        <div className="hero-demo">
          <div className="demo-label">
            <GraphIcon size={16} /> A real token mint on Base Sepolia, as the chain shows it
          </div>
          <LensReveal />
          <p className="lens-caption">
            Every value looks encrypted. Under the lens: the balance is built from two plain numbers, so <b>anyone can compute it.</b>
          </p>
        </div>
      </div>
    </section>
  )
}

const STEPS: Array<[string, string]> = [
  ['Paste a transaction', 'Any transaction that used CoFHE on Ethereum, Arbitrum or Base testnets, and on mainnet once it opens.'],
  ['See every encrypted value', 'FHEye decodes each encrypted operation and draws where every value comes from.'],
  ['Find what isn’t secret', 'Values built only from plain numbers or public decryptions are flagged, with the math behind them and a fix.'],
]

const TOOLS = [
  { href: '#/contract', icon: <ReportIcon />, title: 'Contract report', text: 'Grade a contract by how many of its encrypted values are really public, across its recent transactions.' },
  { href: '#/handles', icon: <HashIcon />, title: 'Handle decoder', text: 'Paste the ids that stand for encrypted values and see their type, origin and who may decrypt them.' },
  { href: '#/status', icon: <PulseIcon />, title: 'Mainnet status', text: 'Is CoFHE open on Ethereum and Arbitrum yet, and which contracts are allowed to use it?' },
]

export function HomePage() {
  return (
    <div className="stack" style={{ gap: 40 }}>
      <section>
        <div className="section-head">
          <h2>How it works</h2>
          <p>Fully homomorphic encryption lets contracts compute on encrypted numbers. But a value computed only from public numbers is public, however well it is encrypted.</p>
        </div>
        <div className="steps">
          {STEPS.map(([title, text], i) => (
            <div key={title} className="card step spot" onPointerMove={spotlight}>
              <span className="step-num">{i + 1}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="examples">
        <div className="section-head">
          <h2>Try an example</h2>
          <p>Real testnet transactions. Three of them leak a value; one keeps everything secret.</p>
        </div>
        <ExampleTiles />
      </section>

      <section>
        <div className="section-head">
          <h2>More tools</h2>
        </div>
        <div className="tiles">
          {TOOLS.map((t) => (
            <a key={t.href} className="card tile spot" href={t.href} onPointerMove={spotlight}>
              <span className="tile-icon">{t.icon}</span>
              <h3>{t.title}</h3>
              <p>{t.text}</p>
              <span className="go">
                Open <ArrowIcon size={16} />
              </span>
            </a>
          ))}
        </div>
      </section>
    </div>
  )
}
