// Chunked eth_getLogs for public RPCs. Splits [from, to] into maxRange-sized chunks, runs a few
// in parallel, and bisects a chunk when the node rejects it for returning too many results.
// Public endpoints differ a lot (see spike/rpc-probe.ts): some cap the span, some cap the result count,
// some prune old history; this handles the first two and surfaces the third as an error.

import type { AbiEvent, Address, Log, PublicClient } from 'viem'

export interface ScanProgress {
  doneBlocks: bigint
  totalBlocks: bigint
  logs: number
  requests: number
}

export interface ScanOptions<E extends readonly AbiEvent[]> {
  client: PublicClient
  address: Address
  events: E
  fromBlock: bigint
  toBlock: bigint
  maxRange: bigint
  concurrency?: number
  /** Optional indexed-argument filter, applied when `events` holds a single event. */
  args?: Record<string, unknown>
  /**
   * Responses with at least this many logs are not trusted and the range is re-fetched in
   * halves. Some providers silently drop the oldest logs past a size cap (Tenderly's Sepolia
   * gateway returns ~6k of 39k with no error), so a large response can't be told from a
   * truncated one.
   */
  trustLimit?: number
  onProgress?: (p: ScanProgress) => void
  signal?: AbortSignal
}

// Order matters: rate limits are retried with backoff, never bisected (bisecting multiplies the
// request count and makes the throttling worse).
const RATE_LIMITED = /rate limit|too many requests|HTTP 429|throttl|capacity|temporarily unavailable|try again/i
const TOO_MANY = /max results|too many (results|logs)|more than \d+ (results|logs)|response size|query returned|exceeds? (max|limit)|block range|ranges? over|limited to|query spans|over limit|size limit/i
const PRUNED = /pruned|archive|missing trie|history unavailable|personal token/i

export class PrunedHistoryError extends Error {
  fromBlock: bigint
  toBlock: bigint
  constructor(fromBlock: bigint, toBlock: bigint, cause: string) {
    super(`RPC has no log history for blocks ${fromBlock}-${toBlock}: ${cause}`)
    this.fromBlock = fromBlock
    this.toBlock = toBlock
  }
}

export class TruncatedResponseError extends Error {}

// Only the server's own message: viem's `message` embeds the request body, whose topic hashes
// can contain digit runs like "429" and trip the patterns below.
function errorText(e: unknown): string {
  type E = { details?: string; shortMessage?: string; status?: number; cause?: E }
  const parts: string[] = []
  for (let cur = e as E | undefined, depth = 0; cur && depth < 4; cur = cur.cause, depth++) {
    if (cur.details) parts.push(cur.details)
    if (cur.shortMessage) parts.push(cur.shortMessage)
    if (cur.status) parts.push(`HTTP ${cur.status}`)
  }
  return parts.join(' | ')
}

export async function scanLogs<const E extends readonly AbiEvent[]>(opts: ScanOptions<E>): Promise<Log[]> {
  const { client, address, events, fromBlock, toBlock, maxRange, concurrency = 4, trustLimit = 5000, onProgress, signal } = opts
  if (toBlock < fromBlock) return []

  const out: Log[] = []
  const progress: ScanProgress = { doneBlocks: 0n, totalBlocks: toBlock - fromBlock + 1n, logs: 0, requests: 0 }
  // Chunk size adapts to log density: halves when a range must be split, doubles when sparse.
  let span = maxRange
  let cursor = fromBlock
  const shrink = (size: bigint) => {
    if (size < span) span = size > 1n ? size : 1n
  }

  async function bisect(from: bigint, to: bigint) {
    const mid = from + (to - from) / 2n
    shrink(mid - from + 1n)
    await fetchRange(from, mid)
    await fetchRange(mid + 1n, to)
  }

  async function fetchRange(from: bigint, to: bigint, attempt = 0): Promise<void> {
    signal?.throwIfAborted()
    progress.requests++
    try {
      const logs = await client.getLogs({
        address,
        // no events = every log from the address, undecoded
        ...(events.length === 0 ? {} : events.length === 1 ? { event: events[0], args: opts.args } : { events }),
        fromBlock: from,
        toBlock: to,
        strict: true,
      } as Parameters<PublicClient['getLogs']>[0])
      if (logs.length >= trustLimit) {
        if (to > from) return bisect(from, to)
        throw new TruncatedResponseError(`Block ${from} returned ${logs.length} logs, the trust limit; the RPC may have truncated it. Try an RPC without response caps.`)
      }
      out.push(...(logs as Log[]))
      progress.logs += logs.length
      progress.doneBlocks += to - from + 1n
      if (logs.length < trustLimit / 8 && to - from + 1n >= span) span = span * 2n > maxRange ? maxRange : span * 2n
      onProgress?.({ ...progress })
    } catch (e) {
      if (e instanceof TruncatedResponseError) throw e
      const text = errorText(e)
      const rateLimited = RATE_LIMITED.test(text)
      if (!rateLimited && PRUNED.test(text)) throw new PrunedHistoryError(from, to, text)
      if (!rateLimited && TOO_MANY.test(text) && to > from) return bisect(from, to)
      if (attempt < (rateLimited ? 6 : 3)) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt + Math.random() * 300))
        return fetchRange(from, to, attempt + 1)
      }
      throw e
    }
  }

  let failed = false
  async function worker() {
    while (cursor <= toBlock && !failed) {
      const from = cursor
      const end = from + span - 1n
      const to = end > toBlock ? toBlock : end
      cursor = to + 1n
      try {
        await fetchRange(from, to)
      } catch (e) {
        failed = true // stop the other workers from sending more requests
        throw e
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))

  return out.sort((a, b) => Number(a.blockNumber! - b.blockNumber!) || a.logIndex! - b.logIndex!)
}
