// `fhe-lens handle`: offline decode of handles, optionally with their on-chain status.

import type { HandleStatus } from '../src/acl/check'
import type { DecodedHandle } from '../src/handle/decode'
import { lookupTrivial } from '../src/leak/dictionary'
import { plain, table, type Style } from './format'

export interface HandleRow {
  handle: `0x${string}`
  type: string | null
  typeId: number
  bits: number | null
  trivial: boolean
  /** Plaintext of a trivially encrypted common constant (see leak/dictionary.ts). */
  trivialValue: bigint | null
  zone: number
  /** On-chain status, only when a network was asked. */
  global?: boolean
  published?: bigint | null
}

export function summarizeHandles(handles: DecodedHandle[], status?: Map<bigint, HandleStatus>): HandleRow[] {
  return handles.map((h) => {
    const row: HandleRow = {
      handle: h.hex,
      type: h.typeName,
      typeId: h.typeId,
      bits: h.bits,
      trivial: h.isTrivial,
      trivialValue: h.isTrivial ? (lookupTrivial(h.handle) ?? null) : null,
      zone: h.securityZone,
    }
    const s = status?.get(h.handle)
    if (s) Object.assign(row, { global: s.global, published: s.published })
    return row
  })
}

export function formatHandles(rows: HandleRow[], st: Style = plain): string {
  const withStatus = rows.some((r) => r.global !== undefined)
  const head = ['handle', 'type', 'trivial', 'zone', ...(withStatus ? ['anyone can decrypt', 'published'] : [])]
  const body = rows.map((r) => {
    const trivial = r.trivial ? st.warn(r.trivialValue !== null ? `yes = ${r.trivialValue}` : 'yes') : 'no'
    const cells = [r.handle, r.type ?? st.danger(`unknown type ${r.typeId}`), trivial, String(r.zone)]
    if (withStatus) cells.push(r.global ? st.danger('yes') : 'no', r.published !== null && r.published !== undefined ? String(r.published) : st.dim('none'))
    return cells
  })
  return table([head.map((h) => st.dim(h)), ...body]).join('\n')
}
