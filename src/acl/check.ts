// Point queries for one handle: who may use it, can anyone decrypt it, was a result published.
// ACL grants emit no events, so "who can read handle X" has no list; only yes/no per address.

import type { Address, PublicClient } from 'viem'
import { aclAbi, taskManagerAbi } from '../abi'

export interface HandleStatus {
  /** `ACL.globalAllowed`: anyone may decrypt (allowGlobal / allowPublic). */
  global: boolean
  /** `ACL.isAllowedForDecryption`. */
  forDecryption: boolean
  /** Published decrypt result (PlaintextsStorage), if any. */
  published: bigint | null
  /** `isAllowed(handle, addr)` for each address asked about. */
  allowed: Record<Address, boolean>
}

export async function getAcl(client: PublicClient, taskManager: Address): Promise<Address> {
  return client.readContract({ address: taskManager, abi: taskManagerAbi, functionName: 'acl' })
}

export async function handleStatus(client: PublicClient, taskManager: Address, acl: Address, handle: bigint, addresses: Address[] = []): Promise<HandleStatus> {
  const [global, forDecryption, [value, has], ...allowed] = await Promise.all([
    client.readContract({ address: acl, abi: aclAbi, functionName: 'globalAllowed', args: [handle] }),
    client.readContract({ address: acl, abi: aclAbi, functionName: 'isAllowedForDecryption', args: [handle] }),
    client.readContract({ address: taskManager, abi: taskManagerAbi, functionName: 'getDecryptResultSafe', args: [handle] }),
    ...addresses.map((a) => client.readContract({ address: acl, abi: aclAbi, functionName: 'isAllowed', args: [handle, a] })),
  ])
  return {
    global,
    forDecryption,
    published: has ? value : null,
    allowed: Object.fromEntries(addresses.map((a, i) => [a, allowed[i]])),
  }
}
