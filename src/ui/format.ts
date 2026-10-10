import type { LensChain } from '../chains'

export const shortHex = (hex: string, head = 6, tail = 4) => (hex.length <= head + tail + 3 ? hex : `${hex.slice(0, head)}…${hex.slice(-tail)}`)

export const fmt = (n: number | bigint) => n.toLocaleString('en-US')

export const pct = (x: number) => `${(x * 100).toFixed(x > 0 && x < 0.01 ? 2 : 1)}%`

export const addressUrl = (chain: LensChain, address: string) => `${chain.explorer}/address/${address}`
export const txUrl = (chain: LensChain, hash: string) => `${chain.explorer}/tx/${hash}`
export const blockUrl = (chain: LensChain, block: bigint) => `${chain.explorer}/block/${block}`

export function errorMessage(e: unknown): string {
  const any = e as { shortMessage?: string; details?: string; message?: string }
  return any.details || any.shortMessage || any.message || String(e)
}
