// Docs: what FHEye is, how to read it, how to fix what it finds, and how to use it from code.

import { useEffect, useState, type ReactNode } from 'react'
import { Copy } from '../ui/components'

const SECTIONS: Array<[string, string]> = [
  ['overview', 'What is FHEye?'],
  ['start', 'Getting started'],
  ['verdict', 'Reading a verdict'],
  ['radar', 'Leak radar'],
  ['contract', 'Contract report'],
  ['handles', 'Handles'],
  ['mainnet', 'Mainnet status'],
  ['concepts', 'Concepts'],
  ['fix', 'Fixing leaks'],
  ['api', 'API'],
  ['cli', 'Command line'],
  ['limits', 'Privacy and limits'],
]

function Code({ children, lang }: { children: string; lang?: string }) {
  return (
    <div className="code">
      <div className="code-bar">
        <span>{lang}</span>
        <Copy text={children} label="copy" />
      </div>
      <pre>{children}</pre>
    </div>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={`doc-${id}`} className="doc-section">
      <h2>{title}</h2>
      {children}
    </section>
  )
}

const BAD = `// Leaks: the amount and the starting zero are plain numbers in the transaction.
function mint(address to, uint64 amount) external {
    euint64 start = FHE.asEuint64(0);
    balance[to] = FHE.add(start, FHE.asEuint64(amount));
    FHE.allowThis(balance[to]);
}`

const GOOD = `// Private: the amount arrives encrypted from the user's browser.
function mint(address to, externalEuint64 amount, bytes calldata proof) external {
    euint64 value = FHE.asEuint64(amount, proof);
    balance[to] = FHE.add(balance[to], value);
    FHE.allowThis(balance[to]);
    FHE.allow(balance[to], to);
}`

const CLIENT = `import { Encryptable } from '@cofhe/sdk'

// Encrypt in the browser; pass the result and its proof to mint().
const encrypted = await client
  .encryptInputs([Encryptable.uint64(5_000_000n)])
  .setConsumingContract(token.address)
  .execute()`

const API_EXAMPLE = `curl https://fheye.vercel.app/api/tx/0x5fc67cd8d581d33a6ce246d253d6bf9ec07b675f1068f1716a9c81a99e9962a3

{
  "verdict": {
    "kind": "exposed",
    "headline": "Looks encrypted, but anyone can work it out",
    "detail": "1 of 1 computed value in this transaction looks encrypted but is public.",
    "equation": { "parts": [ … "+" … ], "result": { "value": "5,000,000", … } },
    "explanation": "This value is computed only from the plain numbers 0 and 5,000,000 …",
    "advice": "Fine if 5,000,000 is meant to be public. If it should stay secret, …"
  },
  "chain": { "key": "base-sepolia", … },
  "tasks": [ … ],
  "url": "https://fheye.vercel.app/#/tx/base-sepolia/0x5fc6…62a3"
}`

const CLI = `git clone https://github.com/kriss39/fheye && cd fheye
npm ci && npm run build:cli

node dist-cli/fheye.mjs tx 0x7d8e313f60bff6680df9d5db638f265fa1d9bbf5dee34dc4eede8cb0721753bb
node dist-cli/fheye.mjs contract 0x87a3effb84cbe1e4cab6ab430139ec41d156d55a --chain sepolia --hours 6
node dist-cli/fheye.mjs handle 0x76c4c176dc23fd580abc40e3e30f30ee9c466e4b6adc6fbdc7c45425f1a50500 --chain sepolia
node dist-cli/fheye.mjs status                     # mainnet TaskManagers`

const CI = `- name: Check for public values
  run: |
    git clone --depth 1 https://github.com/kriss39/fheye /tmp/fheye
    cd /tmp/fheye && npm ci && npm run build:cli
    node dist-cli/fheye.mjs contract \${{ vars.CONTRACT }} --chain sepolia --hours 6 --fail-on-public`

