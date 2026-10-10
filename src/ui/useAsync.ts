import { useCallback, useEffect, useEffectEvent, useState } from 'react'

export interface AsyncState<T> {
  data: T | undefined
  error: unknown
  loading: boolean
}

interface Settled<T> {
  key: string
  nonce: number
  data: T | undefined
  error: unknown
}

/**
 * Runs `fn` whenever `key` changes (null = idle). The AbortSignal is aborted when the key
 * changes or the component unmounts, and stale results are dropped. On `reload()` the previous
 * data stays visible until the new result arrives.
 */
export function useAsync<T>(key: string | null, fn: (signal: AbortSignal) => Promise<T>): AsyncState<T> & { reload: () => void } {
  const [settled, setSettled] = useState<Settled<T> | null>(null)
  const [nonce, setNonce] = useState(0)
  const run = useEffectEvent(fn)

  useEffect(() => {
    if (key === null) return
    const ctrl = new AbortController()
    run(ctrl.signal).then(
      (data) => !ctrl.signal.aborted && setSettled({ key, nonce, data, error: undefined }),
      (error) => !ctrl.signal.aborted && setSettled({ key, nonce, data: undefined, error }),
    )
    return () => ctrl.abort()
  }, [key, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  const sameKey = key !== null && settled?.key === key
  const current = sameKey && settled.nonce === nonce
  return {
    data: sameKey ? settled.data : undefined,
    error: current ? settled.error : undefined,
    loading: key !== null && !current,
    reload,
  }
}
