// "Ask the network" for a handle anyone may decrypt. User-initiated; the signature is checked
// against the TaskManager's decrypt signer, and compared with FHEye's own value when it has one.

import { useState } from 'react'
import { publicDecrypt, type PublicDecryptResult } from '../acl/publicDecrypt'
import type { LensChain } from '../chains'
import { useClients } from './clients'
import { AlertIcon, CheckIcon } from './icons'
import { errorMessage } from './format'

export function DecryptButton({ chain, handle, expected, big = false }: { chain: LensChain; handle: bigint; expected?: bigint; big?: boolean }) {
  const { client } = useClients(chain)
  const [state, setState] = useState<{ busy: boolean; result?: PublicDecryptResult; error?: string }>({ busy: false })
  if (state.result) {
    const r = state.result
    const agrees = expected === undefined ? null : expected === r.value
    const good = r.verified && agrees !== false
    return (
      <span className={big ? `verify-result ${good ? 'ok' : 'bad'}` : 'small'} title={`signature from ${r.signer ?? 'unknown'}`}>
        {big && (good ? <CheckIcon size={18} /> : <AlertIcon size={18} />)}
        <span>
          {big ? 'The CoFHE network says' : 'network:'} <span className="value">{big ? r.value.toLocaleString('en-US') : r.value.toString()}</span>{' '}
          <span style={{ color: r.verified ? 'var(--ok)' : 'var(--danger)' }}>{r.verified ? '✓ signed by the decrypt signer' : '✗ signature not from the decrypt signer'}</span>
          {agrees !== null && <span style={{ color: agrees ? 'var(--ok)' : 'var(--danger)' }}>{agrees ? ' · matches FHEye' : ' · differs from FHEye'}</span>}
        </span>
      </span>
    )
  }
  return (
    <span className={big ? 'verdict-actions' : 'small'}>
      <button
        type="button"
        className={big ? 'primary' : 'sm'}
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
        {big && <CheckIcon size={18} />}
        {state.busy ? 'asking the network…' : big ? 'Check it with the CoFHE network' : 'decrypt via network'}
      </button>
      {big && !state.busy && <span className="muted small">Anyone may decrypt this value, so FHEye can ask the network itself and verify its signature.</span>}
      {state.error && <span style={{ color: 'var(--danger)' }}> {state.error}</span>}
    </span>
  )
}
