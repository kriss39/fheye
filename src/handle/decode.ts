// Ciphertext handle layout (cofhe-contracts TaskManager.sol, TMCommon):
//   keccak256(operands ‖ op)[0:30] ‖ is_trivial (1 bit) ‖ ct_type (7 bits) ‖ security_zone (int8)

export const FHE_TYPES = {
  0: 'ebool',
  2: 'euint8',
  3: 'euint16',
  4: 'euint32',
  5: 'euint64',
  6: 'euint128',
  7: 'eaddress',
} as const

export type FheTypeId = keyof typeof FHE_TYPES
export type FheTypeName = (typeof FHE_TYPES)[FheTypeId]

/** Bit width of each type's plaintext. eaddress is a 160-bit unsigned integer. */
export const TYPE_BITS: Record<FheTypeId, number> = {
  0: 1,
  2: 8,
  3: 16,
  4: 32,
  5: 64,
  6: 128,
  7: 160,
}

export const EBOOL = 0
export const EADDRESS = 7

const MAX_UINT256 = (1n << 256n) - 1n
export const METADATA_MASK = 0xffffn
export const HASH_MASK = MAX_UINT256 - METADATA_MASK

export interface DecodedHandle {
  handle: bigint
  hex: `0x${string}`
  typeId: number
  typeName: FheTypeName | null
  /** Plaintext bit width, or null for an unknown type id. */
  bits: number | null
  isTrivial: boolean
  securityZone: number
  /** Upper 240 bits: the truncated keccak of the task's operands and op. */
  hashPart: bigint
}

export function isFheTypeId(t: number): t is FheTypeId {
  return Object.hasOwn(FHE_TYPES, t)
}

export function toHex32(value: bigint): `0x${string}` {
  return `0x${value.toString(16).padStart(64, '0')}`
}

/** Accepts a bigint, a decimal string or a 0x-prefixed hex string of up to 32 bytes. */
export function parseHandle(input: bigint | string): bigint {
  if (typeof input === 'bigint') {
    if (input < 0n || input > MAX_UINT256) throw new Error('Handle out of uint256 range')
    return input
  }
  const s = input.trim()
  if (/^0x[0-9a-fA-F]{1,64}$/.test(s)) return BigInt(s)
  if (/^[0-9]{1,78}$/.test(s)) {
    const v = BigInt(s)
    if (v > MAX_UINT256) throw new Error('Handle out of uint256 range')
    return v
  }
  throw new Error(`Not a handle: ${s.slice(0, 80)}`)
}

export function decodeHandle(input: bigint | string): DecodedHandle {
  const handle = parseHandle(input)
  const typeId = Number((handle >> 8n) & 0x7fn)
  const zoneByte = Number(handle & 0xffn)
  const typeName = isFheTypeId(typeId) ? FHE_TYPES[typeId] : null
  return {
    handle,
    hex: toHex32(handle),
    typeId,
    typeName,
    bits: isFheTypeId(typeId) ? TYPE_BITS[typeId] : null,
    isTrivial: ((handle >> 15n) & 1n) === 1n,
    securityZone: zoneByte >= 0x80 ? zoneByte - 0x100 : zoneByte,
    hashPart: handle & HASH_MASK,
  }
}

/** Splits pasted text (newlines, commas, spaces) into handles; invalid tokens are reported, not thrown. */
export function decodeMany(text: string): Array<DecodedHandle | { error: string; token: string }> {
  return text
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map((token) => {
      try {
        return decodeHandle(token)
      } catch (e) {
        return { error: (e as Error).message, token }
      }
    })
}
