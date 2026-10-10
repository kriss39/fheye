import type { LensChain } from '../chains'
import { PrunedHistoryError, TruncatedResponseError } from '../logs'

export const shortHex = (hex: string, head = 6, tail = 4) => (hex.length <= head + tail + 3 ? hex : `${hex.slice(0, head)}…${hex.slice(-tail)}`)

export const fmt = (n: number | bigint) => n.toLocaleString('en-US')

export const pct = (x: number) => `${(x * 100).toFixed(x > 0 && x < 0.01 ? 2 : 1)}%`

export const addressUrl = (chain: LensChain, address: string) => `${chain.explorer}/address/${address}`
export const txUrl = (chain: LensChain, hash: string) => `${chain.explorer}/tx/${hash}`
export const blockUrl = (chain: LensChain, block: bigint) => `${chain.explorer}/block/${block}`

const RPC_HINT = 'You can set your own endpoint under "RPC endpoints" at the bottom of the page.'

/** Turns RPC failures into something a user can act on. */
export function errorMessage(e: unknown): string {
  if (e instanceof PrunedHistoryError) return `This RPC no longer serves logs that old (blocks ${e.fromBlock}–${e.toBlock}). ${RPC_HINT}`
  if (e instanceof TruncatedResponseError) return `${e.message} ${RPC_HINT}`
  const any = e as { shortMessage?: string; details?: string; message?: string; name?: string }
  const text = any.details || any.shortMessage || any.message || String(e)
  if (/rate limit|too many requests|429/i.test(text)) return `The public RPC is rate-limiting requests. Wait a few seconds and retry. ${RPC_HINT}`
  if (any.name === 'TransactionReceiptNotFoundError' || /could not be found/i.test(text)) return 'This transaction was not found on the selected network.'
  if (/failed to fetch|fetch failed|network|timeout|timed out/i.test(text)) return `Could not reach the RPC (${text.slice(0, 120)}). ${RPC_HINT}`
  return text
}
