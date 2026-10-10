import { createPublicClient, fallback, http, type Chain, type PublicClient } from 'viem'
import { arbitrum, arbitrumSepolia, baseSepolia, mainnet, sepolia } from 'viem/chains'
import type { LensChain } from './chains'

const VIEM_CHAINS: Record<number, Chain> = {
  [mainnet.id]: mainnet,
  [arbitrum.id]: arbitrum,
  [sepolia.id]: sepolia,
  [arbitrumSepolia.id]: arbitrumSepolia,
  [baseSepolia.id]: baseSepolia,
}

export interface LensClients {
  client: PublicClient
  logClient: PublicClient
}

/** A user-supplied RPC replaces the defaults for both roles. */
export function makeClients(chain: LensChain, userRpc?: string): LensClients {
  const viemChain = VIEM_CHAINS[chain.id]
  const rpc = userRpc || chain.rpc
  const client = createPublicClient({ chain: viemChain, transport: http(rpc, { batch: { batchSize: 50 } }), batch: { multicall: true } })
  const logUrls = userRpc ? [userRpc] : chain.logRpcs
  const logClient =
    logUrls.length === 1 && logUrls[0] === rpc
      ? client
      : createPublicClient({ chain: viemChain, transport: fallback(logUrls.map((u) => http(u, { retryCount: 1 }))) })
  return { client: client as PublicClient, logClient: logClient as PublicClient }
}
