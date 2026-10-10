// Decrypts one globally-allowed handle through the threshold network and verifies the signature.
import { chainById } from '../src/chains'
import { makeClients } from '../src/client'
import { publicDecrypt } from '../src/acl/publicDecrypt'

const [chainId, handle] = process.argv.slice(2)
const chain = chainById(Number(chainId))
const r = await publicDecrypt(makeClients(chain).client, chain, BigInt(handle))
console.log(`value=${r.value} signer=${r.signer} verified=${r.verified}`)
