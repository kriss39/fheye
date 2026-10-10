// The home page's centerpiece. Everything looks encrypted until the lens passes over it: under the
// glass are the plain numbers anyone can read from the transaction. Two identical grids are stacked;
// the top one (plaintext) is masked to a circle that drifts between the terms or follows the pointer.

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { LockIcon, UnlockIcon } from './icons'
import { randomHex, reducedMotion } from './motion'

const TERMS = [
  { value: '0', label: 'plain number' },
  { value: '5,000,000', label: 'plain number' },
  { value: '5,000,000', label: 'the “encrypted” balance' },
]
const LINES = 3
const WIDTH = 10

function useCipher(live: boolean) {
  const [rows, setRows] = useState(() => Array.from({ length: TERMS.length * LINES }, () => randomHex(WIDTH)))
  useEffect(() => {
    if (!live || reducedMotion()) return
    const id = setInterval(() => {
      setRows((rs) =>
        rs.map((r) => {
          const a = [...r]
          for (let k = 0; k < 2; k++) a[(Math.random() * a.length) | 0] = randomHex(1)
          return a.join('')
        }),
      )
    }, 120)
    return () => clearInterval(id)
  }, [live])
  return rows
}

export function LensReveal() {
  const stage = useRef<HTMLDivElement>(null)
  const cards = useRef<Array<HTMLDivElement | null>>([])
  const pointer = useRef<{ x: number; y: number; until: number }>({ x: 0, y: 0, until: 0 })
  const [visible, setVisible] = useState(false)
  const rows = useCipher(visible)

  useEffect(() => {
    const el = stage.current!
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting))
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    const el = stage.current!
    let anchors: Array<[number, number]> = []
    const measure = () => {
      const s = el.getBoundingClientRect()
      el.style.setProperty('--lr', `${Math.round(Math.max(68, Math.min(104, s.width * 0.165)))}px`)
      anchors = cards.current.map((c) => {
        const r = c!.getBoundingClientRect()
        return [r.left - s.left + r.width / 2, r.top - s.top + r.height / 2]
      })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    void document.fonts?.ready.then(measure)

    // Start on the result: the one value that is supposed to be secret.
    let [x, y] = anchors[anchors.length - 1]
    const place = () => {
      el.style.setProperty('--lx', `${x}px`)
      el.style.setProperty('--ly', `${y}px`)
    }
    place()
    if (reducedMotion() || !visible) return () => ro.disconnect()

    let raf = 0
    let target = 0
    let switched = performance.now()
    const loop = (now: number) => {
      let tx: number, ty: number
      if (now < pointer.current.until) {
        ;({ x: tx, y: ty } = pointer.current)
      } else {
        // Dwell on each term, longer on the result.
        if (now - switched > (target === anchors.length - 1 ? 2600 : 1700)) {
          target = (target + 1) % anchors.length
          switched = now
        }
        ;[tx, ty] = anchors[target]
      }
      x += (tx - x) * 0.07
      y += (ty - y) * 0.07
      place()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [visible])

  const move = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    pointer.current = { x: e.clientX - r.left, y: e.clientY - r.top, until: performance.now() + 2200 }
    if (reducedMotion()) {
      e.currentTarget.style.setProperty('--lx', `${pointer.current.x}px`)
      e.currentTarget.style.setProperty('--ly', `${pointer.current.y}px`)
    }
  }

  const grid = (plain: boolean) => (
    <div className={`lens-layer ${plain ? 'plain' : 'cipher'}`} aria-hidden="true">
      {TERMS.map((t, i) => (
        <div key={i} className="lens-cell" style={{ '--slot': i * 2 + 1 } as CSSProperties}>
          <div
            ref={plain ? (el) => void (cards.current[i] = el) : undefined}
            className={`lens-card${i === TERMS.length - 1 ? ' result' : ''}`}
          >
            {plain ? (
              <>
                <b>
                  <UnlockIcon size={18} />
                  {t.value}
                </b>
                <span>{t.label}</span>
              </>
            ) : (
              <>
                <LockIcon size={18} />
                <code>
                  {rows.slice(i * LINES, i * LINES + LINES).map((r, k) => (
                    <span key={k}>{r}</span>
                  ))}
                </code>
              </>
            )}
          </div>
        </div>
      ))}
      <span className="lens-op" style={{ '--slot': 2 } as CSSProperties}>
        +
      </span>
      <span className="lens-op" style={{ '--slot': 4 } as CSSProperties}>
        =
      </span>
    </div>
  )

  return (
    <div className="lens-stage" ref={stage} onPointerMove={move} role="img" aria-label="Three values that look encrypted. Under the lens: 0 plus 5,000,000 equals 5,000,000, so the encrypted balance is public.">
      {grid(false)}
      {grid(true)}
      <div className="lens-ring" aria-hidden="true" />
    </div>
  )
}
