// Networks FHEye can read. TaskManager addresses are resolved through the CoFHE address
// book at runtime; the ones here are fallbacks and a sanity check.
//
// Default endpoints were picked by probing keyless public RPCs (2026-10-10) for browser CORS,
// log history depth and eth_getLogs span limits. `rpc` serves latest-state calls and receipts,
// `logRpcs` must keep full log history. Users can override both.

export const ADDRESS_BOOK = '0xC0F4e00E531a2B086492Ae3DCC1515038307196b' as const

export interface LensChain {
  id: number
  key: string
  name: string
  mainnet: boolean
  rpc: string
  /** Full-history endpoints for eth_getLogs, tried in order. */
  logRpcs: string[]
  /** Largest block span every `logRpcs` entry accepts for one eth_getLogs call. */
  maxLogRange: bigint
  explorer: string
  taskManager: `0x${string}`
  /** First block with TaskManager logs; scans for admin events start here. */
  deployBlock: bigint
  /** Average seconds per block, for time-based windows. */
  blockTime: number
  /** CoFHE threshold network (decrypt service), from @cofhe/sdk chain configs. */
  tnUrl: string
}

const MAINNET_TN = 'https://cofhe-tn.mainnet.fhenix.zone'
const TESTNET_TN = 'https://testnet-cofhe-tn.fhenix.zone'

const MAINNET_TM = '0x52E7a0cAF234b266bCFAa6aA933a412FDe58432A' as const
const TESTNET_TM = '0xeA30c4B8b44078Bbf8a6ef5b9f1eC1626C7848D9' as const

export const CHAINS: LensChain[] = [
  {
    id: 1,
    key: 'ethereum',
    name: 'Ethereum',
    mainnet: true,
    rpc: 'https://ethereum-rpc.publicnode.com',
    // publicnode only serves recent logs without a token; these keep full history at 50k spans.
    // (drpc's free plan dropped to ~100-block ranges in Oct 2026, so it's no longer listed.)
    logRpcs: ['https://mainnet.gateway.tenderly.co', 'https://rpc.mevblocker.io'],
    maxLogRange: 50_000n,
    explorer: 'https://etherscan.io',
    taskManager: MAINNET_TM,
    deployBlock: 26_120_645n,
    blockTime: 12,
    tnUrl: MAINNET_TN,
  },
  {
    id: 42161,
    key: 'arbitrum',
    name: 'Arbitrum One',
    mainnet: true,
    rpc: 'https://arb1.arbitrum.io/rpc',
    logRpcs: ['https://arb1.arbitrum.io/rpc'],
    maxLogRange: 1_000_000n,
    explorer: 'https://arbiscan.io',
    taskManager: MAINNET_TM,
    deployBlock: 511_675_619n,
    blockTime: 0.25,
    tnUrl: MAINNET_TN,
  },
  {
    id: 11155111,
    key: 'sepolia',
    name: 'Ethereum Sepolia',
    mainnet: false,
    rpc: 'https://ethereum-sepolia-rpc.publicnode.com',
    // publicnode prunes Sepolia logs older than ~2 days
    logRpcs: ['https://sepolia.gateway.tenderly.co', 'https://ethereum-sepolia.gateway.tatum.io'],
    maxLogRange: 100_000n,
    explorer: 'https://sepolia.etherscan.io',
    taskManager: TESTNET_TM,
    deployBlock: 0n,
    blockTime: 12,
    tnUrl: TESTNET_TN,
  },
  {
    id: 421614,
    key: 'arbitrum-sepolia',
    name: 'Arbitrum Sepolia',
    mainnet: false,
    rpc: 'https://arbitrum-sepolia-rpc.publicnode.com',
    logRpcs: ['https://arbitrum-sepolia-rpc.publicnode.com', 'https://sepolia-rollup.arbitrum.io/rpc'],
    maxLogRange: 50_000n,
    explorer: 'https://sepolia.arbiscan.io',
    taskManager: TESTNET_TM,
    deployBlock: 0n,
    blockTime: 0.25,
    tnUrl: TESTNET_TN,
  },
  {
    id: 84532,
    key: 'base-sepolia',
    name: 'Base Sepolia',
    mainnet: false,
    rpc: 'https://base-sepolia-rpc.publicnode.com',
    logRpcs: ['https://base-sepolia-rpc.publicnode.com'],
    maxLogRange: 50_000n,
    explorer: 'https://sepolia.basescan.org',
    taskManager: TESTNET_TM,
    deployBlock: 0n,
    blockTime: 2,
    tnUrl: TESTNET_TN,
  },
]

export function chainById(id: number): LensChain {
  const c = CHAINS.find((x) => x.id === id)
  if (!c) throw new Error(`Unsupported chain ${id}`)
  return c
}
