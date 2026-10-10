import { useEffect, useState } from 'react'
import { HEX, reducedMotion } from './motion'

/** Text that starts as random hex and settles into `text`, left to right, like a value being decrypted. Remount (key) to replay. */
export function Scramble({ text, duration = 750, delay = 0 }: { text: string; duration?: number; delay?: number }) {
  const [shown, setShown] = useState(() => (reducedMotion() ? text : text.replace(/[0-9a-zA-Z]/g, () => HEX[(Math.random() * 16) | 0])))
  useEffect(() => {
    if (reducedMotion()) return
    let raf = 0
    const start = performance.now() + delay
    const tick = (now: number) => {
      const p = Math.max(0, Math.min(1, (now - start) / duration))
      const settled = Math.floor(p * text.length)
      setShown([...text].map((c, i) => (i < settled || !/[0-9a-zA-Z]/.test(c) ? c : HEX[(Math.random() * 16) | 0])).join(''))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [text, duration, delay])
  return <>{shown}</>
}
