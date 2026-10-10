// Detects silent eth_getLogs truncation: one big query vs the same range split into small ones.
const TASK_CREATED = '0xe9de54a3e7ddf0c48cc6e1134185300d5a71acbf2d8c21fcdefa9d9dd9e20ac1'
const TM = process.argv[3] ?? '0xeA30c4B8b44078Bbf8a6ef5b9f1eC1626C7848D9'
const url = process.argv[2]
const span = Number(process.argv[4] ?? 1000)
const parts = Number(process.argv[5] ?? 10)
async function rpc(method: string, params: unknown[]) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })
  return r.json() as Promise<any>
}
const head = Number(BigInt((await rpc('eth_blockNumber', [])).result)) - 20
const from = head - span
const big = await rpc('eth_getLogs', [{ address: TM, topics: [TASK_CREATED], fromBlock: '0x' + from.toString(16), toBlock: '0x' + head.toString(16) }])
const bigN = big.result?.length ?? `ERR ${big.error?.message}`
const lastBlock = big.result?.length ? Number(BigInt(big.result.at(-1).blockNumber)) : null
let sum = 0
const step = Math.ceil(span / parts)
for (let s = from; s <= head; s += step) {
  const e = Math.min(head, s + step - 1)
  const r = await rpc('eth_getLogs', [{ address: TM, topics: [TASK_CREATED], fromBlock: '0x' + s.toString(16), toBlock: '0x' + e.toString(16) }])
  if (!r.result) { console.log('part ERR', r.error?.message); break }
  sum += r.result.length
}
console.log(`${url} span=${span}: one query=${bigN} (last log block ${lastBlock}, range end ${head}); ${parts} parts sum=${sum}`)
