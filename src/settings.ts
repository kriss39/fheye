// Per-viewer settings kept in localStorage: custom RPC per chain and cached TaskManager history.
// Storage can be unavailable (private windows, blocked site data), so every access is guarded.

import { useSyncExternalStore } from 'react'
import type { LensChain } from './chains'

const listeners = new Set<() => void>()

export function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* storage unavailable: settings stay in memory for this visit */
  }
  listeners.forEach((l) => l())
}

const rpcKey = (chainId: number) => `fhelens:rpc:${chainId}`

export function customRpc(chain: LensChain): string | undefined {
  return readStorage(rpcKey(chain.id)) || undefined
}

export function setCustomRpc(chain: LensChain, url: string) {
  writeStorage(rpcKey(chain.id), url.trim() || null)
}

/** Re-renders when any setting changes. */
export function useSettingsVersion(): number {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => version,
  )
}
let version = 0
listeners.add(() => version++)
