// "Ask the network" for a handle anyone may decrypt. User-initiated; the signature is checked
// against the TaskManager's decrypt signer, and compared with FHE Lens' own value when it has one.

import { useState } from 'react'
import { publicDecrypt, type PublicDecryptResult } from '../acl/publicDecrypt'
import type { LensChain } from '../chains'
import { useClients } from './clients'
import { errorMessage } from './format'

export function DecryptButton({ chain, handle, expected }: { chain: LensChain; handle: bigint; expected?: bigint }) {
  const { client } = useClients(chain)
  const [state, setState] = useState<{ busy: boolean; result?: PublicDecryptResult; error?: string }>({ busy: false })
  if (state.result) {
    const r = state.result
    const agrees = expected === undefined ? null : expected === r.value
    return (
      <span className="small" title={`signature from ${r.signer ?? 'unknown'}`}>
        network: <span className="value">{r.value.toString()}</span>{' '}
        <span style={{ color: r.verified ? 'var(--ok)' : 'var(--danger)' }}>{r.verified ? '✓ signed by the decrypt signer' : '✗ signature not from the decrypt signer'}</span>
        {agrees !== null && <span style={{ color: agrees ? 'var(--ok)' : 'var(--danger)' }}>{agrees ? ' · matches FHE Lens' : ' · differs from FHE Lens'}</span>}
      </span>
    )
  }
  return (
    <span className="small">
      <button
        type="button"
        className="link small"
        disabled={state.busy}
        title="This handle is marked decryptable by anyone. Ask the CoFHE threshold network for its value."
        onClick={async () => {
          setState({ busy: true })
          try {
            setState({ busy: false, result: await publicDecrypt(client, chain, handle) })
          } catch (e) {
            setState({ busy: false, error: errorMessage(e) })
          }
        }}
      >
        {state.busy ? 'asking the network…' : 'decrypt via network'}
      </button>
      {state.error && <span style={{ color: 'var(--danger)' }}> {state.error}</span>}
    </span>
  )
}
