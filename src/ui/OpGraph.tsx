// Layered drawing of a tx's task graph: leaves (user inputs, handles from earlier txs) on the
// left, each task one column right of its deepest input. Public values are highlighted, and
// selecting a task lights up everything it is computed from.

import { useState, type CSSProperties } from 'react'
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

const isLeak = (k?: Known) => k?.source === 'derived' || k?.source === 'identity'

export function OpGraph({ graph, known, onSelect }: { graph: TxGraph; known: Map<bigint, Known>; onSelect: (row: number) => void }) {
  const rowOf = new Map<bigint, number>()
  graph.tasks.forEach((t, i) => {
    if (!rowOf.has(t.ctHash)) rowOf.set(t.ctHash, i)
  })
  // Start on the first public value, so the graph opens on the answer to "why is this public?".
  const [selected, setSelected] = useState<bigint | null>(() => [...rowOf.keys()].find((h) => isLeak(known.get(h))) ?? null)
  const [hovered, setHovered] = useState<bigint | null>(null)
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
      t.op?.kind === 'trivial' ? 'trivial' : t.op?.kind === 'random' ? 'random' : isLeak(k) ? 'public' : 'secret'
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

  // Everything the active node is computed from, itself included.
  const active = hovered ?? selected
  const lit = new Set<bigint>()
  const climb = (h: bigint) => {
    if (lit.has(h)) return
    lit.add(h)
    const row = rowOf.get(h)
    if (row !== undefined) graph.tasks[row].inputHandles.forEach((i) => climb(i.handle))
  }
  if (active !== null && nodes.has(active)) climb(active)
  const dimmed = (h: bigint) => lit.size > 0 && !lit.has(h)

  return (
    <div className="graph-wrap">
      <svg className="opgraph" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="FHE task graph" onMouseLeave={() => setHovered(null)}>
        {edges.map((e, i) => {
          const x1 = e.from.x + NODE_W
          const y1 = e.from.y + NODE_H / 2
          const x2 = e.to.x
          const y2 = e.to.y + ((e.slot + 1) * NODE_H) / (e.of + 1)
          const mid = (x1 + x2) / 2
          const state = lit.has(e.to.handle) && lit.has(e.from.handle) ? ' lit' : dimmed(e.to.handle) ? ' dim' : ''
          return (
            <path
              key={i}
              className={`edge${e.to.kind === 'public' ? ' public' : ''}${state}`}
              d={`M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`}
              pathLength={1}
              style={{ '--d': e.to.depth } as CSSProperties}
            />
          )
        })}
        {[...nodes.values()].map((n) => (
          <g
            key={n.handle.toString()}
            className={`node ${n.kind}${n.row !== null ? ' clickable' : ''}${dimmed(n.handle) ? ' dim' : ''}${n.handle === active ? ' active' : ''}`}
            transform={`translate(${n.x},${n.y})`}
            style={{ '--d': n.depth } as CSSProperties}
            onMouseEnter={() => n.row !== null && setHovered(n.handle)}
            onClick={() => n.row !== null && setSelected(n.handle === selected ? null : n.handle)}
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
      {active !== null && rowOf.has(active) && <Why graph={graph} known={known} rowOf={rowOf} handle={active} onSelect={onSelect} onClear={() => setSelected(null)} />}
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

/** One-line explanation of the active task: its formula, and for public values what they rest on. */
function Why({ graph, known, rowOf, handle, onSelect, onClear }: { graph: TxGraph; known: Map<bigint, Known>; rowOf: Map<bigint, number>; handle: bigint; onSelect: (row: number) => void; onClear: () => void }) {
  const row = rowOf.get(handle)!
  const task = graph.tasks[row]
  const k = known.get(handle)
  const name = (h: bigint) => {
    const r = rowOf.get(h)
    const v = known.get(h)
    if (r !== undefined) return v ? `${short(v.value)} (#${r + 1})` : `#${r + 1}`
    if (v) return short(v.value)
    return graph.inputs.has(h) ? 'a user input' : 'a handle from an earlier tx'
  }
  const leaves = isLeak(k)
    ? k!.leaves.map((h) => {
        const r = rowOf.get(h)
        const v = known.get(h)
        const what = graph.tasks[r ?? -1]?.op?.kind === 'trivial' ? 'constant' : v?.source === 'published' ? 'published decrypt' : 'value'
        return `${what} ${r !== undefined ? `#${r + 1} ` : ''}(${v ? short(v.value) : '?'})`
      })
    : []
  const formula =
    task.op?.kind === 'trivial' ? `trivialEncrypt(${short(task.input1)})` : `${task.operation}(${task.inputHandles.map((i) => name(i.handle)).join(', ')})`
  return (
    <p className={`why small${isLeak(k) ? ' public' : ''}`}>
      <b>
        #{row + 1} {formula}
        {k ? ` = ${short(k.value)}` : ''}
      </b>
      {isLeak(k) && (leaves.length ? <> · anyone can compute this from {leaves.join(', ')}</> : <> · this holds whatever the inputs are</>)}
      {!k && task.op?.kind !== 'trivial' && <> · encrypted: it depends on something FHE Lens can't see</>}
      {task.op?.kind === 'trivial' && <> · the plaintext is in the event data</>}
      <span className="why-actions">
        <button className="sm" onClick={() => onSelect(row)}>
          Show in table
        </button>
        <button className="sm" onClick={onClear}>
          Clear selection
        </button>
      </span>
    </p>
  )
}
