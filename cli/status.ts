// `fheye status`: mainnet TaskManager flags, the access list rebuilt from events and checked
// against storage, and lifetime task counts. Same reads as the web status page, without its
// localStorage cache, so every run scans the full history.

import type { Address, PublicClient } from 'viem'
import type { LensChain } from '../src/chains'
import type { ScanProgress } from '../src/logs'
import { foldAdmin, readFlags, scanHistory, verifyAccessList, type AccessEntry, type TaskManagerFlags } from '../src/mainnet/status'
import { fmt } from '../src/ui/format'
import { plain, table, type Style } from './format'

export interface ChainStatus {
  chain: { key: string; id: number; name: string }
  taskManager: Address
  deployBlock: bigint
  scannedTo: bigint
  flags: TaskManagerFlags
  counts: { tasks: number; inputs: number; decrypts: number; adminEvents: number }
  accessList: AccessEntry[]
  denyList: Address[]
  roles: Array<{ role: string; account: Address; since: bigint }>
}

export async function loadStatus(client: PublicClient, logClient: PublicClient, chain: LensChain, onProgress?: (p: ScanProgress) => void): Promise<ChainStatus> {
  const [flags, history] = await Promise.all([readFlags(client, chain.taskManager), scanHistory(logClient, chain, { onProgress })])
  const admin = foldAdmin(history.admin)
  const accessList = await verifyAccessList(client, chain.taskManager, admin.accessList)
  return {
    chain: { key: chain.key, id: chain.id, name: chain.name },
    taskManager: chain.taskManager,
    deployBlock: chain.deployBlock,
    scannedTo: history.scannedTo,
    flags,
    counts: { tasks: history.taskCount, inputs: history.inputCount, decrypts: history.decryptCount, adminEvents: history.admin.length },
    accessList,
    denyList: admin.denyList,
    roles: admin.roles,
  }
}

export function formatStatus(s: ChainStatus, st: Style = plain): string {
  const f = s.flags
  const out: string[] = []
  out.push(
    `${st.bold(s.chain.name)}  ${f.isEnabled ? st.ok('intake enabled') : st.warn('intake disabled')} · ${f.accessListEnabled ? 'allowlist only' : st.ok('open to all')}`,
  )
  out.push(st.dim(`TaskManager ${s.taskManager} · deployed in block ${fmt(s.deployBlock)} · scanned through block ${fmt(s.scannedTo)}`))
  out.push(
    ...table([
      ['allowlisted callers', fmt(s.accessList.length)],
      ['FHE tasks', fmt(s.counts.tasks)],
      ['encrypted inputs', fmt(s.counts.inputs)],
      ['published decrypts', fmt(s.counts.decrypts)],
    ]).map((l) => `  ${l}`),
  )

  if (s.accessList.length === 0) {
    out.push(f.accessListEnabled ? 'No contract is allowlisted yet, so no one can create FHE tasks on this chain.' : 'The access list is off: any caller not on the deny list can create tasks.')
  } else {
    out.push('Access list:')
    out.push(...table(s.accessList.map((a) => [`  ${a.account}`, `added in block ${fmt(a.grantedAt)}`, a.onChain ? st.ok('still on list') : st.danger('no longer on list')])))
  }
  if (s.denyList.length) out.push(`Deny list: ${s.denyList.join(', ')}`)

  const kv: string[][] = [
    ['verifier signer', f.verifierSigner],
    ['decrypt signer', f.decryptResultSigner],
    ['ACL', f.acl],
    ['PlaintextsStorage', f.plaintextsStorage],
    ['version', String(f.version)],
  ]
  const byAccount = new Map<string, string[]>()
  for (const r of s.roles) byAccount.set(r.account, [...(byAccount.get(r.account) ?? []), r.role.replace(/_ROLE$/, '').toLowerCase().replace(/_/g, ' ')])
  out.push(...table(kv).map((l) => st.dim(`  ${l}`)))
  if (byAccount.size) {
    out.push(st.dim('  roles:'))
    out.push(...table([...byAccount].map(([account, roles]) => [account, roles.join(', ')])).map((l) => st.dim(`    ${l}`)))
  }
  return out.join('\n')
}
