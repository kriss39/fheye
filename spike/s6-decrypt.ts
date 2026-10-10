// S6: decrypts the results of a probe contract that computes these edge cases, marks each result
// allowGlobal and exposes count()/handles(i)/labels(i). Compares them with
// TFHE-rs <= 1.6 (shift amount truncated) and >= 1.7 (overshift returns 0) semantics.
// Usage: npx tsx spike/s6-decrypt.ts <chainId> <probeAddress>
import { parseAbi, type Address } from 'viem'
import { publicDecrypt } from '../src/acl/publicDecrypt'
import { chainById } from '../src/chains'
import { makeClients } from '../src/client'

const EXPECT: Record<string, { old: bigint; new: bigint; note: string }> = {
  'rem(7,0) u8': { old: 7n, new: 7n, note: 'TFHE-rs docs: numerator' },
  'div(7,0) u8': { old: 255n, new: 255n, note: 'TFHE-rs docs: type max' },
  'shl(3,8) u8': { old: 3n, new: 0n, note: '' },
  'shl(3,9) u8': { old: 6n, new: 0n, note: '' },
  'shr(0x80,9) u8': { old: 0x40n, new: 0n, note: '' },
  'rol(0x81,9) u8': { old: 0x03n, new: 0x03n, note: 'rotation is modular' },
  'ror(0x81,9) u8': { old: 0xc0n, new: 0xc0n, note: 'rotation is modular' },
  'not(5) u8': { old: 250n, new: 250n, note: 'bitwise' },
  'shl(5,33) u32': { old: 10n, new: 0n, note: '' },
}

const [chainId, probe] = process.argv.slice(2)
const chain = chainById(Number(chainId))
const { client } = makeClients(chain)
const abi = parseAbi(['function count() view returns (uint256)', 'function handles(uint256) view returns (bytes32)', 'function labels(uint256) view returns (string)'])
const n = await client.readContract({ address: probe as Address, abi, functionName: 'count' })
for (let i = 0n; i < n; i++) {
  const [h, label] = await Promise.all([
    client.readContract({ address: probe as Address, abi, functionName: 'handles', args: [i] }),
    client.readContract({ address: probe as Address, abi, functionName: 'labels', args: [i] }),
  ])
  const e = EXPECT[label]
  try {
    const r = await publicDecrypt(client, chain, BigInt(h))
    const verdict = !e ? '?' : r.value === e.old && r.value === e.new ? 'as documented' : r.value === e.old ? 'TFHE-rs <= 1.6 (wraps)' : r.value === e.new ? 'TFHE-rs >= 1.7 (zero)' : 'UNEXPECTED'
    console.log(`${label.padEnd(16)} engine=${String(r.value).padEnd(5)} ${verdict.padEnd(24)} signature=${r.verified ? 'valid' : 'INVALID'} ${e?.note ?? ''}`)
  } catch (err) {
    console.log(`${label.padEnd(16)} error: ${(err as Error).message.slice(0, 120)}`)
  }
}
