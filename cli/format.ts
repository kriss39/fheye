// Text helpers shared by the CLI commands. Everything here is pure: colour is passed in as a
// Style, so tests and pipes get plain text.

export interface Style {
  bold: (s: string) => string
  dim: (s: string) => string
  warn: (s: string) => string
  danger: (s: string) => string
  ok: (s: string) => string
}

const id = (s: string) => s
export const plain: Style = { bold: id, dim: id, warn: id, danger: id, ok: id }

const sgr = (open: number, close: number) => (s: string) => (s ? `\x1b[${open}m${s}\x1b[${close}m` : s)
export const ansi: Style = { bold: sgr(1, 22), dim: sgr(2, 22), warn: sgr(33, 39), danger: sgr(31, 39), ok: sgr(32, 39) }

/** ANSI colours only on a terminal, and never when NO_COLOR is set (https://no-color.org). */
export function styleFor(stream: { isTTY?: boolean }, env: Record<string, string | undefined> = process.env): Style {
  return stream.isTTY && !env.NO_COLOR ? ansi : plain
}

const ANSI_RE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g')
const visible = (s: string) => s.replace(ANSI_RE, '').length

/** Left-aligned columns; cells may contain ANSI codes. The last column is never padded. */
export function table(rows: string[][], gap = '  '): string[] {
  const widths: number[] = []
  for (const r of rows) r.forEach((c, i) => (widths[i] = Math.max(widths[i] ?? 0, visible(c))))
  return rows.map((r) =>
    r
      .map((c, i) => (i === r.length - 1 ? c : c + ' '.repeat(widths[i] - visible(c))))
      .join(gap)
      .trimEnd(),
  )
}

export const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many)

/** One JSON document: bigints become decimal strings, Maps and Sets become arrays. */
export function toJson(value: unknown): string {
  return JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? v.toString() : v instanceof Map || v instanceof Set ? [...v] : v), 2)
}
