// Checks that every configured log RPC still accepts the chain's maxLogRange in one eth_getLogs call:
// npx tsx spike/log-limits.ts [extraUrl=chainId ...]
import { createPublicClient, http } from 'viem'
import { CHAINS } from '../src/chains'

const extra = process.argv.slice(2).map((a) => a.split('=') as [string, string])
for (const chain of CHAINS) {
  const urls = [...chain.logRpcs, ...extra.filter(([, id]) => Number(id) === chain.id).map(([u]) => u)]
  const head = await createPublicClient({ transport: http(chain.rpc) }).getBlockNumber()
  const toBlock = head - 20n
  const fromBlock = toBlock - chain.maxLogRange + 1n
  for (const url of urls) {
    const started = Date.now()
    try {
      const logs = await createPublicClient({ transport: http(url, { retryCount: 0, timeout: 30_000 }) }).getLogs({ address: chain.taskManager, fromBlock, toBlock })
      console.log(`ok    ${chain.key.padEnd(17)} ${url.padEnd(52)} ${chain.maxLogRange} blocks, ${logs.length} logs, ${Date.now() - started} ms`)
    } catch (e) {
      const msg = ((e as { details?: string; shortMessage?: string }).details ?? (e as Error).message).split('\n')[0].slice(0, 90)
      console.log(`FAIL  ${chain.key.padEnd(17)} ${url.padEnd(52)} ${msg}`)
    }
  }
}
