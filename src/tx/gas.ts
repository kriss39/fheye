// Gas per FHE operation from the Fhenix docs (fhe-library/reference/gas-costs.mdx). Values are
// for the first FHE call in a tx; every later call costs about 20k less. Estimates only: the
// docs round to 100 gas and take the max across types.

const FIRST_CALL: Record<string, number> = {
  add: 51_600,
  sub: 51_500,
  mul: 52_600,
  div: 52_300,
  rem: 52_500,
  square: 48_900,
  min: 53_600,
  max: 53_800,
  eq: 52_700,
  ne: 53_000,
  lt: 53_000,
  lte: 52_800,
  gt: 53_300,
  gte: 52_800,
  and: 51_700,
  or: 51_900,
  xor: 51_500,
  not: 45_700,
  shl: 52_800,
  shr: 52_900,
  rol: 54_500,
  ror: 54_600,
  select: 55_900,
  trivialEncrypt: 45_400,
  random: 40_900,
  cast: 45_900,
}

export const INPUT_GAS = 39_800
export const LATER_CALL_DISCOUNT = 20_000

export interface GasEstimate {
  perTask: number[]
  inputs: number
  total: number
}

/** `inputCount` is the number of InputVerified events (one encrypted input each). */
export function estimateFheGas(operations: string[], inputCount: number): GasEstimate {
  let first = true
  const charge = (base: number) => {
    const g = first ? base : Math.max(0, base - LATER_CALL_DISCOUNT)
    first = false
    return g
  }
  // Inputs are verified before the ops that consume them.
  let inputs = 0
  for (let i = 0; i < inputCount; i++) inputs += charge(INPUT_GAS)
  const perTask = operations.map((op) => charge(FIRST_CALL[op] ?? 50_000))
  return { perTask, inputs, total: inputs + perTask.reduce((a, b) => a + b, 0) }
}
