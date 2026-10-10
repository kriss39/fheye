// Small motion helpers. Every effect settles immediately when the viewer prefers reduced motion.

import { useEffect, useState, type PointerEvent } from 'react'

export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

export const HEX = '0123456789abcdef'
export const randomHex = (n: number) => Array.from({ length: n }, () => HEX[(Math.random() * 16) | 0]).join('')

/** A number that counts up from zero to `target` with an ease-out. */
export function useCountUp(target: number, duration = 1400): number {
  const [value, setValue] = useState(() => (reducedMotion() ? target : 0))
  useEffect(() => {
    if (reducedMotion()) return
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      setValue(target * (1 - (1 - p) ** 3))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return value
}

/** Pointer handler for cards with a light that follows the cursor (see .spot in index.css). */
export function spotlight(e: PointerEvent<HTMLElement>) {
  const r = e.currentTarget.getBoundingClientRect()
  e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`)
  e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`)
}
