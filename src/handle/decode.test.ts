import { describe, expect, it } from 'vitest'
import { decodeHandle, decodeMany, parseHandle } from './decode'

describe('decodeHandle', () => {
  it('decodes a computed euint128 handle seen on Sepolia', () => {
    const h = decodeHandle('0x10f5f6' + '0'.repeat(54) + '0600')
    expect(h.typeName).toBe('euint128')
    expect(h.isTrivial).toBe(false)
    expect(h.securityZone).toBe(0)
    expect(h.bits).toBe(128)
  })

  it('reads the trivial bit and ebool', () => {
    const trivialU64 = decodeHandle(0xabcdn << 16n | 0x8500n)
    expect(trivialU64.typeName).toBe('euint64')
    expect(trivialU64.isTrivial).toBe(true)
    const bool = decodeHandle(0x1234n << 16n)
    expect(bool.typeName).toBe('ebool')
  })

  it('treats the zone byte as int8', () => {
    expect(decodeHandle(0x07ffn).securityZone).toBe(-1)
    expect(decodeHandle(0x0701n).securityZone).toBe(1)
    expect(decodeHandle(0x0701n).typeName).toBe('eaddress')
  })

  it('flags unknown types (euint256 = 8 is rejected by the TaskManager)', () => {
    const h = decodeHandle(0x0800n)
    expect(h.typeId).toBe(8)
    expect(h.typeName).toBeNull()
    expect(h.bits).toBeNull()
  })

  it('masks the metadata out of hashPart', () => {
    const h = decodeHandle((0xdeadn << 16n) | 0x8601n)
    expect(h.hashPart).toBe(0xdeadn << 16n)
  })
})

describe('parseHandle', () => {
  it('accepts hex, decimal and bigint', () => {
    expect(parseHandle('0x0500')).toBe(0x500n)
    expect(parseHandle('1280')).toBe(1280n)
    expect(parseHandle(5n)).toBe(5n)
  })

  it('rejects junk and out-of-range values', () => {
    expect(() => parseHandle('0xzz')).toThrow()
    expect(() => parseHandle('0x' + '1'.repeat(65))).toThrow()
    expect(() => parseHandle((1n << 256n).toString())).toThrow()
    expect(() => parseHandle(-1n)).toThrow()
  })
})

describe('decodeMany', () => {
  it('splits pasted text and reports bad tokens without throwing', () => {
    const out = decodeMany('0x0500, 0x0600\n nope 0x8500')
    expect(out).toHaveLength(4)
    expect(out.filter((x) => 'error' in x)).toHaveLength(1)
  })
})
