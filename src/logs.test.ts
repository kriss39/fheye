import { describe, expect, it } from 'vitest'
import type { Log, PublicClient } from 'viem'
import { PrunedHistoryError, TruncatedResponseError, scanLogs } from './logs'

// One log per block in [0, 9999].
const ALL = Array.from({ length: 10_000 }, (_, i) => ({ blockNumber: BigInt(i), logIndex: 0 }) as unknown as Log)

function fakeClient(behaviour: (from: bigint, to: bigint, call: number) => Log[] | Error) {
  let calls = 0
  const client = {
    getLogs: async ({ fromBlock, toBlock }: { fromBlock: bigint; toBlock: bigint }) => {
      const r = behaviour(fromBlock, toBlock, calls++)
      if (r instanceof Error) throw r
      return r
    },
  } as unknown as PublicClient
  return { client, calls: () => calls }
}

const slice = (from: bigint, to: bigint) => ALL.filter((l) => l.blockNumber! >= from && l.blockNumber! <= to)
const rpcError = (details: string) => Object.assign(new Error('RPC Request failed.'), { details })
const base = { address: '0x0000000000000000000000000000000000000001', events: [], fromBlock: 0n, toBlock: 9999n } as const

describe('scanLogs', () => {
  it('bisects ranges the node rejects for size', async () => {
    const { client } = fakeClient((f, t) => (t - f >= 1000n ? rpcError('query exceeds max results 20000, retry with the range 1-2') : slice(f, t)))
    const logs = await scanLogs({ ...base, client, maxRange: 10_000n })
    expect(logs).toHaveLength(10_000)
  })

  it('does not trust large responses, which some providers silently truncate', async () => {
    // Keeps only the newest 600 logs of any bigger response, like Tenderly's gateway.
    const { client } = fakeClient((f, t) => slice(f, t).slice(-600))
    const logs = await scanLogs({ ...base, client, maxRange: 10_000n, trustLimit: 500 })
    expect(logs).toHaveLength(10_000)
    expect(logs[0].blockNumber).toBe(0n)
  })

  it('retries rate limits with backoff instead of bisecting', async () => {
    const { client, calls } = fakeClient((f, t, call) => (call === 0 ? rpcError('Too many requests, rate limit reached') : slice(f, t)))
    const logs = await scanLogs({ ...base, client, maxRange: 10_000n, trustLimit: 20_000, concurrency: 1 })
    expect(logs).toHaveLength(10_000)
    expect(calls()).toBe(2)
  })

  it('ignores digits like 429 inside the request body', async () => {
    const err = Object.assign(new Error('body: 0xe4292f…'), { details: 'query exceeds max results 20000' })
    const { client } = fakeClient((f, t) => (t - f >= 5000n ? err : slice(f, t)))
    expect(await scanLogs({ ...base, client, maxRange: 10_000n })).toHaveLength(10_000)
  })

  it('surfaces pruned history as a typed error', async () => {
    const { client } = fakeClient(() => rpcError('pruned history unavailable'))
    await expect(scanLogs({ ...base, client, maxRange: 10_000n })).rejects.toBeInstanceOf(PrunedHistoryError)
  })

  it('returns logs sorted by block and log index', async () => {
    const { client } = fakeClient((f, t) => slice(f, t).reverse())
    const logs = await scanLogs({ ...base, client, maxRange: 1000n, concurrency: 5 })
    expect(logs.map((l) => Number(l.blockNumber))).toEqual(ALL.map((_, i) => i))
  })
})

describe('scanLogs truncation at the block level', () => {
  it('refuses a single block at the trust limit instead of accepting a possibly truncated set', async () => {
    // Every range, down to a single block, comes back capped at 600 logs.
    const { client } = fakeClient(() => ALL.slice(0, 600))
    await expect(scanLogs({ ...base, client, toBlock: 3n, maxRange: 4n, trustLimit: 500 })).rejects.toBeInstanceOf(TruncatedResponseError)
  })
})
