// A live line of real testnet data on the home page: CoFHE is busy right now, and a share of what
// it computes starts from plain numbers. Hidden if the RPC doesn't answer.

import { chainById } from '../chains'
import { recentActivity } from '../mainnet/activity'
import { customRpc } from '../settings'
import { useClients } from './clients'
import { useCountUp } from './motion'
import { useAsync } from './useAsync'

const SEPOLIA = chainById(11155111)
const WINDOW = 600

function Count({ value, suffix = '' }: { value: number; suffix?: string }) {
  const v = useCountUp(value)
  return (
    <b>
      {Math.round(v).toLocaleString('en-US')}
      {suffix}
    </b>
  )
}

export function LivePulse() {
  const { client, logClient } = useClients(SEPOLIA)
  const state = useAsync(`live:${customRpc(SEPOLIA) ?? ''}`, (signal) => recentActivity(client, logClient, SEPOLIA, { seconds: WINDOW, maxTxLookups: 0, signal }))
  const a = state.data
  if (state.error !== undefined || (a && a.tasks === 0)) return null
  return (
    <div className="live" aria-live="polite">
      <span className="live-dot" aria-hidden="true" />
      <span className="live-label">Live on {SEPOLIA.name} · last 10 minutes</span>
      {a ? (
        <>
          <span>
            <Count value={a.tasks} /> encrypted operations
          </span>
          <span>
            <Count value={a.txs} /> transactions
          </span>
          <span>
            <Count value={Math.round(a.trivialShare * 100)} suffix="%" /> of them just encrypt a plain number
          </span>
        </>
      ) : (
        <span className="live-wait">reading the chain…</span>
      )}
    </div>
  )
}
