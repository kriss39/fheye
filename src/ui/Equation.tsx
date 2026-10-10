// The visual sum behind a verdict: plain numbers and encrypted values, an operator, and the result.

import type { Chip, EquationPart } from '../leak/explain'
import { LockIcon, UnlockIcon } from './icons'

function ChipView({ chip, result = false }: { chip: Chip; result?: boolean }) {
  return (
    <div className={`chip ${chip.kind}${result ? ' result' : ''}`}>
      <b>
        {chip.kind === 'secret' ? <LockIcon size={20} /> : <UnlockIcon size={20} />}
        {chip.value}
      </b>
      <span>{chip.note}</span>
    </div>
  )
}

export function Equation({ parts, result }: { parts: EquationPart[]; result: Chip }) {
  return (
    <div className="equation" role="group" aria-label="How the value is computed">
      {parts.map((p, i) =>
        typeof p === 'string' ? (
          <span key={i} className="op">
            {p}
          </span>
        ) : (
          <ChipView key={i} chip={p} />
        ),
      )}
      <span className="op">=</span>
      <ChipView chip={result} result />
    </div>
  )
}
