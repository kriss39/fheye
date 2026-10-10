// Trivial handles are content-addressed: trivialEncrypt(value, type, zone) always yields the same
// handle. A tx often consumes a trivial handle stored by an earlier tx (e.g. an encrypted zero),
// and since ctHash isn't indexed we can't find that earlier event. Precomputing handles for common
// constants lets us name such values anyway.

import { FHE_TYPES, TYPE_BITS, type FheTypeId } from '../handle/decode'
import { deriveHandle } from '../handle/derive'
import { getOp } from '../ops'

const TRIVIAL = getOp('trivialEncrypt')!

function commonValues(bits: number): bigint[] {
  const max = (1n << BigInt(bits)) - 1n
  const out = new Set<bigint>()
  for (let v = 0n; v <= 1024n && v <= max; v++) out.add(v)
  for (let p = 0n; p < BigInt(bits); p++) out.add(1n << p)
  for (let x = 10n; x <= max; x *= 10n) {
    for (const m of [1n, 2n, 5n]) if (x * m <= max) out.add(x * m)
  }
  out.add(max)
  return [...out]
}

let cache: Map<bigint, { value: bigint; typeId: number }> | null = null

/** Handle → plaintext for trivialEncrypt of common values in security zone 0. */
export function trivialDictionary(): Map<bigint, { value: bigint; typeId: number }> {
  if (cache) return cache
  cache = new Map()
  for (const key of Object.keys(FHE_TYPES)) {
    const typeId = Number(key) as FheTypeId
    for (const value of commonValues(TYPE_BITS[typeId])) {
      cache.set(deriveHandle(TRIVIAL, [value, BigInt(typeId), 0n], typeId, 0), { value, typeId })
    }
  }
  return cache
}

export function lookupTrivial(handle: bigint): bigint | undefined {
  return trivialDictionary().get(handle)?.value
}
