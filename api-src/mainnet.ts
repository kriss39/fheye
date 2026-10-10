// GET /api/mainnet: both mainnet TaskManagers, read live: intake, access list, task counts.

import { CHAINS } from '../src/chains'
import { makeClients } from '../src/client'
import { loadStatus } from '../cli/status'
import { handle, json, preflight, SITE } from './common'

export const OPTIONS = preflight

export function GET(request: Request) {
  return handle(async () => {
    const chains = await Promise.all(
      CHAINS.filter((c) => c.mainnet).map((c) => {
        const { client, logClient } = makeClients(c)
        return loadStatus(client, logClient, c)
      }),
    )
    return json({ live: chains.some((c) => c.flags.isEnabled), chains, url: `${SITE}/#/status` }, 200, 60)
  }, request)
}
