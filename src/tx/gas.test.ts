import { describe, expect, it } from 'vitest'
import { estimateFheGas } from './gas'

describe('estimateFheGas', () => {
  it('charges the first FHE call in full and discounts later ones', () => {
    const g = estimateFheGas(['trivialEncrypt', 'add', 'add'], 0)
    expect(g.perTask).toEqual([45_400, 31_600, 31_600])
    expect(g.total).toBe(108_600)
  })

  it('counts verified inputs before ops', () => {
    const g = estimateFheGas(['add'], 2)
    expect(g.inputs).toBe(39_800 + 19_800)
    expect(g.perTask).toEqual([31_600])
  })
})
