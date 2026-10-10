// TaskManager status: live flags read with eth_call, plus the contract's full event history
// folded into the access list, deny list, role holders and signer history. The access list is a
// plain mapping, so logs are the only way to enumerate it; every reconstructed entry is
// re-checked against `accessList(addr)`.
//
// History is fetched with topic-less eth_getLogs and decoded locally: Arbitrum's public RPC
// allows 10x wider block ranges without topic filters, and on mainnet the volume is small.

import { decodeEventLog, keccak256, parseAbi, toHex, type Address, type Log, type PublicClient } from 'viem'
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

// OpenZeppelin AccessControl / ERC1967 events the TaskManager proxy also emits.
const proxyAbi = parseAbi([
  'event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)',
  'event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)',
  'event Upgraded(address indexed implementation)',
])
const historyAbi = [...taskManagerAbi, ...proxyAbi]

const ROLE_NAMES = ['UPGRADER_ROLE', 'PAUSER_ROLE', 'SECURITY_ZONE_MANAGER_ROLE', 'ACCESS_LIST_MANAGER_ROLE', 'VERIFIER_SIGNER_MANAGER_ROLE', 'DECRYPT_SIGNER_MANAGER_ROLE', 'CONFIG_MANAGER_ROLE']
export const ROLES: Record<string, string> = Object.fromEntries([
  ['0x' + '00'.repeat(32), 'DEFAULT_ADMIN_ROLE'],
  ...ROLE_NAMES.map((n) => [keccak256(toHex(n)), n]),
])

export interface TmEvent {
  name: string
  args: Record<string, unknown>
  blockNumber: bigint
  logIndex: number
  txHash: `0x${string}`
}

const ADMIN_NAMES = new Set([
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
  'RoleGranted',
  'RoleRevoked',
  'Upgraded',
])

export function decodeTmLog(l: Log): TmEvent | null {
  try {
    const ev = decodeEventLog({ abi: historyAbi, data: l.data, topics: l.topics as [`0x${string}`, ...`0x${string}`[]] })
    return { name: ev.eventName, args: (ev.args ?? {}) as Record<string, unknown>, blockNumber: l.blockNumber!, logIndex: l.logIndex!, txHash: l.transactionHash! }
  } catch {
    return null
  }
}

export interface AccessEntry {
  account: Address
  grantedAt: bigint
  grantTx: `0x${string}`
  /** Result of `accessList(account)` at the latest block; null if not checked. */
  onChain: boolean | null
}

export interface TmHistory {
  chainId: number
  taskManager: Address
  scannedFrom: bigint
  scannedTo: bigint
  /** Admin, role and upgrade events, oldest first. */
  admin: TmEvent[]
  taskCount: number
  inputCount: number
  decryptCount: number
  /** Tasks per tx hash, to attribute them to contracts later. */
  tasksByTx: Record<string, number>
}

export function emptyHistory(chain: LensChain): TmHistory {
  return { chainId: chain.id, taskManager: chain.taskManager, scannedFrom: chain.deployBlock, scannedTo: chain.deployBlock - 1n, admin: [], taskCount: 0, inputCount: 0, decryptCount: 0, tasksByTx: {} }
}

/** Extends `prior` (or a fresh history) up to `toBlock`. */
export async function scanHistory(
  logClient: PublicClient,
  chain: LensChain,
  opts: { prior?: TmHistory; toBlock?: bigint; onProgress?: (p: ScanProgress) => void; signal?: AbortSignal } = {},
): Promise<TmHistory> {
  const base = opts.prior && opts.prior.taskManager === chain.taskManager ? opts.prior : emptyHistory(chain)
  const toBlock = opts.toBlock ?? (await logClient.getBlockNumber())
  if (toBlock <= base.scannedTo) return base
  const logs = await scanLogs({
    client: logClient,
    address: chain.taskManager,
    events: [],
    fromBlock: base.scannedTo + 1n,
    toBlock,
    maxRange: chain.maxLogRange,
    onProgress: opts.onProgress,
    signal: opts.signal,
  })
  const next: TmHistory = { ...base, admin: [...base.admin], tasksByTx: { ...base.tasksByTx }, scannedTo: toBlock }
  for (const l of logs) {
    const ev = decodeTmLog(l)
    if (!ev) continue
    if (ADMIN_NAMES.has(ev.name)) next.admin.push(ev)
    else if (ev.name === 'TaskCreated') {
      next.taskCount++
      next.tasksByTx[ev.txHash] = (next.tasksByTx[ev.txHash] ?? 0) + 1
    } else if (ev.name === 'InputVerified') next.inputCount++
    else if (ev.name === 'DecryptionResult') next.decryptCount++
  }
  return next
}

export interface AdminState {
  accessList: AccessEntry[]
  denyList: Address[]
  roles: Array<{ role: string; account: Address; since: bigint }>
  signerHistory: TmEvent[]
}

export function foldAdmin(events: TmEvent[]): AdminState {
  const access = new Map<Address, AccessEntry>()
  const deny = new Set<Address>()
  const roles = new Map<string, { role: string; account: Address; since: bigint }>()
  for (const e of events) {
    const account = e.args.account as Address | undefined
    if (e.name === 'AccessGranted' && account) access.set(account, { account, grantedAt: e.blockNumber, grantTx: e.txHash, onChain: null })
    else if (e.name === 'AccessRevoked' && account) access.delete(account)
    else if (e.name === 'DenyListSet' && account) {
      if (e.args.denied) deny.add(account)
      else deny.delete(account)
    } else if ((e.name === 'RoleGranted' || e.name === 'RoleRevoked') && account) {
      const role = ROLES[e.args.role as string] ?? (e.args.role as string)
      const key = `${role}:${account.toLowerCase()}`
      if (e.name === 'RoleGranted') roles.set(key, { role, account, since: e.blockNumber })
      else roles.delete(key)
    }
  }
  return {
    accessList: [...access.values()],
    denyList: [...deny],
    roles: [...roles.values()],
    signerHistory: events.filter((e) => e.name === 'VerifierSignerChanged' || e.name === 'DecryptResultSignerChanged'),
  }
}

/** Confirms reconstructed access-list entries against contract storage. */
export async function verifyAccessList(client: PublicClient, tm: Address, entries: AccessEntry[]): Promise<AccessEntry[]> {
  const results = await Promise.all(entries.map((e) => client.readContract({ address: tm, abi: taskManagerAbi, functionName: 'accessList', args: [e.account] })))
  return entries.map((e, i) => ({ ...e, onChain: results[i] }))
}

// JSON with bigints, for caching histories in localStorage.
export const serializeHistory = (h: TmHistory) => JSON.stringify(h, (_, v) => (typeof v === 'bigint' ? { $n: v.toString() } : v))
export const deserializeHistory = (s: string): TmHistory =>
  JSON.parse(s, (_, v) => (v && typeof v === 'object' && typeof v.$n === 'string' && Object.keys(v).length === 1 ? BigInt(v.$n) : v))
