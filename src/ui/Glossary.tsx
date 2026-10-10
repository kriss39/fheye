// Plain-language key for the tx view. Hover titles don't exist on phones, so the terms are spelled out here.

import type { ReactNode } from 'react'
import { Pill } from './components'

const TERMS: Array<{ term: ReactNode; text: ReactNode }> = [
  {
    term: (
      <>
        <span className="swatch public" /> public value
      </>
    ),
    text: 'Looks encrypted, but anyone can recompute it from plaintext constants or published decrypt results. This is what FHEye is looking for.',
  },
  {
    term: (
      <>
        <span className="swatch trivial" /> plaintext constant
      </>
    ),
    text: (
      <>
        Made with <code>trivialEncrypt</code>, e.g. <code>FHE.asEuint64(10000)</code>. The number is stored in the transaction's event data for anyone to read.
      </>
    ),
  },
  {
    term: (
      <>
        <span className="swatch secret" /> encrypted
      </>
    ),
    text: 'Depends on an encrypted user input, randomness or an unknown earlier value. FHEye can say nothing about it.',
  },
  {
    term: <Pill tone="danger">anyone can decrypt</Pill>,
    text: (
      <>
        The contract called <code>allowGlobal</code> on this handle, so anyone may ask the CoFHE network for its value. FHEye can do that for you and check the network's signature.
      </>
    ),
  },
  { term: <Pill>contract ✓ / sender ✓</Pill>, text: "The transaction's target contract or sender may use this handle (the ACL's isAllowed)." },
  { term: 'handle', text: 'The 32-byte id that stands for an encrypted value on chain. Its last two bytes give the type and whether it came from a plaintext constant.' },
  { term: 'earlier tx', text: 'A handle this transaction used but did not create. The contract report follows such handles back through earlier transactions.' },
  { term: 'est. FHE gas', text: "Estimated from the gas table in the CoFHE docs; it's the cost of the FHE calls, not of the off-chain computation." },
]

export function Glossary({ open = false }: { open?: boolean }) {
  return (
    <details className="card glossary" open={open}>
      <summary>
        <h3>How to read this</h3>
      </summary>
      <dl>
        {TERMS.map(({ term, text }, i) => (
          <div key={i}>
            <dt>{term}</dt>
            <dd>{text}</dd>
          </div>
        ))}
      </dl>
    </details>
  )
}
