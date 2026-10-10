// GET /api: what the API offers.

import { CHAINS } from '../src/chains'
import { json, preflight, SITE } from './common'

export const OPTIONS = preflight

export function GET() {
  return json(
    {
      name: 'FHEye API',
      about: 'See what encryption does not hide. Read-only analysis of Fhenix CoFHE transactions. Unofficial; not affiliated with Fhenix.',
      endpoints: {
        [`${SITE}/api/tx/<hash>`]: 'Verdict and FHE tasks of one transaction. Optional ?chain=<key>; otherwise the network is found automatically.',
        [`${SITE}/api/handle/<handle>[,<handle>…]`]: 'Decode up to 20 handles. With ?chain=<key>, also whether anyone may decrypt them and any published result.',
        [`${SITE}/api/mainnet`]: 'Live state of the CoFHE TaskManagers on Ethereum and Arbitrum One.',
      },
      chains: CHAINS.map((c) => c.key),
      notes: 'Bigints are decimal strings, handles are 32-byte hex. CORS is open; responses are cached at the edge.',
    },
    200,
    3600,
  )
}
