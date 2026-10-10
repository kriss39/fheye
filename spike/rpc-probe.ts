// Probes public RPCs for what FHEye needs: CORS for browser use, log history depth
// (pruning), max getLogs block range, and old receipts.
const ORIGIN = 'http://localhost:5173'
const TASK_CREATED = '0xe9de54a3e7ddf0c48cc6e1134185300d5a71acbf2d8c21fcdefa9d9dd9e20ac1'

const CANDIDATES: Record<string, { tm: string; rpcs: string[] }> = {
  ethereum: {
    tm: '0x52E7a0cAF234b266bCFAa6aA933a412FDe58432A',
    rpcs: ['https://ethereum-rpc.publicnode.com', 'https://eth.drpc.org', 'https://1rpc.io/eth', 'https://eth.llamarpc.com', 'https://cloudflare-eth.com', 'https://eth.merkle.io', 'https://rpc.mevblocker.io'],
  },
  arbitrum: {
    tm: '0x52E7a0cAF234b266bCFAa6aA933a412FDe58432A',
    rpcs: ['https://arbitrum-one-rpc.publicnode.com', 'https://arb1.arbitrum.io/rpc', 'https://arbitrum.drpc.org', 'https://1rpc.io/arb', 'https://arbitrum.llamarpc.com'],
  },
  sepolia: {
    tm: '0xeA30c4B8b44078Bbf8a6ef5b9f1eC1626C7848D9',
    rpcs: ['https://ethereum-sepolia-rpc.publicnode.com', 'https://sepolia.drpc.org', 'https://1rpc.io/sepolia', 'https://sepolia.gateway.tenderly.co', 'https://rpc.sepolia.org', 'https://ethereum-sepolia.gateway.tatum.io'],
  },
  'arbitrum-sepolia': {
    tm: '0xeA30c4B8b44078Bbf8a6ef5b9f1eC1626C7848D9',
    rpcs: ['https://arbitrum-sepolia-rpc.publicnode.com', 'https://sepolia-rollup.arbitrum.io/rpc', 'https://arbitrum-sepolia.drpc.org'],
  },
  'base-sepolia': {
    tm: '0xeA30c4B8b44078Bbf8a6ef5b9f1eC1626C7848D9',
    rpcs: ['https://base-sepolia-rpc.publicnode.com', 'https://sepolia.base.org', 'https://base-sepolia.drpc.org'],
  },
}

async function rpc(url: string, method: string, params: unknown[], timeoutMs = 15000) {
  const t0 = performance.now()
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const ms = Math.round(performance.now() - t0)
  const text = await res.text()
  let body: any
  try {
    body = JSON.parse(text)
  } catch {
    body = { error: { message: `HTTP ${res.status}: ${text.slice(0, 80)}` } }
  }
  return { ms, body, acao: res.headers.get('access-control-allow-origin') }
}

async function preflight(url: string) {
  try {
    const res = await fetch(url, {
      method: 'OPTIONS',
      headers: { origin: ORIGIN, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' },
      signal: AbortSignal.timeout(10000),
    })
    return `${res.status} acao=${res.headers.get('access-control-allow-origin')} acah=${res.headers.get('access-control-allow-headers')}`
  } catch (e) {
    return `ERR ${(e as Error).message}`
  }
}

const hex = (n: number) => `0x${n.toString(16)}`
const short = (m: string) => m.replace(/\s+/g, ' ').slice(0, 70)

const only = process.argv[2]
for (const [key, { tm, rpcs }] of Object.entries(CANDIDATES)) {
  if (only && key !== only) continue
  console.log(`\n=== ${key}`)
  for (const url of rpcs) {
    try {
      const bn = await rpc(url, 'eth_blockNumber', [])
      if (!bn.body.result) {
        console.log(`${url}: blockNumber failed: ${short(bn.body.error?.message ?? '?')}`)
        continue
      }
      const head = Number(BigInt(bn.body.result))
      const pf = await preflight(url)
      const depth: string[] = []
      for (const back of [5_000, 20_000, 200_000, 2_000_000]) {
        const from = head - back
        if (from < 0) continue
        const r = await rpc(url, 'eth_getLogs', [{ address: tm, topics: [TASK_CREATED], fromBlock: hex(from), toBlock: hex(from + 100) }])
        depth.push(`-${back}:${r.body.result ? `ok(${r.body.result.length})` : `ERR ${short(r.body.error?.message ?? '?')}`}`)
      }
      const ranges: string[] = []
      for (const span of [10_000, 50_000, 100_000]) {
        // a topic that never fires keeps the result-count limit out of the way
        const r = await rpc(url, 'eth_getLogs', [{ address: tm, topics: ['0x' + '00'.repeat(32)], fromBlock: hex(head - span), toBlock: hex(head) }])
        ranges.push(`${span}:${r.body.result ? `ok ${r.ms}ms` : `ERR ${short(r.body.error?.message ?? '?')}`}`)
      }
      console.log(`${url}\n  head=${head} ${bn.ms}ms acao(POST)=${bn.acao} preflight=${pf}\n  history: ${depth.join(' | ')}\n  range:   ${ranges.join(' | ')}`)
    } catch (e) {
      console.log(`${url}: ${short((e as Error).message)}`)
    }
  }
}
