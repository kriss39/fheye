import type { Address, Log } from 'viem'

export interface Fixture {
  chainId: number
  taskManager: Address
  txHash: `0x${string}`
  logs: Log[]
}

interface RawFixture {
  chainId: number
  taskManager: Address
  txHash: `0x${string}`
  logs: Array<Omit<Log, 'blockNumber'> & { blockNumber: string }>
}

export function loadFixture(raw: unknown): Fixture {
  const f = raw as RawFixture
  return { ...f, logs: f.logs.map((l) => ({ ...l, blockNumber: BigInt(l.blockNumber) }) as Log) }
}
