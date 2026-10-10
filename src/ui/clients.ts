import { useMemo } from 'react'
import type { LensChain } from '../chains'
import { makeClients, type LensClients } from '../client'
import { customRpc, useSettingsVersion } from '../settings'

/** viem clients for a chain, honouring the viewer's RPC override. */
export function useClients(chain: LensChain): LensClients {
  useSettingsVersion() // re-render when the override changes
  const rpc = customRpc(chain)
  return useMemo(() => makeClients(chain, rpc), [chain, rpc])
}
