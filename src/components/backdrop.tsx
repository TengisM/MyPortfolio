import { useEffect, useRef } from 'react'

// The moving background behind the public pages: three soft colour blobs drifting slowly
// (pure CSS, see `.aurora` in src/styles/portfolio.css) and a soft glow that follows the cursor.
// Fixed behind everything, so it only shows through sections without their own background.
export function Backdrop() {
  const spot = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // Mouse and trackpad only; on touch the glow would just sit where the last tap was.
    if (!matchMedia('(pointer: fine)').matches) return
    let frame = 0
    // A transform on the glow itself. Custom properties on <html> restyled the whole page on
    // every mouse move.
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        if (spot.current) spot.current.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`
      })
    }
    addEventListener('pointermove', onMove, { passive: true })
    return () => {
      removeEventListener('pointermove', onMove)
      cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <div aria-hidden="true" className="aurora">
      <span />
      <span />
      <span />
      <div ref={spot} className="spotlight" />
    </div>
  )
}
