// Decrypts a handle that is marked decryptable by anyone (ACL.globalAllowed), using the CoFHE
// threshold network the same way @cofhe/sdk's decryptForTx().withoutACP() does, and checks the
// returned signature against the TaskManager's decryptResultSigner so the value doesn't have to
// be taken on trust.

import { encodePacked, isAddressEqual, keccak256, recoverAddress, type Address, type Hex, type PublicClient } from 'viem'
import { taskManagerAbi } from '../abi'
import type { LensChain } from '../chains'
import { decodeHandle } from '../handle/decode'

export interface PublicDecryptResult {
  value: bigint
  signature: Hex
  /** Recovered signer equals TaskManager.decryptResultSigner. */
  verified: boolean
  signer: Address | null
}

const bytesToBigInt = (bytes: number[]) => (bytes.length ? BigInt(`0x${bytes.map((b) => b.toString(16).padStart(2, '0')).join('')}`) : 0n)

interface TnResponse {
  request_id?: string | null
  status?: string
  is_succeed?: boolean
  decrypted?: number[]
  signature?: string
  error_message?: string | null
  /** The service reports request errors here, e.g. "not_publicly_allowed". */
  error?: string
  message?: string
}

const errText = (b: TnResponse) => b.error ?? b.error_message ?? b.message ?? ''

async function tnFetch(url: string, init: RequestInit, signal?: AbortSignal): Promise<{ status: number; body: TnResponse }> {
  const res = await fetch(url, { ...init, signal })
  const text = await res.text()
  let body: TnResponse = {}
  try {
    body = JSON.parse(text)
  } catch {
    body = { message: text.slice(0, 200) }
  }
  return { status: res.status, body }
}

export async function requestPublicDecrypt(chain: LensChain, handle: bigint, opts: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<{ value: bigint; signature: Hex }> {
  const deadline = Date.now() + (opts.timeoutMs ?? 60_000)
  const body = JSON.stringify({ ct_tempkey: handle.toString(16).padStart(64, '0'), host_chain_id: chain.id })
  let res = await tnFetch(`${chain.tnUrl}/v2/decrypt`, { method: 'POST', headers: { 'content-type': 'application/json' }, body }, opts.signal)
  // A fresh handle can 404 until the network has indexed it; retry briefly like the SDK.
  const transient = () => res.status === 404 || res.status >= 500
  while (transient() && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500))
    res = await tnFetch(`${chain.tnUrl}/v2/decrypt`, { method: 'POST', headers: { 'content-type': 'application/json' }, body }, opts.signal)
  }
  for (let wait = 1000; ; wait = Math.min(wait * 1.5, 8000)) {
    const b = res.body
    if (res.status >= 400) throw new Error(`Decrypt service answered ${res.status}: ${errText(b) || 'error'}`)
    if (b.is_succeed === false || b.error_message) throw new Error(`Decrypt failed: ${b.error_message ?? 'unknown error'}`)
    if (Array.isArray(b.decrypted) && b.signature) {
      const sig = (b.signature.startsWith('0x') ? b.signature : `0x${b.signature}`) as Hex
      return { value: bytesToBigInt(b.decrypted), signature: sig }
    }
    if (!b.request_id) throw new Error('Decrypt service returned neither a result nor a request id')
    if (Date.now() > deadline) throw new Error('Timed out waiting for the decrypt service')
    await new Promise((r) => setTimeout(r, wait))
    res = await tnFetch(`${chain.tnUrl}/v2/decrypt/${b.request_id}`, { method: 'GET' }, opts.signal)
  }
}

/** Message the decrypt signer signs: result ‖ enc_type (4) ‖ chain_id (8) ‖ ct_hash (TaskManager._computeDecryptResultHash). */
export function decryptResultHash(chainId: number, handle: bigint, value: bigint): Hex {
  const encType = decodeHandle(handle).typeId
  return keccak256(encodePacked(['uint256', 'uint32', 'uint64', 'uint256'], [value, encType, BigInt(chainId), handle]))
}

export async function publicDecrypt(client: PublicClient, chain: LensChain, handle: bigint, opts: { signal?: AbortSignal } = {}): Promise<PublicDecryptResult> {
  const [{ value, signature }, expected] = await Promise.all([
    requestPublicDecrypt(chain, handle, opts),
    client.readContract({ address: chain.taskManager, abi: taskManagerAbi, functionName: 'decryptResultSigner' }),
  ])
  let signer: Address | null = null
  try {
    signer = await recoverAddress({ hash: decryptResultHash(chain.id, handle, value), signature })
  } catch {
    signer = null
  }
  return { value, signature, signer, verified: !!signer && isAddressEqual(signer, expected) }
}
