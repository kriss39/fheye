// The plain-language answer at the top of the tx page (see leak/explain.ts).

import type { HandleStatus } from '../acl/check'
import type { LensChain } from '../chains'
import type { Verdict } from '../leak/explain'
import { DecryptButton } from './DecryptButton'
import { Equation } from './Equation'
import { AlertIcon, GraphIcon, ShieldIcon, UnlockIcon } from './icons'

export function VerdictCard({ verdict: v, chain, status }: { verdict: Verdict; chain: LensChain; status: Map<bigint, HandleStatus> }) {
  const icon = v.kind === 'exposed' ? <UnlockIcon size={28} /> : v.kind === 'private' ? <ShieldIcon size={28} /> : <GraphIcon size={28} />
  const canVerify = v.equation && status.get(v.equation.handle)?.global
  return (
    <section className={`verdict ${v.kind}`} aria-label="Verdict">
      <div className="verdict-head">
        <div className="verdict-icon">{icon}</div>
        <div>
          <h2>{v.headline}</h2>
          <p className="detail">{v.detail}</p>
        </div>
      </div>
      {v.equation && <Equation parts={v.equation.parts} result={v.equation.result} />}
      <p className="explain">{v.explanation}</p>
      {canVerify && <DecryptButton chain={chain} handle={v.equation!.handle} expected={v.equation!.value} big />}
      {v.advice && (
        <div className="advice">
          <AlertIcon size={20} />
          <p>
            <b>What to do</b>
            {v.advice}
          </p>
        </div>
      )}
      {v.notes.length > 0 && (
        <ul className="verdict-notes">
          {v.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </section>
  )
}
