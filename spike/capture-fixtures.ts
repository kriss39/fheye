// Saves receipts of real Sepolia txs as test fixtures (src/__fixtures__/*.json).
import { writeFileSync, mkdirSync } from 'node:fs'
import { getAbiItem, type Hash } from 'viem'
import { taskManagerAbi } from '../src/abi'
import { chainById } from '../src/chains'
import { makeClients } from '../src/client'

const chain = chainById(11155111)
const { client } = makeClients(chain)
const head = await client.getBlockNumber()

async function firstTxWith(event: 'InputVerified' | 'DecryptionResult'): Promise<Hash> {
  const logs = await client.getLogs({ address: chain.taskManager, event: getAbiItem({ abi: taskManagerAbi, name: event }), fromBlock: head - 200n, toBlock: head - 5n })
  // prefer a tx that also created tasks
  for (const l of logs) {
    const r = await client.getTransactionReceipt({ hash: l.transactionHash })
    if (r.logs.length > 3) return l.transactionHash
  }
  return logs[0].transactionHash
}

const txs: Record<string, Hash> = {
  'transfer-public-amount': '0x7d8e313f60bff6680df9d5db638f265fa1d9bbf5dee34dc4eede8cb0721753bb',
  'accumulator': '0xc870ea914edbf425386f49fbc5e879ad9e4219312c3946cce0e6e73b46054a9e',
  'with-inputs': await firstTxWith('InputVerified'),
  'with-decrypt': await firstTxWith('DecryptionResult'),
}

mkdirSync('src/__fixtures__', { recursive: true })
for (const [name, hash] of Object.entries(txs)) {
  const r = await client.getTransactionReceipt({ hash })
  const fixture = {
    chainId: chain.id,
    taskManager: chain.taskManager,
    txHash: hash,
    blockNumber: r.blockNumber.toString(),
    logs: r.logs.map((l) => ({ address: l.address, topics: l.topics, data: l.data, logIndex: l.logIndex, blockNumber: l.blockNumber.toString(), transactionHash: l.transactionHash })),
  }
  writeFileSync(`src/__fixtures__/${name}.json`, JSON.stringify(fixture, null, 1))
  console.log(name, hash, `${r.logs.length} logs`)
}
