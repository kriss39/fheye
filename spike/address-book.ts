// Checks that the CoFHE address book resolves to the TaskManager configured for every chain:
// npx tsx spike/address-book.ts
import { isAddressEqual } from 'viem'
import { addressBookAbi } from '../src/abi'
import { ADDRESS_BOOK, CHAINS } from '../src/chains'
import { makeClients } from '../src/client'

for (const chain of CHAINS) {
  const tm = await makeClients(chain).client.readContract({ address: ADDRESS_BOOK, abi: addressBookAbi, functionName: 'getTm', args: [1n] })
  console.log(`${isAddressEqual(tm, chain.taskManager) ? 'ok  ' : 'DIFF'} ${chain.key.padEnd(17)} ${tm}`)
}
