import { useEffect } from 'react'

// The moving background behind the public pages: three blurred colour blobs drifting slowly
// (pure CSS, see `.aurora` in src/styles/portfolio.css) and a soft glow that follows the cursor.
// Fixed behind everything, so it only shows through sections without their own background.
export function Backdrop() {
  useEffect(() => {
    // Mouse and trackpad only; on touch the glow would just sit where the last tap was.
    if (!matchMedia('(pointer: fine)').matches) return
    const root = document.documentElement
    let frame = 0
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        root.style.setProperty('--mx', `${e.clientX}px`)
        root.style.setProperty('--my', `${e.clientY}px`)
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
      <div className="spotlight" />
    </div>
  )
}
