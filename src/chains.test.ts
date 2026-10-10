import { describe, expect, it } from 'vitest'
import { CHAINS } from './chains'

describe('chain config', () => {
  it('pairs every network with the right TaskManager and decrypt service', () => {
    for (const c of CHAINS) {
      expect(c.taskManager).toBe(c.mainnet ? '0x52E7a0cAF234b266bCFAa6aA933a412FDe58432A' : '0xeA30c4B8b44078Bbf8a6ef5b9f1eC1626C7848D9')
      expect(c.tnUrl).toBe(c.mainnet ? 'https://cofhe-tn.mainnet.fhenix.zone' : 'https://testnet-cofhe-tn.fhenix.zone')
      expect(c.mainnet ? c.deployBlock > 0n : c.deployBlock === 0n).toBe(true)
      expect(c.logRpcs.length).toBeGreaterThan(0)
    }
  })

  it('has unique ids and keys', () => {
    expect(new Set(CHAINS.map((c) => c.id)).size).toBe(CHAINS.length)
    expect(new Set(CHAINS.map((c) => c.key)).size).toBe(CHAINS.length)
  })
})
