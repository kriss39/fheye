// TaskManager status: live flags read with eth_call, plus the admin event history folded into
// the current access list. The access list is a plain mapping, so logs are the only way to
// enumerate it; every reconstructed entry is re-checked against `accessList(addr)`.

import { getAbiItem, type Address, type PublicClient } from 'viem'
import { taskManagerAbi } from '../abi'
import type { LensChain } from '../chains'
import { scanLogs, type ScanProgress } from '../logs'

export interface TaskManagerFlags {
  isEnabled: boolean
  accessListEnabled: boolean
  acl: Address
  plaintextsStorage: Address
  verifierSigner: Address
  decryptResultSigner: Address
  version: number
}

export async function readFlags(client: PublicClient, tm: Address): Promise<TaskManagerFlags> {
  const call = <F extends 'isEnabled' | 'accessListEnabled' | 'acl' | 'plaintextsStorage' | 'verifierSigner' | 'decryptResultSigner' | 'getVersion'>(functionName: F) =>
    client.readContract({ address: tm, abi: taskManagerAbi, functionName })
  const [isEnabled, accessListEnabled, acl, plaintextsStorage, verifierSigner, decryptResultSigner, version] = await Promise.all([
    call('isEnabled'),
    call('accessListEnabled'),
    call('acl'),
    call('plaintextsStorage'),
    call('verifierSigner'),
    call('decryptResultSigner'),
    call('getVersion'),
  ])
  return { isEnabled, accessListEnabled, acl, plaintextsStorage, verifierSigner, decryptResultSigner, version: Number(version) }
}

const ADMIN_EVENTS = [
  'AccessListEnabledSet',
  'AccessGranted',
  'AccessRevoked',
  'DenyListSet',
  'EnabledSet',
  'DecryptResultSignerChanged',
  'VerifierSignerChanged',
  'ACLContractChanged',
  'PlaintextsStorageChanged',
  'SecurityZonesChanged',
  'VersionIncremented',
] as const

export const adminEventAbis = ADMIN_EVENTS.map((name) => getAbiItem({ abi: taskManagerAbi, name }))

export interface AdminEvent {
  name: (typeof ADMIN_EVENTS)[number]
  args: Record<string, unknown>
  blockNumber: bigint
  txHash: `0x${string}`
}

export interface AccessEntry {
  account: Address
  grantedAt: bigint
  grantTx: `0x${string}`
  /** Result of `accessList(account)` at the latest block; null if not checked. */
  onChain: boolean | null
}

export interface AdminHistory {
  events: AdminEvent[]
  accessList: AccessEntry[]
  denyList: Address[]
  scannedTo: bigint
}

export async function scanAdminHistory(
  logClient: PublicClient,
  chain: LensChain,
  opts: { toBlock?: bigint; onProgress?: (p: ScanProgress) => void; signal?: AbortSignal } = {},
): Promise<AdminHistory> {
  const toBlock = opts.toBlock ?? (await logClient.getBlockNumber())
  const logs = await scanLogs({
    client: logClient,
    address: chain.taskManager,
    events: adminEventAbis,
    fromBlock: chain.deployBlock,
    toBlock,
    maxRange: chain.maxLogRange,
    onProgress: opts.onProgress,
    signal: opts.signal,
  })

  const events: AdminEvent[] = logs.map((l) => {
    const decoded = l as unknown as { eventName: AdminEvent['name']; args: Record<string, unknown> }
    return { name: decoded.eventName, args: decoded.args, blockNumber: l.blockNumber!, txHash: l.transactionHash! }
  })

  const access = new Map<Address, AccessEntry>()
  const deny = new Set<Address>()
  for (const e of events) {
    const account = e.args.account as Address | undefined
    if (e.name === 'AccessGranted' && account) access.set(account, { account, grantedAt: e.blockNumber, grantTx: e.txHash, onChain: null })
    if (e.name === 'AccessRevoked' && account) access.delete(account)
    if (e.name === 'DenyListSet' && account) {
      if (e.args.denied) deny.add(account)
      else deny.delete(account)
    }
  }
  return { events, accessList: [...access.values()], denyList: [...deny], scannedTo: toBlock }
}

/** Confirms reconstructed access-list entries against contract storage. */
export async function verifyAccessList(client: PublicClient, tm: Address, entries: AccessEntry[]): Promise<AccessEntry[]> {
  const results = await Promise.all(
    entries.map((e) => client.readContract({ address: tm, abi: taskManagerAbi, functionName: 'accessList', args: [e.account] })),
  )
  return entries.map((e, i) => ({ ...e, onChain: results[i] }))
}
