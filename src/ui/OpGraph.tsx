// Layered drawing of a tx's task graph: leaves (user inputs, handles from earlier txs) on the
// left, each task one column right of its deepest input. Public values are highlighted.

import type { Known } from '../leak/evaluate'
import type { TxGraph } from '../tx/graph'
import { shortHex } from './format'

const COL_W = 180
const NODE_W = 144
const NODE_H = 38
const ROW_H = 50
const PAD = 8
const MAX_NODES = 160

type NodeKind = 'input' | 'external' | 'trivial' | 'public' | 'secret' | 'random'

interface Node {
  handle: bigint
  row: number | null // task row in the table, null for leaves
  kind: NodeKind
  label: string
  sub: string
  depth: number
  x: number
  y: number
}

const short = (v: bigint) => {
  const s = v.toString()
  return s.length > 12 ? `${s.slice(0, 5)}…${s.slice(-4)}` : s
}

export function OpGraph({ graph, known, onSelect }: { graph: TxGraph; known: Map<bigint, Known>; onSelect: (row: number) => void }) {
  const rowOf = new Map<bigint, number>()
  graph.tasks.forEach((t, i) => {
    if (!rowOf.has(t.ctHash)) rowOf.set(t.ctHash, i)
  })
  const nodeCount = rowOf.size + graph.external.size + graph.inputs.size
  if (nodeCount > MAX_NODES) return <p className="muted small">This graph has {nodeCount} nodes; see the table below.</p>

  const depth = new Map<bigint, number>()
  const depthOf = (h: bigint, seen = new Set<bigint>()): number => {
    const cached = depth.get(h)
    if (cached !== undefined) return cached
    const row = rowOf.get(h)
    if (row === undefined || seen.has(h)) return 0
    seen.add(h)
    const d = 1 + Math.max(0, ...graph.tasks[row].inputHandles.map((i) => depthOf(i.handle, seen)))
    depth.set(h, d)
    return d
  }

  const nodes = new Map<bigint, Node>()
  const leaf = (h: bigint) => {
    if (nodes.has(h) || rowOf.has(h)) return
    const k = known.get(h)
    const isInput = graph.inputs.has(h)
    nodes.set(h, {
      handle: h,
      row: null,
      kind: k && k.source !== 'published' ? 'public' : isInput ? 'input' : 'external',
      label: isInput ? 'user input' : 'earlier tx',
      sub: k ? `= ${short(k.value)}` : shortHex(`0x${h.toString(16).padStart(64, '0')}`, 6, 4),
      depth: 0,
      x: 0,
      y: 0,
    })
  }
  graph.tasks.forEach((t) => t.inputHandles.forEach((i) => leaf(i.handle)))
  for (const [h, row] of rowOf) {
    const t = graph.tasks[row]
    const k = known.get(h)
    const kind: NodeKind =
      t.op?.kind === 'trivial' ? 'trivial' : t.op?.kind === 'random' ? 'random' : k && (k.source === 'derived' || k.source === 'identity') ? 'public' : 'secret'
    nodes.set(h, {
      handle: h,
      row,
      kind,
      label: `${row + 1}  ${t.operation}`,
      sub: kind === 'trivial' ? `= ${short(t.input1)}` : kind === 'public' ? `= ${short(k!.value)}` : (t.output.typeName ?? ''),
      depth: depthOf(h),
      x: 0,
      y: 0,
    })
  }

  // Column by depth, rows in table order within a column.
  const columns = new Map<number, Node[]>()
  for (const n of nodes.values()) columns.set(n.depth, [...(columns.get(n.depth) ?? []), n])
  // Left to right, order each column by the mean height of its inputs (barycenter heuristic) to
  // cut edge crossings; ties keep table order.
  let maxRows = 0
  for (const d of [...columns.keys()].sort((a, b) => a - b)) {
    const col = columns.get(d)!
    const center = (n: Node) => {
      if (n.row === null) return n.row ?? -1
      const ys = graph.tasks[n.row].inputHandles.map((i) => nodes.get(i.handle)?.y).filter((y): y is number => y !== undefined)
      return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : 0
    }
    col.sort((a, b) => center(a) - center(b) || (a.row ?? -1) - (b.row ?? -1))
    col.forEach((n, i) => {
      n.x = PAD + d * COL_W
      n.y = PAD + i * ROW_H
    })
    maxRows = Math.max(maxRows, col.length)
  }
  const width = PAD * 2 + (Math.max(...columns.keys()) + 1) * COL_W - (COL_W - NODE_W)
  const height = PAD * 2 + maxRows * ROW_H - (ROW_H - NODE_H)

  const edges: Array<{ from: Node; to: Node; slot: number; of: number }> = []
  for (const n of nodes.values()) {
    if (n.row === null) continue
    const ins = graph.tasks[n.row].inputHandles
    ins.forEach((i, slot) => {
      const from = nodes.get(i.handle)
      if (from) edges.push({ from, to: n, slot, of: ins.length })
    })
  }

  return (
    <div className="graph-wrap">
      <svg className="opgraph" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="FHE task graph">
        {edges.map((e, i) => {
          const x1 = e.from.x + NODE_W
          const y1 = e.from.y + NODE_H / 2
          const x2 = e.to.x
          const y2 = e.to.y + ((e.slot + 1) * NODE_H) / (e.of + 1)
          const mid = (x1 + x2) / 2
          return <path key={i} className={e.to.kind === 'public' ? 'edge public' : 'edge'} d={`M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`} />
        })}
        {[...nodes.values()].map((n) => (
          <g
            key={n.handle.toString()}
            className={`node ${n.kind}${n.row !== null ? ' clickable' : ''}`}
            transform={`translate(${n.x},${n.y})`}
            onClick={() => n.row !== null && onSelect(n.row)}
          >
            <title>{`0x${n.handle.toString(16).padStart(64, '0')}`}</title>
            <rect width={NODE_W} height={NODE_H} rx={7} />
            <text x={9} y={15} className="node-label">
              {n.label}
            </text>
            <text x={9} y={30} className="node-sub">
              {n.sub}
            </text>
          </g>
        ))}
      </svg>
      {width > 560 && <span className="small muted graph-hint">Scroll sideways to see the whole graph.</span>}
      <div className="row small muted legend">
        <span className="legend-item">
          <span className="swatch public" /> public value
        </span>
        <span className="legend-item">
          <span className="swatch trivial" /> plaintext constant
        </span>
        <span className="legend-item">
          <span className="swatch secret" /> encrypted
        </span>
        <span className="legend-item">
          <span className="swatch input" /> input / earlier tx
        </span>
      </div>
    </div>
  )
}