export function DocsPage({ params }: { params: string[] }) {
  const target = params[0]
  const [active, setActive] = useState(target ?? SECTIONS[0][0])

  useEffect(() => {
    if (target) document.getElementById(`doc-${target}`)?.scrollIntoView({ block: 'start' })
  }, [target])

  // Highlight the section being read.
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (top) setActive(top.target.id.replace('doc-', ''))
      },
      { rootMargin: '-15% 0px -70% 0px' },
    )
    document.querySelectorAll('.doc-section').forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  return (
    <div className="docs">
      <nav className="docs-nav" aria-label="Docs">
        <span className="docs-nav-title">Docs</span>
        {SECTIONS.map(([id, title]) => (
          <a key={id} href={`#/docs/${id}`} aria-current={active === id ? 'true' : undefined}>
            {title}
          </a>
        ))}
      </nav>

      <article className="docs-body">
        <Section id="overview" title="What is FHEye?">
          <p className="doc-lead">
            FHEye shows which encrypted values on Fhenix CoFHE anyone can work out from public data, and why. Paste a transaction and the answer comes first, in plain language; the encrypted operations behind it follow for
            whoever wants them.
          </p>
          <p>
            CoFHE lets smart contracts compute on encrypted numbers with fully homomorphic encryption (FHE). On chain, an encrypted number is a <em>handle</em>: an id that reveals nothing by itself. But encryption only hides what was
            secret to begin with. A balance computed from <code>0 + 5,000,000</code>, where both numbers were written into the transaction in plain text, is stored encrypted and still known to everyone. FHEye finds these values.
          </p>
          <div className="doc-cards">
            <div>
              <b>For developers</b>
              <span>Catch leaks on testnet, before mainnet, and keep them out with a CI check.</span>
            </div>
            <div>
              <b>For auditors</b>
              <span>Grade a contract by how much of its encrypted state is really public.</span>
            </div>
            <div>
              <b>For everyone</b>
              <span>Check whether a “private” balance is private.</span>
            </div>
          </div>
          <p className="doc-note">FHEye is independent and unofficial, not made by Fhenix. It only reads public chain data and never decrypts anything with keys. A clean result is good news, not an audit.</p>
        </Section>

        <Section id="start" title="Getting started">
          <ol className="doc-steps">
            <li>
              <b>Find a transaction.</b> Any transaction that used CoFHE: a token mint, a private transfer, a vote. Copy its hash from your wallet or a block explorer, or pick one on the <a href="#/radar">leak radar</a>.
            </li>
            <li>
              <b>Paste it into the search box</b> on the home page or in the header. The network is found automatically. A contract address works too and opens its report.
            </li>
            <li>
              <b>Read the verdict at the top.</b> It says whether a value is exposed, shows the sum that gives it away and suggests a fix. Scroll down for the operations behind it.
            </li>
          </ol>
          <p>
            No hash at hand? Start with an example: <a href="#/tx/base-sepolia/0x5fc67cd8d581d33a6ce246d253d6bf9ec07b675f1068f1716a9c81a99e9962a3">a token mint whose balance anyone can read</a>, or{' '}
            <a href="#/tx/sepolia/0x538d54bd2e959fee8620c7a5bbde3237ea77056b484e88ffe67837174a7874b5">math on encrypted inputs that stays private</a>.
          </p>
        </Section>

        <Section id="verdict" title="Reading a verdict">
          <p>Every transaction page opens with one of three verdicts:</p>
          <ul className="doc-list">
            <li>
              <span className="badge exposed">Looks encrypted, but anyone can work it out</span> At least one computed value can be recomputed from public data.
            </li>
            <li>
              <span className="badge private">Nothing here can be worked out from public data</span> No computed value could be worked out from public data. Not a proof of privacy, but no shortcut was found.
            </li>
            <li>
              <span className="badge neutral">No encrypted computation here</span> The transaction did not run FHE operations (it may only verify inputs or publish results).
            </li>
          </ul>
          <h3>The sum</h3>
          <p>An exposed verdict shows the operation that gives the value away. Each box is a value:</p>
          <ul className="doc-legend">
            <li>
              <span className="mchip c">5,000,000</span> a plain number written into the transaction (dashed amber)
            </li>
            <li>
              <span className="mchip p">10,790</span> a value that was already decrypted publicly (dashed violet)
            </li>
            <li>
              <span className="mchip s">encrypted</span> something FHEye cannot see (solid violet)
            </li>
            <li>
              <span className="mchip r">5,000,000</span> the result: stored encrypted, known to everyone (solid amber)
            </li>
          </ul>
          <p>
            Below it, <b>What to do</b> suggests a fix. When the contract made the value readable by anyone, <b>Check it with the CoFHE network</b> asks Fhenix's own decryption network for the value and verifies its signature, so you
            don't have to take FHEye's word for it.
          </p>
          <h3>Under the hood</h3>
          <p>
            The stats, the graph and the task table list every encrypted operation in execution order. In the graph, click a task to light up everything it is computed from. In the table, <code>#2</code> refers to the task that
            produced a value, and <code>#4↓</code> to a value an earlier transaction stored and this one re-created. The access column shows who may use each value: <b>anyone can decrypt</b> (allowGlobal), the target contract and the
            sender.
          </p>
        </Section>

        <Section id="radar" title="Leak radar">
          <p>
            The <a href="#/radar">radar</a> lists the latest CoFHE transactions on a network, refreshed every 30 seconds. Each row is marked <span className="badge exposed">Exposed · 1 of 2</span>,{' '}
            <span className="badge private">Nothing found</span> or <span className="badge neutral">Constants only</span>; open a row for its verdict. “Via earlier txs” means the value is only public because of results computed in an
            earlier transaction in the 15-minute window. The side panel lists the contracts leaking most right now.
          </p>
        </Section>

        <Section id="contract" title="Contract report">
          <p>
            A <a href="#/contract">contract report</a> analyses a contract's latest transactions (up to 25, in the window you pick) and grades the share of computed values that are public: <b>A</b> none, <b>B</b> up to 10%, <b>C</b> up to
            25%, <b>D</b> up to half, <b>F</b> more. Values are followed back through earlier transactions in the window, so a balance that started from a plain zero is caught in every later transaction that adds to it. Copy the report
            link to share it.
          </p>
          <p>Paste a wallet instead of a contract and the report covers the encrypted transactions that wallet sent.</p>
        </Section>

        <Section id="handles" title="Handles">
          <p>
            A handle is the 32-byte id that stands for an encrypted value. Its last two bytes say what it is: one bit for “made from a plain number” (trivially encrypted), seven bits for the type (ebool, euint8 … euint128, eaddress) and
            one byte for the security zone. The <a href="#/handles">handle decoder</a> reads them offline; <b>Check on chain</b> asks a network whether anyone may decrypt each handle and whether a decrypt result was published.
          </p>
        </Section>

        <Section id="mainnet" title="Mainnet status">
          <p>
            CoFHE's TaskManager contract is deployed on Ethereum and Arbitrum One but switched off until launch. The <a href="#/status">mainnet page</a> reads both directly and shows the launch as steps: deployed, contracts allowed,
            intake open, first encrypted operation. The bar on top of every page and the badge on the Mainnet tab switch to live on their own when a TaskManager opens.
          </p>
        </Section>

        <Section id="concepts" title="Concepts">
          <dl className="doc-dl">
            <dt>FHE and CoFHE</dt>
            <dd>Fully homomorphic encryption computes on encrypted data without decrypting it. CoFHE is Fhenix's coprocessor: contracts on Ethereum, Arbitrum and Base request FHE operations, which run off chain.</dd>
            <dt>TaskManager</dt>
            <dd>The contract that receives those requests. Every operation emits a TaskCreated event with its inputs; FHEye rebuilds each transaction's computation from these events.</dd>
            <dt>Trivial encryption</dt>
            <dd>
              <code>FHE.asEuint64(5000000)</code> turns a plain number into an encrypted value. The number itself is in the event data, so the result is public.
            </dd>
            <dt>Encrypted input</dt>
            <dd>A value the user encrypts in their own browser with the CoFHE SDK and passes in with a proof. The chain never sees the plain number.</dd>
            <dt>Access (ACL)</dt>
            <dd>
              <code>FHE.allow</code>, <code>allowThis</code> and <code>allowSender</code> let specific addresses use a value; <code>allowGlobal</code> (also called <code>allowPublic</code>) lets anyone ask the network to decrypt it.
            </dd>
            <dt>Published decrypt</dt>
            <dd>A decryption result written on chain with the network's signature. Once published, the value and anything computed only from it are public.</dd>
          </dl>
        </Section>

        <Section id="fix" title="Fixing leaks">
          <p>The most common leak: amounts written into the transaction as plain numbers.</p>
          <Code lang="Solidity">{BAD}</Code>
          <p>Take the amount as an encrypted input instead, and give the owner access:</p>
          <Code lang="Solidity">{GOOD}</Code>
          <Code lang="TypeScript">{CLIENT}</Code>
          <p>Three more patterns FHEye flags:</p>
          <ul className="doc-list plain">
            <li>
              <b>Built on a public decryption.</b> Anything computed only from a published result and plain numbers is public. Mix in an encrypted value, or publish only the final result you mean to reveal.
            </li>
            <li>
              <b>Math that cancels out.</b> <code>x − x</code>, <code>x × 0</code> or a choice between two equal values gives the same answer for any input. Usually a logic slip.
            </li>
            <li>
              <b>Readable by anyone.</b> <code>allowGlobal</code> lets anyone decrypt a value. Use <code>FHE.allow(value, account)</code> unless the value is meant to be public.
            </li>
          </ul>
          <p className="doc-note">The examples follow cofhe-contracts and @cofhe/sdk as of October 2026. Exact calls change between versions; check the official CoFHE documentation for the release you use.</p>
        </Section>

        <Section id="api" title="API">
          <p>A free, read-only JSON API with open CORS and edge caching. Bigints are decimal strings, handles are 32-byte hex.</p>
          <table className="doc-table">
            <tbody>
              <tr>
                <td>
                  <code>GET /api/tx/&lt;hash&gt;</code>
                </td>
                <td>Verdict and FHE tasks of a transaction. Optional ?chain=&lt;key&gt;.</td>
              </tr>
              <tr>
                <td>
                  <code>GET /api/handle/&lt;handle&gt;</code>
                </td>
                <td>Decode up to 20 comma-separated handles; with ?chain=, who may decrypt them.</td>
              </tr>
              <tr>
                <td>
                  <code>GET /api/mainnet</code>
                </td>
                <td>Live state of both mainnet TaskManagers.</td>
              </tr>
              <tr>
                <td>
                  <a href="api" target="_blank" rel="noreferrer">
                    <code>GET /api</code>
                  </a>
                </td>
                <td>The list of endpoints.</td>
              </tr>
            </tbody>
          </table>
          <p className="small muted">Chains: ethereum, arbitrum, sepolia, arbitrum-sepolia, base-sepolia.</p>
          <Code lang="Shell">{API_EXAMPLE}</Code>
        </Section>

        <Section id="cli" title="Command line">
          <p>
            The same analysis runs in a terminal with <code>fheye</code>. Every command takes <code>--rpc</code> and <code>--json</code>. Exit codes: <code>0</code> done, <code>1</code> a computed value is public (with{' '}
            <code>--fail-on-public</code>), <code>2</code> bad input or network error.
          </p>
          <Code lang="Shell">{CLI}</Code>
          <p>Fail a CI job when a contract's recent transactions leak a value:</p>
          <Code lang="YAML">{CI}</Code>
        </Section>

        <Section id="limits" title="Privacy and limits">
          <ul className="doc-list plain">
            <li>FHEye runs in your browser. It reads public chain data through public RPC endpoints, which you can replace with your own under “RPC endpoints” at the bottom of every page (stored only in your browser).</li>
            <li>It never asks for a wallet, never sends a transaction and never holds keys.</li>
            <li>“Public” means provably public. Values built from encrypted inputs can still leak through gas, control flow or other transactions; those are out of scope.</li>
            <li>TaskCreated does not index the handle, so a value from an older transaction is only followed within the window the radar or report scans.</li>
            <li>Contracts are attributed by the transaction's target, which differs when calls go through a router.</li>
            <li>Results follow TFHE-rs, the library behind CoFHE. Where production behaviour hasn't been confirmed (division and remainder by zero, wide shifts), the verdict says what it assumes.</li>
          </ul>
        </Section>
      </article>
    </div>
  )
}
