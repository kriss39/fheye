// Landing page: what FHEye finds, in one picture, and where to start.

import { useState, type FormEvent } from 'react'
import { ExampleTiles } from '../ui/ExampleTiles'
import { AlertIcon, ArrowIcon, CheckIcon, GraphIcon, HashIcon, LockIcon, PulseIcon, ReportIcon, SearchIcon, ShieldIcon, UnlockIcon } from '../ui/icons'
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

type Mini = { v: string; k: 'c' | 'p' | 's' | 'r' }
const mini = (v: string, k: Mini['k']): Mini => ({ v, k })

const PATTERNS: Array<{ title: string; eq: Array<Mini | string>; text: string; fix: string }> = [
  {
    title: 'Plain numbers in, “secret” out',
    eq: [mini('0', 'c'), '+', mini('5,000,000', 'c'), '=', mini('5,000,000', 'r')],
    text: 'The contract writes amounts into the transaction with FHE.asEuint64(…) and computes on them. The result is stored encrypted, but anyone can repeat the math.',
    fix: 'Let users encrypt amounts in their browser with the CoFHE SDK and pass them in as encrypted inputs.',
  },
  {
    title: 'Built on a public decryption',
    eq: [mini('10,790', 'p'), '+', mini('1', 'c'), '=', mini('10,791', 'r')],
    text: 'Once a value has been decrypted on-chain, anything computed only from it and plain numbers is public too.',
    fix: 'Mix in an encrypted value, or decrypt only the final result you mean to reveal.',
  },
  {
    title: 'Math that cancels out',
    eq: [mini('x', 's'), '−', mini('x', 's'), '=', mini('0', 'r')],
    text: 'Some operations give the same answer whatever the encrypted input is: x − x, x × 0, or a choice between two equal values.',
    fix: 'Usually a logic slip. Check what the contract meant to compute.',
  },
  {
    title: 'Readable by anyone',
    eq: [mini('balance', 's'), '→', mini('allowGlobal', 'c'), '→', mini('anyone', 'r')],
    text: 'allowGlobal lets anyone ask the CoFHE network to decrypt a value. Sometimes that is the point, sometimes it is a mistake.',
    fix: 'Grant access to specific addresses with FHE.allow unless the value is meant to be public.',
  },
]

function MiniEq({ eq }: { eq: Array<Mini | string> }) {
  return (
    <div className="mini-eq" aria-hidden="true">
      {eq.map((p, i) =>
        typeof p === 'string' ? (
          <span key={i} className="mini-op">
            {p}
          </span>
        ) : (
          <span key={i} className={`mchip ${p.k}`}>
            {p.k === 's' ? <LockIcon size={12} /> : <UnlockIcon size={12} />}
            {p.v}
          </span>
        ),
      )}
    </div>
  )
}

const PERSONAS = [
  { icon: <GraphIcon />, title: 'Contract developers', text: 'Check every transaction your contract sends on testnet, fix what leaks before mainnet, and run the command line in CI to keep it that way.' },
  { icon: <ReportIcon />, title: 'Auditors and reviewers', text: 'Grade a contract by how much of its encrypted state is really public, with the transactions to prove it.' },
  { icon: <ShieldIcon />, title: 'Users and the curious', text: 'Wondering whether a “private” balance is private? Paste the transaction and see for yourself.' },
]

const FAQ: Array<[string, string]> = [
  ['Is FHEye made by Fhenix?', 'No. FHEye is an independent, unofficial tool. It reads Fhenix CoFHE contracts but is not affiliated with Fhenix.'],
  [
    'Does FHEye decrypt my data?',
    'No. It never holds keys. It recomputes values that are already public: plain numbers in the transaction and results that were decrypted on-chain. The optional network check only works for values a contract made readable by anyone.',
  ],
  ['What does “public” mean here?', 'Anyone who reads the chain can work the value out, with no key and no permission.'],
  [
    'If FHEye finds nothing, is my contract private?',
    'Not proven. FHEye only flags what is provably public. Values built from encrypted inputs can still leak in other ways, for example through gas use, control flow or other transactions.',
  ],
  ['Which networks does it support?', 'Ethereum Sepolia, Arbitrum Sepolia and Base Sepolia today, and Ethereum and Arbitrum One as soon as CoFHE mainnet opens.'],
  ['Do I need a wallet or an account?', 'No. FHEye runs in your browser and only reads public chain data through public RPC endpoints. It never asks for a wallet or sends a transaction.'],
  ['What is a handle?', 'The 32-byte id that stands for an encrypted value on chain. Its last two bytes say the type and whether the value came from a plain number; the Handles page decodes them.'],
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

      <section>
        <div className="section-head">
          <h2>What FHEye catches</h2>
          <p>Four ways an encrypted value ends up public. Each one comes with the math that gives it away and a way to fix it.</p>
        </div>
        <div className="patterns">
          {PATTERNS.map((p) => (
            <div key={p.title} className="card pattern spot" onPointerMove={spotlight}>
              <h3>{p.title}</h3>
              <MiniEq eq={p.eq} />
              <p>{p.text}</p>
              <p className="fix">
                <CheckIcon size={16} />
                <span>{p.fix}</span>
              </p>
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
          <h2>Who it's for</h2>
        </div>
        <div className="steps">
          {PERSONAS.map((p) => (
            <div key={p.title} className="card step spot" onPointerMove={spotlight}>
              <span className="tile-icon">{p.icon}</span>
              <h3>{p.title}</h3>
              <p>{p.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="terminal-section">
        <div className="section-head">
          <h2>Also in your terminal and CI</h2>
          <p>The same analysis runs from the command line. With --fail-on-public, a CI job fails as soon as a computed value is public, so a leak never reaches mainnet unnoticed.</p>
        </div>
        <div className="terminal" aria-label="Example command line session">
          <div className="terminal-bar">
            <span />
            <span />
            <span />
          </div>
          <pre>
            <span className="t-prompt">$</span> fheye tx 0x7d8e…53bb --fail-on-public{'\n'}
            <span className="t-dim">Ethereum Sepolia · block 11,881,095 · success</span>
            {'\n'}
            <span className="t-dim">11 FHE tasks (longest chain 4), 0 encrypted inputs</span>
            {'\n\n'}
            {'  '}#2 add{'   '}
            <span className="t-amber">10000 PUBLIC</span> from constant 0 (#4), constant 10000 (#1){'\n\n'}
            <span className="t-bold">1 of 8 computed values in this transaction looks encrypted but is public.</span>
            {'\n'}
            <span className="t-prompt">$</span> echo $?{'\n'}
            <span className="t-red">1</span>
          </pre>
        </div>
      </section>

      <section className="card mainnet-teaser spot" onPointerMove={spotlight}>
        <span className="soon-dot" aria-hidden="true" />
        <div>
          <h3>CoFHE mainnet is coming</h3>
          <p>FHEye already reads the mainnet contracts on Ethereum and Arbitrum. Follow the launch step by step; the page switches to live on its own when CoFHE opens.</p>
        </div>
        <a className="btn primary" href="#/status">
          Watch the launch <ArrowIcon size={16} />
        </a>
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

      <section>
        <div className="section-head">
          <h2>Questions</h2>
        </div>
        <div className="faq">
          {FAQ.map(([q, a]) => (
            <details key={q} className="card">
              <summary>
                <h3>{q}</h3>
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
        <p className="muted small" style={{ marginTop: 14 }}>
          <AlertIcon size={14} /> FHEye shows what is provably public. A clean result is not an audit.
        </p>
      </section>
    </div>
  )
}
